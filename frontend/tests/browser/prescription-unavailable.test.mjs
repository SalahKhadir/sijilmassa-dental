import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { browserHarness, authenticationFixture } from "./browser-harness.mjs";
const harness = browserHarness({ port: 3117 });
const enabled = ["renderer-disabled", "missing-practitioner"].includes(process.env.PRESCRIPTION_E2E_MODE);
before(async () => { if (enabled) await harness.start(); }); after(harness.stop);
test("isolated missing practitioner or disabled renderer refuses finalization with an actionable safe message", { skip: !enabled }, async () => {
  const { value, page } = await harness.context();
  const mode = (await authenticationFixture()).prescriptionMode;
  assert(["renderer-disabled", "missing-practitioner"].includes(mode));
  const base = harness.baseURL;
  async function write(path, method, data) {
    const csrf = await (await value.request.get(`${base}/api/v1/auth/csrf`)).json();
    return value.request.fetch(`${base}${path}`, { method, headers: { [csrf.headerName]: csrf.token }, data });
  }
  try {
    const identity = { firstName: "Fictive", lastName: "Indisponibilite853B", sex: "unanswered", dateOfBirth: null, address: "", gsm: "", landline: "", profession: "", cin: "", medicalCoverage: "" };
    const p = await write("/api/v1/patients", "POST", { identity, status: "active" }); assert.equal(p.status(), 201); const patient = await p.json();
    const input = { patientId: patient.id, content: { consultationId: null, issuedDate: "2026-11-11", generalInstructions: "Instructions fictives", medications: [{ medicationName: "Produit fictif", dosage: "Saisie fictive", frequency: "Saisie fictive", duration: "Saisie fictive", instructions: "" }] } };
    const created = await write("/api/v1/prescriptions", "POST", input); assert.equal(created.status(), 201); const record = await created.json();
    await page.goto(`${base}/documents/ordonnances/${record.id}?patientId=${patient.id}`);
    await page.getByRole("button", { name: "Finaliser l’ordonnance", exact: true }).click();
    const pending = page.waitForResponse(r => r.request().method() === "PUT" && new URL(r.url()).pathname.endsWith("/finalization"));
    await page.getByRole("dialog").getByRole("button", { name: "Finaliser l’ordonnance", exact: true }).click();
    const response = await pending; assert.equal(response.status(), 503);
    assert.equal((await response.json()).code, mode === "renderer-disabled" ? "RENDERER_UNAVAILABLE" : "PRACTITIONER_UNAVAILABLE");
    await page.getByRole("dialog").getByRole("alert").filter({ hasText: mode === "renderer-disabled" ? /création du PDF est indisponible/ : /profil professionnel/ }).waitFor();
    const unchanged = await (await value.request.get(`${base}/api/v1/prescriptions/${record.id}?patientId=${patient.id}`)).json();
    assert.equal(unchanged.version, 0); assert.equal(unchanged.status, "BROUILLON"); assert.equal(unchanged.document, null);
  } finally { await value.close(); }
});
