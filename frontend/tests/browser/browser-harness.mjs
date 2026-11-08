import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
import { mkdir, readFile } from "node:fs/promises";

const sessions = new Map();
export async function authenticationFixture() {
  assert(process.env.AUTH_TEST_FIXTURE, "AUTH_TEST_FIXTURE must point to isolated synthetic test accounts; no authentication bypass is available.");
  return JSON.parse(await readFile(process.env.AUTH_TEST_FIXTURE, "utf8"));
}
import { chromium } from "playwright";

export function browserHarness({ port }) {
  let browser;
  let server;
  let serverOutput = "";
  const baseURL =
    process.env.PATIENTS_TEST_BASE_URL ?? `http://127.0.0.1:${port}`;
  return {
    baseURL,
    async start() {
      for (const directory of [
        process.env.PATIENTS_TEST_SCREENSHOT_DIR,
        process.env.APPOINTMENTS_TEST_SCREENSHOT_DIR,
      ].filter(Boolean))
        await mkdir(directory, { recursive: true });
      if (!process.env.PATIENTS_TEST_BASE_URL) {
        server = spawn(
          process.execPath,
          [
            "node_modules/next/dist/bin/next",
            "start",
            "--hostname",
            "127.0.0.1",
            "--port",
            String(port),
          ],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        server.stdout.on("data", (chunk) => {
          serverOutput += chunk;
        });
        server.stderr.on("data", (chunk) => {
          serverOutput += chunk;
        });
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt += 1) {
          if (server.exitCode !== null)
            throw new Error(`Next.js exited during startup. ${serverOutput}`);
          try {
            if ((await fetch(baseURL)).ok) {
              ready = true;
              break;
            }
          } catch {
            /* Local startup only. */
          }
          await pause(100);
        }
        assert(ready, `Local server did not become ready. ${serverOutput}`);
      }
      // Wait for the real Spring-backed proxy, not just the Next.js login HTML.
      let backendReady = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        try {
          if ((await fetch(`${baseURL}/api/v1/auth/csrf`, { signal: AbortSignal.timeout(2000) })).status === 200) {
            backendReady = true; break;
          }
        } catch { /* Startup only; no mutation is retried. */ }
        await pause(200);
      }
      assert(backendReady, "Real backend authentication proxy is not ready");
      browser = await chromium.launch({
        headless: true,
        executablePath:
          process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      });
    },
    async stop() {
      await browser?.close();
      if (server && server.exitCode === null) {
        const exited = once(server, "exit");
        server.kill("SIGTERM");
        await exited;
      }
    },
    async context(options = {}) {
      const { anonymous = false, role = "dentist", ...browserOptions } = options;
      const value = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        ...browserOptions,
      });
      if (!anonymous) {
        const key = `${baseURL}:${role}`;
        if (sessions.has(key)) {
          await value.addCookies(sessions.get(key));
        } else {
          const fixture = (await authenticationFixture())[role];
          const csrfResponse = await value.request.get(`${baseURL}/api/v1/auth/csrf`);
          assert.equal(csrfResponse.status(), 200, "Real backend CSRF unavailable");
          const csrf = await csrfResponse.json();
          const login = await value.request.post(`${baseURL}/api/v1/auth/login`, {
            headers: { [csrf.headerName]: csrf.token }, data: fixture,
          });
          assert.equal(login.status(), 200, "Real synthetic login failed");
          await value.request.get(`${baseURL}/api/v1/auth/csrf`);
          sessions.set(key, await value.cookies());
        }
      }
      const page = await value.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      const external = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        const url = new URL(request.url());
        // The native PDF viewer loads browser-owned resources without network access.
        if (["chrome:", "chrome-extension:"].includes(url.protocol)) return;
        if (url.origin !== new URL(baseURL).origin)
          external.push(request.url());
      });
      return { value, page, errors, external };
    },
  };
}
