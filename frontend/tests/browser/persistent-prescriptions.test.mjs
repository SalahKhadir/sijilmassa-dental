import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { browserHarness, authenticationFixture } from "./browser-harness.mjs";
const harness = browserHarness({ port: 3116 });
const enabled = process.env.PRESCRIPTION_E2E_MODE === "ready";
const journey = (name, run) => test(name, { skip: !enabled }, run);
before(async () => { if (enabled) { assert.equal((await authenticationFixture()).prescriptionMode, "ready"); await harness.start(); } }); after(harness.stop);
const url = path => `${harness.baseURL}${path}`;
const canary = "Instructions synthétiques privées 853B";
async function mutate(context, path, method, data) {
  const csrf = await (await context.request.get(url("/api/v1/auth/csrf"))).json();
  return context.request.fetch(url(path), { method, headers: { [csrf.headerName]: csrf.token }, data });
}
async function login(page) {
  const fixture = (await authenticationFixture()).dentist;
  await page.goto(url("/login"));
  await page.getByLabel("Identifiant (obligatoire)", { exact: true }).fill(fixture.identifier);
  await page.getByLabel("Mot de passe (obligatoire)", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(value => value.pathname !== "/login");
}
async function patient(context, name) {
  const identity = { firstName: "Ordonnance fictive", lastName: name, sex: "unanswered", dateOfBirth: null,
    address: "", gsm: "", landline: "", profession: "", cin: "", medicalCoverage: "" };
  const response = await mutate(context, "/api/v1/patients", "POST", { identity, status: "active" });
  assert.equal(response.status(), 201); return response.json();
}
const medication = { medicationName: "Produit fictif 853B", dosage: "Posologie synthétique", frequency: "Fréquence synthétique", duration: "Durée synthétique", instructions: "" };
const draft = { consultationId: null, issuedDate: "2026-11-11", medications: [medication], generalInstructions: canary };
const endpoint = (r, suffix = "") => `/api/v1/prescriptions/${r.id}${suffix}?patientId=${r.patientId}`;
const detail = r => `/documents/ordonnances/${r.id}?patientId=${r.patientId}`;
async function create(context, owner, content = draft) {
  const response = await mutate(context, "/api/v1/prescriptions", "POST", { patientId: owner.id, content });
  assert.equal(response.status(), 201); return response.json();
}
async function finish(page, expected = 200) {
  await page.getByRole("button", { name: "Finaliser l’ordonnance", exact: true }).click();
  await page.getByRole("dialog").getByText(/irréversible/).waitFor();
  const response = page.waitForResponse(r => r.request().method() === "PUT" && new URL(r.url()).pathname.endsWith("/finalization"));
  const writes = [];
  const track = request => { if (request.method() === "PUT" && new URL(request.url()).pathname.endsWith("/finalization")) writes.push(request.url()); };
  page.on("request", track);
  await page.getByRole("dialog").getByRole("button", { name: "Finaliser l’ordonnance", exact: true }).evaluate(button => { button.click(); button.click(); });
  const result = await response; page.off("request", track); assert.equal(writes.length, 1); assert.equal(result.status(), expected); return result.json();
}
async function addLine(page, name) {
  await page.getByRole("button", { name: "Ajouter un médicament", exact: true }).click();
  const group = page.getByRole("group", { name: /^Médicament \d+$/ }).last();
  await group.getByLabel("Nom du médicament", { exact: true }).fill(name);
  await group.getByLabel("Posologie", { exact: true }).fill("Saisie synthétique");
  await group.getByLabel("Fréquence", { exact: true }).fill("Saisie synthétique");
  await group.getByLabel("Durée", { exact: true }).fill("Saisie synthétique");
}
async function screenshot(page, name) { await mkdir("/tmp/sijilmassa-853b-screenshots", { recursive: true }); await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); }); await page.screenshot({ path: `/tmp/sijilmassa-853b-screenshots/${name}.png`, fullPage: true }); }

journey("real login, patient UI, ordered draft, reload/edit, explicit finalization, immutable stored A5 download and print", async () => {
  const { value, page, errors, external } = await harness.context({ anonymous: true }); page.on("dialog", dialog => dialog.accept());
  try {
    await login(page);
    await page.goto(url("/patients/nouveau"));
    await page.getByLabel("Nom (obligatoire)", { exact: true }).fill("Prescription-853B");
    await page.getByLabel("Prénom (obligatoire)", { exact: true }).fill("Fictive");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continuer", exact: true }).click();
    await page.getByRole("button", { name: "Créer le patient", exact: true }).click(); await page.waitForURL(/\/patients\/[0-9a-f-]{36}$/);
    const patientId = new URL(page.url()).pathname.split("/").at(-1);
    await page.getByRole("link", { name: "Ordonnances du patient", exact: true }).click();
    await page.getByRole("link", { name: "Nouvelle ordonnance", exact: true }).click();
    await addLine(page, "Produit fictif A"); await addLine(page, "Produit fictif B");
    await page.getByRole("button", { name: "Monter le médicament 2", exact: true }).click();
    await page.getByLabel("Instructions générales (facultatif)").fill(canary);
    await page.getByRole("button", { name: "Créer le brouillon", exact: true }).click(); await page.waitForURL(/\/documents\/ordonnances\/[0-9a-f-]{36}\?/);
    const id = new URL(page.url()).pathname.split("/").at(-1), r = { id, patientId };
    await page.getByText("Ordonnance créée en brouillon.", { exact: true }).waitFor(); await page.reload();
    await page.getByText(canary, { exact: true }).waitFor();
    let stored = await (await value.request.get(url(endpoint(r)))).json(); assert.equal(stored.status, "BROUILLON");
    assert.deepEqual(stored.content.medications.map(l => l.medicationName), ["Produit fictif B", "Produit fictif A"]);
    assert.equal(await page.getByRole("button", { name: "Télécharger le PDF finalisé", exact: true }).count(), 0);
    await page.getByRole("link", { name: "Modifier le brouillon", exact: true }).click();
    await page.getByLabel("Instructions générales (facultatif)").fill("Instructions corrigées synthétiques 853B");
    await page.getByRole("button", { name: "Retirer le médicament 2", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Retirer la ligne", exact: true }).click();
    await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click(); await page.waitForURL(/\/documents\/ordonnances\/[0-9a-f-]{36}\?patientId=/);
    await page.getByText("Brouillon enregistré.", { exact: true }).waitFor();
    stored = await (await value.request.get(url(endpoint(r)))).json(); assert.equal(stored.status, "BROUILLON"); assert.equal(stored.content.medications.length, 1);
    await page.getByRole("button", { name: "Finaliser l’ordonnance", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Annuler", exact: true }).click();
    assert.equal((await (await value.request.get(url(endpoint(r)))).json()).status, "BROUILLON");
    const finalized = await finish(page);
    await page.getByText("Ordonnance finalisée · Contenu et PDF en lecture seule.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Modifier le brouillon", exact: true }).count(), 0);
    const downloadEvent = page.waitForEvent("download"); void downloadEvent.catch(() => {});
    const pdfResponse = page.waitForResponse(r => new URL(r.url()).pathname.endsWith("/pdf") && r.request().method() === "GET");
    await page.getByRole("button", { name: "Télécharger le PDF finalisé", exact: true }).click();
    const received = await pdfResponse;
    assert.equal(received.status(), 200, `PDF response status ${received.status()}`);
    assert.equal(received.headers()["content-type"], "application/pdf");
    assert.equal(received.headers()["x-prescription-pdf-bytes"], String(finalized.document.pdfBytes));
    const download = await downloadEvent; assert.equal(download.suggestedFilename(), `ordonnance-${id}.pdf`);
    const bytes = await readFile(await download.path());
    assert.equal(createHash("sha256").update(bytes).digest("hex"), finalized.document.pdfSha256);
    assert.equal(bytes.length, finalized.document.pdfBytes);
    const pdf = await PDFDocument.load(bytes); assert.equal(pdf.getPageCount(), 1); assert.equal(pdf.getPage(0).getWidth(), 419.25); assert(Math.abs(pdf.getPage(0).getHeight() - 595.499986) < .01);
    const direct = await value.request.get(url(`${endpoint(r, "/pdf")}&version=${finalized.version}&disposition=attachment`));
    assert.deepEqual(await direct.body(), bytes); assert.match(direct.headers()["cache-control"], /no-store/);
    const owner = await (await value.request.get(url(`/api/v1/patients/${patientId}`))).json();
    assert.equal((await mutate(value, `/api/v1/patients/${patientId}`, "PUT", { version: owner.version, identity: { ...owner.identity, firstName: "Identité actuelle synthétique" }, status: "active" })).status(), 200);
    await page.reload(); await page.getByRole("heading", { name: /Ordonnance du/ }).waitFor();
    await page.getByText("Identité actuelle synthétique Prescription-853B", { exact: true }).waitFor();
    await page.getByText("Fictive Prescription-853B · " + finalized.document.patientIdentity.reference, { exact: true }).waitFor();
    await page.getByRole("button", { name: "Préparer l’impression", exact: true }).click();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Imprimer le PDF finalisé")?.disabled);
    const blobUrl = await page.locator('iframe[title="PDF finalisé enregistré"]').getAttribute("src");
    assert.deepEqual(Buffer.from(await page.evaluate(async source => Array.from(new Uint8Array(await (await fetch(source)).arrayBuffer())), blobUrl)), bytes);
    await page.evaluate(() => { window.__rxPrint = 0; document.querySelector('iframe[title="PDF finalisé enregistré"]').contentWindow.print = () => { window.__rxPrint++; }; });
    await page.getByRole("button", { name: "Imprimer le PDF finalisé", exact: true }).click(); assert.equal(await page.evaluate(() => window.__rxPrint), 1);
    await page.getByRole("button", { name: "Fermer l’aperçu", exact: true }).click();
    assert.equal(await page.evaluate(async source => { try { await fetch(source); return false; } catch { return true; } }, blobUrl), true);
    await page.reload(); await page.getByText("Ordonnance finalisée · Contenu et PDF en lecture seule.", { exact: true }).waitFor();
    assert.equal((await mutate(value, endpoint(r), "PUT", { version: finalized.version, content: finalized.content })).status(), 409);
    await page.goto(url(`/documents/ordonnances/${id}/modifier?patientId=${patientId}`));
    await page.getByText("Cette ordonnance est en lecture seule.", { exact: true }).waitFor(); assert(await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).isDisabled());
    await page.goto(url(detail(r))); await page.getByRole("heading", { name: /Ordonnance du/ }).waitFor(); await screenshot(page, "finalized-desktop");
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0); assert.equal(await page.evaluate(async () => (await indexedDB.databases()).length), 0);
    assert.deepEqual(errors, []); assert.deepEqual(external.filter(u => !u.startsWith("blob:")), []);
  } finally { await value.close(); }
});

journey("real patient picker and scoped history, confirmed archive and archived immutability", async () => {
  const { value, page } = await harness.context();
  try {
    const owner = await patient(value, "Archive853B"), other = await patient(value, "Autre853B");
    await page.goto(url("/documents/ordonnances/nouvelle"));
    await page.getByLabel("Rechercher un patient", { exact: true }).fill("Archive853B");
    await page.getByRole("button", { name: /Ordonnance fictive Archive853B/ }).click();
    await page.getByRole("button", { name: "Créer le brouillon", exact: true }).click(); await page.waitForURL(/\/documents\/ordonnances\/[0-9a-f-]{36}\?/);
    const r = { id: new URL(page.url()).pathname.split("/").at(-1), patientId: owner.id };
    await page.getByRole("button", { name: "Archiver le brouillon", exact: true }).click();
    const response = page.waitForResponse(r => r.request().method() === "PUT" && new URL(r.url()).pathname.endsWith("/archival"));
    await page.getByRole("dialog").getByRole("button", { name: "Archiver le brouillon", exact: true }).click(); assert.equal((await response).status(), 200);
    await page.getByText(/Lecture seule définitive/).waitFor(); await page.reload(); await page.getByText(/Lecture seule définitive/).waitFor();
    assert.equal(await page.getByRole("button", { name: "Finaliser l’ordonnance", exact: true }).count(), 0);
    const archived = await (await value.request.get(url(endpoint(r)))).json(); assert.equal(archived.status, "BROUILLON"); assert(archived.archivedAt);
    assert.equal((await mutate(value, endpoint(r), "PUT", { version: archived.version, content: draft })).status(), 409);
    await page.goto(url(`/documents?patientId=${owner.id}`)); await page.getByText("Aucune ordonnance sur cette page.", { exact: true }).waitFor();
    await page.getByLabel("Classement", { exact: true }).selectOption("all"); await page.getByRole("link", { name: /Ouvrir l’ordonnance/ }).waitFor();
    const otherHistory = await (await value.request.get(url(`/api/v1/prescriptions?patientId=${other.id}&archive=all`))).json(); assert.equal(otherHistory.items.length, 0);
    assert.equal((await value.request.get(url(`/api/v1/prescriptions/${r.id}?patientId=${other.id}`))).status(), 404);
    await page.goto(url(`/documents/ordonnances/${r.id}/modifier?patientId=${owner.id}`)); await page.getByText("Cette ordonnance est en lecture seule.").waitFor(); assert(await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).isDisabled());
  } finally { await value.close(); }
});

journey("real consultation ownership, preselection and mobile form/navigation", async () => {
  const { value, page, errors } = await harness.context({ viewport: { width: 390, height: 844 } });
  try {
    const owner = await patient(value, "Mobile853B");
    const response = await mutate(value, "/api/v1/consultations", "POST", { patientId: owner.id, content: { appointmentId: null, consultationDate: "2026-11-11", chiefComplaint: "Motif synthétique 853B", clinicalObservations: "", assessment: "", treatmentPlan: "", notes: "" } });
    assert.equal(response.status(), 201); const c = await response.json();
    await page.goto(url(`/consultations/${c.id}?patientId=${owner.id}`)); await page.getByRole("link", { name: "Créer une ordonnance", exact: true }).click();
    await page.waitForFunction(id => document.querySelector("#prescription-consultation")?.value === id, c.id);
    await addLine(page, "Produit fictif mobile"); await screenshot(page, "mobile-form");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole("button", { name: "Créer le brouillon", exact: true }).click(); await page.waitForURL(/\/documents\/ordonnances\/[0-9a-f-]{36}\?/);
    const r = { id: new URL(page.url()).pathname.split("/").at(-1), patientId: owner.id };
    assert.equal((await (await value.request.get(url(endpoint(r)))).json()).content.consultationId, c.id);
    await page.getByRole("link", { name: "Voir la consultation liée", exact: true }).click(); await page.getByRole("link", { name: "Ordonnances de cette consultation", exact: true }).click();
    await page.getByRole("link", { name: /Ouvrir l’ordonnance/ }).waitFor();
    const other = await patient(value, "AutreMobile853B"); await page.goto(url(`/documents/ordonnances/nouvelle?patientId=${other.id}&consultationId=${c.id}`));
    await page.locator("main p[role=alert]").first().waitFor(); assert.equal(await page.getByRole("button", { name: "Créer le brouillon", exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await value.close(); }
});

journey("real stale draft preserves unsaved edits until confirmed reload and requires fresh finalization confirmation", async () => {
  const { value, page } = await harness.context(); page.on("dialog", d => d.accept());
  try {
    const owner = await patient(value, "Conflit853B"), r = await create(value, owner);
    await page.goto(url(`/documents/ordonnances/${r.id}/modifier?patientId=${owner.id}`));
    await page.getByLabel("Instructions générales (facultatif)").fill("Saisie non enregistrée 853B");
    assert.equal((await mutate(value, endpoint(r), "PUT", { version: r.version, content: { ...draft, generalInstructions: "Modification concurrente 853B" } })).status(), 200);
    const conflict = page.waitForResponse(res => res.request().method() === "PUT" && new URL(res.url()).pathname === `/api/v1/prescriptions/${r.id}`);
    await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click(); assert.equal((await conflict).status(), 409);
    assert.equal(await page.getByLabel("Instructions générales (facultatif)").inputValue(), "Saisie non enregistrée 853B"); assert(await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).isDisabled());
    await page.getByRole("button", { name: "Recharger le brouillon", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Recharger et remplacer mes saisies", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await page.getByLabel("Instructions générales (facultatif)").inputValue(), "Modification concurrente 853B");
    await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click(); await page.waitForURL(/\/documents\/ordonnances\/[0-9a-f-]{36}\?patientId=/);
    await page.getByRole("button", { name: "Finaliser l’ordonnance", exact: true }).waitFor();
    const latest = await (await value.request.get(url(endpoint(r)))).json();
    assert.equal((await mutate(value, `/api/v1/patients/${owner.id}`, "PUT", { version: owner.version, identity: { ...owner.identity, firstName: "Identité synthétique modifiée" }, status: "active" })).status(), 200);
    await finish(page, 409); await page.getByRole("dialog").getByRole("button", { name: "Annuler", exact: true }).click();
    await page.getByRole("button", { name: "Actualiser l’ordonnance", exact: true }).click(); await page.getByText("Identité synthétique modifiée Conflit853B", { exact: true }).waitFor();
    assert.equal((await (await value.request.get(url(endpoint(r)))).json()).version, latest.version);
    await finish(page); await page.getByText("Ordonnance finalisée · Contenu et PDF en lecture seule.", { exact: true }).waitFor();
  } finally { await value.close(); }
});

for (const [name, changes, code, message] of [
  ["incomplete content", { medications: [] }, "INCOMPLETE_PRESCRIPTION", /Renseignez au moins un médicament/],
  ["unsupported Arabic", { generalInstructions: "تعليمات تجريبية" }, "PDF_UNSUPPORTED_CHARACTER", /Certains caractères/],
  ["A5 overflow", { generalInstructions: Array(70).fill("Instructions fictives").join("\n") }, "PDF_LAYOUT_OVERFLOW", /dépasse une page A5/],
]) journey(`real finalization refuses ${name} without changing the draft`, async () => {
  const { value, page } = await harness.context();
  try {
    const owner = await patient(value, `Refus-${code}`), r = await create(value, owner, { ...draft, ...changes });
    await page.goto(url(detail(r))); assert.equal((await finish(page, 400)).code, code);
    await page.getByRole("dialog").getByRole("alert").filter({ hasText: message }).waitFor();
    const after = await (await value.request.get(url(endpoint(r)))).json(); assert.equal(after.version, r.version); assert.equal(after.status, "BROUILLON"); assert.equal(after.document, null);
  } finally { await value.close(); }
});

journey("reception cannot mount prescription UI or fetch details/history/PDF", async () => {
  const dentist = await harness.context(), reception = await harness.context({ role: "receptionist" });
  try {
    const owner = await patient(dentist.value, "Roles853B"), r = await create(dentist.value, owner);
    const seen = []; reception.page.on("request", req => { if (req.url().includes("/api/v1/prescriptions")) seen.push(req.url()); });
    for (const path of ["/documents", detail(r), `/documents/ordonnances/nouvelle?patientId=${owner.id}`, "/demo/documents"]) {
      await reception.page.goto(url(path)); await reception.page.getByRole("heading", { name: "Accès réservé au dentiste", exact: true }).waitFor();
    }
    assert.deepEqual(seen, []);
    for (const path of [endpoint(r), `/api/v1/prescriptions?patientId=${owner.id}`, `${endpoint(r, "/pdf")}&version=0`]) assert.equal((await reception.value.request.get(url(path))).status(), 403);
    assert.equal((await mutate(reception.value, endpoint(r, "/finalization"), "PUT", { version: r.version, patientVersion: owner.version })).status(), 403);
  } finally { await dentist.value.close(); await reception.value.close(); }
});

journey("real CSRF rejection preserves form input; session expiry removes clinical content", async () => {
  const { value, page } = await harness.context({ anonymous: true });
  try {
    await login(page); const owner = await patient(value, "Securite853B"); await page.goto(url(`/documents/ordonnances/nouvelle?patientId=${owner.id}`));
    await page.getByLabel("Instructions générales (facultatif)").fill(canary);
    await value.route("**/api/v1/prescriptions", route => { const headers = { ...route.request().headers() }; delete headers["x-csrf-token"]; return route.continue({ headers }); });
    const response = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/prescriptions");
    await page.getByRole("button", { name: "Créer le brouillon", exact: true }).click(); assert.equal((await response).status(), 403);
    assert.equal(await page.getByLabel("Instructions générales (facultatif)").inputValue(), canary); assert(await page.getByRole("button", { name: "Créer le brouillon", exact: true }).isDisabled());
    await value.unroute("**/api/v1/prescriptions"); assert.equal((await mutate(value, "/api/v1/auth/logout", "POST")).status(), 204);
    await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await page.waitForURL(/\/login$/);
    assert.equal(await page.locator("textarea").count(), 0); assert(!(await page.content()).includes(canary)); assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  } finally { await value.close(); }
});

journey("registered records never enter demo routes; backend errors never fall back to prototype data", async () => {
  const { value, page } = await harness.context();
  try {
    const owner = await patient(value, "Isolation853B"), r = await create(value, owner);
    const seen = []; page.on("request", req => { if (req.url().includes("/api/v1/prescriptions")) seen.push(req.url()); });
    await page.goto(url("/demo/documents")); await page.getByRole("status").filter({ hasText: "8 ordonnances affichées" }).waitFor(); assert.equal(seen.length, 0);
    await page.goto(url(`/demo/documents/ordonnances/${r.id}`)); await page.getByRole("heading", { name: "Cette ordonnance est introuvable.", exact: true }).waitFor();
    assert.equal(seen.length, 0);
    await page.goto(url(`/documents/ordonnances/prescription-demo-001?patientId=${owner.id}`)); await page.locator("main p[role=alert]").first().waitFor();
    assert.equal(await page.getByRole("button", { name: "Finaliser l’ordonnance", exact: true }).count(), 0);
    await page.goto(url(detail(r))); await page.getByText(canary, { exact: true }).waitFor();
    await value.route("**/api/v1/prescriptions/**", route => route.abort("connectionrefused"));
    await page.getByRole("button", { name: "Actualiser l’ordonnance", exact: true }).click(); await page.locator("main p[role=alert]").first().waitFor();
    assert.equal(await page.getByText(canary, { exact: true }).count(), 0); await value.unroute("**/api/v1/prescriptions/**");
    await page.getByRole("button", { name: "Recharger les données", exact: true }).click(); await page.getByText(canary, { exact: true }).waitFor();
  } finally { await value.close(); }
});
