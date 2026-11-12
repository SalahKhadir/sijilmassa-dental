import assert from "node:assert/strict";
import test from "node:test";
import { proxyAuthentication } from "../src/lib/auth/backend-proxy.ts";
import { fetchPatientDossier } from "../src/lib/patients/api/dossier.ts";

const id = "00000000-0000-0000-0000-000000000018";
const path = `patients/${id}/dossier.pdf`;
const filename = `dossier-${id}.pdf`;
const bytes = new TextEncoder().encode("%PDF-1.7\nSYNTHETIC");
const headers = { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`,
  "Content-Length": String(bytes.length) };

test("dossier proxy allowlists the one PDF path and preserves bytes, session and private download metadata", async () => {
  const response = await proxyAuthentication(new Request(`http://localhost/api/v1/${path}`, {
    headers: { Cookie: "JSESSIONID=fixture; tracking=no" },
  }), path, { origin: "http://127.0.0.1:9", fetcher: async (url, options) => {
    assert.equal(url, `http://127.0.0.1:9/api/v1/${path}`);
    assert.equal(options.headers.get("Cookie"), "JSESSIONID=fixture");
    assert.equal(options.redirect, "manual");
    return new Response(bytes, { headers });
  } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Dossier-PDF-Bytes"), String(bytes.length));
  assert.match(response.headers.get("cache-control"), /private.*no-store/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test("dossier proxy rejects other methods, paths and unsafe upstream metadata", async () => {
  for (const [method, target, status] of [["POST", path, 405], ["GET", `${path}/download`, 404], ["GET", `patients/${id}/dossierXpdf`, 404]]) {
    const response = await proxyAuthentication(new Request(`http://localhost/api/v1/${target}`, { method }), target,
      { fetcher: () => { throw new Error("Unexpected fetch"); } });
    assert.equal(response.status, status);
  }
  for (const changes of [{ "Content-Disposition": 'attachment; filename="nom-secret.pdf"' },
    { "Content-Type": "text/html" }, { "Content-Length": "2097153" }]) {
    const response = await proxyAuthentication(new Request(`http://localhost/api/v1/${path}`), path,
      { origin: "http://127.0.0.1:9", fetcher: async () => new Response(bytes, { headers: { ...headers, ...changes } }) });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("content-disposition"), null);
  }
});

test("dossier client downloads the actual backend bytes, rejects truncation and maps safe errors", async () => {
  const signal = new AbortController().signal;
  const download = await fetchPatientDossier(id, signal, () => {}, async (url, options) => {
    assert.equal(url, `/api/v1/${path}`);
    assert.equal(options.credentials, "same-origin");
    return new Response(bytes, { headers: { ...headers, "X-Dossier-PDF-Bytes": String(bytes.length) } });
  });
  assert.equal(download.filename, filename);
  assert.deepEqual(new Uint8Array(await download.blob.arrayBuffer()), bytes);
  await assert.rejects(fetchPatientDossier(id, signal, () => {}, async () => new Response(bytes.slice(0, 6), { headers })), { status: 502 });
  await assert.rejects(fetchPatientDossier(id, signal, () => {}, async () =>
    Response.json({ status: 413, code: "DOSSIER_LIMIT", detail: "Private value" },
      { status: 413, headers: { "Content-Type": "application/problem+json" } })), error =>
    error.status === 413 && error.message.includes("taille autorisée") && !error.message.includes("Private value"));
  let redirects = 0;
  await assert.rejects(fetchPatientDossier(id, signal, () => { redirects++; }, async () => new Response(null, { status: 401 })), { status: 401 });
  assert.equal(redirects, 1);
});
