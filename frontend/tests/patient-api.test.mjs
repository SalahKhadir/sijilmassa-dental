import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPatientApi, PatientApiError, administrativeInput, medicalInput, persistentFormSchema } from "../src/lib/patients/api/client.ts";
import { emptyPatientInput } from "../src/lib/patients/schema.ts";
import { proxyAuthentication } from "../src/lib/auth/backend-proxy.ts";
const id = "00000000-0000-4000-8000-000000000001";
const values = emptyPatientInput(); values.identity.firstName = "Fictive"; values.identity.lastName = "Validation";
const patient = { id, reference: "PAT-000001", ...administrativeInput(values), version: 7, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
const medical = { patientId: id, version: 3, createdAt: patient.createdAt, updatedAt: patient.updatedAt, record: medicalInput(values) };
const entry = { ...patient, identity: { firstName: "Fictive", lastName: "Validation", sex: "unanswered", dateOfBirth: null, gsm: "", landline: "" } }; delete entry.updatedAt;
function harness(response = patient) {
 const calls = [];
 const api = createPatientApi(async (url, init) => {
   calls.push({ url, ...init });
   return Response.json(url.endsWith("/csrf") ? { headerName: "X-CSRF-TOKEN", token: "synthetic-only" } : response);
 });
 return { api, calls };
}
test("list preserves server pagination and encoded name/phone search without private fields", async () => {
 const { api, calls } = harness({ items: [entry], total: 31, page: 2, pageSize: 20, pageCount: 2 });
 const data = await api.list({ q: "É & 06123", status: "all", sort: "name", page: 2, pageSize: 20 });
 assert.equal(data.total, 31); const url = new URL(calls[0].url, "http://clinic"); assert.equal(url.searchParams.get("q"), "É & 06123"); assert.equal(url.searchParams.get("page"), "2");
 assert(!("medicalHistory" in data.items[0])); assert(!("cin" in data.items[0].identity));
});
test("create uses server UUID/reference, nullable DOB and a fresh CSRF token", async () => {
 const { api, calls } = harness(); const result = await api.create(administrativeInput(values));
 assert.equal(result.id, id); assert.equal(calls.length, 2); const body = JSON.parse(calls[1].body);
 assert.deepEqual(Object.keys(body).sort(), ["identity", "status"]); assert.equal(body.identity.dateOfBirth, null);
 assert.equal(calls[1].headers["X-CSRF-TOKEN"], "synthetic-only"); assert.equal(calls[1].credentials, "same-origin"); assert.equal(calls[1].cache, "no-store");
});
test("admin update sends the captured integer version and no clinical fields", async () => {
 const { api, calls } = harness(); await api.update(id, 7, administrativeInput(values));
 assert.equal(JSON.parse(calls[1].body).version, 7); assert(!calls[1].body.includes("medicalHistory"));
});
test("medical read/write preserves independent version and unanswered semantics", async () => {
 const { api, calls } = harness(medical); await api.medical(id); await api.updateMedical(id, 3, medical.record);
 const body = JSON.parse(calls[2].body); assert.equal(body.version, 3); assert.equal(body.record.healthQuestionnaire.pregnant, "unanswered"); assert.equal(body.record.medicalHistory.reportStatus, "unanswered");
});
test("complete creation is a single atomic mutation with explicit administrative/medical projections", async () => {
 const { api, calls } = harness({ patient, medicalRecord: medical }); await api.createComplete(administrativeInput(values), medical.record);
 assert.equal(calls[1].url, "/api/v1/patients/with-medical-record"); assert.equal(calls.length, 2);
});
test("archive and restore use existing versioned PUT without delete or clinical fields", async () => {
 const { api, calls } = harness(); await api.archive(patient, "inactive"); await api.archive(patient, "active");
 assert.equal(calls[1].method, "PUT"); assert.equal(JSON.parse(calls[1].body).status, "inactive"); assert.equal(JSON.parse(calls[3].body).version, 7);
});
for (const status of [400,401,403,404,409,429,500,502,503]) test(`safe error ${status} has no payload echo, fallback or mutation replay`, async () => {
 let calls = 0, expired = 0;
 const api = createPatientApi(async url => { calls++; return url.endsWith("csrf") ? Response.json({ headerName: "X-CSRF-TOKEN", token: "synthetic" }) : Response.json({ detail: "PRIVATE-PAYLOAD" }, { status }); }, () => expired++);
 await assert.rejects(api.update(id, 7, administrativeInput(values)), error => error instanceof PatientApiError && error.status === status && !error.message.includes("PRIVATE"));
 assert.equal(calls, 2); assert.equal(expired, status === 401 ? 1 : 0);
});
test("CSRF failure prevents mutation, and network timeout never retries", async () => {
 let calls = 0;
 const api = createPatientApi(async () => { calls++; return Response.json({}, { status: 403 }); });
 await assert.rejects(api.create(administrativeInput(values)), { status: 403 }); assert.equal(calls, 1);
 const failing = createPatientApi(async () => { throw new DOMException("private-host", "TimeoutError"); });
 await assert.rejects(failing.get(id), { status: 503 });
});
test("invalid responses and unsafe integer versions fail closed", async () => {
 for (const invalid of [{ ...patient, version: 0.5 }, { ...patient, version: Number.MAX_SAFE_INTEGER + 1 }, { ...patient, medicalHistory: {} }, { ...patient, id: "patient-demo-001" }]) {
  await assert.rejects(harness(invalid).api.get(id), { status: 502 });
 }
 assert.throws(() => harness().api.update(id, 0.5, administrativeInput(values)));
});
test("prototype identifiers never reach backend; fictional X phone cannot persist", async () => {
 const { api, calls } = harness(); assert.throws(() => api.get("patient-demo-001"), { status: 404 }); assert.equal(calls.length, 0);
 assert.equal(persistentFormSchema().safeParse({ ...values, identity: { ...values.identity, gsm: "+212 6XX XX 00 00" } }).success, false);
});
test("patient proxy forwards bounded query, cookies, PUT and RFC9457 conflicts", async () => {
 const request = new Request(`http://clinic/api/v1/patients/${id}`, { method: "PUT", headers: { Origin: "http://clinic", Cookie: "JSESSIONID=fake; other=no", "X-CSRF-TOKEN": "fake" }, body: "{}" });
 const result = await proxyAuthentication(request, `patients/${id}`, { origin: "http://internal", fetcher: async (url, init) => {
  assert.equal(url, `http://internal/api/v1/patients/${id}`); assert.equal(init.method, "PUT"); assert.equal(init.headers.get("Cookie"), "JSESSIONID=fake"); assert.equal(init.headers.get("X-CSRF-TOKEN"), "fake");
  return Response.json({ type: "about:blank", status: 409 }, { status: 409, headers: { "Content-Type": "application/problem+json" } });
 }});
 assert.equal(result.status, 409); assert.match(result.headers.get("cache-control"), /no-store/);
 await proxyAuthentication(new Request("http://clinic/api/v1/patients?q=Fictive&page=2"), "patients", { origin: "http://internal", fetcher: async url => {
  assert.equal(url, "http://internal/api/v1/patients?q=Fictive&page=2"); return Response.json({});
 }});
});
test("proxy rejects arbitrary patient paths, methods, cross-origin PUT and excessive UTF8 body", async () => {
 for (const path of ["patients/../../auth/me", "patients/patient-demo-001", `patients/${id}/delete`, "patients/https://evil"]) assert.equal((await proxyAuthentication(new Request("http://clinic"), path)).status, 404);
 assert.equal((await proxyAuthentication(new Request("http://clinic", { method: "DELETE" }), `patients/${id}`)).status, 405);
 assert.equal((await proxyAuthentication(new Request("http://clinic", { method: "PUT", headers: { Origin: "http://evil" } }), `patients/${id}`)).status, 403);
 assert.equal((await proxyAuthentication(new Request("http://clinic", { method: "POST", body: "é".repeat(33000) }), "patients", { origin: "http://internal" })).status, 413);
 const valid = await proxyAuthentication(new Request("http://clinic", { method: "POST", body: "é".repeat(10000) }), "patients/with-medical-record", { origin: "http://internal", fetcher: async () => Response.json({}) }); assert.equal(valid.status, 200);
});
test("persistent patient screens have no prototype repository, PDF coupling, storage or logging", async () => {
 for (const name of ["directory.tsx","record.tsx","form.tsx","shared.tsx"]) {
  const text = await readFile(new URL(`../src/components/patients/persistent/${name}`, import.meta.url), "utf8");
  assert(!/localStorage|sessionStorage|indexedDB|console\.|patient-provider|patientFixtures|FinancialHistory|InsuranceSection|PatientPrescriptions/.test(text));
 }
});
