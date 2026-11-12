import assert from "node:assert/strict";
import test from "node:test";
import { proxyAuthentication } from "../src/lib/auth/backend-proxy.ts";
import { canAccessPath } from "../src/lib/auth/permissions.ts";
import { formatMad } from "../src/lib/financial/money.ts";
import { createInvoiceApi, InvoiceApiError, unknownInvoiceOutcome } from "../src/lib/invoices/client.ts";
import { invoiceDetail, eligiblePage, historyPage, sumPrices } from "../src/lib/invoices/schemas.ts";

const patient = "00000000-0000-4000-8000-000000000001";
const invoice = "00000000-0000-4000-8000-000000000002";
const charge = "00000000-0000-4000-8000-000000000003";
const other = "00000000-0000-4000-8000-000000000004";
const date = "2026-11-11";
const instant = date + "T09:00:00.123456Z";
const identity = { reference: "P-001", firstName: "Patient", lastName: "Fictif" };
const line = { chargeId: charge, treatmentDate: date, treatmentLabel: "Soin fictif", priceMinor: 100 };
const balance = { totalMinor: "100", receivedMinor: "40", remainingMinor: "60" };
const draft = { invoiceId: invoice, patientId: patient, version: 0, lifecycle: "BROUILLON", currency: "MAD", createdAt: instant, updatedAt: instant,
  draft: { billingIdentity: identity, lines: [line] }, issuanceSnapshot: null, currentFinancialState: { balance, settlement: null } };
const issued = { ...draft, version: 1, lifecycle: "EMISE", draft: null, issuanceSnapshot: { invoiceNumber: "2026-001", issueDate: date,
  issuedAt: instant, billingIdentity: identity, lines: [{ ...line, receivedAtIssueMinor: 40 }], balanceAtIssue: balance },
  currentFinancialState: { balance: { totalMinor: "100", receivedMinor: "100", remainingMinor: "0" }, settlement: "SETTLED" } };

test("invoice proxy forwards only the six named operations and scoped queries", async () => {
  const detail = `invoices/${invoice}`;
  const paths = [["POST", "invoices", ""], ["GET", detail, `?patientId=${patient}`], ["PUT", detail, `?patientId=${patient}`],
    ["POST", detail + "/issue", `?patientId=${patient}`], ["GET", `patients/${patient}/invoices`, `?afterCreatedAt=${instant}&afterInvoiceId=${invoice}`],
    ["GET", `patients/${patient}/invoice-eligible-charges`, `?afterDate=${date}&afterChargeId=${charge}`]];
  for (const [method, path, query] of paths) {
    const headers = { Cookie: "JSESSIONID=synthetic; hidden=secret", "X-CSRF-TOKEN": "token", "Content-Type": "application/json" };
    const created = path === "invoices";
    const location = `/api/v1/${detail}?patientId=${patient}`;
    const response = await proxyAuthentication(new Request(`http://clinic.test/api/v1/${path}${query}`, {
      method, headers, body: method !== "GET" ? "{}" : undefined,
    }), path, { origin: "http://internal", fetcher: async (url, init) => {
      assert.equal(url, `http://internal/api/v1/${path}${query}`);
      assert.equal(init.method, method);
      assert.equal(init.headers.get("Cookie"), "JSESSIONID=synthetic");
      assert.equal(init.headers.get("X-CSRF-TOKEN"), "token");
      return Response.json({}, { status: created ? 201 : 200, headers: created ? { Location: location } : {} });
    } });
    assert.equal(response.status, created ? 201 : 200);
    assert.equal(response.headers.get("Location"), created ? location : null);
    assert.match(response.headers.get("Cache-Control"), /no-store/);
  }
});

test("invoice proxy rejects arbitrary suffixes, methods, cross-origin writes, oversized bodies and unsafe locations", async () => {
  const blocked = [["GET", "invoices", 405], ["DELETE", `invoices/${invoice}`, 405],
    ["GET", `invoices/${invoice}/issue`, 405], ["POST", `invoices/${invoice}/cancel`, 404],
    ["POST", `invoices/${invoice}/pdf`, 405], ["GET", "invoices/1-2-3-4-5", 404],
    ["POST", `patients/${patient}/invoices`, 405], ["GET", `patients/${patient}/invoice-eligible-charges/other`, 404]];
  let calls = 0;
  const options = { origin: "http://internal", fetcher: async () => { calls++; return Response.json({}); } };
  for (const [method, path, status] of blocked) {
    assert.equal((await proxyAuthentication(new Request(`http://clinic.test/api/v1/${path}`, { method }), path, options)).status, status);
  }
  const create = "http://clinic.test/api/v1/invoices";
  assert.equal((await proxyAuthentication(new Request(create, { method: "POST", body: "a".repeat(16385) }), "invoices", options)).status, 413);
  assert.equal((await proxyAuthentication(new Request(create, { method: "POST", headers: { Origin: "http://outside.test" } }), "invoices", options)).status, 403);
  assert.equal(calls, 0);
  for (const location of ["http://internal/path", "//internal/path", `/api/v1/invoices/${invoice}`]) {
    const response = await proxyAuthentication(new Request(create, { method: "POST", body: "{}" }), "invoices", {
      ...options, fetcher: async () => Response.json({}, { status: 201, headers: { Location: location } }),
    });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("Location"), null);
  }
});

test("reception may use persistent invoice routes and cannot access demo or clinical records", () => {
  for (const path of ["/facturation", "/facturation/nouvelle", `/facturation/${invoice}`, `/facturation/${invoice}/modifier`, `/patients/${patient}/factures`]) {
    assert.equal(canAccessPath("RECEPTIONIST", path), true);
  }
  for (const path of ["/demo/facturation", "/facturation/invoice-demo-001", `/facturation/${invoice}/pdf`, `/patients/${patient}/dossier`, "/consultations"]) {
    assert.equal(canAccessPath("RECEPTIONIST", path), false);
  }
});

test("strict invoice schemas distinguish drafts from issued snapshots and reject unsafe balances and clinical fields", () => {
  assert(invoiceDetail.safeParse(draft).success);
  assert(invoiceDetail.safeParse(issued).success);
  assert(!invoiceDetail.safeParse({ ...issued, draft: draft.draft }).success);
  assert(!invoiceDetail.safeParse({ ...draft, version: "0" }).success);
  assert(!invoiceDetail.safeParse({ ...draft, draft: { ...draft.draft, lines: [line, line] } }).success);
  assert(!invoiceDetail.safeParse({ ...draft, draft: { ...draft.draft, lines: [{ ...line, priceMinor: 1.25 }] } }).success);
  assert(!invoiceDetail.safeParse({ ...issued, issuanceSnapshot: { ...issued.issuanceSnapshot, balanceAtIssue: { ...balance, receivedMinor: "NaN" } } }).success);
  assert(!invoiceDetail.safeParse({ ...draft, currentFinancialState: { ...draft.currentFinancialState, balance: { ...balance, remainingMinor: "999" } } }).success);
  assert(!eligiblePage.safeParse({ currency: "MAD", items: [{ ...line, notes: "private" }], nextCursor: null }).success);
  assert(!eligiblePage.safeParse({ currency: "MAD", items: Array(51).fill(line), nextCursor: null }).success);
  assert(!historyPage.safeParse({ currency: "MAD", items: [], nextCursor: { afterCreatedAt: instant } }).success);
});

test("issued tooth references accept historical absence and retain the stored separator and ordering", () => {
  for (const reference of [undefined, null, "16", "17 / 18, 21"]) {
    const issuedLine = { ...issued.issuanceSnapshot.lines[0], ...(reference === undefined ? {} : { toothReference: reference }) };
    const parsed = invoiceDetail.parse({ ...issued, issuanceSnapshot: { ...issued.issuanceSnapshot, lines: [issuedLine] } });
    assert.equal(parsed.issuanceSnapshot.lines[0].toothReference, reference);
  }
  for (const invalid of ["", "1".repeat(51), [16, 17], 16]) {
    const issuedLine = { ...issued.issuanceSnapshot.lines[0], toothReference: invalid };
    assert(!invoiceDetail.safeParse({ ...issued, issuanceSnapshot: { ...issued.issuanceSnapshot, lines: [issuedLine] } }).success);
  }
  assert(!invoiceDetail.safeParse({ ...draft, draft: { ...draft.draft, lines: [{ ...line, toothReference: "16" }] } }).success);
});

test("amounts above JavaScript's safe integer remain exact in invoice totals and formatting", () => {
  const value = sumPrices([{ priceMinor: Number.MAX_SAFE_INTEGER }, { priceMinor: Number.MAX_SAFE_INTEGER }]);
  assert.equal(value, "18014398509481982");
  const formatted = formatMad(value).replace(/[.\s\u202f]/gu, "");
  assert.equal(formatted, "180143985094819,82DH");
});

test("invoice client uses versions and cursor pairs, validates scope and avoids write retries", async () => {
  const calls = [];
  let result = draft;
  const api = createInvoiceApi({ access: () => "RECEPTIONIST", fetcher: async (path, init) => {
    calls.push([path, init.method, init.body && JSON.parse(init.body)]);
    if (path === "/api/v1/auth/csrf") return Response.json({ headerName: "X-CSRF-TOKEN", token: "synthetic" });
    if (result instanceof Response) return result;
    return Response.json(result);
  } });
  await api.create(patient, [charge]);
  assert.deepEqual(calls.pop(), ["/api/v1/invoices", "POST", { patientId: patient, chargeIds: [charge] }]);
  result = { ...draft, version: 2 };
  await api.edit(patient, invoice, 1, [charge]);
  assert.deepEqual(calls.pop(), [`/api/v1/invoices/${invoice}?patientId=${patient}`, "PUT", { expectedVersion: 1, chargeIds: [charge] }]);
  result = issued;
  await api.issue(patient, invoice, 0);
  assert.deepEqual(calls.pop(), [`/api/v1/invoices/${invoice}/issue?patientId=${patient}`, "POST", { expectedVersion: 0 }]);
  result = { currency: "MAD", items: [], nextCursor: null };
  await api.history(patient, { afterCreatedAt: instant, afterInvoiceId: invoice });
  const historyUrl = new URL(calls.pop()[0], "http://clinic.test");
  assert.equal(historyUrl.searchParams.get("afterCreatedAt"), instant);
  assert.equal(historyUrl.searchParams.get("afterInvoiceId"), invoice);
  await api.eligible(patient, { afterDate: date, afterChargeId: charge });
  assert.deepEqual(calls.pop(), [`/api/v1/patients/${patient}/invoice-eligible-charges?afterDate=${date}&afterChargeId=${charge}`, "GET", undefined]);
  result = { ...draft, patientId: other };
  await assert.rejects(api.get(patient, invoice), error => error.status === 502);
  await assert.rejects(api.create(patient, [charge, charge.toUpperCase()]), error => error.status === 400);
  result = Response.json({ status: 409, code: "VERSION_CONFLICT", detail: "private" }, { status: 409, headers: { "Content-Type": "application/problem+json" } });
  const before = calls.length;
  await assert.rejects(api.issue(patient, invoice, 0), error => error instanceof InvoiceApiError && error.code === "VERSION_CONFLICT"
    && !unknownInvoiceOutcome(error) && !error.message.includes("private"));
  assert.equal(calls.length - before, 2);
});

test("invoice client aborts the authenticated request and redirects on session expiry", async () => {
  let unauthenticated = 0;
  const controller = new AbortController();
  const api = createInvoiceApi({ access: () => "DENTIST", signal: () => controller.signal,
    unauthenticated: () => { unauthenticated++; }, fetcher: async (_, options) => {
      assert.equal(options.signal.aborted, false);
      return Response.json({}, { status: 401 });
    } });
  await assert.rejects(api.get(patient, invoice), error => error.status === 401);
  assert.equal(unauthenticated, 1);
  controller.abort();
  await assert.rejects(api.get(patient, invoice), error => error.status === 403);
  assert.equal(unauthenticated, 1);
});
