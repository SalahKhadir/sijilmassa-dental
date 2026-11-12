import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { after, before, test } from "node:test";
import { authenticationFixture, browserHarness } from "./browser-harness.mjs";
import { formatMad } from "../../src/lib/financial/money.ts";

const harness = browserHarness({ port: 3121 });
before(async () => { await authenticationFixture(); await harness.start(); });
after(harness.stop);

const url = path => harness.baseURL + path;
const collection = "/api/v1/insurance-documents";
const history = patient => `/patients/${patient.id}/assurances`;
const apiHistory = patient => `/api/v1/patients/${patient.id}/insurance-documents`;
const apiDetail = (patient, id, suffix = "") => `${collection}/${id}${suffix}?patientId=${patient.id}`;
const detail = (patient, id, action) => `/documents/assurances/${id}?patientId=${patient.id}${action ? `&action=${action}` : ""}`;
const heading = (page, name) => page.getByRole("heading", { name, exact: true });
const button = (page, name) => page.getByRole("button", { name, exact: true });
const link = (page, name) => page.getByRole("link", { name, exact: true });
const field = (page, name) => page.getByLabel(name);
const day = "2026-11-10";
const canary = "SYNTHETIC-INSURANCE-PRIVATE-NOTES";
const emptyDraft = { fields: { cnss: {} }, acts: [] };

async function read(context, path, status = 200) {
  const response = await context.request.get(url(path));
  assert.equal(response.status(), status, path);
  return response.json();
}
async function write(context, method, path, data, status) {
  const csrf = await read(context, "/api/v1/auth/csrf");
  const response = await context.request.fetch(url(path), { method, data, headers: { [csrf.headerName]: csrf.token } });
  assert.equal(response.status(), status, `${method} ${path}`);
  return status === 204 ? undefined : response.json();
}
function createPatient(context, label) {
  return write(context, "POST", "/api/v1/patients", { status: "active", identity: {
    firstName: "Patient fictif", lastName: label, dateOfBirth: "1990-10-03", sex: "F", address: "Adresse fictive",
    gsm: "0612345678", landline: "", profession: "", cin: "ZZ12345", medicalCoverage: "",
  } }, 201);
}
function createDraft(context, patient, draft = emptyDraft, additional = {}) {
  return write(context, "POST", collection, { patientId: patient.id, documentType: "CNSS_DENTAIRE",
    templateVersion: 1, purpose: "ENTENTE_PREALABLE", draft, ...additional }, 201);
}
const completeCnss = {
  fields: { insured: { relationship: "LUI_MEME" }, cnss: { registrationNumber: "FICTIF", practitionerInp: "123456789" } },
  acts: [{ fields: { plannedDescription: "Acte prévu fictif", quotedFeeMinor: 0 } }],
};

async function openForm(page, type, purpose) {
  await field(page, "Organisme").selectOption(type);
  await field(page, "Objet du document").selectOption(purpose);
  await button(page, "Ouvrir le formulaire").click();
}
async function addActs(page, count) {
  const add = button(page, "Ajouter un acte");
  for (let index = 0; index < count; index++) await add.click();
  assert.equal(await add.isDisabled(), true);
}
async function prepare(page) {
  await button(page, "Finaliser").click();
  await heading(page.getByRole("dialog"), "Finaliser le document").waitFor();
}

test("dentist creates all three insurer-specific drafts with enforced act limits and exact centimes", async () => {
  const { value, page, errors, external } = await harness.context();
  try {
    const patient = await createPatient(value, "Assurance formulaires");
    await page.goto(url(`/patients/${patient.id}`));
    await link(page, "Documents d’assurance").click();
    await page.getByText("Aucun document d’assurance pour ce patient.", { exact: true }).waitFor();
    for (const [type, purpose, count] of [["CNSS_DENTAIRE", "ENTENTE_PREALABLE", 3], ["CNOPS_DENTAIRE", "ENTENTE_PREALABLE", 9], ["FAR_DENTAIRE", "DEVIS", 5]]) {
      await link(page, "Nouveau document").click();
      await openForm(page, type, purpose);
      await addActs(page, count);
      await field(page, "Lien du patient avec l’assuré").selectOption("LUI_MEME");
      await field(page, "Libellé prévu").first().fill("Acte fictif");
      await field(page, "Honoraires du devis (DH)").first().fill("90071992547409,91");
      if (type === "CNSS_DENTAIRE") {
        await field(page, "INP du praticien").fill("123");
        await button(page, "Enregistrer le brouillon").click();
        await page.getByText("Saisissez les neuf chiffres.", { exact: true }).waitFor();
        await field(page, "INP du praticien").fill("123456789");
        await field(page, "Numéro d’immatriculation").fill("CNSS-FICTIF");
      } else if (type === "CNOPS_DENTAIRE") {
        await field(page, "Catégorie CIM-10 (facultatif)").fill("K02.1");
        await button(page, "Enregistrer le brouillon").click();
        await page.getByText("Saisissez une lettre majuscule suivie de deux chiffres.", { exact: true }).waitFor();
        await field(page, "Catégorie CIM-10 (facultatif)").fill("K02");
        await field(page, "Numéro d’affiliation").fill("AFFILIATION-FICTIVE");
        await field(page, "Numéro d’immatriculation").fill("IMMATRICULATION-FICTIVE");
      } else {
        await field(page, "Référence de compte FAR").fill("COMPTE-FICTIF");
        await button(page, "Ajouter une marque").click();
        await field(page, "Dent FDI 1").selectOption("16");
        await field(page, "Symbole 1").selectOption("CROIX");
        assert.equal(await field(page, "Code de l’acte").count(), 0);
      }
      await button(page, "Enregistrer le brouillon").click();
      await heading(page, "Brouillon d’assurance").waitFor();
      const id = new URL(page.url()).pathname.split("/").at(-1);
      const saved = await read(value, apiDetail(patient, id));
      assert.equal(saved.documentType, type);
      assert.equal(saved.draft.acts.length, count);
      assert.equal(saved.draft.acts[0].fields.quotedFeeMinor, Number.MAX_SAFE_INTEGER);
      assert.equal(saved.draft.acts[1].fields.quotedFeeMinor, null);
      assert.equal(saved.snapshot, null);
      if (type === "CNOPS_DENTAIRE") {
        assert.equal(saved.draft.fields.cnops.affiliationNumber, "AFFILIATION-FICTIVE");
        assert.equal(saved.draft.fields.cnops.registrationNumber, "IMMATRICULATION-FICTIVE");
      }
      if (type === "FAR_DENTAIRE") assert.deepEqual(saved.draft.fields.far.marks, [{ tooth: "16", symbol: "CROIX" }]);
      await prepare(page);
      await page.getByText("Éléments à compléter avant la finalisation", { exact: true }).waitFor();
      assert.equal(await button(page.getByRole("dialog"), "Confirmer la finalisation").isDisabled(), true);
      await button(page.getByRole("dialog"), "Annuler").click();
      await link(page, "Documents d’assurance").click();
    }
    assert.equal((await read(value, apiHistory(patient))).items.length, 3);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  } finally { await value.close(); }
});

test("version conflicts preserve unsaved values and finalization recovers a committed lost response with GET only", async () => {
  const { value, page } = await harness.context();
  try {
    const patient = await createPatient(value, "Assurance versions");
    const draft = await createDraft(value, patient, completeCnss);
    const id = draft.documentId;
    await page.goto(url(detail(patient, id, "modifier")));
    const registration = field(page, "Numéro d’immatriculation");
    await registration.fill("LOCAL-FICTIF");
    await page.getByText("Modifications non enregistrées.", { exact: true }).waitFor();
    page.once("dialog", dialog => dialog.dismiss());
    await link(page, "Documents d’assurance").click();
    assert.match(page.url(), /action=modifier/);
    const remote = structuredClone(completeCnss);
    remote.fields.cnss.registrationNumber = "DISTANT-FICTIF";
    await write(value, "PUT", apiDetail(patient, id), { expectedVersion: 0, draft: remote }, 200);
    await button(page, "Enregistrer le brouillon").click();
    await button(page, "Garder mes saisies sur cette version").waitFor();
    assert.equal(await registration.inputValue(), "LOCAL-FICTIF");
    assert.equal((await read(value, apiDetail(patient, id))).draft.fields.cnss.registrationNumber, "DISTANT-FICTIF");
    await button(page, "Garder mes saisies sur cette version").click();
    assert.equal(await registration.inputValue(), "LOCAL-FICTIF");
    await button(page, "Enregistrer le brouillon").click();
    await page.getByText("Brouillon enregistré.", { exact: true }).waitFor();

    let posts = 0;
    let blockedReads = 0;
    await page.route(`**${apiDetail(patient, id, "/finalize")}`, async route => {
      posts++;
      assert.equal((await route.fetch()).status(), 200);
      await route.abort("failed");
    });
    await page.route(`**${apiDetail(patient, id)}`, async route => {
      if (posts === 1 && blockedReads++ === 0) await route.abort("failed");
      else await route.continue();
    });
    await prepare(page);
    await page.getByRole("dialog").getByText("LOCAL-FICTIF", { exact: true }).waitFor();
    await button(page.getByRole("dialog"), "Confirmer la finalisation").click();
    await page.getByText(/Le résultat de la finalisation reste indéterminé/).waitFor();
    assert.equal(await button(page, "Finaliser").count(), 0);
    await button(page, "Relire le document").click();
    await heading(page, "Document d’assurance finalisé").waitFor();
    assert.equal(posts, 1);
    assert.equal(await button(page, "Modifier le brouillon").count(), 0);
    assert.equal(await button(page, "Télécharger le formulaire PDF").count(), 1);
    const finalized = await read(value, apiDetail(patient, id));
    assert.equal(finalized.snapshot.knownCompleteFeeTotalMinor, "0");
    await write(value, "PUT", `/api/v1/patients/${patient.id}`, {
      identity: { ...patient.identity, lastName: "Identité ultérieure" }, version: patient.version, status: "active",
    }, 200);
    await page.reload();
    await page.getByText("Patient fictif Assurance versions", { exact: true }).waitFor();
    assert.deepEqual(await read(value, apiDetail(patient, id)), finalized);
  } finally { await value.close(); }
});

test("consultation entry links an eligible treatment and existing price, then requires fresh confirmation when a lost write left a draft", async () => {
  const { value, page } = await harness.context();
  try {
    const patient = await createPatient(value, "Assurance soins");
    const other = await createPatient(value, "Assurance autre patient");
    let consultation = await write(value, "POST", "/api/v1/consultations", { patientId: patient.id,
      content: { consultationDate: day, appointmentId: null, chiefComplaint: canary, clinicalObservations: canary, assessment: "", treatmentPlan: "", notes: canary },
    }, 201);
    const clinical = `/api/v1/consultations/${consultation.id}`;
    const clinicalQuery = `?patientId=${patient.id}`;
    consultation = await write(value, "POST", `${clinical}/treatments${clinicalQuery}`, { version: consultation.version,
      content: { treatmentDate: day, description: "Soin synthétique associé", toothReference: "16", notes: canary },
    }, 200);
    const treatmentId = consultation.treatments[0].id;
    const charge = await write(value, "POST", "/api/v1/financial/charges", {
      patientId: patient.id, consultationId: consultation.id, treatmentId,
      expectedConsultationVersion: consultation.version, priceMinor: 12345,
    }, 201);
    consultation = await read(value, `${clinical}${clinicalQuery}`);
    const finances = `/api/v1/financial/patients/${patient.id}/summary`;

    await page.goto(url(`/documents/assurances/nouvelle?patientId=${other.id}&consultationId=${consultation.id}`));
    await field(page, "Organisme").selectOption("FAR_DENTAIRE");
    await field(page, "Objet du document").selectOption("RECUS");
    await page.getByRole("alert").filter({ hasText: /introuvable/ }).waitFor();
    assert.equal(await button(page, "Ouvrir le formulaire").isDisabled(), true);

    await page.goto(url(`/consultations/${consultation.id}${clinicalQuery}`));
    await link(page, "Créer un document d’assurance").click();
    await openForm(page, "FAR_DENTAIRE", "RECUS");
    await field(page, "Lien du patient avec l’assuré").selectOption("LUI_MEME");
    await field(page, "Référence de compte FAR").fill("COMPTE-FICTIF");
    await field(page, "Grade").fill("Grade fictif");
    await field(page, "Unité").fill("Unité fictive");
    await field(page, "INPE du praticien").fill("123456789");
    await field(page, "Nature des soins").selectOption("SOINS");
    await field(page, "Contexte").selectOption("MALADIE");
    await field(page, "Nombre de prospectus").fill("0");
    await field(page, "Nombre de pièces jointes").fill("0");
    await field(page, "Date de la déclaration de l’assuré").fill(day);
    await button(page, "Ajouter un acte").click();
    await field(page, "Soin de la consultation").selectOption(treatmentId);
    await field(page, "Prix convenu associé").selectOption(charge.chargeId);
    await button(page, "Enregistrer le brouillon").click();
    await heading(page, "Brouillon d’assurance").waitFor();
    const id = new URL(page.url()).pathname.split("/").at(-1);
    assert.equal((await read(value, apiDetail(other, id), 404)).code, "NOT_FOUND");
    await prepare(page);
    await page.getByText("Terminez la consultation liée avant de finaliser le document.", { exact: true }).waitFor();
    assert.equal(await button(page.getByRole("dialog"), "Confirmer la finalisation").isDisabled(), true);
    await button(page.getByRole("dialog"), "Annuler").click();
    await write(value, "PUT", `${clinical}/finalization${clinicalQuery}`, { version: consultation.version }, 200);
    const before = await read(value, finances);
    let posts = 0;
    await page.route(`**${apiDetail(patient, id, "/finalize")}`, route => ++posts === 1 ? route.abort("failed") : route.continue());
    await prepare(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByText(formatMad(12345), { exact: true }).waitFor();
    assert.equal(await dialog.getByText(canary).count(), 0);
    await button(dialog, "Confirmer la finalisation").click();
    await page.getByText(/Le document est toujours en brouillon/).waitFor();
    assert.equal(posts, 1);
    assert.equal((await read(value, apiDetail(patient, id))).lifecycle, "BROUILLON");
    await prepare(page);
    await button(dialog, "Confirmer la finalisation").click();
    await heading(page, "Document d’assurance finalisé").waitFor();
    assert.equal(posts, 2);
    const frozen = await read(value, apiDetail(patient, id));
    assert.equal(frozen.snapshot.acts[0].chargeId, charge.chargeId);
    assert.equal(frozen.snapshot.acts[0].feeSource, "V9_AGREED_PRICE");
    assert.equal(frozen.snapshot.acts[0].feeMinor, 12345);
    await page.getByText(/PDF FAR indisponible/).waitFor();
    assert.equal(await button(page, "Télécharger le formulaire PDF").count(), 0);
    assert.equal((await read(value, apiDetail(patient, id, "/pdf"), 409)).code, "INSURANCE_PDF_FAR_UNAVAILABLE");
    assert(!JSON.stringify(frozen).includes(canary));
    assert.deepEqual(await read(value, finances), before);
  } finally { await value.close(); }
});

test("history pagination, archive restrictions, and role boundaries use the real backend", async () => {
  const dentist = await harness.context();
  const reception = await harness.context({ role: "receptionist" });
  const anonymous = await harness.context({ anonymous: true });
  try {
    const patient = await createPatient(dentist.value, "Assurance historique");
    const first = await createDraft(dentist.value, patient);
    for (let index = 0; index < 50; index++) await createDraft(dentist.value, patient);
    const firstPage = await read(dentist.value, apiHistory(patient));
    assert.equal(firstPage.items.length, 50);
    assert(firstPage.nextCursor);
    await dentist.page.goto(url(history(patient)));
    await link(dentist.page, "Consulter").last().waitFor();
    assert.equal(await link(dentist.page, "Consulter").count(), 50);
    await button(dentist.page, "Page suivante").click();
    await link(dentist.page, "Consulter").waitFor();
    assert.equal(await link(dentist.page, "Consulter").getAttribute("href"), detail(patient, first.documentId));
    await button(dentist.page, "Page précédente").click();
    await link(dentist.page, "Consulter").last().waitFor();
    assert.equal(await link(dentist.page, "Consulter").count(), 50);
    await write(dentist.value, "PUT", `/api/v1/patients/${patient.id}`, { identity: patient.identity, status: "inactive", version: patient.version }, 200);
    await dentist.page.reload();
    await dentist.page.getByText("Patient archivé. Ses documents restent consultables.", { exact: true }).waitFor();
    assert.equal(await link(dentist.page, "Nouveau document").count(), 0);
    assert.equal(await link(dentist.page, "Modifier le brouillon").count(), 0);
    await dentist.page.goto(url(detail(patient, first.documentId, "modifier")));
    await dentist.page.getByText("Patient archivé. Ce document est en lecture seule.", { exact: true }).waitFor();
    assert.equal(await button(dentist.page, "Enregistrer le brouillon").count(), 0);
    assert.equal((await write(dentist.value, "PUT", apiDetail(patient, first.documentId), { expectedVersion: 0, draft: emptyDraft }, 409)).code, "ARCHIVED_PATIENT");

    const requests = [];
    reception.page.on("request", request => { if (request.url().includes("/insurance-documents")) requests.push(request.url()); });
    await reception.page.goto(url(`/patients/${patient.id}`));
    await heading(reception.page, "Patient fictif Assurance historique").waitFor();
    assert.equal(await link(reception.page, "Documents d’assurance").count(), 0);
    for (const path of [history(patient), detail(patient, first.documentId), `/documents/assurances/nouvelle?patientId=${patient.id}`]) {
      await reception.page.goto(url(path));
      await heading(reception.page, "Accès réservé au dentiste").waitFor();
    }
    assert.deepEqual(requests, []);
    await read(reception.value, apiHistory(patient), 403);
    await read(reception.value, apiDetail(patient, first.documentId), 403);
    await read(reception.value, apiDetail(patient, first.documentId, "/pdf"), 403);
    await read(reception.value, apiDetail(patient, crypto.randomUUID(), "/pdf"), 403);
    await write(reception.value, "POST", collection, { patientId: patient.id, draft: emptyDraft }, 403);
    await read(anonymous.value, apiHistory(patient), 401);
    await read(anonymous.value, apiDetail(patient, first.documentId, "/pdf"), 401);
    await anonymous.page.goto(url(history(patient)));
    await anonymous.page.waitForURL(url("/login"));
  } finally {
    await Promise.all([dentist.value.close(), reception.value.close(), anonymous.value.close()]);
  }
});

test("logout clears insurance editor state across tabs and a reception session cannot restore it", async () => {
  const { value, page } = await harness.context({ anonymous: true });
  try {
    const fixture = await authenticationFixture();
    await write(value, "POST", "/api/v1/auth/login", fixture.dentist, 200);
    const patient = await createPatient(value, "Assurance session");
    const draft = await createDraft(value, patient, completeCnss);
    await page.goto(url(detail(patient, draft.documentId, "modifier")));
    await field(page, "Numéro d’immatriculation").fill("SAISIE-LOCALE-FICTIVE");
    const otherTab = await value.newPage();
    await otherTab.goto(url(history(patient)));
    await button(otherTab, "Se déconnecter").click();
    await otherTab.waitForURL(url("/login"));
    await page.waitForURL(url("/login"));
    await write(value, "POST", "/api/v1/auth/login", fixture.receptionist, 200);
    await page.goto(url(detail(patient, draft.documentId, "modifier")));
    await heading(page, "Accès réservé au dentiste").waitFor();
    assert.equal(await field(page, "Numéro d’immatriculation").count(), 0);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  } finally { await value.close(); }
});

test("finalized CNSS and CNOPS download original-sized forms and open the browser print preview", async () => {
  const { value, page, errors } = await harness.context();
  try {
    const patient = await createPatient(value, "Assurance PDF");
    for (const [type, branch, size, rotation] of [["CNSS_DENTAIRE", "cnss", [728.4, 1031.76], 270],
      ["CNOPS_DENTAIRE", "cnops", [799.44, 574.08], 0]]) {
      const fields = { insured: { relationship: "LUI_MEME" }, [branch]: branch === "cnss"
        ? { registrationNumber: "012345678", practitionerInp: "123456789" }
        : { registrationNumber: "FICTIF", affiliationNumber: "AFF-FICTIF", practitionerInpe: "123456789" } };
      const draft = await createDraft(value, patient, { fields, acts: [{ fields: { plannedDescription: "Acte fictif", actCode: "D1", keyValueMinor: 13 } }] },
        { documentType: type });
      const id = draft.documentId;
      await page.goto(url(detail(patient, id)));
      await heading(page, "Brouillon d’assurance").waitFor();
      assert.equal(await button(page, "Télécharger le formulaire PDF").count(), 0);
      await prepare(page);
      await button(page.getByRole("dialog"), "Confirmer la finalisation").click();
      await heading(page, "Document d’assurance finalisé").waitFor();
      const downloadEvent = page.waitForEvent("download");
      await button(page, "Télécharger le formulaire PDF").click();
      const download = await downloadEvent;
      assert.equal(download.suggestedFilename(), `formulaire-assurance-${id}.pdf`);
      const bytes = await readFile(await download.path());
      assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
      const pdf = await PDFDocument.load(bytes);
      assert.equal(pdf.getPageCount(), 2);
      for (const pdfPage of pdf.getPages()) {
        assert(Math.abs(pdfPage.getWidth() - size[0]) < .01);
        assert(Math.abs(pdfPage.getHeight() - size[1]) < .01);
        assert.equal(pdfPage.getRotation().angle, rotation);
      }
      if (branch === "cnops") {
        await button(page, "Imprimer le formulaire").click();
        const preview = page.locator('iframe[title="Aperçu du formulaire PDF d’assurance"]');
        await preview.waitFor();
        const blob = await preview.getAttribute("src");
        assert.match(blob, /^blob:/);
        assert.equal(await link(page, "Ouvrir le PDF dans un nouvel onglet").getAttribute("href"), blob);
        await button(page, "Fermer l’aperçu").click();
        assert.equal(await preview.count(), 0);
        assert.equal(await page.evaluate(async value => (await fetch(value).catch(() => null)) === null, blob), true);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await value.close(); }
});

test("rendering overflow is safe and a lost session cannot download a PDF", async () => {
  const { value, page } = await harness.context();
  try {
    const patient = await createPatient(value, "Assurance PDF erreur");
    const input = structuredClone(completeCnss);
    input.fields.cnss.registrationNumber = "0123456789";
    const draft = await createDraft(value, patient, input);
    const id = draft.documentId;
    await page.goto(url(detail(patient, id)));
    await prepare(page);
    await button(page.getByRole("dialog"), "Confirmer la finalisation").click();
    await heading(page, "Document d’assurance finalisé").waitFor();
    const error = await read(value, apiDetail(patient, id, "/pdf"), 422);
    assert.equal(error.code, "INSURANCE_PDF_LAYOUT_OVERFLOW");
    const downloads = [];
    page.on("download", download => downloads.push(download));
    await button(page, "Télécharger le formulaire PDF").click();
    await page.getByRole("alert").filter({ hasText: /Une valeur dépasse/ }).waitFor();
    await value.clearCookies();
    await button(page, "Télécharger le formulaire PDF").click();
    await page.waitForURL(url("/login"));
    assert.equal(downloads.length, 0);
  } finally { await value.close(); }
});
