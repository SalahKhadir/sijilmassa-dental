import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createFormControl } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createConsultationApi, ClinicalApiError } from "../src/lib/consultations/api/client.ts";
import * as schemas from "../src/lib/consultations/api/schemas.ts";
import { clinicalDraftFormSchema, clinicalDraftCommand, clinicalDraftValues, clinicalTreatmentFormSchema } from "../src/lib/consultations/api/forms.ts";
import { createClinicalMutation } from "../src/lib/consultations/api/mutation.ts";
import { ClinicalMutationFeedback } from "../src/components/consultations/persistent/mutation-feedback.tsx";
import { proxyAuthentication } from "../src/lib/auth/backend-proxy.ts";

const patientId = "00000000-0000-4000-8000-000000000001", id = "00000000-0000-4000-8000-000000000002", treatmentId = "00000000-0000-4000-8000-000000000003";
const instant = "2026-11-10T09:00:00Z", canary = "SYNTHETIC-PRIVATE-CLINICAL-CONTENT";
const content = { appointmentId: null, consultationDate: "2026-11-10", chiefComplaint: "Motif synthétique", clinicalObservations: canary, assessment: "", treatmentPlan: "", notes: "" };
const treatmentContent = { treatmentDate: "2026-11-10", description: canary, toothReference: "16", notes: "" };
const treatment = { id: treatmentId, version: 0, content: treatmentContent, createdAt: instant, updatedAt: instant };
const record = { id, patientId, version: 0, status: "BROUILLON", content, treatments: [], createdAt: instant, updatedAt: instant };
const csrf = { headerName: "X-CSRF-TOKEN", token: "synthetic-token" };
const scope = `/api/v1/consultations/${id}?patientId=${patientId}`;
function harness(response = record) {
  const calls = [];
  const api = createConsultationApi({ canAccess: () => true, fetcher: async (url, options) => {
    calls.push({ url, options }); return Response.json(url.endsWith("csrf") ? csrf : response);
  } });
  return { api, calls };
}
test("strict DTOs parse the REST projection without coercion or clinical transformations", () => {
  assert.deepEqual(schemas.persistentConsultationSchema.parse(record), record);
  assert(schemas.persistentConsultationSchema.safeParse({ ...record, treatments: [treatment] }).success);
  for (const value of [{ ...record, secret: canary }, { ...record, version: 0.5 }, { ...record, version: Number.MAX_SAFE_INTEGER + 1 },
    { ...record, version: "0" }, { ...record, id: "consultation-demo-1" }, { ...record, status: "REOPENED" },
    { ...record, updatedAt: "2026-11-10T08:00:00Z" }, { ...record, treatments: [{ ...treatment, removedAt: instant }] },
    { ...record, treatments: [treatment, treatment] }]) assert(!schemas.persistentConsultationSchema.safeParse(value).success);
});
test("draft and treatment payloads reject foreign fields, invalid dates, NUL and oversized text", () => {
  for (const changes of [{ consultationDate: "2026-02-30" }, { consultationDate: "0000-01-01" }, { consultationDate: "2026-11-10T10:00Z" },
    { chiefComplaint: " " }, { notes: "x".repeat(5001) }, { clinicalObservations: "\0" }, { appointmentId: "appointment-demo" }, { treatments: [] }])
    assert(!schemas.draftContentSchema.safeParse({ ...content, ...changes }).success);
  for (const changes of [{ description: "" }, { description: "x".repeat(1001) }, { toothReference: "<script>" }, { notes: "x".repeat(2001) }, { id: treatmentId }])
    assert(!schemas.treatmentContentSchema.safeParse({ ...treatmentContent, ...changes }).success);
  assert.equal(schemas.draftContentSchema.parse({ ...content, chiefComplaint: " Motif " }).chiefComplaint, " Motif ");
});
test("active and removed response projections are disjoint; retired legacy references remain readable", () => {
  const removed = { treatment: { ...treatment, content: { ...treatmentContent, toothReference: "legacy<>reference" } }, removedAt: instant };
  assert(schemas.removedClinicalHistorySchema.safeParse({ items: [removed], nextCursor: null }).success);
  assert(!schemas.persistentConsultationSchema.safeParse({ ...record, treatments: [removed] }).success);
  assert(!schemas.removedClinicalHistorySchema.safeParse({ items: [treatment], nextCursor: null }).success);
  assert(!schemas.removedTreatmentSchema.safeParse({ ...removed, removedAt: "2026-11-10T08:00:00Z" }).success);
});
test("all nine operations use exact methods, scoped URLs and parent versions", async () => {
  let response = record;
  const calls = [];
  const api = createConsultationApi({ canAccess: () => true, fetcher: async (url, options) => {
    calls.push({ url, options }); return Response.json(url.endsWith("csrf") ? csrf : response);
  } });
  await api.create({ patientId, content }); await api.get(patientId, id);
  response = { ...record, version: 1 };
  await api.update(patientId, id, { version: 0, content });
  await api.addTreatment(patientId, id, { version: 0, content: treatmentContent });
  await api.editTreatment(patientId, id, treatmentId, { version: 0, content: treatmentContent });
  await api.removeTreatment(patientId, id, treatmentId, 0);
  response = { ...response, status: "TERMINEE" }; await api.finalize(patientId, id, 0);
  response = { items: [], nextCursor: null };
  await api.history(patientId); await api.removedTreatments(patientId, id);
  const clinical = calls.filter(c => !c.url.endsWith("csrf"));
  assert.deepEqual(clinical.map(c => c.options.method), ["POST", "GET", "PUT", "POST", "PUT", "PUT", "PUT", "GET", "GET"]);
  assert.equal(clinical[1].url, scope);
  assert.equal(clinical[5].url, `/api/v1/consultations/${id}/treatments/${treatmentId}/removal?patientId=${patientId}`);
  for (const call of calls) { assert.equal(call.options.cache, "no-store"); assert.equal(call.options.credentials, "same-origin"); assert.equal(call.options.redirect, "error"); assert(!call.url.includes(canary)); }
  assert.equal(calls.filter(c => c.url.endsWith("csrf")).length, 6);
  for (const call of clinical.filter(c => c.options.method !== "GET")) assert.equal(call.options.headers["X-CSRF-TOKEN"], csrf.token);
  assert.equal(JSON.parse(clinical[4].options.body).version, 0);
});
test("invalid request DTOs, synthetic IDs and cursors never reach transport", async () => {
  const { api, calls } = harness();
  for (const invoke of [() => api.get(patientId, "consultation-demo"), () => api.create({ patientId: "demo-patient", content }),
    () => api.update(patientId, id, { version: 0.5, content }), () => api.addTreatment(patientId, id, { version: 0, content: { ...treatmentContent, description: "" } }),
    () => api.finalize(patientId, id, -1), () => api.history(patientId, { date: "2026-11-10" }),
    () => api.removedTreatments(patientId, id, { date: "bad", id })]) await assert.rejects(invoke, { status: 400 });
  assert.equal(calls.length, 0);
});
test("UI permission denies every clinical operation before reads or CSRF", async () => {
  let count = 0;
  const api = createConsultationApi({ canAccess: () => false, fetcher: async () => { count++; throw Error(canary); } });
  for (const invoke of [() => api.create({ patientId, content }), () => api.get(patientId, id), () => api.history(patientId), () => api.removedTreatments(patientId, id),
    () => api.update(patientId, id, { version: 0, content }), () => api.addTreatment(patientId, id, { version: 0, content: treatmentContent }),
    () => api.editTreatment(patientId, id, treatmentId, { version: 0, content: treatmentContent }), () => api.removeTreatment(patientId, id, treatmentId, 0), () => api.finalize(patientId, id, 0)])
    await assert.rejects(invoke, { status: 403 });
  assert.equal(count, 0);
});
test("permission revoked during CSRF prevents the clinical write", async () => {
  let allowed = true, count = 0;
  const api = createConsultationApi({ canAccess: () => allowed, fetcher: async () => { count++; allowed = false; return Response.json(csrf); } });
  await assert.rejects(api.create({ patientId, content }), { status: 403 }); assert.equal(count, 1);
  allowed = true;
  const reading = createConsultationApi({ canAccess: () => allowed, fetcher: async () => { allowed = false; return Response.json(record); } });
  await assert.rejects(reading.get(patientId, id), { status: 403 });
});
for (const status of [400, 401, 403, 404, 409, 429, 500, 502, 503]) test(`clinical ${status} is safe, has no fallback, and never retries writes`, async () => {
  let writes = 0, expired = 0;
  const api = createConsultationApi({ canAccess: () => true, unauthenticated: () => expired++, fetcher: async url => {
    if (url.endsWith("csrf")) return Response.json(csrf);
    writes++; return Response.json({ detail: canary }, { status });
  } });
  await assert.rejects(api.update(patientId, id, { version: 0, content }), e => e instanceof ClinicalApiError && e.status === status && !e.message.includes(canary));
  assert.equal(writes, 1); assert.equal(expired, status === 401 ? 1 : 0);
});
test("CSRF rejection/malformed token prevents mutation and network outage is 503", async () => {
  for (const response of [Response.json({}, { status: 403 }), Response.json({ headerName: "Wrong", token: canary })]) {
    let calls = 0;
    const api = createConsultationApi({ canAccess: () => true, fetcher: async () => { calls++; return response; } });
    await assert.rejects(api.create({ patientId, content })); assert.equal(calls, 1);
  }
  const api = createConsultationApi({ canAccess: () => true, fetcher: async () => { throw new Error("internal-host " + canary); } });
  await assert.rejects(api.get(patientId, id), e => e.status === 503 && !e.message.includes(canary));
});
test("unexpected projections, mismatched patient and unconfirmed versions fail closed", async () => {
  for (const value of [{}, { ...record, patientId: id }, { ...record, id: patientId }]) await assert.rejects(harness(value).api.get(patientId, id), { status: 502 });
  await assert.rejects(harness(record).api.update(patientId, id, { version: 0, content }), { status: 502 });
  await assert.rejects(harness({ ...record, version: 1 }).api.finalize(patientId, id, 0), { status: 502 });
});
test("history and removed pages use paired cursors without unbounded accumulation", async () => {
  const { api, calls } = harness({ items: [], nextCursor: null });
  await api.history(patientId, { date: "2026-11-10", id });
  await api.removedTreatments(patientId, id, { date: "2026-11-10", id: treatmentId });
  assert(calls[0].url.endsWith(`beforeDate=2026-11-10&beforeId=${id}`));
  assert(calls[1].url.endsWith(`afterDate=2026-11-10&afterId=${treatmentId}`));
  assert.equal(calls.length, 2);
  const summary = { id, consultationDate: "2026-11-10", status: "BROUILLON", version: 0 };
  assert(!schemas.clinicalHistorySchema.safeParse({ items: [summary, summary], nextCursor: null }).success);
  assert(!schemas.clinicalHistorySchema.safeParse({ items: [], nextCursor: { date: "2026-11-10", id } }).success);
  await assert.rejects(harness({ items: [summary], nextCursor: null }).api.history(patientId, { date: "2026-11-10", id }), { status: 502 });
});
test("full 50-row history pages require their exact last-row cursor and do not trigger automatic reads", async () => {
  const uuid = n => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
  const items = Array.from({ length: 50 }, (_, index) => ({ id: uuid(50 - index), consultationDate: "2026-11-10", status: "BROUILLON", version: 0 }));
  const page = { items, nextCursor: { date: "2026-11-10", id: uuid(1) } };
  const { api, calls } = harness(page);
  assert.equal((await api.history(patientId)).items.length, 50); assert.equal(calls.length, 1);
  for (const bad of [{ ...page, nextCursor: null }, { ...page, nextCursor: { date: "2026-11-10", id } }, { ...page, items: [...items, items[0]] }])
    assert(!schemas.clinicalHistorySchema.safeParse(bad).success);
  const retired = Array.from({ length: 50 }, (_, index) => ({ treatment: { ...treatment, id: uuid(index + 1) }, removedAt: instant }));
  assert(schemas.removedClinicalHistorySchema.safeParse({ items: retired, nextCursor: { date: "2026-11-10", id: uuid(50) } }).success);
});
test("form mapping separates draft/treatment commands from prototype entries and preserves exact input", () => {
  const values = clinicalDraftValues(patientId, content); assert.equal(values.appointmentId, "");
  assert.deepEqual(clinicalDraftCommand(values), { patientId, content });
  assert(!clinicalDraftFormSchema.safeParse({ ...values, treatments: [] }).success);
  assert(!clinicalTreatmentFormSchema.safeParse({ ...treatmentContent, id: "treatment-demo" }).success);
  assert(!clinicalDraftFormSchema.safeParse({ ...values, patientId: "demo-patient" }).success);
});
test("React Hook Form validation and 409 preserve unsaved values and original expected version", async () => {
  const values = clinicalDraftValues(patientId, content);
  const form = createFormControl({ resolver: zodResolver(clinicalDraftFormSchema), defaultValues: values });
  const unsubscribe = form.subscribe({ formState: { values: true }, callback() {} });
  form.setValue("notes", canary + " unsaved");
  const controller = createClinicalMutation(7, true); let calls = 0;
  const submit = form.handleSubmit(async input => controller.submit(async version => {
    calls++; assert.equal(version, 7); assert.equal(input.notes, canary + " unsaved"); throw new ClinicalApiError(409);
  }));
  await submit(); await submit(); assert.equal(calls, 1);
  assert.equal(form.getValues("notes"), canary + " unsaved"); assert.equal(controller.getSnapshot().version, 7);
  assert.equal(controller.acceptReload(8, false), false); assert.equal(controller.getSnapshot().blocked, true);
  assert.equal(controller.acceptReload(8, true), true); assert.equal(controller.getSnapshot().version, 8);
  form.setValue("chiefComplaint", ""); await submit(); assert.equal(calls, 1);
  unsubscribe();
});
test("duplicate submissions and confirmed success do not create extra writes", async () => {
  const controller = createClinicalMutation(undefined, true); let resolve, writes = 0;
  const operation = () => { writes++; return new Promise(r => { resolve = r; }); };
  const first = controller.submit(operation); await controller.submit(operation); assert.equal(writes, 1);
  assert.equal(controller.acceptReload(1, true), false);
  resolve(record); await first; await controller.submit(operation); assert.equal(writes, 1);
  assert.equal(controller.getSnapshot().completed, true); assert(!("result" in controller.getSnapshot()));
});
for (const status of [401, 403, 409, 500, 502, 503, 504]) test(`mutation outcome ${status} requires an explicit reload without clearing inputs`, async () => {
  const controller = createClinicalMutation(3, true); let writes = 0;
  const operation = async () => { writes++; throw new ClinicalApiError(status); };
  await controller.submit(operation); await controller.submit(operation);
  assert.equal(writes, 1); assert.equal(controller.getSnapshot().version, 3); assert(controller.getSnapshot().blocked);
});
test("permission denial and revocation prevent results from being accepted by mutation state", async () => {
  const controller = createClinicalMutation(0, false); let writes = 0;
  await controller.submit(async () => { writes++; return record; }); assert.equal(writes, 0);
  controller.setAllowed(true);
  await controller.submit(async () => { controller.setAllowed(false); return record; });
  assert.equal(controller.getSnapshot().completed, false); assert.equal(controller.getSnapshot().error.status, 403);
});
test("accessible feedback announces saving/errors and renders nothing for a receptionist", () => {
  const state = { pending: true, blocked: false, completed: false };
  const render = (state, allowed) => renderToStaticMarkup(createElement(ClinicalMutationFeedback, { state, allowed }));
  assert.match(render(state, true), /aria-busy="true"/); assert.match(render(state, true), /role="status"/);
  assert.match(render({ ...state, error: new ClinicalApiError(409), blocked: true }, true), /role="alert"/);
  assert.equal(render(state, false), "");
});
test("clinical proxy forwards scoped mutation query, CSRF, session, status and separate cookies", async () => {
  const path = `consultations/${id}/treatments/${treatmentId}/removal`;
  const response = await proxyAuthentication(new Request(`http://clinic/api/v1/${path}?patientId=${patientId}`, {
    method: "PUT", headers: { Origin: "http://clinic", Cookie: "other=secret; JSESSIONID=synthetic", "X-CSRF-TOKEN": csrf.token, "Content-Type": "application/json" }, body: '{"version":0}',
  }), path, { origin: "http://internal", fetcher: async (url, options) => {
    assert.equal(url, `http://internal/api/v1/${path}?patientId=${patientId}`);
    assert.equal(options.headers.get("Cookie"), "JSESSIONID=synthetic"); assert.equal(options.headers.get("X-CSRF-TOKEN"), csrf.token);
    const headers = new Headers({ "Content-Type": "application/problem+json" }); headers.append("Set-Cookie", "JSESSIONID=rotated; HttpOnly; Path=/");
    return new Response('{"status":409}', { status: 409, headers });
  } });
  assert.equal(response.status, 409); assert.match(response.headers.get("cache-control"), /private.*no-store/);
  assert.equal(response.headers.getSetCookie().length, 1); assert(!response.headers.get("set-cookie").includes("internal"));
});
test("proxy explicitly supports all nine paths/methods and forwards safe creation Location", async () => {
  const paths = [["consultations", "GET"], ["consultations", "POST"], [`consultations/${id}`, "GET"], [`consultations/${id}`, "PUT"],
    [`consultations/${id}/treatments`, "POST"], [`consultations/${id}/treatments/${treatmentId}`, "PUT"],
    [`consultations/${id}/treatments/${treatmentId}/removal`, "PUT"], [`consultations/${id}/finalization`, "PUT"], [`consultations/${id}/treatments/removed`, "GET"]];
  for (const [path, method] of paths) {
    const response = await proxyAuthentication(new Request(`http://clinic/api/v1/${path}?patientId=${patientId}`, { method }), path,
      { origin: "http://internal", fetcher: async url => { assert(url.endsWith(`?patientId=${patientId}`)); return Response.json(record); } });
    assert.equal(response.status, 200);
  }
  const location = `/api/v1/consultations/${id}?patientId=${patientId}`;
  const result = await proxyAuthentication(new Request("http://clinic", { method: "POST" }), "consultations", {
    origin: "http://internal", fetcher: async () => Response.json(record, { status: 201, headers: { Location: location } }),
  }); assert.equal(result.headers.get("Location"), location);
});
test("proxy refuses synthetic paths, traversal, invented actions, methods and cross-origin writes", async () => {
  for (const path of ["consultations/demo", `consultations/${id}/reopen`, `consultations/${id}/../../auth/me`, `consultations/${id}/treatments/${treatmentId}/restore`, `consultations/${id}/treatments/removed/extra`])
    assert.equal((await proxyAuthentication(new Request("http://clinic"), path)).status, 404);
  assert.equal((await proxyAuthentication(new Request("http://clinic", { method: "DELETE" }), `consultations/${id}`)).status, 405);
  assert.equal((await proxyAuthentication(new Request("http://clinic", { method: "PUT", headers: { Origin: "http://attacker" } }), `consultations/${id}`)).status, 403);
});
test("proxy enforces body size, safe Location/cookies, JSON and backend outage handling", async () => {
  let calls = 0;
  const tooBig = await proxyAuthentication(new Request("http://clinic", { method: "POST", body: "x".repeat(65537) }), "consultations", { origin: "http://internal", fetcher: async () => { calls++; return Response.json({}); } });
  assert.equal(tooBig.status, 413); assert.equal(calls, 0);
  for (const response of [Response.json({}, { headers: { Location: "http://internal/private" } }), new Response("private backend", { headers: { "Content-Type": "text/html" } }),
    Response.json({}, { headers: { "Set-Cookie": "JSESSIONID=x; Domain=internal" } }), new Response(null, { status: 302 })]) {
    const proxied = await proxyAuthentication(new Request("http://clinic"), "consultations", { origin: "http://internal", fetcher: async () => response });
    assert.equal(proxied.status, 502); assert(!(await proxied.text()).includes("internal"));
  }
  const outage = await proxyAuthentication(new Request("http://clinic"), "consultations", { origin: "http://internal", fetcher: async () => { throw Error(canary); } });
  assert.equal(outage.status, 503); assert(!(await outage.text()).includes(canary));
});
