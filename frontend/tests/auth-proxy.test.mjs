import assert from "node:assert/strict";
import test from "node:test";
import { proxyAuthentication, backendOrigin } from "../src/lib/auth/backend-proxy.ts";
import { canAccessPath, dashboardFor, hasPermission } from "../src/lib/auth/permissions.ts";

test("proxy forwards body, session cookie and CSRF, preserving multiple Set-Cookie headers", async () => {
  const input = new Request("http://clinic.local/api/v1/auth/login", {
    method: "POST", headers: { Cookie: "JSESSIONID=synthetic-session; unrelated=private", "X-CSRF-TOKEN": "synthetic-csrf", "Content-Type": "application/json", Origin: "http://clinic.local", Connection: "keep-alive", "X-Forwarded-Host": "attacker.invalid" },
    body: JSON.stringify({ identifier: "synthetic", password: "synthetic-only" }),
  });
  const result = await proxyAuthentication(input, "auth/login", { origin: "http://127.0.0.1:8080", fetcher: async (url, init) => {
    assert.equal(url, "http://127.0.0.1:8080/api/v1/auth/login");
    assert.equal(init.headers.get("Cookie"), "JSESSIONID=synthetic-session");
    assert.equal(init.headers.get("X-CSRF-TOKEN"), "synthetic-csrf");
    assert.equal(init.headers.has("connection"), false); assert.equal(init.headers.has("x-forwarded-host"), false);
    assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "manual");
    assert.equal(JSON.parse(new TextDecoder().decode(init.body)).identifier, "synthetic");
    const headers = new Headers({ "Content-Type": "application/json", "Connection": "close", "Location": "http://private-backend", "X-Request-ID": "synthetic-request" });
    headers.append("Set-Cookie", "JSESSIONID=; Expires=Thu, 01 Jan 1970 00:00:10 GMT; Path=/; HttpOnly; Secure; SameSite=Strict");
    headers.append("Set-Cookie", "JSESSIONID=rotated; Path=/; HttpOnly; Secure; SameSite=Strict");
    return new Response("{}", { headers });
  } });
  assert.equal(result.status, 200); assert.equal(result.headers.getSetCookie().length, 2);
  assert(result.headers.getSetCookie()[1].includes("Secure"));
  assert.equal(result.headers.has("Location"), false); assert.equal(result.headers.has("Connection"), false);
  assert.match(result.headers.get("cache-control"), /private, no-store/);
});

test("proxy has a fixed destination, safe failures, no redirects and no domain cookies", async () => {
  const request = () => new Request("http://clinic.local/api/v1/auth/me");
  assert.equal((await proxyAuthentication(request(), "https://attacker.invalid")).status, 404);
  assert.equal((await proxyAuthentication(request(), "auth/login")).status, 405);
  assert.equal((await proxyAuthentication(request(), "auth/me", { origin: "http://127.0.0.1:1" })).status, 503);
  for (const response of [new Response(null, { status: 302, headers: { Location: "http://internal" } }), new Response("private-stacktrace", { status: 500 }), new Response("{}", { headers: { "Content-Type": "application/json", "Set-Cookie": "JSESSIONID=x; Domain=internal" } })]) {
    const result = await proxyAuthentication(request(), "auth/me", { origin: "http://internal", fetcher: async () => response });
    assert.equal(result.status, 502); assert(!(await result.text()).includes("internal"));
  }
  for (const value of ["http://user:password@internal", "http://internal/path", "file:///tmp/private"]) assert.throws(() => backendOrigin(value));
});

test("cross-origin mutations and oversized bodies are rejected locally", async () => {
  assert.equal((await proxyAuthentication(new Request("http://clinic.local/api/v1/auth/login", { method: "POST", headers: { Origin: "http://attacker.invalid" } }), "auth/login")).status, 403);
  assert.equal((await proxyAuthentication(new Request("http://clinic.local/api/v1/auth/login", { method: "POST", body: "x".repeat(4097) }), "auth/login", { origin: "http://internal" })).status, 413);
});

test("central presentation policies are restrictive for mixed clinical modules", () => {
  assert.equal(dashboardFor("RECEPTIONIST"), "/rendez-vous");
  assert.equal(dashboardFor("DENTIST"), "/");
  for (const path of ["/", "/demo/patients", "/patients/demo/dossier", "/consultations", "/documents", "/facturation", "/parametres"]) {
    assert.equal(canAccessPath("RECEPTIONIST", path), false); assert.equal(canAccessPath("DENTIST", path), true);
  }
  assert.equal(canAccessPath("RECEPTIONIST", "/rendez-vous/demo/modifier"), true);
  assert.equal(hasPermission("RECEPTIONIST", "clinical"), false);
  assert.equal(hasPermission("RECEPTIONIST", "administrative"), true);
});


test("origin check uses incoming authority rather than Next's internal localhost URL", async () => {
  const response = await proxyAuthentication(new Request("http://localhost:3100/api/v1/auth/logout", {
    method: "POST", headers: { Host: "127.0.0.1:3100", Origin: "http://127.0.0.1:3100" },
  }), "auth/logout", { origin: "http://internal", fetcher: async () => new Response(null, { status: 204 }) });
  assert.equal(response.status, 204);
});

 test("reception can open only persistent administrative patient routes", () => { for (const path of ["/patients", "/patients/nouveau", "/patients/00000000-0000-4000-8000-000000000001", "/patients/00000000-0000-4000-8000-000000000001/modifier"]) assert.equal(canAccessPath("RECEPTIONIST", path), true); for (const path of ["/demo/patients", "/patients/00000000-0000-4000-8000-000000000001/dossier", "/patients/00000000-0000-4000-8000-000000000001/clinique"]) assert.equal(canAccessPath("RECEPTIONIST", path), false); });
