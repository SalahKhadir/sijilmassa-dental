import { z } from "zod";
import { createSessionRequest } from "../../api/session-request";
import { clinicalCursorSchema, clinicalHistorySchema, clinicalIdSchema, createConsultationSchema,
  expectedClinicalVersionSchema, persistentConsultationSchema, removedClinicalHistorySchema, clinicalOrder,
  treatmentMutationSchema, updateConsultationSchema,
  type ClinicalCursor, type CreateConsultation, type PersistentConsultation, type TreatmentMutation, type UpdateConsultation,
} from "./schemas";

export class ClinicalApiError extends Error {
  constructor(public readonly status: number) {
    const messages: Record<number, string> = {
      400: "Vérifiez les champs et le lien au rendez-vous.", 401: "Votre session a expiré. Reconnectez-vous.",
      403: "L’accès clinique est réservé au dentiste ou la vérification de sécurité a expiré.",
      404: "Ce patient, cette consultation ou ce soin est introuvable.",
      409: "Le dossier a changé ou cette action est en conflit avec son état actuel. Vos saisies sont conservées. Rechargez explicitement avant de réessayer.",
      413: "Le contenu dépasse la taille autorisée.", 429: "Trop de demandes. Patientez avant de réessayer.",
      500: "Le serveur n’a pas confirmé l’enregistrement. Vérifiez le dossier avant toute nouvelle tentative.",
      502: "La réponse du serveur ne peut pas être vérifiée. Vérifiez le dossier avant toute nouvelle tentative.",
      503: "Le service clinique est indisponible. Vérifiez le dossier avant toute nouvelle tentative.",
    };
    super(messages[status] ?? "Cette opération clinique n’a pas pu être confirmée.");
    this.name = "ClinicalApiError";
  }
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ClinicalApiError(400);
  return parsed.data;
}
/** Internal same-origin client. The caller supplies the current UI permission; Spring remains authoritative. */
export function createConsultationApi({ canAccess, fetcher = fetch, unauthenticated = () => {} }: {
  canAccess: () => boolean; fetcher?: typeof fetch; unauthenticated?: () => void;
}) {
  const allow = () => { if (!canAccess()) throw new ClinicalApiError(403); };
  const guardedFetch: typeof fetch = async (url, options) => {
    allow(); const response = await fetcher(url, options); allow(); return response;
  };
  const request = createSessionRequest(guardedFetch, unauthenticated, status => new ClinicalApiError(status));
  const scope = (patientId: string, id: string, suffix = "") => {
    allow(); parse(clinicalIdSchema, patientId); parse(clinicalIdSchema, id);
    return `/api/v1/consultations/${id}${suffix}?${new URLSearchParams({ patientId })}`;
  };
  const treatmentPath = (patientId: string, id: string, treatmentId: string, suffix = "") => {
    parse(clinicalIdSchema, treatmentId); return scope(patientId, id, `/treatments/${treatmentId}${suffix}`);
  };
  function scoped(result: PersistentConsultation, patientId: string, id?: string, version?: number) {
    if (result.patientId.toLowerCase() !== patientId.toLowerCase() || (id !== undefined && result.id.toLowerCase() !== id.toLowerCase())
      || (version !== undefined && result.version !== version + 1)) throw new ClinicalApiError(502);
    return result;
  }
  return {
    async create(input: CreateConsultation) {
      allow(); const body = parse(createConsultationSchema, input);
      const result = scoped(await request("/api/v1/consultations", persistentConsultationSchema, "POST", body), body.patientId);
      if (result.version !== 0 || result.status !== "BROUILLON") throw new ClinicalApiError(502);
      return result;
    },
    async get(patientId: string, id: string) {
      return scoped(await request(scope(patientId, id), persistentConsultationSchema), patientId, id);
    },
    async update(patientId: string, id: string, input: UpdateConsultation) {
      const path = scope(patientId, id), body = parse(updateConsultationSchema, input);
      return scoped(await request(path, persistentConsultationSchema, "PUT", body), patientId, id, body.version);
    },
    async addTreatment(patientId: string, id: string, input: TreatmentMutation) {
      const path = scope(patientId, id, "/treatments"), body = parse(treatmentMutationSchema, input);
      return scoped(await request(path, persistentConsultationSchema, "POST", body), patientId, id, body.version);
    },
    async editTreatment(patientId: string, id: string, treatmentId: string, input: TreatmentMutation) {
      const path = treatmentPath(patientId, id, treatmentId), body = parse(treatmentMutationSchema, input);
      return scoped(await request(path, persistentConsultationSchema, "PUT", body), patientId, id, body.version);
    },
    async removeTreatment(patientId: string, id: string, treatmentId: string, version: number) {
      const path = treatmentPath(patientId, id, treatmentId, "/removal"), body = parse(expectedClinicalVersionSchema, { version });
      return scoped(await request(path, persistentConsultationSchema, "PUT", body), patientId, id, version);
    },
    async finalize(patientId: string, id: string, version: number) {
      const path = scope(patientId, id, "/finalization"), body = parse(expectedClinicalVersionSchema, { version });
      const result = scoped(await request(path, persistentConsultationSchema, "PUT", body), patientId, id, version);
      if (result.status !== "TERMINEE") throw new ClinicalApiError(502);
      return result;
    },
    async history(patientId: string, before?: ClinicalCursor) {
      allow(); parse(clinicalIdSchema, patientId);
      const params = new URLSearchParams({ patientId });
      if (before !== undefined) { const c = parse(clinicalCursorSchema, before); params.set("beforeDate", c.date); params.set("beforeId", c.id); }
      const page = await request(`/api/v1/consultations?${params}`, clinicalHistorySchema);
      if (before && page.items.some(i => clinicalOrder({ date: i.consultationDate, id: i.id }, before) >= 0)) throw new ClinicalApiError(502);
      return page;
    },
    async removedTreatments(patientId: string, id: string, after?: ClinicalCursor) {
      let path = scope(patientId, id, "/treatments/removed");
      if (after !== undefined) { const c = parse(clinicalCursorSchema, after); path += `&${new URLSearchParams({ afterDate: c.date, afterId: c.id })}`; }
      const page = await request(path, removedClinicalHistorySchema);
      if (after && page.items.some(i => clinicalOrder({ date: i.treatment.content.treatmentDate, id: i.treatment.id }, after) <= 0)) throw new ClinicalApiError(502);
      return page;
    },
  };
}
export type ConsultationApi = ReturnType<typeof createConsultationApi>;
