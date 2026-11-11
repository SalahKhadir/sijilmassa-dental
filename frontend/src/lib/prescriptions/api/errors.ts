import { z } from "zod";
const codes = {
  INVALID_INPUT: "Vérifiez les champs et la consultation associée.",
  INCOMPLETE_PRESCRIPTION: "Renseignez au moins un médicament avec son nom, sa posologie, sa fréquence et sa durée.",
  PDF_LAYOUT_OVERFLOW: "Le contenu dépasse une page A5. Réduisez ou réorganisez le brouillon avant de finaliser. Aucun texte n’a été tronqué.",
  PDF_UNSUPPORTED_CHARACTER: "Certains caractères, notamment le texte arabe saisi, ne peuvent pas être imprimés. Revoyez le brouillon avant de finaliser.",
  VERSION_CONFLICT: "Le dossier a changé. Vos saisies sont conservées. Rechargez explicitement les données avant de réessayer.",
  READ_ONLY: "Cette ordonnance ne peut plus être modifiée. Relisez son état actuel.",
  RENDERER_UNAVAILABLE: "La création du PDF est indisponible. La finalisation n’est pas confirmée. Relisez l’ordonnance avant de réessayer.",
  PRACTITIONER_UNAVAILABLE: "Le profil professionnel du dentiste doit être validé avant la finalisation. Contactez le responsable du cabinet.",
  DOCUMENT_UNAVAILABLE: "Le document ne peut pas être restitué ou sa finalisation confirmée. Relisez l’ordonnance avant de réessayer.",
};
export type PrescriptionErrorCode = keyof typeof codes;
const statuses: Record<number, string> = { 400: codes.INVALID_INPUT, 401: "Votre session a expiré. Reconnectez-vous.",
  403: "L’accès aux ordonnances est réservé au dentiste ou la vérification de sécurité a expiré.",
  404: "Ce patient ou cette ordonnance est introuvable.", 409: codes.VERSION_CONFLICT,
  413: "Le contenu dépasse la taille autorisée.", 422: "Vérifiez les champs transmis.",
  429: "Trop de demandes. Patientez avant de réessayer.",
};
const expectedStatus: Record<PrescriptionErrorCode, number> = { INVALID_INPUT: 400, INCOMPLETE_PRESCRIPTION: 400,
  PDF_LAYOUT_OVERFLOW: 400, PDF_UNSUPPORTED_CHARACTER: 400, VERSION_CONFLICT: 409, READ_ONLY: 409,
  RENDERER_UNAVAILABLE: 503, PRACTITIONER_UNAVAILABLE: 503, DOCUMENT_UNAVAILABLE: 500 };
export class PrescriptionApiError extends Error {
  constructor(public readonly status: number, public readonly code?: PrescriptionErrorCode) {
    super(code ? codes[code] : statuses[status] ?? "Le service des ordonnances est indisponible. Aucun enregistrement n’est confirmé. Relisez le dossier avant toute nouvelle tentative.");
    this.name = "PrescriptionApiError";
  }
}
/** Retain only a known code with its expected HTTP status, never backend prose/field values. */
export async function prescriptionFailure(status: number, response?: Response) {
  let code: PrescriptionErrorCode | undefined;
  if (response && /^application\/problem\+json(?:;|$)/i.test(response.headers.get("Content-Type") ?? "")) {
    try {
      const parsed = z.object({ status: z.literal(status), code: z.enum(Object.keys(codes) as [PrescriptionErrorCode, ...PrescriptionErrorCode[]]) }).safeParse(await response.json());
      if (parsed.success && expectedStatus[parsed.data.code] === status) code = parsed.data.code;
    } catch { /* Safe fallback by status. */ }
  }
  return new PrescriptionApiError(status, code);
}
