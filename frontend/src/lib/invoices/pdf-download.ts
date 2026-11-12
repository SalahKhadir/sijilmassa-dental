import { z } from "zod";
import { createSessionResponse } from "../api/session-request";
import { readPdfDownload } from "../api/pdf-download";
import { financialId } from "../financial/schemas";

const messages = {
  INVOICE_NOT_ISSUED: "Le PDF sera disponible après l’émission de la facture.",
  INVOICE_PDF_LAYOUT_OVERFLOW: "Cette facture dépasse la place disponible sur une page A5. Contactez le responsable du cabinet pour son impression.",
  INVOICE_PDF_UNSUPPORTED_TEXT: "Certains caractères de cette facture ne peuvent pas être imprimés. Contactez le responsable du cabinet.",
  INVOICE_PDF_INTEGRITY: "Les données d’émission n’ont pas pu être vérifiées. Contactez le responsable du cabinet.",
  INVOICE_PDF_BUSY: "La préparation de PDF est occupée. Réessayez dans un instant.",
} as const;
const problem = z.object({ status: z.number().int(), code: z.enum(Object.keys(messages) as [keyof typeof messages, ...(keyof typeof messages)[]]).optional() });
type Code = z.infer<typeof problem>["code"];

export class InvoicePdfDownloadError extends Error {
  constructor(public readonly status: number, code?: Code) {
    super(code ? messages[code] : status === 401 ? "Votre session a expiré. Reconnectez-vous."
      : status === 403 ? "L’accès à la facture est refusé."
      : status === 404 ? "La facture est introuvable."
      : "Le PDF de la facture n’a pas pu être téléchargé. Réessayez.");
    this.name = "InvoicePdfDownloadError";
  }
}

export async function fetchInvoicePdf(invoice: { patientId: string; invoiceId: string; number: string },
  signal: AbortSignal, unauthenticated: () => void, fetcher: typeof fetch = fetch) {
  const { patientId, invoiceId, number } = invoice;
  if (!financialId.safeParse(patientId).success || !financialId.safeParse(invoiceId).success || !/^[0-9]{4}-[0-9]{3,19}$/.test(number)) {
    throw new InvoicePdfDownloadError(400);
  }
  const request = createSessionResponse((path, options) => fetcher(path, {
    ...options, signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  }), unauthenticated, async (status, response) => {
    if (response?.headers.get("Content-Type")?.startsWith("application/problem+json")) {
      try {
        const parsed = problem.safeParse(await response.json());
        if (parsed.success && parsed.data.status === status) return new InvoicePdfDownloadError(status, parsed.data.code);
      } catch { /* Discard the untrusted response. */ }
    }
    return new InvoicePdfDownloadError(status);
  });
  const response = await request(`/api/v1/invoices/${invoiceId}/pdf?patientId=${patientId}`);
  return readPdfDownload(response, `facture-${number}.pdf`, "X-Invoice-PDF-Bytes", () => new InvoicePdfDownloadError(502));
}
