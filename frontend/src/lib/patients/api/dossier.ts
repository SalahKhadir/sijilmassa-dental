import { z } from "zod";
import { createSessionResponse } from "../../api/session-request";
import { readPdfDownload } from "../../api/pdf-download";

const idPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const problem = z.object({ status: z.number().int(), code: z.enum(["DOSSIER_LIMIT", "UNSUPPORTED_TEXT"]).optional() });

export class DossierDownloadError extends Error {
  constructor(public readonly status: number, code?: string) {
    const message = code === "DOSSIER_LIMIT" ? "Le dossier dépasse la taille autorisée pour un PDF."
      : code === "UNSUPPORTED_TEXT" ? "Certains caractères du dossier ne peuvent pas être imprimés dans ce PDF."
      : status === 401 ? "Votre session a expiré. Reconnectez-vous."
      : status === 403 ? "Le dossier PDF est réservé au dentiste."
      : status === 404 ? "Le dossier patient est introuvable."
      : "Le dossier PDF n’a pas pu être téléchargé. Réessayez.";
    super(message);
    this.name = "DossierDownloadError";
  }
}

export async function fetchPatientDossier(patientId: string, signal: AbortSignal,
  unauthenticated: () => void, fetcher: typeof fetch = fetch) {
  if (!idPattern.test(patientId)) throw new DossierDownloadError(400);
  const request = createSessionResponse((path, options) => fetcher(path, {
    ...options,
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  }), unauthenticated, async (status, response) => {
    if (response && [413, 422].includes(status) && response.headers.get("Content-Type")?.startsWith("application/problem+json")) {
      try {
        const parsed = problem.safeParse(await response.json());
        if (parsed.success && parsed.data.status === status) return new DossierDownloadError(status, parsed.data.code);
      } catch { /* The HTTP response is untrusted. */ }
    }
    return new DossierDownloadError(status);
  });
  const response = await request(`/api/v1/patients/${patientId}/dossier.pdf`);
  return readPdfDownload(response, `dossier-${patientId.toLowerCase()}.pdf`, "X-Dossier-PDF-Bytes", () => new DossierDownloadError(502));
}
