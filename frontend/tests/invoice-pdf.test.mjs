import assert from "node:assert/strict";
import test from "node:test";
import { proxyAuthentication } from "../src/lib/auth/backend-proxy.ts";
import { fetchInvoicePdf, InvoicePdfDownloadError } from "../src/lib/invoices/pdf-download.ts";

const invoiceId = "00000000-0000-4000-8000-000000000001";
const patientId = "00000000-0000-4000-8000-000000000002";
const invoice = { invoiceId, patientId, number: "2026-001" };
const path = `invoices/${invoiceId}/pdf`;
const query = `?patientId=${patientId}`;
const pdf = "%PDF-1.7\n%%EOF";
const filename = "facture-2026-001.pdf";
const headers = { "Content-Type": "application/pdf", "Content-Length": String(pdf.length),
  "Content-Disposition": `attachment; filename="${filename}"` };
const problem = (status, code) => Response.json({ status, code, detail: "INTERNAL-CANARY" },
  { status, headers: { "Content-Type": "application/problem+json" } });

test("invoice PDF proxy forwards the session and scope and returns only complete private bytes", async () => {
  const input = new Request(`http://clinic.test/api/v1/${path}${query}`, { headers: { Cookie: "JSESSIONID=test; other=private" } });
  const result = await proxyAuthentication(input, path, { origin: "http://internal", fetcher: async (url, options) => {
    assert.equal(url, `http://internal/api/v1/${path}${query}`);
    assert.equal(options.headers.get("Cookie"), "JSESSIONID=test");
    assert.equal(options.method, "GET");
    return new Response(pdf, { headers });
  } });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("Content-Disposition"), headers["Content-Disposition"]);
  assert.equal(result.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(result.headers.get("X-Invoice-PDF-Bytes"), String(pdf.length));
  assert.match(result.headers.get("Cache-Control"), /no-store/);
  assert.equal(await result.text(), pdf);
});

test("invoice PDF proxy denies other paths and methods and rejects unsafe or incomplete upstream PDF", async () => {
  for (const [route, method, status] of [[path, "POST", 405], [path + "/extra", "GET", 404], ["invoices/missing/pdf", "GET", 404],
    [`patients/${patientId}/invoice.pdf`, "GET", 404], [path, "HEAD", 405]]) {
    const result = await proxyAuthentication(new Request(`http://clinic.test/api/v1/${route}`, { method }), route,
      { origin: "http://internal", fetcher: () => assert.fail("Unlisted request reached Spring") });
    assert.equal(result.status, status);
  }
  for (const override of [{ "Content-Disposition": 'inline; filename="facture-2026-001.pdf"' },
    { "Content-Disposition": 'attachment; filename="../../secret.pdf"' }, { "Content-Length": "2097153" },
    { "Content-Length": String(pdf.length + 1) }, { "Content-Length": String(pdf.length - 1) }]) {
    const result = await proxyAuthentication(new Request(`http://clinic.test/api/v1/${path}${query}`), path,
      { origin: "http://internal", fetcher: async () => new Response(pdf, { headers: { ...headers, ...override } }) });
    assert.equal(result.status, 502);
    assert.match(result.headers.get("Content-Type"), /application\/problem\+json/);
    assert(!((await result.text()).includes("%PDF")));
  }
  const result = await proxyAuthentication(new Request(`http://clinic.test/api/v1/${path}${query}`), path,
    { origin: "http://internal", fetcher: async () => problem(422, "INVOICE_PDF_LAYOUT_OVERFLOW") });
  assert.equal(result.status, 422);
  assert.equal((await result.json()).code, "INVOICE_PDF_LAYOUT_OVERFLOW");
});

test("invoice PDF client checks the permanent number and authenticates only same-origin requests", async () => {
  const controller = new AbortController();
  const downloaded = await fetchInvoicePdf(invoice, controller.signal, () => assert.fail("authenticated download"), async (url, options) => {
    assert.equal(url, `/api/v1/${path}${query}`);
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    return new Response(pdf, { headers });
  });
  assert.equal(downloaded.filename, filename);
  assert.equal(await downloaded.blob.text(), pdf);
  await assert.rejects(fetchInvoicePdf({ ...invoice, number: "../../private" }, controller.signal, () => {},
    () => assert.fail("invalid invoice number")), { status: 400 });
  await assert.rejects(fetchInvoicePdf({ ...invoice, number: "2026-002" }, controller.signal, () => {},
    async () => new Response(pdf, { headers })), { status: 502 });
  await assert.rejects(fetchInvoicePdf(invoice, controller.signal, () => {},
    async () => new Response(pdf.slice(0, 8), { headers })), { status: 502 });
});

test("invoice PDF client maps rendering problems and redirects on expired sessions", async () => {
  const signal = new AbortController().signal;
  let redirected = 0;
  const unauthenticated = () => { redirected++; };
  for (const [status, code, message] of [[422, "INVOICE_PDF_LAYOUT_OVERFLOW", /une page A5/],
    [422, "INVOICE_PDF_UNSUPPORTED_TEXT", /caractères/], [409, "INVOICE_NOT_ISSUED", /après l’émission/],
    [500, "INVOICE_PDF_INTEGRITY", /données d’émission/], [401, undefined, /session a expiré/]]) {
    await assert.rejects(fetchInvoicePdf(invoice, signal, unauthenticated, async () => problem(status, code)), error =>
      error instanceof InvoicePdfDownloadError && error.status === status && message.test(error.message)
      && !error.message.includes("INTERNAL-CANARY"));
  }
  assert.equal(redirected, 1);
});
