import assert from "node:assert/strict";
import test from "node:test";
import { loginSchema } from "../src/lib/auth/login-schema.ts";
import { authenticationService } from "../src/lib/auth/authentication-service.ts";

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

test("every prototype submission remains unavailable, including repeated submissions", async () => {
  const credentials = Object.freeze({
    identifier: "compte-fictif",
    password: "exemple-fictif",
  });
  const results = await Promise.all([
    authenticationService.signIn(credentials),
    authenticationService.signIn(credentials),
  ]);
  for (const result of results) {
    assert.equal(result.status, "unavailable");
    assert.match(result.message, /Spring Boot/);
    assert.deepEqual(Object.keys(result).sort(), ["message", "status"]);
  }
  assert.equal(credentials.password, "exemple-fictif");
});
