import { z } from "zod";

type HttpError = Error & { readonly status: number };
/** Explicit mutations obtain a fresh CSRF token. No automatic write retry or shared token/cache. */
export function createSessionRequest(fetcher: typeof fetch, unauthenticated: () => void,
  failure: (status: number) => HttpError) {
  return async function request<T>(path: string, schema: z.ZodType<T>, method = "GET", body?: unknown): Promise<T> {
    try {
      const headers: Record<string, string> = {};
      if (method !== "GET") {
        const csrf = await fetcher("/api/v1/auth/csrf", { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
        if (!csrf.ok) throw failure(csrf.status);
        const token = z.object({ headerName: z.literal("X-CSRF-TOKEN"), token: z.string().min(1).max(512) }).safeParse(await csrf.json());
        if (!token.success) throw failure(502);
        headers[token.data.headerName] = token.data.token;
        headers["Content-Type"] = "application/json";
      }
      const response = await fetcher(path, { method, headers, credentials: "same-origin", cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(10000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (!response.ok) throw failure(response.status);
      const result = schema.safeParse(await response.json());
      if (!result.success) throw failure(502);
      return result.data;
    } catch (error) {
      const current = error instanceof Error && "status" in error && typeof error.status === "number" ? error as HttpError : failure(503);
      if (current.status === 401) unauthenticated();
      throw current;
    }
  };
}
export function requireLogin() {
  document.documentElement.dataset.authBlocked = "true";
  window.location.replace("/login");
}
