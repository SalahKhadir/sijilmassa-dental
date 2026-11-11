import { z } from "zod";
import { createSessionRequest } from "../../api/session-request";
import { appointmentStatusValues, appointmentTypeValues } from "../types";

export const integerVersion = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const appointmentSchema = z.object({ id: z.uuid(), patientId: z.uuid(), startAt: z.iso.datetime(), endAt: z.iso.datetime(),
  type: z.enum(appointmentTypeValues), status: z.enum(appointmentStatusValues), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), version: integerVersion,
}).strict().refine(value => Date.parse(value.startAt) < Date.parse(value.endAt));
export type PersistentAppointment = z.infer<typeof appointmentSchema>;
export const pageSchema = z.object({ items: z.array(appointmentSchema), total: integerVersion, page: z.number().int().min(1).max(100000),
  pageSize: z.number().int().min(1).max(100), pageCount: integerVersion.min(1) }).strict();
export type AppointmentInput = Pick<PersistentAppointment, "patientId" | "startAt" | "endAt" | "type">;
export type CalendarQuery = { from: string; to: string; patientId?: string };
export class AppointmentApiError extends Error {
  constructor(public readonly status: number) {
    const messages: Record<number, string> = {
      400: "Vérifiez le patient, la date, l’heure et la durée du rendez-vous.",
      401: "Votre session a expiré. Reconnectez-vous.", 403: "Cette action est refusée ou sa vérification de sécurité a expiré.",
      404: "Ce rendez-vous ou ce patient est introuvable.",
      409: "Le créneau est occupé, le rendez-vous a changé ou le patient est inactif. Choisissez un autre horaire ou rechargez les données avant de réessayer.",
      413: "Cette période contient trop de rendez-vous. Affichez une période plus courte.",
      429: "Trop de demandes. Patientez avant de réessayer.",
      500: "Une erreur du serveur empêche cette opération. Aucun enregistrement n’est confirmé.",
    };
    super(messages[status] ?? "Le service de rendez-vous est indisponible. Aucun enregistrement n’est confirmé. Réessayez plus tard.");
    this.name = "AppointmentApiError";
  }
}
function id(value: string) { if (!z.uuid().safeParse(value).success) throw new AppointmentApiError(404); return value; }
export function createAppointmentApi(fetcher: typeof fetch = fetch, unauthenticated: () => void = () => {}) {
  const request = createSessionRequest(fetcher, unauthenticated, status => new AppointmentApiError(status));
  return {
    get: (value: string) => request(`/api/v1/appointments/${id(value)}`, appointmentSchema),
    create: (input: AppointmentInput) => request("/api/v1/appointments", appointmentSchema, "POST", input),
    update: (value: string, version: number, input: AppointmentInput) => request(`/api/v1/appointments/${id(value)}`, appointmentSchema, "PUT", { ...input, version: integerVersion.parse(version) }),
    status: (value: string, version: number, status: PersistentAppointment["status"]) => request(`/api/v1/appointments/${id(value)}/status`, appointmentSchema, "PUT", { version: integerVersion.parse(version), status }),
    async list(query: CalendarQuery): Promise<PersistentAppointment[]> {
      const from = Date.parse(query.from), to = Date.parse(query.to);
      if (!z.iso.datetime({offset:true}).safeParse(query.from).success || !z.iso.datetime({offset:true}).safeParse(query.to).success || !Number.isFinite(from) || !Number.isFinite(to) || from >= to || to - from > 43 * 86400000) throw new AppointmentApiError(400);
      if (query.patientId) id(query.patientId);
      const all: PersistentAppointment[] = []; let total: number | undefined;
      for (let page = 1; page <= 100; page++) {
        const parameters = new URLSearchParams({ ...query, page: String(page), pageSize: "100" });
        const result = await request(`/api/v1/appointments?${parameters}`, pageSchema);
        if (result.page !== page || result.pageSize !== 100 || (total !== undefined && result.total !== total)) throw new AppointmentApiError(409);
        if (result.pageCount > 100) throw new AppointmentApiError(413);
        total = result.total; all.push(...result.items);
        if (page >= result.pageCount) {
          if (all.length !== total || new Set(all.map(value => value.id)).size !== all.length) throw new AppointmentApiError(409);
          return all;
        }
      }
      throw new AppointmentApiError(413);
    },
  };
}
