import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { browserHarness, authenticationFixture } from "./browser-harness.mjs";
const harness = browserHarness({ port: 3113 });
before(async () => { await authenticationFixture(); await harness.start(); });
after(harness.stop);
const api = path => `${harness.baseURL}/api/v1/${path}`;
async function mutate(context, path, method, data) {
 const csrfResponse = await context.request.get(api("auth/csrf"));
 assert.equal(csrfResponse.status(), 200);
 const csrf = await csrfResponse.json();
 return context.request.fetch(api(path), { method, headers: { [csrf.headerName]: csrf.token }, data });
}
async function submit(page) { await page.getByRole("button", { name: "Continuer", exact: true }).click(); }
async function createInUI(page) {
 await page.goto(`${harness.baseURL}/patients/nouveau`);
 await page.getByLabel("Nom (obligatoire)", { exact: true }).fill("Validation-83B");
 await page.getByLabel("Prénom (obligatoire)", { exact: true }).fill("Fictive");
 await submit(page); await submit(page); await submit(page);
 await page.getByRole("button", { name: "Créer le patient", exact: true }).click();
 await page.waitForURL(/\/patients\/[0-9a-f-]{36}$/);
 return page.url().split("/").at(-1);
}

test("persistent dentist: create, refresh, administrative update, clinical update, archive/restore, conflict and reload", async () => {
 const { value, page, errors, external } = await harness.context();
 try {
  const id = await createInUI(page);
  await page.reload(); await page.getByRole("heading", { name: "Fictive Validation-83B", exact: true }).waitFor();
  await page.getByRole("link", { name: "Modifier le patient", exact: true }).click();
  await page.getByLabel("Profession", { exact: true }).fill("Profession fictive 83B");
  await submit(page); await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.getByText("Modifications enregistrées.", { exact: false }).waitFor();
  await page.goto(`${harness.baseURL}/patients/${id}`); await page.reload(); await page.getByText("Profession fictive 83B", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Questionnaire et antécédents", exact: true }).click();
  await page.getByRole("link", { name: "Modifier le dossier de santé", exact: true }).click();
  await page.getByLabel("Diabète", { exact: true }).check(); await submit(page); await submit(page);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.getByText("Modifications enregistrées.", { exact: false }).waitFor();
  await page.goto(`${harness.baseURL}/patients/${id}/dossier`); await page.reload();
  const clinical = await (await value.request.get(api(`patients/${id}/medical-record`))).json();
  assert(clinical.record.medicalHistory.conditions.includes("Diabète"));
  // Independent medical version conflicts: mutate via another real HTTP writer while the form remains stale.
  await page.goto(`${harness.baseURL}/patients/${id}/dossier/modifier`);
  await page.getByLabel("Cardiaque", { exact: true }).check();
  assert.equal((await mutate(value, `patients/${id}/medical-record`, "PUT", { version: clinical.version, record: clinical.record })).status(), 200);
  await submit(page); await submit(page);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Le dossier a changé" }).waitFor();
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Recharger les données" }).click();
  assert.equal(await page.getByLabel("Cardiaque", { exact: true }).isChecked(), false);
  // Administrative conflict never retries the stale write.
  await page.goto(`${harness.baseURL}/patients/${id}/modifier`);
  await page.getByLabel("Profession", { exact: true }).fill("Modification non enregistrée");
  const patient = await (await value.request.get(api(`patients/${id}`))).json();
  assert.equal((await mutate(value, `patients/${id}`, "PUT", { identity: { ...patient.identity, profession: "Autre utilisateur fictif" }, status: patient.status, version: patient.version })).status(), 200);
  await submit(page); await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Le dossier a changé" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Enregistrer", exact: true }).isDisabled(), true);
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Recharger les données" }).click();
  assert.equal(await page.getByLabel("Profession", { exact: true }).inputValue(), "Autre utilisateur fictif");
  await page.goto(`${harness.baseURL}/patients/${id}`);
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Archiver le patient", exact: true }).click();
  await page.getByText("Patient inactif.", { exact: false }).waitFor();
  await page.goto(`${harness.baseURL}/patients/${id}/dossier/modifier`); await page.getByText("Restaurez le patient", { exact: false }).waitFor();
  await page.goto(`${harness.baseURL}/patients/${id}`);
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Restaurer le patient", exact: true }).click();
  await page.getByRole("button", { name: "Archiver le patient", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
 } finally { await value.close(); }
});

test("reception administrative UI never requests medical records; backend denies clinical read/write and complete creation", async () => {
 const { value, page } = await harness.context({ role: "receptionist" });
 try {
  const clinicalRequests = [];
  page.on("request", request => { if (request.url().includes("medical-record")) clinicalRequests.push(request.url()); });
  await page.goto(`${harness.baseURL}/patients/nouveau`);
  await page.getByLabel("Nom (obligatoire)", { exact: true }).fill("Accueil-83B");
  await page.getByLabel("Prénom (obligatoire)", { exact: true }).fill("Fictif");
  await submit(page); assert.equal(await page.getByText("Antécédents médicaux", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Créer le patient", exact: true }).click(); await page.waitForURL(/\/patients\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").at(-1);
  await page.reload(); await page.getByRole("heading", { name: "Fictif Accueil-83B", exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Questionnaire et antécédents", exact: true }).count(), 0);
  const admin = await (await value.request.get(api(`patients/${id}`))).json();
  assert(!("medicalHistory" in admin)); assert(!("medicalRecord" in admin));
  await page.goto(`${harness.baseURL}/patients/${id}/dossier`); await page.getByRole("heading", { name: "Accès réservé au dentiste", exact: true }).waitFor();
  assert.deepEqual(clinicalRequests, []);
  assert.equal((await value.request.get(api(`patients/${id}/medical-record`))).status(), 403);
  assert.equal((await mutate(value, `patients/${id}/medical-record`, "PUT", {})).status(), 403);
  assert.equal((await mutate(value, "patients/with-medical-record", "POST", {})).status(), 403);
  await page.goto(`${harness.baseURL}/patients`); await page.getByRole("link", { name: "Accueil-83B Fictif", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
 } finally { await value.close(); }
});

test("persistent API failure is explicit without synthetic fallback; prototype remains a separate domain", async () => {
 const { value, page } = await harness.context();
 try {
  await page.route("**/api/v1/patients?**", route => route.abort("connectionfailed"));
  await page.goto(`${harness.baseURL}/patients`); await page.getByRole("alert").filter({ hasText: "serveur est indisponible" }).waitFor();
  assert.equal(await page.getByRole("table").count(), 0);
  await page.unroute("**/api/v1/patients?**");
  await page.goto(`${harness.baseURL}/demo/patients`); await page.getByRole("heading", { name: "Patients", exact: true }).waitFor();
  await page.getByRole("searchbox", { name: "Rechercher un patient" }).fill("demo-pat-0003");
  await page.getByRole("link", { name: "Mériem Démo-Idrissi", exact: true }).waitFor();
  assert.equal((await value.request.get(api("patients/patient-demo-001"))).status(), 404);
 } finally { await value.close(); }
});

test("real login, logout/login persistence and expired patient session require login", async () => {
 const { value, page } = await harness.context({ anonymous: true });
 try {
  const credentials = (await authenticationFixture()).dentist;
  const login = async () => { assert.equal((await mutate(value, "auth/login", "POST", credentials)).status(), 200); };
  await login(); const id = await createInUI(page);
  assert.equal((await mutate(value, "auth/logout", "POST")).status(), 204);
  await login(); await page.goto(`${harness.baseURL}/patients/${id}`); await page.getByRole("heading", { name: "Fictive Validation-83B", exact: true }).waitFor();
  assert.equal((await mutate(value, "auth/logout", "POST")).status(), 204);
  await page.goto(`${harness.baseURL}/patients/${id}/modifier`); await page.waitForURL("**/login");
 } finally { await value.close(); }
});

test("persistent patient search and server pagination stay separate from prototype fixtures", async () => {
 const { value, page } = await harness.context();
 try {
  const identity = { firstName: "Pagination83B", lastName: "ValidationSynthétique", sex: "unanswered", dateOfBirth: null,
    address: "", gsm: "", landline: "", profession: "", cin: "", medicalCoverage: "" };
  for (let index = 0; index < 21; index++) {
   assert.equal((await mutate(value, "patients", "POST", { identity: { ...identity, firstName: `Pagination83B ${String(index).padStart(2,"0")}` }, status: "active" })).status(), 201);
  }
  await page.goto(`${harness.baseURL}/patients`);
  const search = page.getByRole("searchbox", { name: "Rechercher un patient" });
  await search.fill("Pagination83B");
  await page.getByRole("status").filter({ hasText: "21 patient(s) · Page 1 sur 2" }).waitFor();
  assert.equal(await page.getByRole("row").count(), 21);
  await page.getByRole("button", { name: "Suivant", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Page 2 sur 2" }).waitFor();
  assert.equal(await page.getByRole("row").count(), 2);
  const patient = await (await value.request.get(api("patients?q=Pagination83B&pageSize=1"))).json();
  await search.fill(patient.items[0].reference);
  await page.getByRole("status").filter({ hasText: "1 patient(s) · Page 1 sur 1" }).waitFor();
  assert.equal(await page.getByRole("row").count(), 2);
  assert(!page.url().includes("Pagination83B"));
  await search.fill("no-persistent-result-83B");
  await page.getByText("Aucun patient ne correspond à cette recherche.", { exact: true }).waitFor();
 } finally { await value.close(); }
});
