// Disposable real Spring/PostgreSQL environment. No clinic .env file is sourced.
import assert from "node:assert/strict";
import { chromium, request } from "playwright";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, readdir, rm, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import net from "node:net";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const backend = path.resolve(frontend, "../backend");
const directory = await mkdtemp(path.join(tmpdir(), "sijilmassa-browser-"));
const fixtureDirectory = path.join(directory, "fixture");
await mkdir(fixtureDirectory, { mode: 0o700 });
const children = [];
function start(command, args, options = {}) {
  const child = spawn(command, args, { cwd: frontend, stdio: ["pipe", "inherit", "inherit"], ...options });
  children.push(child); return child;
}
async function run(command, args, options = {}) {
  const child = start(command, args, options);
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`${path.basename(command)} failed (${code})`);
}
async function waitFor(check, child) {
  for (let attempt = 0; attempt < 600; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Integration service exited before readiness");
    try { const value = await check(); if (value) return value; } catch { /* Readiness only. */ }
    await pause(200);
  }
  throw new Error("Integration service readiness timed out");
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.stdin?.end();
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), pause(10000)]);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await once(child, "exit"); }
}
let backendProcess, nextProcess, backendLog, nextLog;
try {
  const classpathFile = path.join(directory, "classpath");
  await run(path.join(backend, "mvnw"), ["-B", "-ntp", "test-compile", "dependency:build-classpath", `-Dmdep.outputFile=${classpathFile}`], { cwd: backend });
  const classpath = [path.join(backend, "target/test-classes"), path.join(backend, "target/classes"), (await readFile(classpathFile, "utf8")).trim()].join(path.delimiter);
  backendLog = await open(path.join(directory, "backend.log"), "wx", 0o600);
  const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin/java") : "java";
  backendProcess = start(java, ["-cp", classpath, "ma.sijilmassa.BrowserIntegrationEnvironment", fixtureDirectory], {
    cwd: backend, stdio: ["pipe", backendLog.fd, backendLog.fd],
  });
  const runtime = await waitFor(async () => JSON.parse(await readFile(path.join(fixtureDirectory, "runtime.json"), "utf8")), backendProcess);
  const server = net.createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = server.address().port; await new Promise(resolve => server.close(resolve));
  const baseURL = `http://127.0.0.1:${port}`;
  nextLog = await open(path.join(directory, "next.log"), "wx", 0o600);
  nextProcess = start(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, BACKEND_INTERNAL_URL: runtime.backendOrigin }, stdio: ["ignore", nextLog.fd, nextLog.fd],
  });
  await waitFor(async () => (await fetch(`${baseURL}/api/v1/auth/csrf`, { signal: AbortSignal.timeout(2000) })).status === 200, nextProcess);
  const health = await fetch(`${runtime.backendOrigin}/actuator/health`);
  assert.equal(health.status, 200); assert.deepEqual(await health.json(), { status: "UP" });
  assert.equal((await fetch(`${baseURL}/api/v1/patients`)).status, 401);
  assert.deepEqual(runtime.migrations, ["1", "2", "3", "4", "5", "6", "7", "8"]); assert.equal(runtime.jpaValidated, true);
  console.log("Real synthetic PostgreSQL, Spring Boot and Next.js proxy ready; V1–V8, JPA, health and anonymous denial verified.");
  // Authenticate the outage probe before the journeys; do not add a login to their final burst.
  const fixture = JSON.parse(await readFile(path.join(fixtureDirectory, "users.json"), "utf8"));
  const probe = await request.newContext({ baseURL });
  let probeState;
  try {
    const csrf = await (await probe.get("/api/v1/auth/csrf")).json();
    assert.equal((await probe.post("/api/v1/auth/login", { headers: { [csrf.headerName]: csrf.token }, data: fixture.dentist })).status(), 200);
    probeState = await probe.storageState();
  } finally { await probe.dispose(); }
  const browserTests = (await readdir(path.join(frontend, "tests/browser"))).filter(name => name.endsWith(".test.mjs")
    && (!process.env.BROWSER_TEST_FILE || name === process.env.BROWSER_TEST_FILE)).sort();
  assert(browserTests.length > 0, "No matching browser test file");
  await run(process.execPath, ["--import", "tsx", "--test", "--experimental-test-isolation=none", ...browserTests.map(name => `tests/browser/${name}`)], { env: { ...process.env,
    AUTH_TEST_FIXTURE: path.join(fixtureDirectory, "users.json"), PATIENTS_TEST_BASE_URL: baseURL,
    BACKEND_INTERNAL_URL: runtime.backendOrigin,
  } });
  // A real outage, after all normal journeys: stop only the backend owned by this process.
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const context = await browser.newContext({ storageState: probeState });
    const patients = await context.request.get(`${baseURL}/api/v1/patients`);
    assert.equal(patients.status(), 200); assert.match(patients.headers()["cache-control"], /private.*no-store|no-store.*private/);
    const page = await context.newPage();
    await page.goto(`${baseURL}/patients`); await page.getByRole("heading", { name: "Patients", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.equal(await page.evaluate(async () => (await indexedDB.databases()).length), 0);
    const identity = { firstName: "Panne clinique fictive", lastName: "852", sex: "unanswered", dateOfBirth: null, address: "", gsm: "", landline: "", profession: "", cin: "", medicalCoverage: "" };
    const currentCsrf = await (await context.request.get(`${baseURL}/api/v1/auth/csrf`)).json();
    const headers = { [currentCsrf.headerName]: currentCsrf.token };
    const createdPatient = await context.request.post(`${baseURL}/api/v1/patients`, { headers, data: { identity, status: "active" } });
    assert.equal(createdPatient.status(), 201); const clinicalPatient = await createdPatient.json();
    const createdConsultation = await context.request.post(`${baseURL}/api/v1/consultations`, { headers, data: { patientId: clinicalPatient.id, content: {
      appointmentId: null, consultationDate: "2026-11-10", chiefComplaint: "SYNTHETIC-CLINICAL-OUTAGE-CANARY", clinicalObservations: "", assessment: "", treatmentPlan: "", notes: "",
    } } });
    assert.equal(createdConsultation.status(), 201); const clinicalRecord = await createdConsultation.json();
    await page.goto(`${baseURL}/consultations/${clinicalRecord.id}?patientId=${clinicalPatient.id}`);
    await page.getByText("SYNTHETIC-CLINICAL-OUTAGE-CANARY", { exact: true }).waitFor();
    backendProcess.stdin.end(); await once(backendProcess, "exit");
    const failure = await context.request.get(`${baseURL}/api/v1/patients`);
    assert.equal(failure.status(), 503); assert.match(failure.headers()["cache-control"], /no-store/);
    assert(!(await failure.text()).includes(runtime.backendOrigin));
    const appointmentFailure = await context.request.get(`${baseURL}/api/v1/appointments?from=2026-11-10T00:00:00Z&to=2026-11-11T00:00:00Z`);
    assert.equal(appointmentFailure.status(), 503); assert.match(appointmentFailure.headers()["cache-control"], /no-store/);
    assert(!(await appointmentFailure.text()).includes(runtime.backendOrigin));
    const clinicalFailure = await context.request.get(`${baseURL}/api/v1/consultations/${clinicalRecord.id}?patientId=${clinicalPatient.id}`);
    assert.equal(clinicalFailure.status(), 503); assert.match(clinicalFailure.headers()["cache-control"], /no-store/);
    assert(!(await clinicalFailure.text()).includes(runtime.backendOrigin));
    await page.getByRole("button", { name: "Actualiser le dossier clinique", exact: true }).click();
    await page.getByText(/Le service clinique est indisponible|Session non vérifiée/).first().waitFor();
    assert.equal(await page.getByText("SYNTHETIC-CLINICAL-OUTAGE-CANARY", { exact: true }).count(), 0);
    await page.goto(`${baseURL}/rendez-vous`); await page.getByRole("heading", { name: "Session non vérifiée", exact: true }).waitFor();
    assert(!page.url().endsWith("/login"));
    const serviceLogs = (await readFile(path.join(directory, "backend.log"), "utf8")) + (await readFile(path.join(directory, "next.log"), "utf8"));
    for (const secret of [fixture.dentist.password, fixture.receptionist.password, "Profession fictive 83B", "Autre utilisateur fictif", "Diabète", "SYNTHETIC-CLINICAL-OUTAGE-CANARY"]) {
      assert(!serviceLogs.includes(secret), "Patient payload or credential found in service logs");
    }
    console.log("Real backend shutdown verified: safe uncached patient/appointment 503, explicit unavailable UI without logout/fallback, empty browser storage and no payload/credentials in service logs.");
    await context.close();
  } finally { await browser.close(); }
} catch (error) {
  console.error(error.message);
  console.error("Private service diagnostics:", directory);
  process.exitCode = 1;
} finally {
  await stop(nextProcess);
  // Closing stdin gives the test-only launcher ownership of graceful cleanup.
  if (backendProcess && backendProcess.exitCode === null && backendProcess.signalCode === null) {
    backendProcess.stdin.end();
    await Promise.race([once(backendProcess, "exit"), pause(15000)]);
  }
  await stop(backendProcess);
  await backendLog?.close(); await nextLog?.close();
  await rm(fixtureDirectory, { recursive: true, force: true });
  if (!process.exitCode) await rm(directory, { recursive: true, force: true });
}
