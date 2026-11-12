import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { browserHarness, authenticationFixture } from "./browser-harness.mjs";
import { formatMad } from "../../src/lib/financial/money.ts";

const harness = browserHarness({ port: 3119 });
before(async () => { await authenticationFixture(); await harness.start(); });
after(harness.stop);
const url = path => harness.baseURL + path;
const invoices = "/api/v1/invoices";
const canary = "SYNTHETIC-INVOICE-CONFIDENTIAL";
const heading = (page, name) => page.getByRole("heading", { name, exact: true });
const button = (page, name) => page.getByRole("button", { name, exact: true });
const dialog = page => page.getByRole("dialog");
const recordPath = (patient, invoice, suffix = "") => `${invoices}/${invoice.invoiceId}${suffix}?patientId=${patient.id}`;
const detailPath = (patient, invoice, suffix = "") => `/facturation/${invoice.invoiceId}${suffix}?patientId=${patient.id}`;
const historyPath = patient => `/patients/${patient.id}/factures`;
const payPath = (patient, charge) => `/api/v1/financial/charges/${charge.chargeId}/payments?patientId=${patient.id}`;

async function write(context, method, path, data, status) {
  const csrf = await (await context.request.get(url("/api/v1/auth/csrf"))).json();
  const response = await context.request.fetch(url(path), { method, headers: { [csrf.headerName]: csrf.token }, data });
  assert.equal(response.status(), status, `${method} ${new URL(url(path)).pathname}`);
  return response.json();
}
async function read(context, path, status = 200) {
  const response = await context.request.get(url(path));
  assert.equal(response.status(), status);
  return response.json();
}
async function fixture(context, lastName, count = 2) {
  const identity = { firstName: "Patient fictif", lastName, sex: "unanswered", dateOfBirth: null,
    address: "", gsm: "", landline: "", profession: "", cin: "", medicalCoverage: "" };
  const patient = await write(context, "POST", "/api/v1/patients", { identity, status: "active" }, 201);
  const day = "2026-11-11";
  let consultation = await write(context, "POST", "/api/v1/consultations", { patientId: patient.id,
    content: { appointmentId: null, consultationDate: day, chiefComplaint: canary, clinicalObservations: canary, assessment: canary, treatmentPlan: "", notes: canary } }, 201);
  const charges = [];
  for (let index = 0; index < count; index++) {
    const label = `Soin synthétique ${index + 1}`;
    consultation = await write(context, "POST", `/api/v1/consultations/${consultation.id}/treatments?patientId=${patient.id}`,
      { version: consultation.version, content: { treatmentDate: day, description: label, toothReference: index === 1 ? "17 / 18" : "16", notes: canary } }, 200);
    const treatment = consultation.treatments.find(item => item.content.description === label);
    charges.push(await write(context, "POST", "/api/v1/financial/charges", { patientId: patient.id, consultationId: consultation.id,
      treatmentId: treatment.id, expectedConsultationVersion: consultation.version, priceMinor: (index + 1) * 10000 }, 201));
  }
  return { patient, charges };
}
function pay(context, patient, charge, expectedChargeVersion, amountMinor) {
  return write(context, "POST", payPath(patient, charge), { expectedChargeVersion, amountMinor,
    paidAt: "2026-11-11T09:00:00Z", method: "ESPECES", operationId: crypto.randomUUID() }, 200);
}
async function choose(page, index) { await page.getByRole("checkbox", { name: new RegExp(`^Soin synthétique ${index} ·`) }).check(); }
async function prepareIssue(page) {
  await button(page, "Préparer l’émission").click();
  await heading(dialog(page), "Émettre la facture ?").waitFor();
}

test("reception uses the patient-first directory, edits and issues a real draft, then sees frozen and current balances", async () => {
  const dentist = await harness.context();
  const reception = await harness.context({ role: "receptionist" });
  const { page, value } = reception;
  const requests = [];
  page.on("request", request => requests.push(new URL(request.url()).pathname));
  try {
    const { patient, charges } = await fixture(dentist.value, "Facturation A");
    await page.goto(url("/rendez-vous"));
    await page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Facturation" }).click();
    await heading(page, "Facturation").waitFor();
    await page.getByRole("searchbox", { name: "Rechercher un patient" }).fill("Facturation A");
    await page.getByRole("button", { name: /Patient fictif Facturation A/ }).click();
    await page.waitForURL(url(historyPath(patient)));
    await page.getByText("Aucune facture pour ce patient.", { exact: true }).waitFor();
    await page.getByRole("link", { name: "Nouvelle facture", exact: true }).click();
    await page.getByRole("checkbox", { name: /^Soin synthétique 1/ }).waitFor();
    assert.equal(await button(page, "Vérifier le brouillon").isDisabled(), true);
    await choose(page, 1);
    await button(page, "Vérifier le brouillon").click();
    await dialog(page).getByText(formatMad(10000), { exact: true }).waitFor();
    await button(dialog(page), "Confirmer la création").click();
    await heading(page, "Brouillon de facture").waitFor();
    const id = new URL(page.url()).pathname.split("/").at(-1);
    const invoice = { invoiceId: id };
    assert.equal((await read(value, recordPath(patient, invoice))).issuanceSnapshot, null);
    assert.equal(await button(page, "Télécharger la facture").count(), 0);
    assert.equal(await button(page, "Imprimer la facture").count(), 0);
    await page.getByRole("link", { name: "Modifier le brouillon" }).click();
    await button(page, "Retirer Soin synthétique 1").click();
    await choose(page, 2);
    await button(page, "Vérifier les modifications").click();
    await button(dialog(page), "Confirmer les modifications").click();
    await heading(page, "Brouillon de facture").waitFor();
    const saved = await read(value, recordPath(patient, invoice));
    assert.deepEqual(saved.draft.lines.map(line => line.chargeId), [charges[1].chargeId]);
    const released = await read(value, `/api/v1/patients/${patient.id}/invoice-eligible-charges`);
    assert.deepEqual(released.items.map(line => line.chargeId), [charges[0].chargeId]);

    await pay(value, patient, charges[1], 0, 5000);
    await prepareIssue(page);
    await dialog(page).getByText(formatMad(5000), { exact: true }).waitFor();
    await dialog(page).getByText(formatMad(15000), { exact: true }).waitFor();
    await button(dialog(page), "Confirmer l’émission").click();
    await page.getByRole("heading", { name: /^Facture \d{4}-\d{3,}$/ }).waitFor();
    const original = page.getByRole("region", { name: "Facture originale" });
    const current = page.getByRole("region", { name: "Situation financière actuelle" });
    await current.getByText("Partiellement réglée", { exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Modifier le brouillon" }).count(), 0);
    await pay(value, patient, charges[1], 1, 15000);
    await button(page, "Actualiser la facture").click();
    await current.getByText("Soldée", { exact: true }).waitFor();
    await original.getByText(formatMad(15000), { exact: true }).waitFor();
    await current.getByText(formatMad(0), { exact: true }).waitFor();
    const persisted = await read(value, recordPath(patient, invoice));
    assert.deepEqual(persisted.issuanceSnapshot.balanceAtIssue, { totalMinor: "20000", receivedMinor: "5000", remainingMinor: "15000" });
    assert.equal(persisted.currentFinancialState.balance.remainingMinor, "0");
    assert.equal(persisted.issuanceSnapshot.lines[0].toothReference, "17 / 18");
    const invoiceNumber = persisted.issuanceSnapshot.invoiceNumber;
    await downloadInvoice(page, invoiceNumber);
    await page.reload();
    await heading(page, `Facture ${invoiceNumber}`).waitFor();
    await page.goto(url(detailPath(patient, invoice, "/modifier")));
    await page.getByText("Cette facture a déjà été émise.", { exact: true }).waitFor();
    await page.goto(url(`/patients/${patient.id}/finances`));
    await page.getByRole("link", { name: "Factures du patient", exact: true }).click();
    await page.getByRole("link", { name: `Ouvrir la facture ${invoiceNumber}` }).waitFor();

    await write(value, "PUT", `/api/v1/patients/${patient.id}`, { identity: patient.identity, status: "inactive", version: patient.version }, 200);
    await page.reload();
    await page.getByText("Patient archivé. Les factures restent consultables.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Nouvelle facture" }).count(), 0);
    await page.getByRole("link", { name: `Ouvrir la facture ${invoiceNumber}` }).click();
    await heading(page, `Facture ${invoiceNumber}`).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("region", { name: "Facture originale" }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert(!requests.some(path => /\/medical-record|\/consultations|\/prescriptions/.test(path)));
    assert.equal(await page.getByText(canary).count(), 0);
    assert.deepEqual(reception.errors, []);
    assert.deepEqual(reception.external, []);
  } finally { await reception.value.close(); await dentist.value.close(); }
});

test("stale edits preserve intended charges, show the refreshed selection and require reconfirmation", async () => {
  const { value, page } = await harness.context();
  try {
    const { patient, charges } = await fixture(value, "Facturation B", 3);
    const draft = await write(value, "POST", invoices, { patientId: patient.id, chargeIds: [charges[0].chargeId] }, 201);
    await page.goto(url(detailPath(patient, draft, "/modifier")));
    await button(page, "Retirer Soin synthétique 1").click();
    await choose(page, 2);
    await write(value, "PUT", recordPath(patient, draft), { expectedVersion: 0, chargeIds: [charges[2].chargeId] }, 200);
    await button(page, "Vérifier les modifications").click();
    await button(dialog(page), "Confirmer les modifications").click();
    await heading(page, "Sélection enregistrée · version 1").waitFor();
    await page.getByRole("region", { name: "Sélection enregistrée" }).getByText("Soin synthétique 3", { exact: true }).waitFor();
    await button(page, "Retirer Soin synthétique 2").waitFor();
    assert.equal((await read(value, recordPath(patient, draft))).version, 1);
    await button(page, "Vérifier les modifications").click();
    await dialog(page).getByText(/Version 1/).waitFor();
    await button(dialog(page), "Confirmer les modifications").click();
    await heading(page, "Brouillon de facture").waitFor();
    assert.deepEqual((await read(value, recordPath(patient, draft))).draft.lines.map(line => line.chargeId), [charges[1].chargeId]);
  } finally { await value.close(); }
});

test("a committed issuance with a lost response recovers through a retried read only", async () => {
  const { value, page } = await harness.context();
  try {
    const { patient, charges } = await fixture(value, "Facturation C", 1);
    const draft = await write(value, "POST", invoices, { patientId: patient.id, chargeIds: [charges[0].chargeId] }, 201);
    let posts = 0;
    let failedReads = 0;
    await page.route(url(recordPath(patient, draft, "/issue")), async route => {
      posts++;
      const committed = await route.fetch();
      assert.equal(committed.status(), 200);
      await route.abort("failed");
    });
    await page.route(url(recordPath(patient, draft)), async route => {
      if (posts === 1 && failedReads === 0) {
        failedReads++;
        await route.abort("failed");
      } else await route.continue();
    });
    await page.goto(url(detailPath(patient, draft)));
    await prepareIssue(page);
    await button(dialog(page), "Confirmer l’émission").click();
    await page.getByText(/L’issue de l’émission reste inconnue/).waitFor();
    assert.equal(await button(page, "Préparer l’émission").count(), 0);
    assert.equal(await page.getByRole("link", { name: "Modifier le brouillon" }).count(), 0);
    await button(page, "Relire la facture").click();
    await page.getByRole("heading", { name: /^Facture \d{4}-\d{3,}$/ }).waitFor();
    assert.equal(posts, 1);
    const history = await read(value, `/api/v1/patients/${patient.id}/invoices`);
    assert.equal(history.items.length, 1);
    assert.equal(history.items[0].lifecycle, "EMISE");
  } finally { await value.close(); }
});

test("an uncommitted lost issuance returns the draft and requires fresh confirmation, with no write on session expiry", async () => {
  const { value, page } = await harness.context();
  try {
    const { patient, charges } = await fixture(value, "Facturation D", 1);
    const draft = await write(value, "POST", invoices, { patientId: patient.id, chargeIds: [charges[0].chargeId] }, 201);
    let posts = 0;
    await page.route(url(recordPath(patient, draft, "/issue")), async route => { posts++; await route.abort("failed"); });
    await page.goto(url(detailPath(patient, draft)));
    await prepareIssue(page);
    await button(dialog(page), "Confirmer l’émission").click();
    await page.getByText(/Le document est en brouillon, version 0/).waitFor();
    assert.equal(posts, 1);
    assert.equal(await dialog(page).count(), 0);
    await prepareIssue(page);
    await button(dialog(page), "Annuler").click();
    await value.clearCookies();
    await button(page, "Actualiser la facture").click();
    await page.waitForURL("**/login");
    assert.equal(posts, 1);
  } finally { await value.close(); }
});

test("empty charge lists and paged invoice histories are rendered without synthetic invoices", async () => {
  const { value, page } = await harness.context();
  try {
    const { patient } = await fixture(value, "Facturation E", 0);
    await page.goto(url(`/facturation/nouvelle?patientId=${patient.id}`));
    await page.getByText("Aucun soin tarifé disponible pour ce patient.", { exact: true }).waitFor();
    assert.equal(await button(page, "Vérifier le brouillon").isDisabled(), true);
    for (let index = 0; index < 51; index++) await write(value, "POST", invoices, { patientId: patient.id, chargeIds: [] }, 201);
    await page.goto(url(historyPath(patient)));
    await button(page, "Factures suivantes").waitFor();
    const rows = page.getByRole("link", { name: /^Ouvrir le brouillon du/ });
    assert.equal(await rows.count(), 50);
    const first = await rows.evaluateAll(links => links.map(link => link.href));
    await button(page, "Factures suivantes").click();
    await rows.first().waitFor();
    assert.equal(await rows.count(), 1);
    assert(!first.includes(await rows.first().evaluate(link => link.href)));
    await button(page, "Première page des factures").click();
    await button(page, "Factures suivantes").waitFor();
    assert.equal(await rows.count(), 50);
  } finally { await value.close(); }
});


async function downloadInvoice(page, number) {
  const event = page.waitForEvent("download");
  await button(page, "Télécharger la facture").click();
  const download = await event;
  assert.equal(download.suggestedFilename(), `facture-${number}.pdf`);
  const bytes = await readFile(await download.path());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert(Math.abs(pdf.getPage(0).getWidth() - 419.5276) < 0.01);
  assert(Math.abs(pdf.getPage(0).getHeight() - 595.2756) < 0.01);
  return bytes;
}

test("dentist downloads the issued invoice and opens the same bytes in the native PDF viewer", async () => {
  const { value, page, errors, external } = await harness.context();
  try {
    const { patient, charges } = await fixture(value, "Facture PDF dentiste", 1);
    const draft = await write(value, "POST", invoices, { patientId: patient.id, chargeIds: [charges[0].chargeId] }, 201);
    const issued = await write(value, "POST", recordPath(patient, draft, "/issue"), { expectedVersion: 0 }, 200);
    await page.goto(url(detailPath(patient, draft)));
    const bytes = await downloadInvoice(page, issued.issuanceSnapshot.invoiceNumber);
    await button(page, "Imprimer la facture").click();
    const preview = page.locator("iframe[title='Aperçu PDF de la facture originale']");
    await preview.waitFor();
    const blob = await preview.getAttribute("src");
    assert(blob.startsWith("blob:"));
    const previewBytes = await page.evaluate(async address => [...new Uint8Array(await (await fetch(address)).arrayBuffer())], blob);
    assert.deepEqual(Buffer.from(previewBytes), bytes);
    await page.getByRole("link", { name: "Ouvrir le PDF dans un nouvel onglet" }).waitFor();
    await button(page, "Fermer l’aperçu").click();
    await preview.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(async address => { try { await fetch(address); return true; } catch { return false; } }, blob), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally { await value.close(); }
});

test("invoice PDF overflow shows an explicit error and session expiry redirects without a download", async () => {
  const { value, page } = await harness.context();
  let downloads = 0;
  page.on("download", () => { downloads++; });
  try {
    const { patient, charges } = await fixture(value, "Facture PDF trop longue", 10);
    const draft = await write(value, "POST", invoices, { patientId: patient.id, chargeIds: charges.map(charge => charge.chargeId) }, 201);
    await write(value, "POST", recordPath(patient, draft, "/issue"), { expectedVersion: 0 }, 200);
    await page.goto(url(detailPath(patient, draft)));
    await button(page, "Télécharger la facture").click();
    await page.getByRole("alert").filter({ hasText: "dépasse la place disponible sur une page A5" }).waitFor();
    assert.equal(downloads, 0);
    await value.clearCookies();
    await button(page, "Télécharger la facture").click();
    await page.waitForURL("**/login");
    assert.equal(downloads, 0);
  } finally { await value.close(); }
});
