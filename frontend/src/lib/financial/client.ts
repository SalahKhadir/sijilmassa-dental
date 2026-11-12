import { z } from "zod";
import { createSessionRequest } from "../api/session-request";
import * as schemas from "./schemas";
import type { ChargeCursor, CreateCharge, FinancialConflict, PaymentCursor, RecordPayment } from "./schemas";

const base = "/api/v1/financial";
const conflicts: Record<FinancialConflict, string> = {
  VERSION_CONFLICT: "Le dossier a changé. Vérifiez les données actualisées avant de confirmer à nouveau.",
  OVERPAYMENT: "Le montant dépasse le reste à payer.",
  OPERATION_CONFLICT: "Cette référence d’encaissement est déjà utilisée. Vérifiez l’historique du soin.",
  DUPLICATE_CHARGE: "Un prix est déjà enregistré pour ce soin.",
  ARCHIVED_PATIENT: "Ce patient est archivé. Seule la consultation de l’historique est possible.",
  CONSULTATION_FINALIZED: "La consultation est finalisée. Le prix ne peut plus être attribué.",
  INELIGIBLE_TREATMENT: "Ce soin a été retiré. Il ne peut plus être tarifé.",
};
const statuses: Record<number, string> = {
  400: "Vérifiez les champs de la demande.", 401: "Votre session a expiré. Reconnectez-vous.",
  403: "Accès refusé ou vérification de sécurité expirée.", 404: "Ce patient ou ce soin est introuvable.",
  409: "L’opération est en conflit avec les données du dossier.", 413: "La demande dépasse la taille autorisée.",
  415: "Le format de la demande est invalide.", 429: "Trop de demandes. Patientez avant de réessayer.",
};
export class FinancialApiError extends Error {
  constructor(public readonly status: number, public readonly code?: FinancialConflict) {
    super((code && conflicts[code]) || statuses[status] || "Le service financier ne répond pas ou sa réponse ne peut pas être vérifiée.");
    this.name = "FinancialApiError";
  }
}
async function failure(status: number, response?: Response) {
  if (status === 409 && response?.headers.get("Content-Type")?.startsWith("application/problem+json")) {
    try {
      const problem = schemas.financialProblem.safeParse(await response.json());
      if (problem.success && problem.data.status === status) return new FinancialApiError(status, problem.data.code);
    } catch { /* The remote error body is untrusted. */ }
  }
  return new FinancialApiError(status);
}
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new FinancialApiError(400);
  return parsed.data;
}
function pathWithQuery(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return query ? `${path}?${query}` : path;
}
export function createFinancialApi({ access, signal, fetcher = fetch, unauthenticated = () => {} }: {
  access: () => "DENTIST" | "RECEPTIONIST" | undefined;
  signal?: AbortSignal | (() => AbortSignal | undefined); fetcher?: typeof fetch; unauthenticated?: () => void;
}) {
  function allowed(dentist = false) {
    const role = access();
    if (!role || (dentist && role !== "DENTIST")) throw new FinancialApiError(403);
  }
  const guardedFetch: typeof fetch = async (url, options) => {
    const lifetime = typeof signal === "function" ? signal() : signal;
    if (lifetime?.aborted) throw new FinancialApiError(503);
    allowed();
    const signals = [lifetime, options?.signal].filter((item): item is AbortSignal => Boolean(item));
    const result = await fetcher(url, { ...options, signal: AbortSignal.any(signals) });
    if (lifetime?.aborted || !access()) throw new FinancialApiError(503);
    return result;
  };
  const request = createSessionRequest(guardedFetch, unauthenticated, failure);
  const id = (value: string) => parse(schemas.financialId, value);
  const chargePath = (patientId: string, chargeId: string, suffix = "") => `${base}/charges/${id(chargeId)}${suffix}?patientId=${id(patientId)}`;
  function patientPath(patientId: string, view: "summary" | "verso", cursor?: ChargeCursor) {
    const next = cursor && parse(schemas.chargeCursor, cursor);
    return pathWithQuery(`${base}/patients/${id(patientId)}/${view}`, next ? { afterDate: next.date, afterChargeId: next.chargeId } : {});
  }
  return {
    async consultationPricing(record: { id: string; patientId: string; version: number; treatments: readonly { id: string }[] }) {
      allowed(true);
      const path = pathWithQuery(`${base}/consultations/${id(record.id)}/pricing`, { patientId: id(record.patientId) });
      const snapshot = await request(path, schemas.consultationPricing);
      allowed(true);
      if (snapshot.patientId.toLowerCase() !== record.patientId.toLowerCase()
        || snapshot.consultationId.toLowerCase() !== record.id.toLowerCase()) throw new FinancialApiError(502);
      if (snapshot.consultationVersion !== record.version) throw new FinancialApiError(409, "VERSION_CONFLICT");
      const prices = new Map(snapshot.items.map(item => [item.treatmentId.toLowerCase(), item]));
      if (prices.size !== record.treatments.length || record.treatments.some(t => !prices.has(t.id.toLowerCase()))) {
        throw new FinancialApiError(502);
      }
      return prices;
    },
    async create(input: CreateCharge) {
      allowed(true);
      const body = parse(schemas.createCharge, input);
      const value = await request(`${base}/charges`, schemas.charge, "POST", body);
      if (value.version !== 0 || value.priceMinor !== body.priceMinor || value.receivedMinor !== 0) throw new FinancialApiError(502);
      return value;
    },
    async get(patientId: string, chargeId: string) {
      const value = await request(chargePath(patientId, chargeId), schemas.charge);
      if (value.chargeId.toLowerCase() !== chargeId.toLowerCase()) throw new FinancialApiError(502);
      return value;
    },
    history(patientId: string, chargeId: string, cursor?: PaymentCursor) {
      const next = cursor && parse(schemas.paymentCursor, cursor);
      const path = chargePath(patientId, chargeId, "/payments");
      const suffix = next ? `&${new URLSearchParams({ afterPaidAt: next.paidAt, afterPaymentId: next.paymentId })}` : "";
      return request(path + suffix, schemas.payments);
    },
    async pay(patientId: string, chargeId: string, input: RecordPayment) {
      const body = parse(schemas.recordPayment, input);
      const value = await request(chargePath(patientId, chargeId, "/payments"), schemas.receipt, "POST", body);
      const timestamp = (iso: string) => iso.replace(/(?:\.(\d{1,6}))?Z$/, (_, digits: string | undefined) => `.${(digits ?? "").padEnd(6, "0")}Z`);
      if (value.charge.chargeId.toLowerCase() !== chargeId.toLowerCase() || value.payment.amountMinor !== body.amountMinor
        || value.payment.method !== body.method || timestamp(value.payment.paidAt) !== timestamp(body.paidAt)) throw new FinancialApiError(502);
      return value;
    },
    summary(patientId: string, cursor?: ChargeCursor) {
      return request(patientPath(patientId, "summary", cursor), schemas.summary);
    },
    verso(patientId: string, cursor?: ChargeCursor) {
      return request(patientPath(patientId, "verso", cursor), schemas.verso);
    },
  };
}
export type FinancialApi = ReturnType<typeof createFinancialApi>;
