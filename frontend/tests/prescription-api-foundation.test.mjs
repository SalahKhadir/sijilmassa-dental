import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createFormControl } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as s from "../src/lib/prescriptions/api/schemas.ts";
import { createPrescriptionApi, PrescriptionApiError } from "../src/lib/prescriptions/api/client.ts";
import { prescriptionFailure } from "../src/lib/prescriptions/api/errors.ts";
import { prescriptionPdf, savePrescriptionPdf } from "../src/lib/prescriptions/api/download.ts";
import { prescriptionDraftFormSchema, prescriptionDraftCommand, prescriptionDraftValues } from "../src/lib/prescriptions/api/forms.ts";
import { createPrescriptionMutation } from "../src/lib/prescriptions/api/mutation.ts";
import { PrescriptionMutationFeedback } from "../src/components/prescriptions/persistent/mutation-feedback.tsx";
import { proxyAuthentication } from "../src/lib/auth/backend-proxy.ts";
const patientId = "00000000-0000-4000-8000-000000000001", id = "00000000-0000-4000-8000-000000000002";
const lineId = "00000000-0000-4000-8000-000000000003", consultationId = "00000000-0000-4000-8000-000000000004";
const instant = "2026-11-11T10:00:00Z", canary = "SYNTHETIC-PRIVATE-PRESCRIPTION";
const line = { medicationName: canary, dosage: "", frequency: "", duration: "", instructions: "" };
const content = { consultationId: null, issuedDate: "2026-11-11", medications: [line], generalInstructions: "" };
const identity = { reference: "PAT-000001", firstName: "Prénom fictif", lastName: "Nom fictif", displayName: "Prénom fictif Nom fictif" };
const record = { id, patientId, version: 0, status: "BROUILLON", content: { ...content, medications: [{ ...line, id: lineId }] },
  patient: { ...identity, id: patientId, version: 7, status: "active" }, createdAt: instant, updatedAt: instant, finalizedAt: null, archivedAt: null, document: null };
const document = { snapshotSchemaVersion: 1, capturedAt: instant, patientIdentity: identity, practitionerDisplayName: "Praticien fictif",
  templateId: "a5", templateSha256: "a".repeat(64), rendererId: "prescription-a5-v1", pdfSha256: "b".repeat(64), pdfBytes: 20 };
const finalized = { ...record, version: 1, status: "FINALISEE", finalizedAt: instant, document };
const csrf = { headerName: "X-CSRF-TOKEN", token: "synthetic-csrf" };
const scope = `/api/v1/prescriptions/${id}?patientId=${patientId}`;
const pdfBytes = new TextEncoder().encode("%PDF-1.7\nsynthetic-only\n%%EOF");
function pdfResponse(headers = {}, bytes = pdfBytes) {
  return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Content-Length": String(bytes.length),
    "Content-Disposition": `attachment; filename="ordonnance-${id}.pdf"`, ...headers } });
}
function harness(initial = record) {
  const calls = []; let value = initial;
  const api = createPrescriptionApi({ canAccess: () => true, fetcher: async (url, options) => {
    calls.push({ url, options }); return Response.json(url.endsWith("csrf") ? csrf : value);
  } });
  return { api, calls, respond(next) { value = next; } };
}
function summary(changes = {}) { return { id, issuedDate: content.issuedDate, status: "BROUILLON", version: 0, consultationId: null, finalizedAt: null, archivedAt: null, ...changes }; }
function proxy(path, method = "GET", search = `?patientId=${patientId}`, upstream = Response.json({}), body) {
  return proxyAuthentication(new Request(`http://clinic.local/api/v1/${path}${search}`, { method,
    headers: { Cookie: "JSESSIONID=synthetic; unrelated=secret", "X-CSRF-TOKEN": "synthetic-csrf", "Content-Type": "application/json" }, ...(body ? { body } : {}) }), path,
    { origin: "http://internal", fetcher: typeof upstream === "function" ? upstream : async () => upstream });
}
test("strict DTO parsing covers draft, archived and finalized metadata", () => {
  assert.deepEqual(s.persistentPrescriptionSchema.parse(record), record);
  assert(s.persistentPrescriptionSchema.safeParse(finalized).success);
  assert(s.persistentPrescriptionSchema.safeParse({ ...record, archivedAt: instant }).success);
  for (const change of [{ patientId: id }, { version: "0" }, { version: 0.5 }, { version: Number.MAX_SAFE_INTEGER + 1 },
    { status: "ARCHIVEE" }, { document }, { finalizedAt: instant }, { secret: canary }, { updatedAt: "2026-11-10T09:00:00Z" }])
    assert(!s.persistentPrescriptionSchema.safeParse({ ...record, ...change }).success);
  for (const change of [{ archivedAt: instant }, { document: null }, { finalizedAt: null }, { document: { ...document, pdfBytes: 2097153 } }])
    assert(!s.persistentPrescriptionSchema.safeParse({ ...finalized, ...change }).success);
});
test("draft validation matches dates, UTF-16 limits, controls and surrogate pairs without trimming", () => {
  assert(s.prescriptionDraftSchema.safeParse({ ...content, medications: [] }).success);
  assert.equal(s.prescriptionDraftSchema.parse({ ...content, generalInstructions: " Texte \n" }).generalInstructions, " Texte \n");
  for (const changes of [{ issuedDate: "0000-01-01" }, { issuedDate: "2026-02-30" }, { medications: Array(21).fill(line) },
    { consultationId: "consultation-demo" }, { generalInstructions: "x".repeat(2001) }, { generalInstructions: "\u0001" },
    { generalInstructions: "\ud800" }, { generalInstructions: "\udc00" }]) assert(!s.prescriptionDraftSchema.safeParse({ ...content, ...changes }).success);
  assert(s.prescriptionDraftSchema.safeParse({ ...content, generalInstructions: "\t\r\n😀عربي" }).success);
  assert(!s.medicationInputSchema.safeParse({ ...line, medicationName: "😀".repeat(101) }).success);
  assert(s.prescriptionDateSchema.safeParse("0001-01-01").success);
});
test("medication IDs are omitted on creation, distinct on update, and array order is authoritative", () => {
  assert(!s.createPrescriptionSchema.safeParse({ patientId, content: record.content }).success);
  assert(!s.medicationInputSchema.safeParse({ ...line, id: null }).success);
  assert(!s.medicationInputSchema.safeParse({ ...line, position: 0 }).success);
  assert(!s.updatePrescriptionSchema.safeParse({ version: 0, content: { ...content, medications: [record.content.medications[0], record.content.medications[0]] } }).success);
  const input = { version: 0, content: { ...content, medications: [{ ...line, id: consultationId }, { ...line, id: lineId }] } };
  assert.deepEqual(s.updatePrescriptionSchema.parse(input).content.medications.map(l => l.id), [consultationId, lineId]);
});
test("patient and optional consultation associations are explicit and strict", () => {
  assert(s.createPrescriptionSchema.safeParse({ patientId, content: { ...content, consultationId } }).success);
  for (const value of [{ ...content, consultationId: undefined }, { ...content, patientId }, { ...content, patientName: canary }])
    assert(!s.prescriptionDraftSchema.safeParse(value).success);
  assert(!s.createPrescriptionSchema.safeParse({ patientId: "patient-demo", content }).success);
});
test("history validates fixed 50-item descending pagination and cursor semantics", () => {
  const items = Array.from({ length: 50 }, (_, i) => summary({ id: `00000000-0000-4000-8000-${String(100 - i).padStart(12, "0")}` }));
  const cursor = { date: content.issuedDate, id: items[49].id };
  assert(s.prescriptionHistorySchema.safeParse({ items, nextCursor: cursor }).success);
  assert(s.prescriptionHistorySchema.safeParse({ items: [], nextCursor: null }).success);
  for (const page of [{ items, nextCursor: null }, { items: items.toReversed(), nextCursor: cursor },
    { items: [items[0], items[0]], nextCursor: null }, { items: [], nextCursor: cursor }]) assert(!s.prescriptionHistorySchema.safeParse(page).success);
});
test("all JSON operations send exact patient-scoped methods, versions and fresh CSRF", async () => {
  const h = harness(); await h.api.create({ patientId, content }); await h.api.get(patientId, id);
  h.respond({ ...record, version: 1 }); await h.api.update(patientId, id, { version: 0, content });
  h.respond({ ...record, version: 1, archivedAt: instant }); await h.api.archive(patientId, id, 0);
  h.respond(finalized); await h.api.finalize(patientId, id, { version: 0, patientVersion: 7 });
  const calls = h.calls.filter(c => !c.url.endsWith("csrf"));
  assert.deepEqual(calls.map(c => [c.url, c.options.method]), [["/api/v1/prescriptions", "POST"], [scope, "GET"], [scope, "PUT"],
    [`/api/v1/prescriptions/${id}/archival?patientId=${patientId}`, "PUT"], [`/api/v1/prescriptions/${id}/finalization?patientId=${patientId}`, "PUT"]]);
  assert.deepEqual(JSON.parse(calls[4].options.body), { version: 0, patientVersion: 7 }); assert.deepEqual(JSON.parse(calls[3].options.body), { version: 0 });
  assert.equal(h.calls.filter(c => c.url.endsWith("csrf")).length, 4);
  for (const c of h.calls) { assert.equal(c.options.credentials, "same-origin"); assert.equal(c.options.cache, "no-store"); assert.equal(c.options.redirect, "error"); }
  for (const c of calls.filter(c => c.options.method !== "GET")) assert.equal(c.options.headers["X-CSRF-TOKEN"], csrf.token);
});
test("history supports only backend patient filters and cursor, without global search", async () => {
  const h = harness({ items: [], nextCursor: null });
  await h.api.history({ patientId, consultationId, status: "BROUILLON", archive: "all", before: { date: "2026-11-11", id } });
  const url = new URL(h.calls[0].url, "http://clinic.local");
  assert.deepEqual(Object.fromEntries(url.searchParams), { patientId, consultationId, status: "BROUILLON", archive: "all", beforeDate: "2026-11-11", beforeId: id });
  await assert.rejects(h.api.history({ patientId, q: canary }), { status: 400 }); await assert.rejects(h.api.history({}), { status: 400 });
});
test("wrong response scope, consultation association and aggregate version reject success", async () => {
  for (const changes of [{ patientId: id, patient: { ...record.patient, id } }, { id: lineId }, { version: 5 }, { content: { ...record.content, consultationId } }]) {
    const h = harness({ ...record, version: 1, ...changes }); await assert.rejects(h.api.update(patientId, id, { version: 0, content }), { status: 502 });
  }
});
test("finalization requires both safe versions, with no content or exhausted version submission", async () => {
  const h = harness(finalized);
  for (const value of [{ version: 0 }, { version: 0, patientVersion: -1 }, { version: 0, patientVersion: 7, content }, { version: 1.2, patientVersion: 7 }])
    await assert.rejects(h.api.finalize(patientId, id, value), { status: 400 });
  await assert.rejects(h.api.finalize(patientId, id, { version: Number.MAX_SAFE_INTEGER, patientVersion: 7 }), { status: 409 }); assert.equal(h.calls.length, 0);
});
for (const status of [400, 401, 403, 409, 422, 500, 503]) test(`safe HTTP ${status} without mock fallback or write retry`, async () => {
  let count = 0, expired = 0;
  const api = createPrescriptionApi({ canAccess: () => true, unauthenticated: () => { expired++; }, fetcher: async url => {
    count++; return url.endsWith("csrf") ? Response.json(csrf) : Response.json({ status, detail: canary }, { status, headers: { "Content-Type": "application/problem+json" } });
  } });
  await assert.rejects(api.update(patientId, id, { version: 0, content }), e => e.status === status && !e.message.includes(canary));
  assert.equal(count, 2); assert.equal(expired, status === 401 ? 1 : 0);
});
for (const [code, status] of [["RENDERER_UNAVAILABLE", 503], ["PRACTITIONER_UNAVAILABLE", 503], ["PDF_UNSUPPORTED_CHARACTER", 400],
  ["PDF_LAYOUT_OVERFLOW", 400], ["INCOMPLETE_PRESCRIPTION", 400], ["DOCUMENT_UNAVAILABLE", 500]]) test(`finalization error ${code} has a safe local message`, async () => {
  const api = createPrescriptionApi({ canAccess: () => true, fetcher: async url => url.endsWith("csrf") ? Response.json(csrf)
    : Response.json({ status, code, detail: canary }, { status, headers: { "Content-Type": "application/problem+json" } }) });
  await assert.rejects(api.finalize(patientId, id, { version: 0, patientVersion: 7 }), e => e.code === code && !e.message.includes(canary));
});
test("unknown, malformed and mismatched problem codes fall back safely", async () => {
  for (const value of [{ code: canary, status: 400 }, { code: "PRACTITIONER_UNAVAILABLE", status: 400 }, { code: "INVALID_INPUT", status: 503 }]) {
    const e = await prescriptionFailure(400, Response.json(value, { headers: { "Content-Type": "application/problem+json" } })); assert.equal(e.code, undefined);
  }
});
test("offline backend, malformed JSON and failed CSRF have no fallback", async () => {
  for (const [fetcher, status] of [[async () => { throw new Error(canary); }, 503], [async () => new Response("invalid-json"), 502]]) {
    await assert.rejects(createPrescriptionApi({ canAccess: () => true, fetcher }).get(patientId, id), { status });
  }
  let calls = 0;
  const api = createPrescriptionApi({ canAccess: () => true, fetcher: async () => { calls++; return new Response(null, { status: 403 }); } });
  await assert.rejects(api.create({ patientId, content }), { status: 403 }); assert.equal(calls, 1);
});
test("role denial and revocation while decoding suppress clinical results", async () => {
  const denied = createPrescriptionApi({ canAccess: () => false, fetcher: async () => { assert.fail("No transport"); } });
  await assert.rejects(denied.get(patientId, id), { status: 403 });
  let allowed = true;
  const api = createPrescriptionApi({ canAccess: () => allowed, fetcher: async () => {
    const response = Response.json(record), original = response.json.bind(response);
    response.json = async () => { allowed = false; return original(); }; return response;
  } });
  await assert.rejects(api.get(patientId, id), { status: 403 });
});
test("binary download uses stored bytes and same-origin GET, without CSRF or generation", async () => {
  let calls = 0;
  const api = createPrescriptionApi({ canAccess: () => true, fetcher: async (url, options) => {
    calls++; assert.equal(url, `/api/v1/prescriptions/${id}/pdf?patientId=${patientId}&version=1&disposition=attachment`);
    assert.equal(options.method, "GET"); assert.equal(options.cache, "no-store"); assert.equal(options.credentials, "same-origin"); return pdfResponse();
  } });
  const result = await api.download(patientId, id, 1);
  assert.equal(result.filename, `ordonnance-${id}.pdf`); assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), pdfBytes); assert.equal(calls, 1);
});
test("PDF retrieval rejects unsafe headers, incorrect byte lengths and non-PDF data", async () => {
  for (const headers of [{ "Content-Disposition": "attachment; filename=patient-name.pdf" }, { "Content-Type": "text/html" },
    { "Content-Length": "2097153" }, { "Content-Length": "0" }, { "Content-Length": "1" }, { "Content-Length": String(pdfBytes.length + 1) }])
    await assert.rejects(prescriptionPdf(pdfResponse(headers), id), { status: 502 });
  await assert.rejects(prescriptionPdf(pdfResponse({}, new TextEncoder().encode("not a PDF")), id), { status: 502 });
  const api = createPrescriptionApi({ canAccess: () => true, fetcher: async () => Response.json({ status: 409, code: "VERSION_CONFLICT" }, { status: 409, headers: { "Content-Type": "application/problem+json" } }) });
  await assert.rejects(api.download(patientId, id, 1), { status: 409, code: "VERSION_CONFLICT" });
});
test("explicit browser download removes link and revokes Blob URL", () => {
  const previous = globalThis.document, create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  let clicked = false, removed = false, revoked;
  const link = { remove() { removed = true; }, click() { clicked = true; } };
  globalThis.document = { createElement: () => link, body: { append() {} } };
  URL.createObjectURL = () => "blob:synthetic"; URL.revokeObjectURL = url => { revoked = url; };
  try { savePrescriptionPdf({ blob: new Blob([pdfBytes]), filename: `ordonnance-${id}.pdf` }); assert(clicked && removed); assert.equal(revoked, "blob:synthetic"); }
  finally { globalThis.document = previous; URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
});
test("proxy allowlists exact routes and methods, rejects unsupported operations locally", async () => {
  for (const [path, methods] of [["prescriptions", ["GET", "POST"]], [`prescriptions/${id}`, ["GET", "PUT"]],
    [`prescriptions/${id}/archival`, ["PUT"]], [`prescriptions/${id}/finalization`, ["PUT"]], [`prescriptions/${id}/pdf`, ["GET"]]]) {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      if (methods.includes(method)) continue;
      assert.equal((await proxy(path, method, "", async () => { assert.fail("Must reject locally"); })).status, 405);
    }
  }
  for (const path of ["prescriptions/search", `prescriptions/${id}/correction`, `prescriptions/${id}/lines`, "prescriptions/demo", `prescriptions/${id}/pdf/extra`])
    assert.equal((await proxy(path)).status, 404);
});
test("proxy mutation transport preserves patient scope, session, CSRF, body and relative Location", async () => {
  for (const [path, method, search] of [["prescriptions", "POST", ""], [`prescriptions/${id}`, "PUT", `?patientId=${patientId}`],
    [`prescriptions/${id}/archival`, "PUT", `?patientId=${patientId}`], [`prescriptions/${id}/finalization`, "PUT", `?patientId=${patientId}`]]) {
    const response = await proxy(path, method, search, async (url, init) => {
      assert.equal(url, `http://internal/api/v1/${path}${search}`); assert.equal(init.headers.get("Cookie"), "JSESSIONID=synthetic");
      assert.equal(init.headers.get("X-CSRF-TOKEN"), "synthetic-csrf"); assert.equal(init.cache, "no-store");
      assert.equal(new TextDecoder().decode(init.body), "{}"); return Response.json({}, { headers: { Location: scope } });
    }, "{}"); assert.equal(response.headers.get("Location"), scope);
  }
  assert.equal((await proxy("prescriptions", "POST", "", Response.json({}, { headers: { Location: "http://internal/private" } }), "{}")).status, 502);
});
test("prescription byte cap accepts multibyte payload over 64 KiB and rejects over 256 KiB", async () => {
  const body = "é".repeat(40000);
  assert.equal((await proxy("prescriptions", "POST", "", async (_, init) => { assert.equal(init.body.byteLength, 80000); return Response.json({}); }, body)).status, 200);
  assert.equal((await proxy("prescriptions", "POST", "", async () => { assert.fail("oversized body"); }, "é".repeat(131073))).status, 413);
  assert.equal((await proxy("consultations", "POST", "", Response.json({}), body)).status, 413);
});
for (const status of [401, 403, 409, 422, 503]) test(`PDF proxy preserves RFC 9457 status ${status} and no-store`, async () => {
  const body = { type: "about:blank", status, title: "Erreur" };
  const response = await proxy(`prescriptions/${id}/pdf`, "GET", `?patientId=${patientId}&version=1`, Response.json(body, { status, headers: { "Content-Type": "application/problem+json" } }));
  assert.equal(response.status, status); assert.deepEqual(await response.json(), body); assert.match(response.headers.get("Cache-Control"), /no-store/);
});
test("PDF proxy streams exact bytes with safe download headers and cookie rotation", async () => {
  const response = await proxy(`prescriptions/${id}/pdf`, "GET", `?patientId=${patientId}&version=1&disposition=attachment`, pdfResponse({ "X-Private": canary, ETag: "private", "Set-Cookie": "JSESSIONID=rotated; Path=/; HttpOnly" }));
  assert.equal(response.status, 200); assert.equal(response.headers.get("Content-Type"), "application/pdf");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff"); assert.equal(response.headers.get("Vary"), "Cookie");
  assert.equal(response.headers.get("Content-Disposition"), `attachment; filename="ordonnance-${id}.pdf"`);
  assert.equal(response.headers.get("Content-Length"), String(pdfBytes.length)); assert.equal(response.headers.get("ETag"), null);
  assert.equal(response.headers.get("X-Private"), null); assert.equal(response.headers.getSetCookie().length, 1);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), pdfBytes);
});
test("PDF proxy refuses bad headers, oversized lengths, wrong MIME and redirects", async () => {
  for (const upstream of [pdfResponse({ "Content-Length": "2097153" }), pdfResponse({ "Content-Length": "" }),
    pdfResponse({ "Content-Disposition": "attachment; filename=private.pdf" }), pdfResponse({ "Content-Type": "text/html" }),
    new Response(null, { status: 302, headers: { Location: "http://private" } })])
    assert.equal((await proxy(`prescriptions/${id}/pdf`, "GET", `?patientId=${patientId}&version=1&disposition=attachment`, upstream)).status, 502);
});
test("PDF stream truncation or overflow aborts instead of completing corrupt download", async () => {
  for (const length of [1, pdfBytes.length + 1]) {
    const response = await proxy(`prescriptions/${id}/pdf`, "GET", "?disposition=attachment", pdfResponse({ "Content-Length": String(length) }));
    await assert.rejects(response.arrayBuffer());
  }
});
test("proxy offline and cross-origin errors are safe", async () => {
  const response = await proxy("prescriptions", "GET", `?patientId=${patientId}`, async () => { throw new Error(canary); });
  assert.equal(response.status, 503); assert(!(await response.text()).includes(canary));
  const cross = await proxyAuthentication(new Request("http://clinic.local/api/v1/prescriptions", { method: "POST", headers: { Origin: "http://attacker.invalid" } }), "prescriptions");
  assert.equal(cross.status, 403);
});
test("RHF/Zod preserves input, association and ordered server line UUIDs", async () => {
  const values = prescriptionDraftValues(patientId, record.content);
  assert.equal(values.consultationId, ""); assert.deepEqual(prescriptionDraftCommand(values), { patientId, content: record.content });
  const form = createFormControl({ defaultValues: values, resolver: zodResolver(prescriptionDraftFormSchema) });
  form.subscribe({ formState: { values: true }, callback() {} }); form.setValue("generalInstructions", canary); let submitted;
  await form.handleSubmit(v => { submitted = v; })(); assert.equal(submitted.generalInstructions, canary); assert.equal(submitted.medications[0].id, lineId);
  form.setValue("issuedDate", "2026-02-30"); submitted = undefined;
  await form.handleSubmit(v => { submitted = v; })(); assert.equal(submitted, undefined); assert.equal(form.getValues("generalInstructions"), canary);
});
test("duplicate-submit guard, conflict freeze and explicit reload preserve unsaved input", async () => {
  const mutation = createPrescriptionMutation(0, true); let reject, calls = 0;
  const form = createFormControl({ defaultValues: prescriptionDraftValues(patientId, record.content) }); form.subscribe({ formState: { values: true }, callback() {} }); form.setValue("generalInstructions", canary);
  const first = mutation.submit(version => { calls++; assert.equal(version, 0); return new Promise((_, no) => { reject = no; }); });
  await mutation.submit(async () => { calls++; return record; }); assert.equal(calls, 1); assert.equal(mutation.acceptReload(2, true), false);
  reject(new PrescriptionApiError(409)); await first;
  assert(mutation.getSnapshot().blocked); assert.equal(form.getValues("generalInstructions"), canary);
  await mutation.submit(async () => { assert.fail("No retry"); });
  assert.equal(mutation.acceptReload(2, false), false); assert.equal(mutation.getSnapshot().version, 0);
  assert.equal(mutation.acceptReload(2, true), true); await mutation.submit(async version => { assert.equal(version, 2); return { ...record, version: 3 }; });
  assert(mutation.getSnapshot().completed);
});
test("revoked mutation suppresses success and exposes accessible safe feedback", async () => {
  const mutation = createPrescriptionMutation(0, true); let resolve;
  const pending = mutation.submit(() => new Promise(yes => { resolve = yes; })); mutation.setAllowed(false); resolve(record);
  assert.equal(await pending, undefined); assert.equal(mutation.getSnapshot().error.status, 403);
  const html = renderToStaticMarkup(createElement(PrescriptionMutationFeedback, { state: mutation.getSnapshot(), allowed: true }));
  assert.match(html, /role="alert"/); assert.match(html, /aria-live="polite"/);
  assert.equal(renderToStaticMarkup(createElement(PrescriptionMutationFeedback, { state: mutation.getSnapshot(), allowed: false })), "");
});
test("persisted client imports no browser persistence, fixtures or PDF renderer and demo stays isolated", async () => {
  for (const path of ["lib/prescriptions/api/client.ts", "lib/prescriptions/api/download.ts", "components/prescriptions/persistent/use-prescription-forms.ts"]) {
    const source = await readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
    assert(!/localStorage|sessionStorage|indexedDB|console\.|pdf-lib|pdf\/service|renderPrescriptionPdf|src\/data/.test(source));
  }
  const route = await readFile(new URL("../src/app/(cabinet)/demo/documents/page.tsx", import.meta.url), "utf8"); assert(!route.includes("persistent"));
});
test("update transport preserves reordered existing line UUIDs and omits IDs for new lines", async () => {
  const ordered = [{ ...line, id: consultationId }, { ...line, id: lineId }, { ...line, medicationName: "Nouvelle ligne fictive" }];
  const h = harness({ ...record, version: 1 });
  await h.api.update(patientId, id, { version: 0, content: { ...content, medications: ordered } });
  const sent = JSON.parse(h.calls[1].options.body);
  assert.deepEqual(sent.content.medications, ordered);
  assert.equal(Object.hasOwn(sent.content.medications[2], "id"), false);
});
test("permission revoked during CSRF prevents the write", async () => {
  let allowed = true, calls = 0;
  const api = createPrescriptionApi({ canAccess: () => allowed, fetcher: async () => { calls++; allowed = false; return Response.json(csrf); } });
  await assert.rejects(api.create({ patientId, content }), { status: 403 }); assert.equal(calls, 1);
});
test("permission revoked while consuming PDF bytes suppresses the download result", async () => {
  let allowed = true;
  const delayed = createPrescriptionApi({ canAccess: () => allowed, fetcher: async () => {
    let emitted = false;
    return new Response(new ReadableStream({ pull(controller) {
      if (emitted) { allowed = false; controller.close(); } else { emitted = true; controller.enqueue(pdfBytes); }
    } }), { headers: { "Content-Type": "application/pdf", "Content-Length": String(pdfBytes.length),
      "Content-Disposition": `attachment; filename="ordonnance-${id}.pdf"` } });
  } });
  await assert.rejects(delayed.download(patientId, id, 1), { status: 403 });
});
test("PDF byte count survives Next streaming without Content-Length", async () => {
  const response = pdfResponse({ "X-Prescription-PDF-Bytes": String(pdfBytes.length) });
  response.headers.delete("Content-Length");
  const result = await prescriptionPdf(response, id);
  assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), pdfBytes);
});
test("inconsistent PDF byte-count headers fail closed", async () => {
  await assert.rejects(prescriptionPdf(pdfResponse({ "X-Prescription-PDF-Bytes": "1" }), id), { status: 502 });
});
