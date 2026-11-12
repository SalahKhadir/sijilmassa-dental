import { MAX_INSURANCE_PDF_BYTES } from "../api/pdf-download";

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
  const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
  const dossierPdf = new RegExp(`^patients/${uuid}/dossier\\.pdf$`).test(path);
  const patientRoute = dossierPdf ? ["GET"]
    : path === "patients" ? ["GET", "POST"]
    : path === "patients/with-medical-record" ? ["POST"]
    : new RegExp(`^patients/${uuid}(?:/medical-record)?$`).test(path) ? ["GET", "PUT"] : null;
  const appointmentRoute = path === "appointments" ? ["GET", "POST"]
    : new RegExp(`^appointments/${uuid}$`).test(path) ? ["GET", "PUT"]
    : new RegExp(`^appointments/${uuid}/status$`).test(path) ? ["PUT"] : null;
  const clinicalRoute = path === "consultations" ? ["GET", "POST"]
    : new RegExp(`^consultations/${uuid}$`).test(path) ? ["GET", "PUT"]
    : new RegExp(`^consultations/${uuid}/treatments$`).test(path) ? ["POST"]
    : new RegExp(`^consultations/${uuid}/treatments/removed$`).test(path) ? ["GET"]
    : new RegExp(`^consultations/${uuid}/(?:finalization|treatments/${uuid}(?:/removal)?)$`).test(path) ? ["PUT"] : null;
  const prescriptionRoute = path === "prescriptions" ? ["GET", "POST"]
    : new RegExp(`^prescriptions/${uuid}$`).test(path) ? ["GET", "PUT"]
    : new RegExp(`^prescriptions/${uuid}/(?:archival|finalization)$`).test(path) ? ["PUT"]
    : new RegExp(`^prescriptions/${uuid}/pdf$`).test(path) ? ["GET"] : null;
  const financialRoute = path === "financial/charges" ? ["POST"]
    : new RegExp(`^financial/charges/${uuid}$`).test(path) ? ["GET"]
    : new RegExp(`^financial/charges/${uuid}/payments$`).test(path) ? ["GET", "POST"]
    : new RegExp(`^financial/consultations/${uuid}/pricing$`).test(path) ? ["GET"]
    : new RegExp(`^financial/patients/${uuid}/(?:summary|verso)$`).test(path) ? ["GET"] : null;
  const invoicePdf = new RegExp(`^invoices/${uuid}/pdf$`).test(path);
  const invoiceRoute = invoicePdf ? ["GET"] : path === "invoices" ? ["POST"]
    : new RegExp(`^invoices/${uuid}$`).test(path) ? ["GET", "PUT"]
    : new RegExp(`^invoices/${uuid}/issue$`).test(path) ? ["POST"]
    : new RegExp(`^patients/${uuid}/(?:invoices|invoice-eligible-charges)$`).test(path) ? ["GET"] : null;
  const insurancePdf = new RegExp(`^insurance-documents/${uuid}/pdf$`).test(path);
  const insuranceRoute = insurancePdf ? ["GET"] : path === "insurance-documents" ? ["POST"]
    : new RegExp(`^insurance-documents/${uuid}$`).test(path) ? ["GET", "PUT"]
    : new RegExp(`^insurance-documents/${uuid}/finalize$`).test(path) ? ["POST"]
    : new RegExp(`^patients/${uuid}/insurance-documents$`).test(path) ? ["GET"] : null;
  const pdfRoute = dossierPdf || invoicePdf || insurancePdf || Boolean(prescriptionRoute && path.endsWith("/pdf"));
  const resourceRoute = patientRoute ?? appointmentRoute ?? clinicalRoute ?? prescriptionRoute ?? financialRoute ?? invoiceRoute ?? insuranceRoute;
  const methods = resourceRoute ?? (paths.has(path) ? [paths.get(path)!] : null);
  if (!methods) return proxyProblem(404);
  const method = request.method;
  if (!methods.includes(method)) return proxyProblem(405);
  if (method === "POST" || method === "PUT") {
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
    if ((method === "POST" || method === "PUT") && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > (prescriptionRoute ? 262144 : insuranceRoute ? 131072 : invoiceRoute ? 16384 : resourceRoute && !financialRoute ? 65536 : 4096)) { await reader.cancel(); return proxyProblem(413); }
        chunks.push(value);
      }
      body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    }
    const upstream = await (options.fetcher ?? fetch)(`${origin}/api/v1/${path}${prescriptionRoute || clinicalRoute || financialRoute || invoiceRoute || insuranceRoute || (resourceRoute && method === "GET") ? new URL(request.url).search : ""}`, {
      method, headers, body, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(dossierPdf || invoicePdf || insurancePdf || (prescriptionRoute && path.endsWith("/finalization")) ? 25000 : 8000),
    });
    if (upstream.status >= 300 && upstream.status < 400) return proxyProblem(502);
    const contentType = upstream.headers.get("content-type") ?? "";
    const pdf = pdfRoute && upstream.status === 200;
    if (!pdf && upstream.status !== 204 && !/^application\/(?:problem\+)?json(?:;|$)/i.test(contentType)) return proxyProblem(502);
    const responseHeaders = new Headers(cacheHeaders);
    if (contentType) responseHeaders.set("Content-Type", contentType);
    for (const name of ["X-Request-ID", "Retry-After"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    if ((clinicalRoute || prescriptionRoute || financialRoute || invoiceRoute || insuranceRoute) && upstream.headers.has("Location")) {
      const location = upstream.headers.get("Location")!;
      const collection = insuranceRoute ? "insurance-documents" : invoiceRoute ? "invoices" : financialRoute ? "financial/charges" : prescriptionRoute ? "prescriptions" : "consultations";
      if (!new RegExp(`^/api/v1/${collection}/${uuid}\\?patientId=${uuid}$`).test(location)) return proxyProblem(502);
      if (financialRoute && (path !== "financial/charges" || upstream.status !== 201)) return proxyProblem(502);
      if (insuranceRoute && (path !== "insurance-documents" || upstream.status !== 201)) return proxyProblem(502);
      if (invoiceRoute && (path !== "invoices" || upstream.status !== 201)) return proxyProblem(502);
      responseHeaders.set("Location", location);
    }
    // Do not combine Set-Cookie (Expires contains commas). Spring uses host-only Path=/ cookies.
    for (const cookie of upstream.headers.getSetCookie()) {
      if (/;\s*domain=/i.test(cookie)) return proxyProblem(502);
      responseHeaders.append("Set-Cookie", cookie);
    }
    if (pdf) {
      const length = upstream.headers.get("Content-Length");
      const disposition = dossierPdf || invoicePdf || insurancePdf ? "attachment" : new URL(request.url).searchParams.get("disposition") ?? "inline";
      const filenamePrefix = insurancePdf ? "formulaire-assurance" : dossierPdf ? "dossier" : "ordonnance";
      const id = path.split("/")[1];
      const dispositionHeader = upstream.headers.get("Content-Disposition") ?? "";
      const validName = invoicePdf
        ? /^attachment; filename="facture-[0-9]{4}-[0-9]{3,19}\.pdf"$/.test(dispositionHeader)
        : dispositionHeader === `${disposition}; filename="${filenamePrefix}-${id.toLowerCase()}.pdf"`;
      if (!/^application\/pdf(?:;|$)/i.test(contentType) || !length || !/^[1-9][0-9]*$/.test(length)
        || Number(length) > (insurancePdf ? MAX_INSURANCE_PDF_BYTES : 2097152) || !["inline", "attachment"].includes(disposition) || !upstream.body
        || !validName) return proxyProblem(502);
      responseHeaders.set("Content-Type", "application/pdf");
      responseHeaders.set("Content-Length", length);
      // Next may remove Content-Length when writing a streamed Route Handler response.
      responseHeaders.set(insurancePdf ? "X-Insurance-PDF-Bytes" : invoicePdf ? "X-Invoice-PDF-Bytes" : dossierPdf ? "X-Dossier-PDF-Bytes" : "X-Prescription-PDF-Bytes", length);
      responseHeaders.set("Content-Disposition", dispositionHeader);
      responseHeaders.set("X-Content-Type-Options", "nosniff");
      let size = 0;
      // Stream with a byte bound; late corruption aborts the stream instead of delivering a partial success.
      const stream = upstream.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          size += chunk.byteLength;
          if (size > Number(length)) throw new Error("Invalid PDF size");
          controller.enqueue(chunk);
        },
        flush() { if (size !== Number(length)) throw new Error("Invalid PDF size"); },
      }));
      if (invoicePdf || insurancePdf) {
        try {
          const bytes = await new Response(stream).arrayBuffer();
          if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return proxyProblem(502);
          return new Response(bytes, { status: 200, headers: responseHeaders });
        } catch { return proxyProblem(502); }
      }
      return new Response(stream, { status: 200, headers: responseHeaders });
    }
    const responseBody = upstream.status === 204 ? null : await upstream.arrayBuffer();
    return new Response(responseBody, { status: upstream.status, headers: responseHeaders });
  } catch { return proxyProblem(503); }
}
