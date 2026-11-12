import assert from "node:assert/strict";
import test from "node:test";
import { proxyAuthentication } from "../src/lib/auth/backend-proxy.ts";
import { canAccessPath } from "../src/lib/auth/permissions.ts";
import { createInsuranceApi, InsuranceApiError } from "../src/lib/insurance/api/client.ts";
import { detailSchema, insuranceDraftSchema } from "../src/lib/insurance/api/schemas.ts";

const patientId = "19000000-0000-4000-8000-000000000001";
const documentId = "19000000-0000-4000-8000-000000000002";
const wrongId = "19000000-0000-4000-8000-000000000003";
const collection = "insurance-documents";
const scope = `?patientId=${patientId}`;
const detailPath = `${collection}/${documentId}`;
const history = `patients/${patientId}/${collection}`;
const record = {
  patientId, documentId, documentType: "CNSS_DENTAIRE", templateVersion: 1, purpose: "ENTENTE_PREALABLE", version: 0,
  lifecycle: "BROUILLON", currency: "MAD", createdAt: "2026-11-12T10:00:00.123456Z", updatedAt: "2026-11-12T10:00:00.123456Z",
  beneficiary: { patientId, version: 3, firstName: "Fictif", lastName: "Test" }, draft: { fields: { cnss: {} }, acts: [] },
};

test("exact insurance proxy operations preserve CSRF, cookies, query, body, Location and no-store", async () => {
  const location = `/api/v1/${detailPath}${scope}`;
  const cursor = `?afterCreatedAt=2026-11-12T10%3A00%3A00.123456Z&afterDocumentId=${documentId}`;
  for (const [method, path, query] of [["POST", collection, ""], ["GET", detailPath, scope], ["PUT", detailPath, scope],
    ["POST", `${detailPath}/finalize`, scope], ["GET", history, cursor]]) {
    const request = new Request(`http://clinic.local/api/v1/${path}${query}`, {
      method, headers: { Cookie: "JSESSIONID=synthetic; ignored=yes", "X-CSRF-TOKEN": "token", Origin: "http://clinic.local", "Content-Type": "application/json" },
      ...(method === "GET" ? {} : { body: "{}" }),
    });
    const result = await proxyAuthentication(request, path, { origin: "http://private-backend", fetcher: async (url, init) => {
      assert.equal(url, `http://private-backend/api/v1/${path}${query}`);
      assert.equal(init.method, method);
      assert.equal(init.headers.get("Cookie"), "JSESSIONID=synthetic");
      assert.equal(init.headers.get("X-CSRF-TOKEN"), "token");
      assert.equal(init.body && new TextDecoder().decode(init.body), method === "GET" ? undefined : "{}");
      return Response.json({}, path === collection ? { status: 201, headers: { Location: location } } : {});
    } });
    assert.equal(result.status, path === collection ? 201 : 200);
    assert.equal(result.headers.get("location"), path === collection ? location : null);
    assert.match(result.headers.get("cache-control"), /private, no-store/);
  }
});

test("insurance proxy rejects methods, arbitrary routes, oversized writes, cross-origin writes and untrusted locations", async () => {
  const send = (path, method, init = {}, fetcher = async () => assert.fail("unexpected upstream request")) =>
    proxyAuthentication(new Request(`http://clinic.local/api/v1/${path}`, { method, ...init }), path, { origin: "http://private-backend", fetcher });
  for (const [path, method, status] of [
    [collection, "GET", 405], [detailPath, "POST", 405], [detailPath, "DELETE", 405],
    [`${detailPath}/finalize`, "PUT", 405], [`${detailPath}/finalize`, "GET", 405], [history, "POST", 405],
    [`${detailPath}/pdf`, "POST", 405], [`${detailPath}/pdf/raw`, "GET", 404], [`${detailPath}/submit`, "POST", 404], [`${collection}/fake`, "GET", 404],
  ]) assert.equal((await send(path, method)).status, status);
  assert.equal((await send(collection, "POST", { body: "x".repeat(131073) })).status, 413);
  assert.equal((await send(collection, "POST", { headers: { Origin: "https://other.invalid" } })).status, 403);
  assert.equal((await send(collection, "POST", {}, async () =>
    Response.json({}, { status: 201, headers: { Location: "http://private-backend/secret" } }))).status, 502);
  assert.equal(canAccessPath("RECEPTIONIST", `/patients/${patientId}/assurances`), false);
  assert.equal(canAccessPath("RECEPTIONIST", "/documents/assurances/nouvelle"), false);
});

test("draft schemas enforce variant, act limits, source rules, and exact optional centimes", () => {
  for (const [type, purpose, key, limit] of [["CNSS_DENTAIRE", "ENTENTE_PREALABLE", "cnss", 3],
    ["CNOPS_DENTAIRE", "ENTENTE_PREALABLE", "cnops", 9], ["FAR_DENTAIRE", "DEVIS", "far", 5]]) {
    const schema = insuranceDraftSchema(type, purpose);
    const fields = { [key]: {} };
    const acts = Array.from({ length: limit }, () => ({ fields: { quotedFeeMinor: Number.MAX_SAFE_INTEGER } }));
    assert.equal(schema.parse({ fields, acts }).acts[0].fields.quotedFeeMinor, Number.MAX_SAFE_INTEGER);
    assert.equal(schema.safeParse({ fields, acts: [...acts, { fields: {} }] }).success, false);
    assert.equal(schema.safeParse({ fields, acts: [{ treatmentId: wrongId, fields: {} }] }).success, false);
    assert.equal(schema.safeParse({ fields, acts: [{ fields: { quotedFeeMinor: Number.MAX_SAFE_INTEGER + 1 } }] }).success, false);
    assert.equal(schema.parse({ fields, acts: [{ fields: { quotedFeeMinor: 0 } }, { fields: {} }] }).acts[0].fields.quotedFeeMinor, 0);
    assert.equal(schema.parse({ fields }).fields.attachmentCount, undefined);
  }
  assert.equal(insuranceDraftSchema("CNOPS_DENTAIRE", "EXECUTION").safeParse({
    fields: { cnops: { diagnosisCategory: "A25.3", practitionerInpe: "123" } },
  }).success, false);
  assert.equal(insuranceDraftSchema("FAR_DENTAIRE", "RECUS").safeParse({
    fields: { far: { marks: [{ tooth: "99", symbol: "CROIX" }] } },
  }).success, false);
  assert.equal(insuranceDraftSchema("CNSS_DENTAIRE", "ENTENTE_PREALABLE").safeParse({ fields: { cnss: {}, far: {} } }).success, false);
});

test("finalized response tolerates historical optional fields and retains an exact decimal-string total", () => {
  const finalized = {
    ...record, version: 1, lifecycle: "FINALISE", finalizedAt: record.createdAt, draft: null,
    snapshot: { schemaVersion: 1, templateSha256: "a".repeat(64), fields: { cnss: {} },
      insured: { source: "PATIENT", relationship: "LUI_MEME" },
      acts: [{ feeMinor: Number.MAX_SAFE_INTEGER }, { feeMinor: Number.MAX_SAFE_INTEGER }],
      knownCompleteFeeTotalMinor: "18014398509481982" },
    unrecognizedFutureField: "discard",
  };
  const value = detailSchema.parse(finalized);
  assert.equal(value.snapshot.knownCompleteFeeTotalMinor, "18014398509481982");
  assert.equal(value.snapshot.insured.cin, undefined);
  assert.equal(value.unrecognizedFutureField, undefined);
});

test("versioned writes use one CSRF and one request, preserving the typed conflict without replay", async () => {
  const requests = [];
  const api = createInsuranceApi({ access: () => "DENTIST", signal: () => undefined, unauthenticated() {},
    fetcher: async (path, init) => {
      requests.push([path, init]);
      if (path.endsWith("/csrf")) return Response.json({ headerName: "X-CSRF-TOKEN", token: "synthetic" });
      return Response.json({ status: 409, code: "VERSION_CONFLICT", requestId: wrongId, detail: "untrusted" },
        { status: 409, headers: { "Content-Type": "application/problem+json" } });
    } });
  await assert.rejects(api.finalize(record), error => error instanceof InsuranceApiError
    && error.code === "VERSION_CONFLICT" && error.requestId === wrongId && !error.message.includes("untrusted"));
  assert.equal(requests.length, 2);
  assert.equal(requests[1][0], `/api/v1/${detailPath}/finalize${scope}`);
  assert.equal(requests[1][1].headers["X-CSRF-TOKEN"], "synthetic");
  assert.deepEqual(JSON.parse(requests[1][1].body), { expectedVersion: 0, expectedPatientVersion: 3 });
});

test("client scopes document reads and cancels requests when the owning session ends", async () => {
  let role = "RECEPTIONIST";
  let called = 0;
  const session = new AbortController();
  const api = createInsuranceApi({ access: () => role, signal: () => session.signal, unauthenticated() {},
    fetcher: async (_path, init) => {
      called++;
      if (called === 2) { session.abort(); assert.equal(init.signal.aborted, true); }
      return Response.json({ ...record, documentId: wrongId });
    } });
  await assert.rejects(api.get(patientId, documentId), { status: 403 });
  assert.equal(called, 0);
  role = "DENTIST";
  await assert.rejects(api.get(patientId, documentId), { status: 502 });
  await assert.rejects(api.get(patientId, documentId), { status: 403 });
  assert.equal(called, 2);
});

test("insurance PDF proxy validates the exact attachment and larger pinned form size before replying", async () => {
  const route = `${detailPath}/pdf`;
  const filename = `formulaire-assurance-${documentId}.pdf`;
  const size = 3 * 1024 * 1024;
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("%PDF-"));
  const valid = { "Content-Type": "application/pdf", "Content-Length": String(size), "Content-Disposition": `attachment; filename="${filename}"` };
  const send = (headers, body = bytes) => proxyAuthentication(new Request(`http://clinic.local/api/v1/${route}${scope}`), route, {
    origin: "http://private-backend", fetcher: async (url, request) => {
      assert.equal(url, `http://private-backend/api/v1/${route}${scope}`);
      assert.equal(request.method, "GET");
      return new Response(body, { headers });
    },
  });
  const success = await send(valid);
  assert.equal(success.status, 200);
  assert.equal(success.headers.get("X-Insurance-PDF-Bytes"), String(size));
  assert.equal(success.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(success.headers.get("Cache-Control"), /no-store/);
  assert.deepEqual(new Uint8Array(await success.arrayBuffer()), bytes);
  for (const result of [
    await send({ ...valid, "Content-Disposition": 'attachment; filename="private.pdf"' }),
    await send({ ...valid, "Content-Length": String(8 * 1024 * 1024 + 1) }),
    await send(valid, new Uint8Array(size)),
    await send(valid, bytes.slice(0, 60)),
  ]) {
    assert.equal(result.status, 502);
    assert.match(result.headers.get("Content-Type"), /problem\+json/);
  }
});

test("insurance PDF client checks binary metadata and maps safe renderer problems", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\n");
  const headers = { "Content-Type": "application/pdf", "X-Insurance-PDF-Bytes": String(bytes.length),
    "Content-Disposition": `attachment; filename="formulaire-assurance-${documentId}.pdf"` };
  const session = new AbortController();
  const setup = (response) => createInsuranceApi({ access: () => "DENTIST", signal: () => session.signal, unauthenticated() {},
    fetcher: async (path, request) => {
      assert.equal(path, `/api/v1/${detailPath}/pdf${scope}`);
      assert.equal(request.cache, "no-store");
      return response;
    } });
  const success = await setup(new Response(bytes, { headers })).pdf(patientId, documentId);
  assert.equal(success.filename, `formulaire-assurance-${documentId}.pdf`);
  assert.deepEqual(new Uint8Array(await success.blob.arrayBuffer()), bytes);
  await assert.rejects(setup(new Response(bytes.slice(0, 5), { headers })).pdf(patientId, documentId), { status: 502 });
  const problem = Response.json({ status: 422, code: "INSURANCE_PDF_LAYOUT_OVERFLOW", detail: "sensitive ignored" },
    { status: 422, headers: { "Content-Type": "application/problem+json" } });
  await assert.rejects(setup(problem).pdf(patientId, documentId), error => error.code === "INSURANCE_PDF_LAYOUT_OVERFLOW"
    && !error.message.includes("sensitive ignored"));
});
