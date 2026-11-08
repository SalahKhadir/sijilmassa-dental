/** Node-only transport, imported by Route Handlers and the server session reader. */
const paths = new Map([
  ["auth/csrf", "GET"], ["auth/me", "GET"], ["auth/login", "POST"], ["auth/logout", "POST"],
]);
const cacheHeaders = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie" };
export function backendOrigin(value = process.env.BACKEND_INTERNAL_URL): string {
  if (!value) throw new Error("Missing internal backend URL");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Invalid internal backend URL");
  }
  return url.origin;
}
export function sessionCookie(cookie: string | null): string {
  return (cookie ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith("JSESSIONID=")).join("; ");
}
export function proxyProblem(status: number): Response {
  const requestId = crypto.randomUUID();
  return Response.json({ requestId, instance: `urn:request:${requestId}`, type: "about:blank", title: "Service indisponible", status,
    detail: "La requête ne peut pas être traitée actuellement." },
    { status, headers: { ...cacheHeaders, "X-Request-ID": requestId, "Content-Type": "application/problem+json" } });
}
export async function proxyAuthentication(request: Request, path: string,
  options: { fetcher?: typeof fetch; origin?: string } = {}): Promise<Response> {
  const method = paths.get(path);
  if (!method) return proxyProblem(404);
  if (request.method !== method) return proxyProblem(405);
  if (method === "POST") {
    const origin = request.headers.get("Origin");
    if (origin) {
      try {
        // Next's internal Request URL may use localhost even when the browser used 127.0.0.1.
        // Host is the incoming HTTP authority; never trust X-Forwarded-Host from the client.
        const supplied = new URL(origin);
        const authority = request.headers.get("Host") ?? new URL(request.url).host;
        if (!["http:", "https:"].includes(supplied.protocol) || supplied.host !== authority) return proxyProblem(403);
      } catch { return proxyProblem(403); }
    }
  }
  try {
    const origin = backendOrigin(options.origin);
    const headers = new Headers();
    const nominated = new Set((request.headers.get("Connection") ?? "").split(",").map(value => value.trim().toLowerCase()));
    const cookie = sessionCookie(request.headers.get("Cookie"));
    if (cookie && !nominated.has("cookie")) headers.set("Cookie", cookie);
    for (const name of ["Content-Type", "X-CSRF-TOKEN"]) {
      const value = request.headers.get(name);
      if (value && !nominated.has(name.toLowerCase())) headers.set(name, value);
    }
    let body: Uint8Array<ArrayBuffer> | undefined;
    if (method === "POST" && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4096) { await reader.cancel(); return proxyProblem(413); }
        chunks.push(value);
      }
      body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    }
    const upstream = await (options.fetcher ?? fetch)(`${origin}/api/v1/${path}`, {
      method, headers, body, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(8000),
    });
    if (upstream.status >= 300 && upstream.status < 400) return proxyProblem(502);
    const contentType = upstream.headers.get("content-type") ?? "";
    if (upstream.status !== 204 && !/^application\/(?:problem\+)?json(?:;|$)/i.test(contentType)) return proxyProblem(502);
    const responseHeaders = new Headers(cacheHeaders);
    if (contentType) responseHeaders.set("Content-Type", contentType);
    for (const name of ["X-Request-ID", "Retry-After"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    // Do not combine Set-Cookie (Expires contains commas). Spring uses host-only Path=/ cookies.
    for (const cookie of upstream.headers.getSetCookie()) {
      if (/;\s*domain=/i.test(cookie)) return proxyProblem(502);
      responseHeaders.append("Set-Cookie", cookie);
    }
    const responseBody = upstream.status === 204 ? null : await upstream.arrayBuffer();
    return new Response(responseBody, { status: upstream.status, headers: responseHeaders });
  } catch { return proxyProblem(503); }
}
