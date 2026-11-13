import { z } from "zod";
import type { LoginCredentials } from "./login-schema";
import { authFailure, identitySchema, type AuthFailure, type SessionResult } from "./types";

export const AUTHENTICATION_NOTICE = "Utilisez l’identifiant de votre compte du cabinet.";
const csrfSchema = z.object({ headerName: z.literal("X-CSRF-TOKEN"), token: z.string().min(1).max(512) });
type MutationResult = { status: "ok" } | AuthFailure;
export interface AuthenticationService {
  restore(): Promise<SessionResult>;
  signIn(credentials: LoginCredentials): Promise<SessionResult>;
  signOut(): Promise<MutationResult>;
}

/** One instance per mounted browser provider; no server-shared token state. */
export function createAuthenticationService(fetcher: typeof fetch = fetch): AuthenticationService {
  let token: z.infer<typeof csrfSchema> | null = null;
  async function request(path: string, options: RequestInit = {}): Promise<Response> {
    return fetcher(`/api/v1/auth/${path}`, {
      ...options, credentials: "same-origin", cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
  }
  async function csrf(): Promise<AuthFailure | null> {
    token = null;
    try {
      const response = await request("csrf");
      if (!response.ok) return authFailure(response.status);
      const result = csrfSchema.safeParse(await response.json());
      if (!result.success) return authFailure(502);
      token = result.data;
      return null;
    } catch { return authFailure(503); }
  }
  async function restore(): Promise<SessionResult> {
    try {
      const response = await request("me");
      if (response.status === 401) { token = null; return { status: "unauthenticated" }; }
      if (!response.ok) return authFailure(response.status);
      const identity = identitySchema.safeParse(await response.json());
      return identity.success ? { status: "authenticated", user: identity.data } : authFailure(502);
    } catch { return authFailure(503); }
  }
  async function mutation(path: "login" | "logout", credentials?: LoginCredentials): Promise<Response | AuthFailure> {
    // Fetch for every explicit mutation: handles another tab rotating CSRF safely.
    const error = await csrf();
    if (error || !token) return error ?? authFailure(503);
    try {
      const current = token as z.infer<typeof csrfSchema>;
      const response = await request(path, {
        method: "POST", headers: { "Content-Type": "application/json", [current.headerName]: current.token },
        body: credentials ? JSON.stringify(credentials) : undefined,
      });
      token = null;
      // Never retry a mutation: a timeout may occur after the server committed it.
      return response;
    } catch { token = null; return authFailure(503); }
  }
  return {
    restore,
    async signIn(credentials) {
      const response = await mutation("login", credentials);
      if (!(response instanceof Response)) return response;
      if (!response.ok) return authFailure(response.status);
      try {
        if (!identitySchema.safeParse(await response.json()).success) return authFailure(502);
      } catch { return authFailure(502); }
      const error = await csrf(); // Login rotated the session and invalidated its old token.
      if (error) return error;
      // /me is authoritative even if session establishment failed after a 200 login.
      return restore();
    },
    async signOut() {
      const response = await mutation("logout");
      if (!(response instanceof Response)) {
        if (response.code === 401 && (await restore()).status === "unauthenticated") return { status: "ok" };
        return response;
      }
      if (response.status === 204 || response.status === 401) { token = null; return { status: "ok" }; }
      if (response.status === 403) {
        const state = await restore();
        if (state.status === "unauthenticated") return { status: "ok" };
      }
      return authFailure(response.status);
    },
  };
}
