import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
import { mkdir } from "node:fs/promises";
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
      const value = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        ...options,
      });
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
