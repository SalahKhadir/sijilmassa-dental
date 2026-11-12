import { z } from "zod";
import { createSessionRequest } from "../api/session-request";
import type { Role } from "../auth/types";
import { financialId } from "../financial/schemas";
import * as schema from "./schemas";
import type { EligibleCursor, HistoryCursor, InvoiceConflict, InvoiceDetail } from "./schemas";

const conflicts: Record<InvoiceConflict, string> = {
  VERSION_CONFLICT: "Le brouillon a été modifié. Vérifiez la sélection avant de confirmer à nouveau.",
  CHARGE_RESERVED: "Un des soins est déjà réservé sur une autre facture.",
  INVOICE_ISSUED: "Cette facture a déjà été émise.",
  EMPTY_DRAFT: "Sélectionnez au moins un soin avant d’émettre la facture.",
  ARCHIVED_PATIENT: "Ce patient est archivé. Ses factures restent consultables.",
};
const errors: Record<number, string> = {
  400: "Vérifiez les informations de la demande.", 401: "Votre session a expiré. Reconnectez-vous.",
  403: "Accès refusé ou vérification de sécurité expirée.", 404: "Le patient, la facture ou le soin est introuvable.",
  409: "La facture ou les soins ont changé.", 413: "La demande dépasse la taille autorisée.",
  429: "Trop de demandes. Patientez avant de réessayer.",
};
export class InvoiceApiError extends Error {
  constructor(public readonly status: number, public readonly code?: InvoiceConflict) {
    super((code && conflicts[code]) || errors[status] || "La réponse du service de facturation n’a pas pu être vérifiée.");
    this.name = "InvoiceApiError";
  }
}
export function invoiceMessage(error: unknown) {
  return error instanceof InvoiceApiError ? error.message : "Impossible de charger la facturation.";
}
export function unknownInvoiceOutcome(error: unknown) {
  return !(error instanceof InvoiceApiError) || error.status >= 500 || error.status === 408;
}
async function failure(status: number, response?: Response) {
  if (status === 409 && response?.headers.get("content-type")?.startsWith("application/problem+json")) {
    try {
      const problem = schema.invoiceProblem.safeParse(await response.json());
      if (problem.success && problem.data.status === status) return new InvoiceApiError(status, problem.data.code);
    } catch { /* Keep the local error message. */ }
  }
  return new InvoiceApiError(status);
}
function checked<T>(validator: z.ZodType<T>, value: unknown) {
  const parsed = validator.safeParse(value);
  if (!parsed.success) throw new InvoiceApiError(400);
  return parsed.data;
}
const id = (value: string) => checked(financialId, value).toLowerCase();
const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const invoices = "/api/v1/invoices";
const detailPath = (patientId: string, invoiceId: string, suffix = "") => `${invoices}/${id(invoiceId)}${suffix}?patientId=${id(patientId)}`;
function scoped(value: InvoiceDetail, patientId: string, invoiceId?: string) {
  if (!sameId(value.patientId, patientId) || (invoiceId && !sameId(value.invoiceId, invoiceId))) throw new InvoiceApiError(502);
  return value;
}
function pagePath(patientId: string, route: "invoices" | "invoice-eligible-charges", cursor?: Record<string, string>) {
  return `/api/v1/patients/${id(patientId)}/${route}${cursor ? `?${new URLSearchParams(cursor)}` : ""}`;
}
function matchesSelection(value: InvoiceDetail, version: number, ids: string[]) {
  if (value.lifecycle !== "BROUILLON" || value.version !== version || value.draft.lines.length !== ids.length
    || value.draft.lines.some((line, index) => !sameId(line.chargeId, ids[index]))) throw new InvoiceApiError(502);
  return value;
}

export function createInvoiceApi({ access, signal, fetcher = fetch, unauthenticated = () => {} }: {
  access: () => Role | undefined; signal?: () => AbortSignal | undefined; fetcher?: typeof fetch; unauthenticated?: () => void;
}) {
  const guardedFetch: typeof fetch = async (url, options) => {
    const lifetime = signal?.();
    if (!access() || lifetime?.aborted) throw new InvoiceApiError(403);
    const signals = [lifetime, options?.signal].filter((item): item is AbortSignal => Boolean(item));
    const result = await fetcher(url, { ...options, signal: AbortSignal.any(signals) });
    if (lifetime?.aborted || !access()) throw new InvoiceApiError(503);
    return result;
  };
  const send = createSessionRequest(guardedFetch, unauthenticated, failure);
  async function request<T>(path: string, validator: z.ZodType<T>, method = "GET", body?: unknown) {
    const lifetime = signal?.();
    const result = await send(path, validator, method, body);
    if (lifetime?.aborted || !access()) throw new InvoiceApiError(503);
    return result;
  }
  return {
    async get(patientId: string, invoiceId: string) {
      return scoped(await request(detailPath(patientId, invoiceId), schema.invoiceDetail), patientId, invoiceId);
    },
    async create(patientId: string, chargeIds: string[]) {
      const body = checked(schema.createDraft, { patientId, chargeIds });
      return matchesSelection(scoped(await request(invoices, schema.invoiceDetail, "POST", body), patientId), 0, chargeIds);
    },
    async edit(patientId: string, invoiceId: string, expectedVersion: number, chargeIds: string[]) {
      const body = checked(schema.replaceDraft, { expectedVersion, chargeIds });
      const value = scoped(await request(detailPath(patientId, invoiceId), schema.invoiceDetail, "PUT", body), patientId, invoiceId);
      return matchesSelection(value, expectedVersion + 1, chargeIds);
    },
    async issue(patientId: string, invoiceId: string, expectedVersion: number) {
      const body = checked(schema.issueDraft, { expectedVersion });
      const value = scoped(await request(detailPath(patientId, invoiceId, "/issue"), schema.invoiceDetail, "POST", body), patientId, invoiceId);
      if (value.lifecycle !== "EMISE" || value.version !== expectedVersion + 1) throw new InvoiceApiError(502);
      return value;
    },
    history(patientId: string, cursor?: HistoryCursor) {
      return request(pagePath(patientId, "invoices", cursor && checked(schema.historyCursor, cursor)), schema.historyPage);
    },
    eligible(patientId: string, cursor?: EligibleCursor) {
      return request(pagePath(patientId, "invoice-eligible-charges", cursor && checked(schema.eligibleCursor, cursor)), schema.eligiblePage);
    },
  };
}
export type InvoiceApi = ReturnType<typeof createInvoiceApi>;
