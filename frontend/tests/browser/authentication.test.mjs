import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { browserHarness, authenticationFixture } from "./browser-harness.mjs";

const harness = browserHarness({ port: 3112 });
before(harness.start); after(harness.stop);
async function snapshot(page, name) {
  if (!process.env.AUTH_TEST_SCREENSHOT_DIR) return;
  await mkdir(process.env.AUTH_TEST_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.AUTH_TEST_SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}
async function login(page, role = "dentist") {
  const credentials = (await authenticationFixture())[role];
  await page.goto(`${harness.baseURL}/login`);
  await page.getByLabel("Identifiant (obligatoire)", { exact: true }).fill(credentials.identifier);
  await page.getByLabel("Mot de passe (obligatoire)", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.getByRole("button", { name: "Se déconnecter", exact: true }).waitFor();
}

test("real dentist session: protected redirect, login, rotation, refresh, logout and back", async () => {
  const { value, page, errors, external } = await harness.context({ anonymous: true });
  try {
    await page.goto(`${harness.baseURL}/patients`);
    await page.waitForURL("**/login");
    await page.getByRole("heading", { name: "Connexion", exact: true }).waitFor();
    await snapshot(page, "login-desktop");
    const beforeLoginCsrf = await (await value.request.get(`${harness.baseURL}/api/v1/auth/csrf`)).json();
    const anonymousSession = (await value.cookies()).find(cookie => cookie.name === "JSESSIONID")?.value;
    await login(page);
    await page.getByRole("heading", { name: "Tableau de bord", exact: true }).waitFor();
    await snapshot(page, "dentist-dashboard");
    const cookies = await value.cookies();
    assert(anonymousSession && cookies.find(cookie => cookie.name === "JSESSIONID")?.value !== anonymousSession,
      "Session identifier must rotate through the proxy");
    assert.equal((await value.request.post(`${harness.baseURL}/api/v1/auth/logout`, {
      headers: { [beforeLoginCsrf.headerName]: beforeLoginCsrf.token },
    })).status(), 403);
    assert(cookies.every(cookie => cookie.httpOnly && cookie.sameSite === "Strict" && cookie.path === "/"));
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    await page.reload();
    await page.getByRole("button", { name: "Se déconnecter" }).waitFor();
    await page.goto(`${harness.baseURL}/login`);
    await page.waitForURL(`${harness.baseURL}/`);
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await page.waitForURL("**/login");
    assert.equal((await value.request.get(`${harness.baseURL}/api/v1/auth/me`)).status(), 401);
    await page.goBack();
    await page.waitForURL("**/login");
    assert.equal(await page.getByRole("button", { name: "Se déconnecter" }).count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally { await value.close(); }
});

test("real receptionist session: agenda only, clinical links hidden and direct routes guarded", async () => {
  const { value, page, errors } = await harness.context({ anonymous: true });
  try {
    await login(page, "receptionist");
    await page.waitForURL("**/rendez-vous");
    const navigation = page.getByRole("navigation", { name: "Navigation principale" });
    assert.equal(await navigation.getByRole("link", { name: "Consultations", exact: true }).count(), 0);
    assert.equal(await navigation.getByRole("link", { name: "Documents", exact: true }).count(), 0);
    assert.equal(await navigation.getByRole("link", { name: "Rendez-vous", exact: true }).count(), 1);
    await snapshot(page, "receptionist-agenda");
    await page.reload();
    await page.getByRole("heading", { name: "Rendez-vous", exact: true }).waitFor();
    await page.goto(`${harness.baseURL}/consultations`);
    await page.getByRole("heading", { name: "Accès réservé au dentiste", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Consultations", exact: true }).count(), 0);
    await page.goto(`${harness.baseURL}/patients/patient-demo-001/dossier`);
    await page.getByRole("heading", { name: "Accès réservé au dentiste", exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await value.close(); }
});

test("CSRF rejection requires an explicit new submission, then real login recovers", async () => {
  const { value, page } = await harness.context({ anonymous: true });
  try {
    const credentials = (await authenticationFixture()).dentist;
    await page.goto(`${harness.baseURL}/login`);
    await page.route("**/api/v1/auth/login", async route => {
      await route.continue({ headers: { ...route.request().headers(), "x-csrf-token": "intentionally-invalid-test-token" } });
    });
    await page.getByLabel("Identifiant (obligatoire)", { exact: true }).fill(credentials.identifier);
    await page.getByLabel("Mot de passe (obligatoire)", { exact: true }).fill(credentials.password);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "vérification de sécurité a expiré" }).waitFor();
    assert.equal(await page.getByLabel("Mot de passe (obligatoire)", { exact: true }).inputValue(), "");
    assert.equal((await value.request.get(`${harness.baseURL}/api/v1/auth/me`)).status(), 401);
    await page.unroute("**/api/v1/auth/login");
    await page.getByLabel("Mot de passe (obligatoire)", { exact: true }).fill(credentials.password);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await page.getByRole("heading", { name: "Tableau de bord", exact: true }).waitFor();
  } finally { await value.close(); }
});

test("server-invalidated session redirects on revalidation without a fake session", async () => {
  const { value, page } = await harness.context({ anonymous: true });
  try {
    await login(page);
    const csrf = await (await value.request.get(`${harness.baseURL}/api/v1/auth/csrf`)).json();
    assert.equal((await value.request.post(`${harness.baseURL}/api/v1/auth/logout`, { headers: { [csrf.headerName]: csrf.token } })).status(), 204);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForURL("**/login");
    await page.reload();
    assert.equal(new URL(page.url()).pathname, "/login");
  } finally { await value.close(); }
});

test("network failures cannot activate login and logout is not falsely confirmed", async () => {
  const { value, page } = await harness.context({ anonymous: true });
  try {
    await page.goto(`${harness.baseURL}/login`);
    await page.route("**/api/v1/auth/csrf", route => route.abort("failed"));
    await page.getByLabel("Identifiant (obligatoire)", { exact: true }).fill("nonexistent.synthetic");
    await page.getByLabel("Mot de passe (obligatoire)", { exact: true }).fill("synthetic-only");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "service de connexion est indisponible" }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/login");
    assert.equal(await page.getByRole("button", { name: "Se déconnecter" }).count(), 0);
    await page.unroute("**/api/v1/auth/csrf");
    await login(page, "receptionist");
    await page.route("**/api/v1/auth/logout", route => route.abort("failed"));
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await page.getByRole("alert").filter({ hasText: "Déconnexion non confirmée" }).waitFor();
    assert.equal((await value.request.get(`${harness.baseURL}/api/v1/auth/me`)).status(), 200);
    await page.getByRole("button", { name: "Réessayer", exact: true }).click();
    await page.getByRole("button", { name: "Se déconnecter" }).waitFor();
  } finally { await value.close(); }
});
