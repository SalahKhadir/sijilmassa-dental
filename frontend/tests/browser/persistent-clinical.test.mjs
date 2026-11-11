import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdir } from "node:fs/promises";
import { browserHarness, authenticationFixture } from "./browser-harness.mjs";
import { clinicParts } from "../../src/lib/appointments/api/time.ts";
import { formatPatientDate } from "../../src/lib/patients/dates.ts";

const harness = browserHarness({ port: 3115 });
before(async () => { await authenticationFixture(); await harness.start(); }); after(harness.stop);
const url = path => `${harness.baseURL}${path}`;
async function mutate(context, path, method, data) {
  const csrf = await (await context.request.get(url("/api/v1/auth/csrf"))).json();
  return context.request.fetch(url(path), { method, headers: { [csrf.headerName]: csrf.token }, data });
}
async function login(page, role = "dentist") {
  const fixture = (await authenticationFixture())[role];
  await page.goto(url("/login"));
  await page.getByLabel("Identifiant (obligatoire)", { exact: true }).fill(fixture.identifier);
  await page.getByLabel("Mot de passe (obligatoire)", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(value => value.pathname !== "/login");
}
async function patient(context, suffix) {
  const identity = { firstName: "Clinique fictive", lastName: suffix, sex: "unanswered", dateOfBirth: null,
    address: "", gsm: "", landline: "", profession: "", cin: "", medicalCoverage: "" };
  const response = await mutate(context, "/api/v1/patients", "POST", { identity, status: "active" });
  assert.equal(response.status(), 201); return response.json();
}
const draft = { appointmentId: null, consultationDate: "2026-11-10", chiefComplaint: "Motif synthétique 852", clinicalObservations: "", assessment: "", treatmentPlan: "", notes: "" };
async function create(context, owner) {
  const response = await mutate(context, "/api/v1/consultations", "POST", { patientId: owner.id, content: draft });
  assert.equal(response.status(), 201); return response.json();
}
const detail = c => `/consultations/${c.id}?patientId=${c.patientId}`;
const endpoint = c => `/api/v1/consultations/${c.id}?patientId=${c.patientId}`;
async function save(page, button, suffix, method = "PUT") {
  const response = page.waitForResponse(r => r.request().method() === method && new URL(r.url()).pathname.endsWith(suffix));
  await button.click(); assert.equal((await response).status(), 200);
}
async function addCare(page, description) {
  await page.getByRole("button", { name: "Ajouter un soin", exact: true }).click();
  await page.getByLabel("Description (obligatoire)", { exact: true }).fill(description);
  await page.getByLabel("Référence dentaire (facultatif)", { exact: true }).fill("16");
  await save(page, page.getByRole("button", { name: "Ajouter le soin", exact: true }), "/treatments", "POST");
  await page.getByLabel("Description (obligatoire)", { exact: true }).waitFor({ state: "hidden" });
  await page.getByText(description, { exact: true }).waitFor();
}
async function screenshot(page, name) {
  await mkdir("/tmp/sijilmassa-852-screenshots", { recursive: true });
  await page.screenshot({ path: `/tmp/sijilmassa-852-screenshots/${name}.png`, fullPage: true });
}

test("real dentist workflow: patient UI, clinical draft, reload, multiple treatments, correction, retained removal and finalization", async () => {
  const { value, page, errors } = await harness.context({ anonymous: true });
  page.on("dialog", dialog => dialog.accept());
  try {
    await login(page);
    await page.goto(url("/patients/nouveau"));
    await page.getByLabel("Nom (obligatoire)", { exact: true }).fill("Clinique-852");
    await page.getByLabel("Prénom (obligatoire)", { exact: true }).fill("Fictive");
    for (let step = 0; step < 3; step++) await page.getByRole("button", { name: "Continuer", exact: true }).click();
    await page.getByRole("button", { name: "Créer le patient", exact: true }).click();
    await page.waitForURL(/\/patients\/[0-9a-f-]{36}$/);
    const patientId = new URL(page.url()).pathname.split("/").at(-1);
    await page.getByRole("link", { name: "Historique clinique", exact: true }).click();
    await page.getByRole("heading", { name: "Historique clinique", exact: true }).waitFor();
    await page.getByRole("link", { name: "Nouvelle consultation", exact: true }).click();
    await page.getByLabel("Motif de consultation (obligatoire)", { exact: true }).fill("Consultation synthétique persistante 852");
    await page.getByLabel("Observations cliniques (facultatif)").fill("Observation synthétique persistante 852");
    await page.getByRole("button", { name: "Créer le brouillon", exact: true }).click();
    await page.waitForURL(/\/consultations\/[0-9a-f-]{36}\?/);
    const id = new URL(page.url()).pathname.split("/").at(-1);
    assert.equal(new URL(page.url()).searchParams.get("patientId"), patientId);
    await page.getByText("Consultation créée.", { exact: true }).waitFor(); await page.reload();
    await page.getByText("Observation synthétique persistante 852", { exact: true }).waitFor();
    await addCare(page, "Soin A synthétique 852"); await addCare(page, "Soin B synthétique 852");
    const first = page.getByText("Soin A synthétique 852", { exact: true }).locator("..");
    await first.getByRole("button", { name: "Modifier ce soin", exact: true }).click();
    await page.getByLabel("Description (obligatoire)", { exact: true }).fill("Soin A corrigé synthétique 852");
    await save(page, page.getByRole("button", { name: "Enregistrer le soin", exact: true }), (await (await value.request.get(url(`/api/v1/consultations/${id}?patientId=${patientId}`))).json()).treatments.find(t => t.content.description === "Soin A synthétique 852").id);
    await page.getByText("Soin modifié.", { exact: true }).waitFor();
    await page.getByText("Soin B synthétique 852", { exact: true }).locator("..").getByRole("button", { name: "Retirer ce soin", exact: true }).click();
    await save(page, page.getByRole("dialog").getByRole("button", { name: "Retirer le soin", exact: true }), "/removal");
    await page.getByText("Soin retiré.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("region", { name: "Soins actifs" }).getByText("Soin B synthétique 852", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Afficher les soins retirés", exact: true }).click();
    await page.getByText("Soin B synthétique 852", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Terminer la consultation", exact: true }).click();
    await save(page, page.getByRole("dialog").getByRole("button", { name: "Terminer la consultation", exact: true }), "/finalization");
    await page.getByText("Consultation finalisée.", { exact: true }).waitFor();
    await page.reload(); await page.getByText("Consultation finalisée · Compte rendu et soins en lecture seule.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Ajouter un soin", exact: true }).count(), 0);
    const c = await (await value.request.get(url(`/api/v1/consultations/${id}?patientId=${patientId}`))).json();
    assert.equal(c.version, 5); assert.equal(c.status, "TERMINEE"); assert.equal(c.treatments.length, 1);
    await page.goto(url(`/consultations/${id}/modifier?patientId=${patientId}`));
    await page.getByText("Cette consultation finalisée est en lecture seule.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).isDisabled(), true);
    await page.goto(url(detail(c))); await page.getByRole("heading", { name: /Consultation du/ }).waitFor();
    await screenshot(page, "clinical-finalized-desktop");
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(errors, []);
  } finally { await value.close(); }
});

test("real stale draft and treatment changes preserve input until an explicit confirmed reload", async () => {
  const { value, page } = await harness.context(); page.on("dialog", dialog => dialog.accept());
  try {
    const owner = await patient(value, "Conflit852"), c = await create(value, owner);
    await page.goto(url(`/consultations/${c.id}/modifier?patientId=${owner.id}`));
    await page.getByLabel("Motif de consultation (obligatoire)", { exact: true }).fill("Saisie non enregistrée 852");
    const changed = await mutate(value, endpoint(c), "PUT", { version: c.version, content: { ...draft, chiefComplaint: "Modification concurrente 852" } });
    assert.equal(changed.status(), 200);
    const conflict = page.waitForResponse(r => r.request().method() === "PUT" && new URL(r.url()).pathname === `/api/v1/consultations/${c.id}`);
    await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click(); assert.equal((await conflict).status(), 409);
    assert.equal(await page.getByLabel("Motif de consultation (obligatoire)", { exact: true }).inputValue(), "Saisie non enregistrée 852");
    assert.equal(await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Recharger le brouillon", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Recharger et remplacer mes saisies", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await page.getByLabel("Motif de consultation (obligatoire)", { exact: true }).inputValue(), "Modification concurrente 852");
    await page.getByLabel("Motif de consultation (obligatoire)", { exact: true }).fill("Correction explicite 852");
    await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click(); await page.waitForURL(/\/consultations\/[0-9a-f-]{36}\?patientId=/);
    await page.getByText("Brouillon enregistré.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Ajouter un soin", exact: true }).click();
    await page.getByLabel("Description (obligatoire)", { exact: true }).fill("Soin non enregistré 852");
    const latest = await (await value.request.get(url(endpoint(c)))).json();
    assert.equal((await mutate(value, endpoint(c), "PUT", { version: latest.version, content: latest.content })).status(), 200);
    const rejected = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/treatments"));
    await page.getByRole("button", { name: "Ajouter le soin", exact: true }).click(); assert.equal((await rejected).status(), 409);
    assert.equal(await page.getByLabel("Description (obligatoire)", { exact: true }).inputValue(), "Soin non enregistré 852");
    await page.getByRole("button", { name: "Recharger le dossier pour ce soin", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Recharger le dossier clinique", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await page.getByLabel("Description (obligatoire)", { exact: true }).inputValue(), "Soin non enregistré 852");
    await save(page, page.getByRole("button", { name: "Ajouter le soin", exact: true }), "/treatments", "POST");
    await page.getByText("Soin ajouté.", { exact: true }).waitFor();
  } finally { await value.close(); }
});

test("real appointment association on mobile stays consistent in America/New_York and does not complete the appointment", async () => {
  const { value, page, errors } = await harness.context({ viewport: { width: 390, height: 844 }, timezoneId: "America/New_York" });
  try {
    const owner = await patient(value, "Mobile852");
    const response = await mutate(value, "/api/v1/appointments", "POST", { patientId: owner.id, startAt: "2026-12-15T23:00:00Z", endAt: "2026-12-15T23:30:00Z", type: "CONSULTATION" });
    assert.equal(response.status(), 201); const a = await response.json();
    const expectedDate = clinicParts(a.startAt).date;
    await page.goto(url(`/rendez-vous/${a.id}`));
    await page.getByRole("link", { name: "Créer une consultation", exact: true }).click();
    await page.getByLabel("Motif de consultation (obligatoire)", { exact: true }).fill("Consultation mobile 852");
    assert.equal(await page.getByLabel("Date de consultation", { exact: true }).inputValue(), expectedDate);
    await page.getByLabel("Rendez-vous lié (facultatif)", { exact: true }).waitFor();
    await page.waitForFunction(id => document.querySelector("#clinical-appointment")?.value === id, a.id);
    await screenshot(page, "clinical-mobile-form");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByRole("button", { name: "Créer le brouillon", exact: true }).click();
    await page.waitForURL(/\/consultations\/[0-9a-f-]{36}\?/);
    await page.getByRole("heading", { name: `Consultation du ${formatPatientDate(expectedDate)}`, exact: true }).waitFor();
    await page.getByRole("button", { name: "Terminer la consultation", exact: true }).click();
    await save(page, page.getByRole("dialog").getByRole("button", { name: "Terminer la consultation", exact: true }), "/finalization");
    await page.getByText("Consultation finalisée.", { exact: true }).waitFor();
    assert.equal((await (await value.request.get(url(`/api/v1/appointments/${a.id}`))).json()).status, "EN_ATTENTE");
    await screenshot(page, "clinical-mobile-finalized"); assert.deepEqual(errors, []);
    const foreign = await patient(value, "Autre852");
    await page.goto(url(`/consultations/nouveau?patientId=${foreign.id}&appointmentId=${a.id}`));
    await page.getByRole("alert").filter({ hasText: "Vérifiez les champs" }).waitFor();
  } finally { await value.close(); }
});

test("real receptionist cannot load clinical data; archived patients remain readable and deny clinical writes", async () => {
  const dentist = await harness.context(); const reception = await harness.context({ role: "receptionist" });
  try {
    const owner = await patient(dentist.value, "Archive852"), c = await create(dentist.value, owner);
    const requests = []; reception.page.on("request", r => { if (r.url().includes("/api/v1/consultations")) requests.push(r.url()); });
    await reception.page.goto(url(detail(c)));
    await reception.page.getByRole("heading", { name: "Accès réservé au dentiste", exact: true }).waitFor();
    await reception.page.goto(url(`/patients/${owner.id}/clinique`));
    await reception.page.getByRole("heading", { name: "Accès réservé au dentiste", exact: true }).waitFor();
    assert.deepEqual(requests, []);
    assert.equal((await reception.value.request.get(url(endpoint(c)))).status(), 403);
    assert.equal((await mutate(dentist.value, `/api/v1/patients/${owner.id}`, "PUT", { version: owner.version, identity: owner.identity, status: "inactive" })).status(), 200);
    await dentist.page.goto(url(detail(c)));
    await dentist.page.getByText("Patient archivé. Ce dossier reste consultable ; aucune modification n’est autorisée.", { exact: true }).waitFor();
    assert.equal(await dentist.page.getByRole("button", { name: "Ajouter un soin", exact: true }).count(), 0);
    await dentist.page.goto(url(`/consultations/${c.id}/modifier?patientId=${owner.id}`));
    await dentist.page.getByRole("alert").filter({ hasText: "Patient archivé" }).waitFor();
    assert.equal(await dentist.page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).isDisabled(), true);
    assert.equal((await mutate(dentist.value, endpoint(c), "PUT", { version: c.version, content: draft })).status(), 409);
  } finally { await dentist.value.close(); await reception.value.close(); }
});

test("real CSRF rejection keeps draft input and session invalidation clears clinical content", async () => {
  const { value, page } = await harness.context({ anonymous: true });
  try {
    await login(page); const owner = await patient(value, "Securite852");
    await page.goto(url(`/consultations/nouveau?patientId=${owner.id}`));
    await page.getByLabel("Motif de consultation (obligatoire)", { exact: true }).fill("Saisie CSRF synthétique 852");
    await value.route("**/api/v1/consultations", async route => {
      if (route.request().method() !== "POST") return route.continue();
      const headers = { ...route.request().headers() }; delete headers["x-csrf-token"]; await route.continue({ headers });
    });
    const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/v1/consultations" && r.request().method() === "POST");
    await page.getByRole("button", { name: "Créer le brouillon", exact: true }).click(); assert.equal((await response).status(), 403);
    assert.equal(await page.getByLabel("Motif de consultation (obligatoire)", { exact: true }).inputValue(), "Saisie CSRF synthétique 852");
    assert.equal(await page.getByRole("button", { name: "Créer le brouillon", exact: true }).isDisabled(), true);
    assert.equal((await (await value.request.get(url(`/api/v1/consultations?patientId=${owner.id}`))).json()).items.length, 0);
    await value.unroute("**/api/v1/consultations");
    assert.equal((await mutate(value, "/api/v1/auth/logout", "POST")).status(), 204);
    await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await page.waitForURL(/\/login$/);
    assert.equal(await page.locator("textarea").count(), 0);
    assert(!(await page.content()).includes("Saisie CSRF synthétique 852"));
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  } finally { await value.close(); }
});
