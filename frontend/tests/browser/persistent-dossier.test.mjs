import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { browserHarness, authenticationFixture } from "./browser-harness.mjs";

const harness = browserHarness({ port: 3119 });
before(async () => { await authenticationFixture(); await harness.start(); });
after(harness.stop);
const url = path => `${harness.baseURL}${path}`;
const label = "Télécharger le dossier PDF";

async function fixture(context, firstName) {
  const csrf = await (await context.request.get(url("/api/v1/auth/csrf"))).json();
  const response = await context.request.post(url("/api/v1/patients"), {
    headers: { [csrf.headerName]: csrf.token }, data: { status: "active", identity: {
      firstName, lastName: "Dossier fictif", sex: "F", dateOfBirth: "1988-02-03", address: "Résidence fictive",
      gsm: "", landline: "", profession: "Éditrice", cin: "", medicalCoverage: "",
    } },
  });
  assert.equal(response.status(), 201);
  return response.json();
}

test("dentist downloads the official two-page PDF from the patient dossier and reception is denied", async () => {
  const dentist = await harness.context();
  const reception = await harness.context({ role: "receptionist" });
  try {
    const patient = await fixture(dentist.value, "Éléonore");
    const path = `/patients/${patient.id}/dossier`;
    await dentist.page.goto(url(path));
    const [download, response] = await Promise.all([
      dentist.page.waitForEvent("download"),
      dentist.page.waitForResponse(r => new URL(r.url()).pathname === `/api/v1${path}.pdf`),
      dentist.page.getByRole("button", { name: label, exact: true }).click(),
    ]);
    assert.equal(download.suggestedFilename(), `dossier-${patient.id}.pdf`);
    assert.equal(response.status(), 200);
    const bytes = await readFile(await download.path());
    assert.equal(bytes.length, Number(response.headers()["x-dossier-pdf-bytes"]));
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 2);
    for (const page of pdf.getPages()) {
      assert.equal(page.getWidth(), 419.25);
      assert(Math.abs(page.getCropBox().height - 595.5) < .01);
      assert(Math.abs(page.getCropBox().y - 8.58) < .01);
    }
    await reception.page.goto(url(path));
    await reception.page.getByRole("heading", { name: "Accès réservé au dentiste" }).waitFor();
    assert.equal(await reception.page.getByRole("button", { name: label, exact: true }).count(), 0);
    assert.equal((await reception.value.request.get(url(`/api/v1${path}.pdf`))).status(), 403);
    assert.deepEqual(dentist.errors, []);
    assert.deepEqual(reception.errors, []);
  } finally { await dentist.value.close(); await reception.value.close(); }
});

test("dossier download reports unsupported text safely and returns to login when the session expires", async () => {
  const dentist = await harness.context();
  try {
    const patient = await fixture(dentist.value, "اسم");
    await dentist.page.goto(url(`/patients/${patient.id}/dossier`));
    const download = dentist.page.getByRole("button", { name: label, exact: true });
    await download.click();
    await dentist.page.getByText("Certains caractères du dossier ne peuvent pas être imprimés dans ce PDF.", { exact: true }).waitFor();
    await dentist.value.clearCookies();
    await download.click();
    await dentist.page.waitForURL(url("/login"));
  } finally { await dentist.value.close(); }
});

test("archived dossier keeps authorized reading and PDF navigation while clinical editing is unavailable", async () => {
  const dentist = await harness.context();
  const reception = await harness.context({ role: "receptionist", viewport: { width: 390, height: 844 } });
  try {
    const patient = await fixture(dentist.value, "Navigation fictive");
    const path = `/patients/${patient.id}`;
    const csrf = await (await dentist.value.request.get(url("/api/v1/auth/csrf"))).json();
    const archive = await dentist.value.request.put(url(`/api/v1${path}`), {
      headers: { [csrf.headerName]: csrf.token },
      data: { identity: patient.identity, status: "inactive", version: patient.version },
    });
    assert.equal(archive.status(), 200);

    const editLabel = "Modifier le dossier de santé";
    const dossierLabel = "Questionnaire et antécédents";
    await dentist.page.goto(url(path));
    await dentist.page.getByRole("link", { name: dossierLabel, exact: true }).press("Enter");
    await dentist.page.waitForURL(url(path + "/dossier"));
    const edit = dentist.page.getByRole("button", { name: editLabel, exact: true });
    await edit.waitFor();
    assert(await edit.isDisabled());
    assert.equal(await dentist.page.getByRole("link", { name: editLabel, exact: true }).count(), 0);
    await dentist.page.getByText("Restaurez le patient depuis sa fiche administrative pour modifier le dossier de santé.").waitFor();
    await dentist.page.getByRole("heading", { name: "Questionnaire de santé", exact: true }).waitFor();
    const [pdf] = await Promise.all([
      dentist.page.waitForEvent("download"),
      dentist.page.getByRole("button", { name: label, exact: true }).click(),
    ]);
    assert.equal(pdf.suggestedFilename(), `dossier-${patient.id}.pdf`);
    await dentist.page.goto(url(path + "/dossier/modifier"));
    await dentist.page.getByText(/Restaurez le patient depuis sa fiche administrative avant/).waitFor();
    assert.equal(await dentist.page.getByRole("button", { name: "Enregistrer", exact: true }).count(), 0);

    await reception.page.goto(url(path));
    await reception.page.getByRole("heading", { name: /Navigation fictive/ }).waitFor();
    assert.equal(await reception.page.getByRole("link", { name: dossierLabel, exact: true }).count(), 0);
    await reception.page.getByRole("link", { name: "Finances du patient", exact: true }).click();
    await reception.page.getByText("Patient archivé. Les finances restent consultables.").waitFor();
    await reception.page.getByRole("link", { name: "Factures du patient", exact: true }).click();
    await reception.page.getByText("Patient archivé. Les factures restent consultables.").waitFor();
    await reception.page.goto(url(path + "/dossier"));
    await reception.page.getByRole("heading", { name: "Accès réservé au dentiste" }).waitFor();
    assert.equal(await reception.page.getByRole("button", { name: label, exact: true }).count(), 0);
    assert.deepEqual(dentist.errors, []);
    assert.deepEqual(reception.errors, []);
  } finally { await dentist.value.close(); await reception.value.close(); }
});
