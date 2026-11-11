import { z } from "zod";

type HttpError = Error & { readonly status: number };
type Failure = (status: number, response?: Response) => HttpError | Promise<HttpError>;
/** Explicit mutations obtain a fresh CSRF token. No automatic write retry or shared token/cache. */
export function createSessionResponse(fetcher: typeof fetch, unauthenticated: () => void, failure: Failure) {
  return async function request(path: string, method = "GET", body?: unknown): Promise<Response> {
    try {
      const headers: Record<string, string> = {};
      if (method !== "GET") {
        const csrf = await fetcher("/api/v1/auth/csrf", { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
        if (!csrf.ok) throw await failure(csrf.status, csrf);
        const token = z.object({ headerName: z.literal("X-CSRF-TOKEN"), token: z.string().min(1).max(512) }).safeParse(await csrf.json());
        if (!token.success) throw await failure(502);
        headers[token.data.headerName] = token.data.token;
        headers["Content-Type"] = "application/json";
      }
      const response = await fetcher(path, { method, headers, credentials: "same-origin", cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(path.startsWith("/api/v1/prescriptions/") && path.includes("/finalization?") ? 30000 : 10000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (!response.ok) throw await failure(response.status, response);
      return response;
    } catch (error) {
      const current = error instanceof Error && "status" in error && typeof error.status === "number" ? error as HttpError : await failure(503);
      if (current.status === 401) unauthenticated();
      throw current;
    }
  };
}
export function createSessionRequest(fetcher: typeof fetch, unauthenticated: () => void, failure: Failure) {
  const response = createSessionResponse(fetcher, unauthenticated, failure);
  return async function request<T>(path: string, schema: z.ZodType<T>, method = "GET", body?: unknown): Promise<T> {
    const result = await response(path, method, body);
    try {
      const parsed = schema.safeParse(await result.json());
      if (parsed.success) return parsed.data;
    } catch { /* Discard untrusted response content. */ }
    throw await failure(502);
  };
}
export function requireLogin() {
  document.documentElement.dataset.authBlocked = "true";
  window.location.replace("/login");
}
