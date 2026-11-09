import { z } from "zod";
import { patientSchema } from "../schema";
import { clinicDate } from "../dates";
import type { CreatePatientInput } from "../types";

const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const fields = patientSchema().shape;
export const identitySchema = fields.identity.extend({ dateOfBirth: z.string().nullable() }).strict();
export const administrativeSchema = z.object({
  id: z.uuid(), reference: z.string().regex(/^PAT-\d{6,19}$/), identity: identitySchema,
  status: fields.status, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), version,
}).strict();
export const medicalContentSchema = z.object({ questionnaireVersion: z.literal(1),
  medicalHistory: fields.medicalHistory, allergies: fields.allergies, healthQuestionnaire: fields.healthQuestionnaire }).strict();
export const medicalSchema = z.object({ patientId: z.uuid(), version, createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(), record: medicalContentSchema }).strict();
export const directoryEntrySchema = administrativeSchema.omit({ updatedAt: true, identity: true }).extend({
  identity: identitySchema.pick({ firstName: true, lastName: true, sex: true, dateOfBirth: true, gsm: true, landline: true }),
}).strict();
export const directorySchema = z.object({ items: z.array(directoryEntrySchema), total: version,
  page: z.number().int().min(1).max(100000), pageSize: z.number().int().min(1).max(50), pageCount: version.min(1) }).strict();
export type AdministrativePatient = z.infer<typeof administrativeSchema>;
export type MedicalRecord = z.infer<typeof medicalSchema>;
export type MedicalContent = z.infer<typeof medicalContentSchema>;
export type DirectoryPage = z.infer<typeof directorySchema>;
export type AdministrativeInput = Pick<AdministrativePatient, "identity" | "status">;
export type PatientQuery = { q: string; status: "active" | "inactive" | "all"; sort: "name" | "newest" | "oldest"; page: number; pageSize: number };
const messages: Record<number, string> = {
  400: "Vérifiez les champs : certaines valeurs ne sont pas acceptées.",
  401: "Votre session a expiré. Reconnectez-vous.", 403: "Cette opération n’est pas autorisée ou sa vérification de sécurité a expiré.",
  404: "Ce patient est introuvable.", 409: "Le dossier a changé ou le patient est inactif. Rechargez les données avant toute nouvelle modification.",
  429: "Trop de demandes. Patientez avant de réessayer.",
};
export class PatientApiError extends Error {
  constructor(public readonly status: number) {
    super(messages[status] ?? "Le serveur est indisponible. Réessayez plus tard. Aucun enregistrement n’est confirmé.");
    this.name = "PatientApiError";
  }
}
export function administrativeInput(values: CreatePatientInput): AdministrativeInput {
  return { identity: { ...values.identity, dateOfBirth: values.identity.dateOfBirth || null }, status: values.status };
}
export function medicalInput(values: CreatePatientInput): MedicalContent {
  return { questionnaireVersion: 1, medicalHistory: values.medicalHistory, allergies: values.allergies,
    healthQuestionnaire: values.healthQuestionnaire };
}
export function persistentFormSchema() {
  return patientSchema(clinicDate()).superRefine((value, context) => {
    for (const key of ["gsm", "landline"] as const) if (/[xX]/.test(value.identity[key])) context.addIssue({
      code: "custom", path: ["identity", key], message: "Saisissez les chiffres du numéro, sans X de démonstration.",
    });
  });
}
/** Local to its owning screen; no patient cache or token shared with prototype providers. */
export function createPatientApi(fetcher: typeof fetch = fetch, unauthenticated: () => void = () => {}) {
  async function request<T>(path: string, schema: z.ZodType<T>, method = "GET", body?: unknown): Promise<T> {
    try {
      const headers: Record<string, string> = {};
      if (method !== "GET") {
        const csrf = await fetcher("/api/v1/auth/csrf", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (!csrf.ok) throw new PatientApiError(csrf.status);
        const token = z.object({ headerName: z.literal("X-CSRF-TOKEN"), token: z.string().min(1).max(512) }).safeParse(await csrf.json());
        if (!token.success) throw new PatientApiError(502);
        headers[token.data.headerName] = token.data.token;
        headers["Content-Type"] = "application/json";
      }
      const response = await fetcher(`/api/v1/patients${path}`, { method, headers, credentials: "same-origin", cache: "no-store",
        redirect: "error", signal: AbortSignal.timeout(10000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (!response.ok) throw new PatientApiError(response.status);
      const result = schema.safeParse(await response.json());
      if (!result.success) throw new PatientApiError(502);
      return result.data;
    } catch (error) {
      const failure = error instanceof PatientApiError ? error : new PatientApiError(503);
      if (failure.status === 401) unauthenticated();
      throw failure;
    }
  }
  function id(value: string) {
    if (!z.uuid().safeParse(value).success) throw new PatientApiError(404);
    return value;
  }
  function checkedVersion(value: number) { return version.parse(value); }
  return {
    list: (query: PatientQuery) => request(`?${new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]))}`, directorySchema),
    get: (value: string) => request(`/${id(value)}`, administrativeSchema),
    create: (input: AdministrativeInput) => request("", administrativeSchema, "POST", input),
    createComplete: (patient: AdministrativeInput, medicalRecord: MedicalContent) => request("/with-medical-record",
      z.object({ patient: administrativeSchema, medicalRecord: medicalSchema }).strict(), "POST", { patient, medicalRecord }),
    update: (value: string, currentVersion: number, input: AdministrativeInput) => request(`/${id(value)}`, administrativeSchema, "PUT", { ...input, version: checkedVersion(currentVersion) }),
    medical: (value: string) => request(`/${id(value)}/medical-record`, medicalSchema),
    updateMedical: (value: string, currentVersion: number, record: MedicalContent) => request(`/${id(value)}/medical-record`, medicalSchema, "PUT", { version: checkedVersion(currentVersion), record }),
    archive: (patient: AdministrativePatient, status: "active" | "inactive") => request(`/${id(patient.id)}`, administrativeSchema, "PUT", { identity: patient.identity, status, version: checkedVersion(patient.version) }),
  };
}
