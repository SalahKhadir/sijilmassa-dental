import assert from "node:assert/strict";
import test from "node:test";
import { createFinancialApi, FinancialApiError } from "../src/lib/financial/client.ts";
import { formatMad, parseMad, validPaymentAmount } from "../src/lib/financial/money.ts";
import { createPaymentAttempts, paymentIntent } from "../src/lib/financial/payment-attempt.ts";
import { consultationPricing, summary, verso } from "../src/lib/financial/schemas.ts";
import { proxyAuthentication } from "../src/lib/auth/backend-proxy.ts";
import { canAccessPath } from "../src/lib/auth/permissions.ts";

const patientId = "00000000-0000-0000-0000-000000000001";
const chargeId = "00000000-0000-0000-0000-000000000002";
const path = `/api/v1/financial/charges/${chargeId}/payments?patientId=${patientId}`;
const charge = { chargeId, version: 0, date: "2026-11-11", treatmentLabel: "Soin synthétique", currency: "MAD",
  priceMinor: 10000, receivedMinor: 0, remainingMinor: 10000, settlement: "DUE" };
const totals = { currency: "MAD", chargesMinor: "18014398509481982", receivedMinor: "18014398509481981", outstandingMinor: "1" };

test("MAD conversion is exact through Number.MAX_SAFE_INTEGER and large totals stay exact", () => {
  assert.equal(parseMad(" 0,01 "), 1);
  assert.equal(parseMad("12.3"), 1230);
  assert.equal(parseMad("90071992547409,91"), Number.MAX_SAFE_INTEGER);
  for (const amount of ["", "9,001", "1e3", "-2", "+1", "1 000", "90071992547409,92", "1.2,3"]) assert.equal(parseMad(amount), undefined);
  assert.equal(parseMad("0"), 0);
  assert.match(formatMad("18014398509481982").replace(/[.\s]/g, ""), /^180143985094819,82DH$/);
  assert.equal(validPaymentAmount(0, 200), false);
  assert.equal(validPaymentAmount(201, 200), false);
  assert.equal(validPaymentAmount(200, 200), true);
});

test("financial DTOs reject invalid amounts, extra clinical fields, inconsistent totals and oversized pages", () => {
  assert(summary.safeParse({ items: [charge], nextCursor: null, totals }).success);
  for (const row of [{ ...charge, notes: "confidential" }, { ...charge, priceMinor: 10000.5 },
    { ...charge, priceMinor: "10000" }, { ...charge, date: "2026-02-30" }, { ...charge, remainingMinor: 1 }]) {
    assert(!summary.safeParse({ items: [row], nextCursor: null, totals }).success);
  }
  for (const amount of ["invalid", "02", "2"]) assert(!summary.safeParse({ items: [], nextCursor: null,
    totals: { ...totals, outstandingMinor: amount } }).success);
  assert(!summary.safeParse({ items: Array(51).fill(charge), nextCursor: null, totals }).success);
  assert(!verso.safeParse({ items: [charge], nextCursor: null, totals }).success);
});

test("client enforces dentist and persisted UUID, and only uses scoped same-origin URLs", async () => {
  const calls = [];
  let role = "RECEPTIONIST";
  const api = createFinancialApi({ access: () => role, fetcher: async (url, options) => {
    calls.push([url, options]);
    if (url.endsWith("/csrf")) return Response.json({ headerName: "X-CSRF-TOKEN", token: "synthetic" });
    return Response.json(charge, { status: 201 });
  } });
  const body = { patientId, consultationId: chargeId, treatmentId: patientId, priceMinor: 10000, expectedConsultationVersion: 2 };
  await assert.rejects(api.create(body), { status: 403 });
  role = "DENTIST";
  await assert.rejects(api.create({ ...body, treatmentId: "local-row" }), { status: 400 });
  assert.equal(calls.length, 0);
  await api.create(body);
  assert.equal(calls[1][0], "/api/v1/financial/charges");
  assert.deepEqual(JSON.parse(calls[1][1].body), body);
  assert.equal(calls[1][1].headers["X-CSRF-TOKEN"], "synthetic");
  assert.equal(calls[1][1].cache, "no-store");
});

test("client accepts only known RFC 9457 conflict codes, handles expiry and aborts an expired scope", async () => {
  const controller = new AbortController();
  let loggedOut = 0;
  let status = 409;
  const api = createFinancialApi({ access: () => "RECEPTIONIST", signal: controller.signal,
    unauthenticated: () => { loggedOut++; }, fetcher: async (_url, options) => {
      if (options.signal.aborted) throw new DOMException("Aborted", "AbortError");
      return Response.json({ status, code: "VERSION_CONFLICT", detail: "SYNTHETIC_PRIVATE_PAYLOAD" },
        { status, headers: { "Content-Type": "application/problem+json" } });
    } });
  await assert.rejects(api.get(patientId, chargeId), error =>
    error.status === 409 && error.code === "VERSION_CONFLICT" && !error.message.includes("SYNTHETIC_PRIVATE_PAYLOAD"));
  status = 401;
  await assert.rejects(api.get(patientId, chargeId), { status: 401 });
  assert.equal(loggedOut, 1);
  controller.abort();
  await assert.rejects(api.get(patientId, chargeId), { status: 503 });
});

test("uncertain attempts hold the exact immutable payload and only permit a replay for the same charge", () => {
  const attempts = createPaymentAttempts();
  const body = paymentIntent(4, 123, "ESPECES");
  const original = attempts.begin(patientId, chargeId, body);
  assert.ok(Object.isFrozen(body));
  assert.equal(attempts.begin(patientId, chargeId, body), undefined);
  attempts.finish(original, new FinancialApiError(503));
  assert.equal(attempts.snapshot().phase, "uncertain");
  assert.equal(attempts.begin(chargeId, patientId), undefined);
  assert.equal(attempts.begin(patientId, chargeId, paymentIntent(5, 123, "ESPECES")), undefined);
  const replay = attempts.begin(patientId, chargeId);
  assert.equal(replay.body, body);
  assert.equal(replay.body.operationId, original.body.operationId);
  attempts.finish(replay, new FinancialApiError(408), true);
  const csrfRefused = attempts.begin(patientId, chargeId);
  attempts.finish(csrfRefused, new FinancialApiError(403), true);
  const retry = attempts.begin(patientId, chargeId);
  attempts.finish(retry, new FinancialApiError(409, "VERSION_CONFLICT"), true);
  assert.equal(attempts.snapshot(), undefined);
  const reconfirmed = paymentIntent(5, 123, "ESPECES");
  assert.notEqual(reconfirmed.operationId, body.operationId);
  assert.equal(reconfirmed.expectedChargeVersion, 5);
});

test("pricing uses the complete UUID mapping from the matching consultation version", async () => {
  const consultationId = "00000000-0000-0000-0000-000000000003";
  const first = "00000000-0000-0000-0000-000000000004";
  const second = "00000000-0000-0000-0000-000000000005";
  const record = { id: consultationId, patientId, version: 4, treatments: [{ id: first }, { id: second }] };
  const priced = { treatmentId: first, state: "PRICED", chargeId, priceMinor: 0 };
  const unpriced = { treatmentId: second, state: "UNPRICED", chargeId: null, priceMinor: null };
  const snapshot = { patientId, consultationId, consultationVersion: 4, items: [unpriced, priced] };
  let response = snapshot;
  let role = "RECEPTIONIST";
  let calls = 0;
  const api = createFinancialApi({ access: () => role, fetcher: async (url, options) => {
    calls++;
    assert.equal(url, `/api/v1/financial/consultations/${consultationId}/pricing?patientId=${patientId}`);
    assert.equal(options.method, "GET");
    return Response.json(response);
  } });
  await assert.rejects(api.consultationPricing(record), { status: 403 });
  assert.equal(calls, 0);
  role = "DENTIST";
  const mapping = await api.consultationPricing(record);
  assert.deepEqual(mapping.get(first), priced);
  assert.deepEqual(mapping.get(second), unpriced);
  response = { ...snapshot, consultationVersion: 5 };
  await assert.rejects(api.consultationPricing(record), { status: 409, code: "VERSION_CONFLICT" });
  for (const invalid of [
    { ...snapshot, patientId: second }, { ...snapshot, consultationId: first },
    { ...snapshot, items: [priced] }, { ...snapshot, items: [priced, { ...unpriced, treatmentId: chargeId }] },
    { ...snapshot, items: [priced, priced] }, { ...snapshot, items: [priced, { ...unpriced, notes: "private" }] },
    { ...snapshot, items: [priced, { ...unpriced, priceMinor: 0 }] },
  ]) {
    response = invalid;
    await assert.rejects(api.consultationPricing(record), { status: 502 });
  }
  assert(!consultationPricing.safeParse({ ...snapshot, items: Array(51).fill(unpriced) }).success);
});

test("all seven proxy entries preserve scope, cookies, CSRF and safe Location", async () => {
  const entries = [
    ["GET", `financial/charges/${chargeId}?patientId=${patientId}`],
    ["GET", `financial/charges/${chargeId}/payments?patientId=${patientId}&afterPaymentId=${chargeId}`],
    ["POST", path.slice("/api/v1/".length)],
    ["GET", `financial/patients/${patientId}/summary?afterDate=2026-11-11&afterChargeId=${chargeId}`],
    ["GET", `financial/patients/${patientId}/verso`],
    ["POST", "financial/charges"],
    ["GET", `financial/consultations/${chargeId}/pricing?patientId=${patientId}`],
  ];
  for (const [method, target] of entries) {
    const location = `/api/v1/financial/charges/${chargeId}?patientId=${patientId}`;
    const response = await proxyAuthentication(new Request(`http://localhost/api/v1/${target}`, {
      method, headers: { Cookie: "analytics=ignored; JSESSIONID=fixture", "X-CSRF-TOKEN": "synthetic" },
      body: method === "POST" ? "{}" : undefined,
    }), target.split("?")[0], { origin: "http://127.0.0.1:9", fetcher: async (url, options) => {
      assert.equal(url, `http://127.0.0.1:9/api/v1/${target}`);
      assert.equal(options.headers.get("Cookie"), "JSESSIONID=fixture");
      assert.equal(options.headers.get("X-CSRF-TOKEN"), "synthetic");
      assert.equal(options.redirect, "manual");
      return Response.json({}, target === "financial/charges" ? { status: 201, headers: { Location: location } } : {});
    } });
    assert.equal(response.status, target === "financial/charges" ? 201 : 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.headers.get("location"), target === "financial/charges" ? location : null);
  }
});

test("proxy rejects unsupported methods, routes, invalid IDs, cross-origin writes and oversized bodies", async () => {
  let calls = 0;
  const options = { origin: "http://127.0.0.1:9", fetcher: async () => { calls++; return Response.json({}); } };
  for (const [method, route, status, origin, body] of [
    ["GET", "financial/charges", 405], ["PUT", `financial/charges/${chargeId}`, 405],
    ["POST", `financial/consultations/${chargeId}/pricing`, 405], ["GET", `financial/consultations/${chargeId}`, 404],
    ["POST", `financial/charges/${chargeId}/refund`, 404], ["GET", "financial/patients/123/summary", 404],
    ["GET", `financial/patients/${patientId}/clinical`, 404], ["GET", `financial/charges/${chargeId}/payments/private`, 404],
    ["POST", "financial/charges", 403, "http://untrusted.invalid"], ["POST", "financial/charges", 413, undefined, "x".repeat(4097)],
  ]) {
    const result = await proxyAuthentication(new Request(`http://localhost/api/v1/${route}`, {
      method, headers: origin ? { Origin: origin } : {}, body,
    }), route, options);
    assert.equal(result.status, status);
  }
  assert.equal(calls, 0);
  const response = await proxyAuthentication(new Request("http://localhost/api/v1/financial/charges", { method: "POST" }),
    "financial/charges", { ...options, fetcher: async () => Response.json({}, { status: 201, headers: { Location: "http://127.0.0.1:9/private" } }) });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("location"), null);
  assert(canAccessPath("RECEPTIONIST", `/patients/${patientId}/finances`));
  assert(!canAccessPath("RECEPTIONIST", `/patients/${patientId}/dossier`));
});
