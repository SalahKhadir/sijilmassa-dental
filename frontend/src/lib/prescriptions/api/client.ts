import { z } from "zod";
import { createSessionRequest, createSessionResponse } from "../../api/session-request";
import { PrescriptionApiError, prescriptionFailure } from "./errors";
import { prescriptionPdf } from "./download";
import { createPrescriptionSchema, updatePrescriptionSchema, finalizePrescriptionSchema, expectedPrescriptionVersionSchema,
  persistentPrescriptionSchema, prescriptionHistorySchema, prescriptionHistoryQuerySchema, prescriptionIdSchema, prescriptionVersionSchema, prescriptionOrder,
  type CreatePrescription, type UpdatePrescription, type FinalizePrescription, type PersistentPrescription, type PrescriptionHistoryQuery } from "./schemas";
export { PrescriptionApiError } from "./errors";
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new PrescriptionApiError(400);
  return result.data;
}
export function createPrescriptionApi({ canAccess, fetcher = fetch, unauthenticated = () => {} }: {
  canAccess: () => boolean; fetcher?: typeof fetch; unauthenticated?: () => void;
}) {
  const allow = () => { if (!canAccess()) throw new PrescriptionApiError(403); };
  const guardedFetch: typeof fetch = async (url, init) => { allow(); const result = await fetcher(url, init); allow(); return result; };
  const request = createSessionRequest(guardedFetch, unauthenticated, prescriptionFailure);
  const response = createSessionResponse(guardedFetch, unauthenticated, prescriptionFailure);
  const scope = (patientId: string, id: string, suffix = "") => {
    allow(); parse(prescriptionIdSchema, patientId); parse(prescriptionIdSchema, id);
    return `/api/v1/prescriptions/${id}${suffix}?${new URLSearchParams({ patientId })}`;
  };
  function scoped(result: PersistentPrescription, patientId: string, id?: string, version?: number) {
    allow();
    if (result.patientId.toLowerCase() !== patientId.toLowerCase() || (id && result.id.toLowerCase() !== id.toLowerCase())
      || (version !== undefined && result.version !== version + 1)) throw new PrescriptionApiError(502);
    return result;
  }
  async function mutate(patientId: string, id: string, suffix: string, body: UpdatePrescription | FinalizePrescription | { version: number }) {
    if (body.version === Number.MAX_SAFE_INTEGER) throw new PrescriptionApiError(409);
    return scoped(await request(scope(patientId, id, suffix), persistentPrescriptionSchema, "PUT", body), patientId, id, body.version);
  }
  return {
    async create(input: CreatePrescription) {
      allow(); const body = parse(createPrescriptionSchema, input);
      const result = scoped(await request("/api/v1/prescriptions", persistentPrescriptionSchema, "POST", body), body.patientId);
      if (result.version !== 0 || result.status !== "BROUILLON" || result.archivedAt !== null
        || result.content.consultationId?.toLowerCase() !== body.content.consultationId?.toLowerCase()) throw new PrescriptionApiError(502);
      return result;
    },
    async get(patientId: string, id: string) { return scoped(await request(scope(patientId, id), persistentPrescriptionSchema), patientId, id); },
    async update(patientId: string, id: string, input: UpdatePrescription) {
      allow(); const body = parse(updatePrescriptionSchema, input);
      const result = await mutate(patientId, id, "", body);
      if (result.status !== "BROUILLON" || result.archivedAt !== null
        || result.content.consultationId?.toLowerCase() !== body.content.consultationId?.toLowerCase()) throw new PrescriptionApiError(502);
      return result;
    },
    async archive(patientId: string, id: string, version: number) {
      allow(); const result = await mutate(patientId, id, "/archival", parse(expectedPrescriptionVersionSchema, { version }));
      if (result.status !== "BROUILLON" || result.archivedAt === null) throw new PrescriptionApiError(502);
      return result;
    },
    async finalize(patientId: string, id: string, input: FinalizePrescription) {
      allow(); const result = await mutate(patientId, id, "/finalization", parse(finalizePrescriptionSchema, input));
      if (result.status !== "FINALISEE") throw new PrescriptionApiError(502);
      return result;
    },
    async history(input: PrescriptionHistoryQuery) {
      allow(); const query = parse(prescriptionHistoryQuerySchema, input);
      const params = new URLSearchParams({ patientId: query.patientId });
      for (const key of ["status", "archive", "consultationId"] as const) if (query[key] !== undefined) params.set(key, query[key]);
      if (query.before) { params.set("beforeDate", query.before.date); params.set("beforeId", query.before.id); }
      const page = await request(`/api/v1/prescriptions?${params}`, prescriptionHistorySchema);
      allow();
      if (page.items.some(i => (query.status && i.status !== query.status)
        || (query.consultationId && i.consultationId?.toLowerCase() !== query.consultationId.toLowerCase())
        || ((query.archive ?? "active") === "active" && i.archivedAt !== null)
        || (query.archive === "archived" && i.archivedAt === null)
        || (query.before && prescriptionOrder({ date: i.issuedDate, id: i.id }, query.before) >= 0))) throw new PrescriptionApiError(502);
      return page;
    },
    async download(patientId: string, id: string, version: number) {
      const path = scope(patientId, id, "/pdf"); parse(prescriptionVersionSchema, version);
      const result = await prescriptionPdf(await response(`${path}&${new URLSearchParams({ version: String(version), disposition: "attachment" })}`), id);
      allow(); return result;
    },
  };
}
export type PrescriptionApi = ReturnType<typeof createPrescriptionApi>;
