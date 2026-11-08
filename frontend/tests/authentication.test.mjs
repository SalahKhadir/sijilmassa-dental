import assert from "node:assert/strict";
import test from "node:test";
import { loginSchema } from "../src/lib/auth/login-schema.ts";
import { createAuthenticationService } from "../src/lib/auth/authentication-service.ts";

test("required fields reject empty and whitespace-only input", () => {
  for (const identifier of ["", "   "]) {
    assert.equal(
      loginSchema.safeParse({ identifier, password: "exemple-fictif" }).success,
      false,
    );
  }
  for (const password of ["", "   "]) {
    assert.equal(
      loginSchema.safeParse({ identifier: "compte-fictif", password }).success,
      false,
    );
  }
});

test("identifier normalization preserves the password exactly", () => {
  const result = loginSchema.parse({
    identifier: "  compte-fictif  ",
    password: " exemple-fictif ",
  });
  assert.deepEqual(result, {
    identifier: "compte-fictif",
    password: " exemple-fictif ",
  });
});


const user = { id: "11111111-1111-4111-8111-111111111111", username: "synthetic", role: "DENTIST" };
const credentials = { identifier: "synthetic", password: "synthetic-only" };
const csrf = (token = "synthetic-csrf") => ({ headerName: "X-CSRF-TOKEN", token });
function queued(values) {
  const calls = [];
  const api = createAuthenticationService(async (url, options) => {
    calls.push({ url, options });
    const value = values.shift();
    if (value instanceof Error) throw value;
    assert(value, "Unexpected extra request");
    return new Response(value.status === 204 ? null : JSON.stringify(value.body), {
      status: value.status ?? 200, headers: { "Content-Type": "application/json" },
    });
  });
  return { api, calls };
}

test("real contract: CSRF, login, renewed CSRF then authoritative session restoration", async () => {
  const { api, calls } = queued([{ body: csrf("before") }, { body: user }, { body: csrf("after") }, { body: user }]);
  assert.deepEqual(await api.signIn(credentials), { status: "authenticated", user });
  assert.deepEqual(calls.map(c => c.url), ["/api/v1/auth/csrf", "/api/v1/auth/login", "/api/v1/auth/csrf", "/api/v1/auth/me"]);
  assert.equal(calls[1].options.headers["X-CSRF-TOKEN"], "before");
  assert.deepEqual(JSON.parse(calls[1].options.body), credentials);
  for (const { options } of calls) { assert.equal(options.credentials, "same-origin"); assert.equal(options.cache, "no-store"); }
});

for (const status of [400, 401, 403, 429, 500, 502, 503]) {
  test(`authentication ${status} is safe, generic and never retries the mutation`, async () => {
    const { api, calls } = queued([{ body: csrf() }, { status, body: { detail: "private-jdbc-details", status } }]);
    const result = await api.signIn(credentials);
    assert.equal(result.status, "error"); assert.equal(result.code, status);
    assert(!result.message.includes("private-jdbc")); assert.equal(calls.length, 2);
  });
}

test("unavailable backend or malformed CSRF cannot establish authentication", async () => {
  for (const value of [new Error("network"), { body: { headerName: "Untrusted-Header", token: "synthetic" } }]) {
    const { api, calls } = queued([value]);
    assert.equal((await api.signIn(credentials)).status, "error"); assert.equal(calls.length, 1);
  }
});

test("session restore distinguishes expired sessions, network failure and unknown roles", async () => {
  const { api } = queued([{ body: user }, { status: 401, body: {} }, new Error("network"), { body: { ...user, role: "ADMIN" } }]);
  assert.equal((await api.restore()).status, "authenticated");
  assert.equal((await api.restore()).status, "unauthenticated");
  assert.equal((await api.restore()).status, "error");
  assert.equal((await api.restore()).status, "error");
});

test("logout obtains a current token and confirms invalidation or expiration", async () => {
  for (const status of [204, 401]) {
    const { api, calls } = queued([{ body: csrf("fresh") }, { status, body: {} }]);
    assert.equal((await api.signOut()).status, "ok");
    assert.equal(calls[1].options.headers["X-CSRF-TOKEN"], "fresh");
    assert.equal(calls[1].url, "/api/v1/auth/logout");
  }
});

test("logout with expired CSRF only rechecks me; never retries logout", async () => {
  for (const meStatus of [200, 401, 503]) {
    const { api, calls } = queued([{ body: csrf() }, { status: 403, body: {} }, { status: meStatus, body: user }]);
    assert.equal((await api.signOut()).status, meStatus === 401 ? "ok" : "error");
    assert.equal(calls.length, 3); assert.equal(calls[2].url, "/api/v1/auth/me");
  }
});

test("unconfirmed logout and failed post-login renewal remain errors", async () => {
  assert.equal((await queued([{ body: csrf() }, new Error("network")]).api.signOut()).status, "error");
  assert.equal((await queued([{ body: csrf() }, { body: user }, new Error("network")]).api.signIn(credentials)).status, "error");
});
