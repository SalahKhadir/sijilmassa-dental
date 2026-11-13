import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { browserHarness, authenticationFixture } from "./browser-harness.mjs";
import { formatMad } from "../../src/lib/financial/money.ts";

const harness = browserHarness({ port: 3118 });
before(async () => { await authenticationFixture(); await harness.start(); });
after(harness.stop);
const url = path => `${harness.baseURL}${path}`;
const api = "/api/v1/financial";
const canary = "CONFIDENTIAL-SYNTHETIC-FINANCIAL-BROWSER";
const name = "Soin synthétique 86B";

async function mutate(context, path, method, data) {
  const csrf = await (await context.request.get(url("/api/v1/auth/csrf"))).json();
  return context.request.fetch(url(path), { method, headers: { [csrf.headerName]: csrf.token }, data });
}
async function expectJson(response, status) {
  assert.equal(response.status(), status);
  return response.json();
}
async function fixture(context, suffix) {
  const identity = { firstName: "Patient fictif", lastName: suffix, sex: "unanswered", dateOfBirth: null,
    address: "", gsm: "", landline: "", profession: "", cin: "", medicalCoverage: "" };
  const patient = await expectJson(await mutate(context, "/api/v1/patients", "POST", { identity, status: "active" }), 201);
  const record = await expectJson(await mutate(context, "/api/v1/consultations", "POST", { patientId: patient.id, content: {
    appointmentId: null, consultationDate: "2026-11-11", chiefComplaint: canary, clinicalObservations: canary,
    assessment: canary, treatmentPlan: "", notes: canary,
  } }), 201);
  return { patient, record };
}
const patientPath = patient => `/patients/${patient.id}`;
const financePath = patient => `${patientPath(patient)}/finances`;
const consultPath = record => `/consultations/${record.id}?patientId=${record.patientId}`;
const actionPath = (record, suffix) => `/api/v1/consultations/${record.id}/${suffix}?patientId=${record.patientId}`;
const paymentsPath = (patient, charge) => `${api}/charges/${charge.chargeId}/payments?patientId=${patient.id}`;

async function seedCharge(context, record, amount) {
  const updated = await expectJson(await mutate(context, actionPath(record, "treatments"), "POST", { version: record.version,
    content: { treatmentDate: "2026-11-11", description: name, toothReference: "16", notes: canary } }), 200);
  return expectJson(await mutate(context, `${api}/charges`, "POST", {
    patientId: record.patientId, consultationId: record.id, treatmentId: updated.treatments[0].id,
    expectedConsultationVersion: updated.version, priceMinor: amount,
  }), 201);
}
function button(page, label) { return page.getByRole("button", { name: label, exact: true }); }
function text(page, value) { return page.getByText(value, { exact: true }); }
async function assignPrice(page, price, card = page) {
  await card.getByLabel("Prix du soin (DH)").fill(price);
  await button(card, "Attribuer le prix").click();
  const request = page.waitForResponse(r => new URL(r.url()).pathname === `${api}/charges` && r.request().method() === "POST");
  await button(page.getByRole("dialog"), "Confirmer le prix").click();
  return request;
}
async function selectCharge(page) {
  await page.getByRole("button", { name: /^Ouvrir le soin / }).click();
}
async function preparePayment(page, value) {
  await page.getByLabel("Montant reçu (DH)").fill(value);
  await button(page, "Préparer l’encaissement").click();
}
function confirmPayment(page) { return button(page.getByRole("dialog"), "Confirmer l’encaissement").click(); }
async function waitRemaining(page, value) {
  await page.getByRole("region", { name: "Détail du soin sélectionné" }).getByText(formatMad(value), { exact: true }).first().waitFor();
}

test("persisted clinical pricing, one-time assignment, role separation, collection, totals and verso", async () => {
  const dentist = await harness.context();
  const reception = await harness.context({ role: "receptionist", viewport: { width: 390, height: 844 } });
  const requests = [];
  reception.page.on("request", request => requests.push(new URL(request.url()).pathname));
  try {
    const { patient, record } = await fixture(dentist.value, "Tarification 86B");
    const { page } = dentist;
    await page.goto(url(consultPath(record)));
    await button(page, "Ajouter un soin").click();
    await page.getByLabel("Description (obligatoire)", { exact: true }).fill(name);
    await page.getByLabel("Référence dentaire (facultatif)", { exact: true }).fill("16");
    await page.getByLabel("Notes du soin (facultatif)", { exact: true }).fill(canary);
    assert.equal(await page.getByLabel("Prix du soin (DH)").count(), 0);
    await button(page, "Ajouter le soin").click();
    const firstCard = page.getByText("Référence dentaire : 16", { exact: true }).locator("..");
    await firstCard.getByLabel("Prix du soin (DH)").waitFor();
    await button(page, "Ajouter un soin").click();
    await page.getByLabel("Description (obligatoire)", { exact: true }).fill(name);
    await page.getByLabel("Référence dentaire (facultatif)", { exact: true }).fill("17");
    await button(page, "Ajouter le soin").click();
    const secondCard = page.getByText("Référence dentaire : 17", { exact: true }).locator("..");
    await secondCard.getByLabel("Prix du soin (DH)").waitFor();
    const chargeResponse = await assignPrice(page, "300,00", firstCard);
    assert.equal(chargeResponse.status(), 201);
    const charge = await chargeResponse.json();
    const submitted = chargeResponse.request().postDataJSON();
    const persisted = await (await dentist.value.request.get(url(`/api/v1${consultPath(record)}`))).json();
    assert.equal(submitted.treatmentId, persisted.treatments.find(t => t.content.toothReference === "16").id);
    assert.equal(submitted.expectedConsultationVersion, persisted.version);
    const priceText = `Prix enregistré · ${formatMad(30000)} · Lecture seule`;
    await text(firstCard, priceText).waitFor();
    assert.equal(await firstCard.getByLabel("Prix du soin (DH)").count(), 0);
    await page.reload();
    await text(firstCard, priceText).waitFor();
    await secondCard.getByLabel("Prix du soin (DH)").waitFor();
    assert.equal(await firstCard.getByLabel("Prix du soin (DH)").count(), 0);
    const pricingPath = `${api}/consultations/${record.id}/pricing?patientId=${patient.id}`;
    assert.equal((await reception.value.request.get(url(pricingPath))).status(), 403);
    await button(page, "Terminer la consultation").click();
    await button(page.getByRole("dialog"), "Terminer la consultation").click();
    await text(page, "Consultation finalisée.").waitFor();
    await text(firstCard, priceText).waitFor();
    await text(secondCard, "Soin sans prix enregistré.").waitFor();
    assert.equal(await page.getByLabel("Prix du soin (DH)").count(), 0);

    const rp = reception.page;
    await rp.goto(url(patientPath(patient)));
    await rp.getByRole("link", { name: "Finances du patient" }).click();
    await rp.waitForURL(url(financePath(patient)));
    await rp.getByRole("table", { name: "Soldes des soins tarifés" }).waitFor();
    assert.equal(await rp.getByText(canary, { exact: true }).count(), 0);
    assert.equal(await rp.getByLabel("Prix du soin (DH)").count(), 0);
    assert(!requests.some(path => /\/medical-record|\/consultations|\/prescriptions/.test(path)));
    assert.equal((await mutate(reception.value, `${api}/charges`, "POST", submitted)).status(), 403);
    assert.equal(await rp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await selectCharge(rp);
    await preparePayment(rp, "300,01");
    await text(rp, "Le montant dépasse le reste à payer.").waitFor();
    await preparePayment(rp, "100,01");
    await confirmPayment(rp);
    await rp.getByText(/^Encaissement confirmé/).waitFor();
    await waitRemaining(rp, 19999);
    await preparePayment(rp, "199,99");
    await confirmPayment(rp);
    await text(rp, "Ce soin est soldé.").waitFor();
    assert.equal(await rp.getByLabel("Montant reçu (DH)").count(), 0);
    assert.equal((await (await reception.value.request.get(url(paymentsPath(patient, charge)))).json()).items.length, 2);
    await button(rp, "Verso du dossier").click();
    const verso = rp.getByRole("table", { name: "Verso du dossier patient" });
    await verso.waitFor();
    assert.deepEqual(await verso.getByRole("columnheader").allTextContents(), ["Date", "Traitement", "Prix", "Reçu", "Reste"]);
    assert.deepEqual((await verso.getByRole("cell").allTextContents()).slice(1), [formatMad(30000), formatMad(30000), formatMad(0)]);
    const totals = rp.locator("dl[aria-label='Totaux du patient']");
    assert.deepEqual(await totals.locator("dd").allTextContents(), [formatMad(30000), formatMad(30000), formatMad(0)]);
    assert.deepEqual(dentist.errors, []);
    assert.deepEqual(reception.errors, []);
  } finally { await dentist.value.close(); await reception.value.close(); }
});

test("a lost response replays the identical operation across cabinet navigation and records exactly once", async () => {
  const dentist = await harness.context();
  const reception = await harness.context({ role: "receptionist" });
  try {
    const { patient, record } = await fixture(dentist.value, "Rejeu 86B");
    const charge = await seedCharge(dentist.value, record, 20000);
    const path = paymentsPath(patient, charge);
    const { page } = reception;
    const bodies = [];
    await page.route(`**${api}/charges/*/payments?*`, async route => {
      if (route.request().method() !== "POST") return route.continue();
      bodies.push(route.request().postData());
      if (bodies.length === 1) {
        const committed = await route.fetch();
        assert.equal(committed.status(), 200);
        return route.abort("connectionreset");
      }
      return route.continue();
    });
    await page.goto(url(financePath(patient)));
    await selectCharge(page);
    await preparePayment(page, "72,25");
    await confirmPayment(page);
    await button(page, "Renvoyer le même encaissement").waitFor();
    await page.getByRole("link", { name: "Retour à la fiche du patient" }).click();
    await page.getByRole("link", { name: "Finances du patient" }).click();
    await button(page, "Renvoyer le même encaissement").click();
    await page.getByText(/^Encaissement confirmé/).waitFor();
    await waitRemaining(page, 12775);
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0], bodies[1]);
    const history = await expectJson(await reception.value.request.get(url(path)), 200);
    assert.equal(history.items.length, 1);
    assert.equal(history.items[0].amountMinor, 7225);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.equal(await page.evaluate(async () => (await indexedDB.databases()).length), 0);
    assert.deepEqual(reception.errors, []);
  } finally { await dentist.value.close(); await reception.value.close(); }
});

test("after a full reload an uncertain committed payment is visible in history without a second write", async () => {
  const dentist = await harness.context();
  const reception = await harness.context({ role: "receptionist" });
  try {
    const { patient, record } = await fixture(dentist.value, "Rechargement fictif");
    const charge = await seedCharge(dentist.value, record, 20000);
    const path = paymentsPath(patient, charge);
    const { page } = reception;
    let writes = 0;
    await page.route(`**${api}/charges/*/payments?*`, async route => {
      if (route.request().method() !== "POST") return route.continue();
      if (++writes !== 1) return route.continue();
      const committed = await route.fetch();
      assert.equal(committed.status(), 200);
      await route.abort("connectionreset");
    });
    await page.goto(url(financePath(patient)));
    await selectCharge(page);
    await preparePayment(page, "72,25");
    await confirmPayment(page);
    await button(page, "Renvoyer le même encaissement").waitFor();
    page.once("dialog", dialog => dialog.accept());
    await page.reload();
    await selectCharge(page);
    await page.getByText(/vérifiez l’historique du soin avant de saisir un autre encaissement/).waitFor();
    await page.getByRole("region", { name: "Historique des encaissements" })
      .getByText(formatMad(7225), { exact: true }).waitFor();
    await waitRemaining(page, 12775);
    assert.equal(await button(page, "Renvoyer le même encaissement").count(), 0);
    assert.equal(writes, 1);
    const history = await expectJson(await reception.value.request.get(url(path)), 200);
    assert.deepEqual(history.items.map(payment => payment.amountMinor), [7225]);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.equal(await page.evaluate(async () => (await indexedDB.databases()).length), 0);
    assert.deepEqual(reception.errors, []);
  } finally { await dentist.value.close(); await reception.value.close(); }
});

test("a stale payment refreshes the charge and requires reconfirmation, and archived or expired sessions cannot collect", async () => {
  const dentist = await harness.context();
  const reception = await harness.context({ role: "receptionist" });
  try {
    const { patient, record } = await fixture(dentist.value, "Conflit 86B");
    const charge = await seedCharge(dentist.value, record, 30000);
    const path = paymentsPath(patient, charge);
    const { page } = reception;
    const bodies = [];
    await page.route(`**${api}/charges/*/payments?*`, route => {
      if (route.request().method() === "POST") bodies.push(route.request().postDataJSON());
      return route.continue();
    });
    await page.goto(url(financePath(patient)));
    await selectCharge(page);
    await preparePayment(page, "20");
    await expectJson(await mutate(dentist.value, path, "POST", {
      amountMinor: 5000, method: "CARTE", paidAt: "2026-11-11T09:00:00Z",
      operationId: crypto.randomUUID(), expectedChargeVersion: 0,
    }), 200);
    await confirmPayment(page);
    await page.getByText(/^Le dossier a changé/).waitFor();
    await waitRemaining(page, 25000);
    assert.equal(bodies.length, 1);
    await preparePayment(page, "20");
    await confirmPayment(page);
    await page.getByText(/^Encaissement confirmé/).waitFor();
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].expectedChargeVersion, 0);
    assert.equal(bodies[1].expectedChargeVersion, 1);
    assert.notEqual(bodies[0].operationId, bodies[1].operationId);
    await expectJson(await mutate(dentist.value, path, "POST", {
      amountMinor: 100, method: "CARTE", paidAt: "2026-11-11T09:00:00Z",
      operationId: crypto.randomUUID(), expectedChargeVersion: 2,
    }), 200);
    await button(page, "Actualiser les finances").click();
    await waitRemaining(page, 22900);
    await expectJson(await mutate(dentist.value, `/api/v1/patients/${patient.id}`, "PUT", {
      version: patient.version, identity: patient.identity, status: "inactive",
    }), 200);
    await button(page, "Actualiser les finances").click();
    await text(page, "Patient archivé. Les finances restent consultables.").waitFor();
    assert.equal(await page.getByLabel("Montant reçu (DH)").count(), 0);
    await page.getByRole("table", { name: "Soldes des soins tarifés" }).waitFor();
    await page.getByRole("region", { name: "Historique des encaissements" })
      .getByText(formatMad(2000), { exact: true }).waitFor();
    // Keep an incidental focus/visibility check from winning this explicit refresh scenario.
    // Release the gate afterwards without fabricating a session response.
    const { promise: sessionGate, resolve: releaseSessionCheck } = Promise.withResolvers();
    await page.route("**/api/v1/auth/me", async route => {
      await sessionGate;
      await route.continue();
    });
    try {
      await reception.value.clearCookies();
      const [expired] = await Promise.all([
        page.waitForResponse(response => {
          const pathname = new URL(response.url()).pathname;
          return response.request().method() === "GET" &&
            (pathname.startsWith(api + "/") || pathname === `/api/v1/patients/${patient.id}`);
        }),
        button(page, "Actualiser les finances").click(),
      ]);
      assert.equal(expired.status(), 401);
      await page.waitForURL(url("/login"));
    } finally {
      releaseSessionCheck();
    }
    assert.equal(await page.getByRole("table").count(), 0);
    assert.deepEqual(reception.errors, []);
  } finally { await dentist.value.close(); await reception.value.close(); }
});

test("focus revalidation after session expiry removes the financial workspace without a refresh click", async () => {
  const reception = await harness.context({ role: "receptionist" });
  try {
    const patient = await expectJson(await mutate(reception.value, "/api/v1/patients", "POST", {
      identity: {
        firstName: "Patient fictif", lastName: "Session finances", sex: "unanswered", dateOfBirth: null,
        address: "", gsm: "", landline: "", profession: "", cin: "", medicalCoverage: "",
      },
      status: "active",
    }), 201);
    const { page } = reception;
    await page.goto(url(financePath(patient)));
    await text(page, "Aucun soin tarifé sur cette page.").waitFor();
    await button(page, "Actualiser les finances").waitFor();
    const expired = page.waitForResponse(response =>
      new URL(response.url()).pathname === "/api/v1/auth/me" && response.status() === 401);
    await reception.value.clearCookies();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expired;
    await page.waitForURL(url("/login"));
    assert.equal(await button(page, "Actualiser les finances").count(), 0);
    assert.equal(await text(page, "Aucun soin tarifé sur cette page.").count(), 0);
    assert.deepEqual(reception.errors, []);
  } finally { await reception.value.close(); }
});

test("empty and paged treatment ledgers show whole-patient totals and bounded verso pages", async () => {
  const dentist = await harness.context();
  const reception = await harness.context({ role: "receptionist" });
  try {
    const { patient, record } = await fixture(dentist.value, "Pagination 86B");
    const { page } = reception;
    await page.goto(url(financePath(patient)));
    await text(page, "Aucun soin tarifé sur cette page.").waitFor();
    let current = record;
    for (let index = 0; index < 51; index++) {
      if (index === 50) {
        current = await expectJson(await mutate(dentist.value, "/api/v1/consultations", "POST", {
          patientId: patient.id, content: record.content,
        }), 201);
      }
      const label = `Soin fictif ${index}`;
      current = await expectJson(await mutate(dentist.value, actionPath(current, "treatments"), "POST", {
        version: current.version, content: { treatmentDate: "2026-11-11", description: label, toothReference: "", notes: "" },
      }), 200);
      await expectJson(await mutate(dentist.value, `${api}/charges`, "POST", {
        patientId: patient.id, consultationId: current.id, treatmentId: current.treatments.find(t => t.content.description === label).id,
        expectedConsultationVersion: current.version, priceMinor: 100,
      }), 201);
    }
    await button(page, "Actualiser les finances").click();
    const summary = page.getByRole("table", { name: "Soldes des soins tarifés" });
    await summary.waitFor();
    assert.equal(await summary.locator("tbody tr").count(), 50);
    await button(page, "Soins suivants").click();
    await button(page, "Première page des soins").waitFor();
    assert.equal(await summary.locator("tbody tr").count(), 1);
    assert.deepEqual(await page.locator("dl[aria-label='Totaux du patient'] dd").allTextContents(), [formatMad(5100), formatMad(0), formatMad(5100)]);
    await button(page, "Verso du dossier").click();
    const verso = page.getByRole("table", { name: "Verso du dossier patient" });
    await verso.waitFor();
    assert.equal(await verso.locator("tbody tr").count(), 50);
    await button(page, "Soins suivants").click();
    await button(page, "Première page des soins").waitFor();
    assert.equal(await verso.locator("tbody tr").count(), 1);
    assert.equal(await verso.getByRole("columnheader").count(), 5);
  } finally { await dentist.value.close(); await reception.value.close(); }
});

test("pricing stays unknown during a failed read and restores the recorded price for an archived patient", async () => {
  const dentist = await harness.context();
  try {
    const { patient, record } = await fixture(dentist.value, "Lecture des prix 86B1");
    await seedCharge(dentist.value, record, 12500);
    const current = await expectJson(await dentist.value.request.get(url(`/api/v1${consultPath(record)}`)), 200);
    await expectJson(await mutate(dentist.value, actionPath(current, "treatments"), "POST", {
      version: current.version, content: { treatmentDate: "2026-11-11", description: "Autre soin fictif", toothReference: "17", notes: "" },
    }), 200);
    const { page } = dentist;
    const endpoint = `**${api}/consultations/${record.id}/pricing?*`;
    await page.route(endpoint, route => route.abort("connectionreset"));
    await page.goto(url(consultPath(record)));
    await text(page, "La tarification des soins ne peut pas être vérifiée.").waitFor();
    await text(page, "Autre soin fictif").waitFor();
    assert.equal(await page.getByLabel("Prix du soin (DH)").count(), 0);
    assert.equal(await text(page, "Soin sans prix enregistré.").count(), 0);

    await page.unroute(endpoint);
    await expectJson(await mutate(dentist.value, `/api/v1/patients/${patient.id}`, "PUT", {
      version: patient.version, identity: patient.identity, status: "inactive",
    }), 200);
    await button(page, "Actualiser le dossier et les prix").click();
    await text(page, `Prix enregistré · ${formatMad(12500)} · Lecture seule`).waitFor();
    await text(page, "Soin sans prix enregistré.").waitFor();
    assert.equal(await page.getByLabel("Prix du soin (DH)").count(), 0);
    assert.deepEqual(dentist.errors, []);
  } finally { await dentist.value.close(); }
});
