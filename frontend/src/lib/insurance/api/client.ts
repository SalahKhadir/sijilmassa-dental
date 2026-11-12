import { z } from "zod";
import { createSessionRequest, createSessionResponse } from "../../api/session-request";
import { MAX_INSURANCE_PDF_BYTES, readPdfDownload } from "../../api/pdf-download";
import type { Role } from "../../auth/types";
import * as schemas from "./schemas";
import type { Draft, InsuranceCursor, InsuranceDetail } from "./schemas";

const base = "/api/v1/insurance-documents";
const codes: Record<z.infer<typeof schemas.problemCode>, string> = {
  INVALID_INPUT: "Vérifiez les champs du document.",
  UNSUPPORTED_TEMPLATE: "Cette version du formulaire d’assurance n’est pas prise en charge.",
  INVALID_TREATMENT: "Un soin sélectionné ne fait plus partie de la consultation. Vérifiez les actes.",
  INVALID_CHARGE: "Un prix associé ne correspond plus au soin. Vérifiez les actes.",
  NOT_FOUND: "Ce document ou ce patient est introuvable.",
  VERSION_CONFLICT: "Le dossier a changé depuis sa dernière lecture.",
  INVALID_CONSULTATION: "La consultation sélectionnée n’est pas admissible pour ce document.",
  ARCHIVED_PATIENT: "Ce patient est archivé. Ses documents restent consultables.",
  READ_ONLY: "Ce document est finalisé. Il est en lecture seule.",
  INCOMPLETE_DOCUMENT: "Renseignez les champs manquants avant de finaliser.",
  STORAGE_FAILURE: "Le serveur n’a pas confirmé l’enregistrement.",
  INSURANCE_PDF_NOT_FINALIZED: "Finalisez le document pour télécharger le formulaire.",
  INSURANCE_PDF_FAR_UNAVAILABLE: "PDF FAR indisponible. La référence de compte, les frais à déclarer et les justificatifs de paiement restent à confirmer.",
  INSURANCE_PDF_TEMPLATE_UNSUPPORTED: "Cette version du formulaire PDF n’est pas prise en charge.",
  INSURANCE_PDF_LAYOUT_OVERFLOW: "Une valeur dépasse la place disponible sur le formulaire. Le PDF n’a pas été généré.",
  INSURANCE_PDF_UNSUPPORTED_TEXT: "Le formulaire contient des caractères que le rendu PDF ne prend pas en charge.",
  INSURANCE_PDF_INTEGRITY: "Le formulaire ou les données enregistrées n’ont pas pu être vérifiés.",
  INSURANCE_PDF_RENDER_FAILED: "Le serveur n’a pas pu préparer le formulaire PDF.",
  INSURANCE_PDF_BUSY: "Le serveur prépare d’autres formulaires. Réessayez dans un instant.",
};
const statuses: Record<number, string> = {
  400: "Vérifiez les champs du document.",
  401: "Votre session a expiré. Reconnectez-vous.",
  403: "Accès refusé ou vérification de sécurité expirée.",
  404: codes.NOT_FOUND,
  409: "Le dossier a changé ou l’opération est incompatible avec son état actuel.",
  413: "Le document dépasse la taille autorisée.",
  415: "Le format de la demande est invalide.",
  429: "Trop de demandes. Patientez avant de réessayer.",
  502: "Le serveur a renvoyé un document illisible ou une version du formulaire non prise en charge.",
};
export class InsuranceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: z.infer<typeof schemas.problemCode>,
    public readonly requestId?: string,
  ) {
    super((code && codes[code]) || statuses[status] || "Le service des documents d’assurance est indisponible.");
    this.name = "InsuranceApiError";
  }
}
async function failure(status: number, response?: Response) {
  if (response?.headers.get("Content-Type")?.startsWith("application/problem+json")) {
    try {
      const parsed = schemas.insuranceProblem.safeParse(await response.json());
      if (parsed.success && parsed.data.status === status) {
        const code = schemas.problemCode.safeParse(parsed.data.code);
        return new InsuranceApiError(status, code.data, parsed.data.requestId);
      }
    } catch { /* Discard untrusted error content. */ }
  }
  return new InsuranceApiError(status);
}
function input<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new InsuranceApiError(400);
  return parsed.data;
}
const id = (value: string) => input(schemas.insuranceId, value).toLowerCase();

export function createInsuranceApi({ access, signal, unauthenticated, fetcher = fetch }: {
  access: () => Role | undefined;
  signal: () => AbortSignal | undefined;
  unauthenticated: () => void;
  fetcher?: typeof fetch;
}) {
  const allow = (lifetime = signal()) => {
    if (lifetime?.aborted || access() !== "DENTIST") throw new InsuranceApiError(403);
  };
  const guardedFetch: typeof fetch = async (url, options) => {
    const lifetime = signal();
    allow(lifetime);
    const combined = AbortSignal.any([lifetime, options?.signal].filter((value): value is AbortSignal => Boolean(value)));
    const result = await fetcher(url, { ...options, signal: combined });
    allow(lifetime);
    return result;
  };
  const request = createSessionRequest(guardedFetch, unauthenticated, failure);
  const path = (patientId: string, documentId: string, suffix = "") => `${base}/${id(documentId)}${suffix}?patientId=${id(patientId)}`;
  const pdfRequest = createSessionResponse((url, options) => guardedFetch(url, {
    ...options, signal: AbortSignal.timeout(30000),
  }), unauthenticated, failure);
  function scoped(detail: InsuranceDetail, patientId: string, documentId?: string) {
    allow();
    if (detail.patientId !== id(patientId) || (documentId && detail.documentId !== id(documentId))) throw new InsuranceApiError(502);
    return detail;
  }
  function updated(value: InsuranceDetail, prior: InsuranceDetail, lifecycle: InsuranceDetail["lifecycle"]) {
    const detail = scoped(value, prior.patientId, prior.documentId);
    if (detail.version !== prior.version + 1 || detail.lifecycle !== lifecycle
      || detail.documentType !== prior.documentType || detail.purpose !== prior.purpose
      || (detail.consultationId ?? null) !== (prior.consultationId ?? null)) throw new InsuranceApiError(502);
    return detail;
  }
  return {
    async history(patientId: string, cursor?: InsuranceCursor) {
      const params = cursor ? `?${new URLSearchParams(input(schemas.cursorSchema, cursor))}` : "";
      const page = await request(`/api/v1/patients/${id(patientId)}/insurance-documents${params}`, schemas.historyPage);
      allow();
      // Preserve the exact UTC cursor string from Spring, including microseconds.
      const key = (stamp: string, id: string) => `${stamp.split(".")[0].replace("Z", "")}.${(stamp.split(".")[1] ?? "").replace("Z", "").padEnd(9, "0")}:${id}`;
      const keys = page.items.map(row => key(row.createdAt, row.documentId));
      const next = page.nextCursor;
      if (keys.some((value, index) => index > 0 && value >= keys[index - 1])
        || (cursor && keys.some(value => value >= key(cursor.afterCreatedAt, cursor.afterDocumentId)))
        || (next && (keys.length !== 50 || keys.at(-1) !== key(next.afterCreatedAt, next.afterDocumentId)))) throw new InsuranceApiError(502);
      return page;
    },
    async get(patientId: string, documentId: string) {
      return scoped(await request(path(patientId, documentId), schemas.detailSchema), patientId, documentId);
    },
    async pdf(patientId: string, documentId: string) {
      const lifetime = signal();
      const response = await pdfRequest(path(patientId, documentId, "/pdf"));
      const file = await readPdfDownload(response, `formulaire-assurance-${id(documentId)}.pdf`, "X-Insurance-PDF-Bytes",
        () => new InsuranceApiError(502), MAX_INSURANCE_PDF_BYTES);
      allow(lifetime);
      return file;
    },
    async create(value: z.input<typeof schemas.createDraft>) {
      const body = input(schemas.createDraft, value);
      body.draft = input(schemas.insuranceDraftSchema(body.documentType, body.purpose), body.draft);
      const detail = scoped(await request(base, schemas.detailSchema, "POST", body), body.patientId);
      if (detail.version !== 0 || detail.lifecycle !== "BROUILLON" || detail.documentType !== body.documentType
        || detail.purpose !== body.purpose || (detail.consultationId ?? null) !== (body.consultationId?.toLowerCase() ?? null)) throw new InsuranceApiError(502);
      return detail;
    },
    async edit(detail: InsuranceDetail, draft: Draft) {
      const body = input(schemas.editDraft, { expectedVersion: detail.version, draft: input(schemas.insuranceDraftSchema(detail.documentType, detail.purpose), draft) });
      return updated(await request(path(detail.patientId, detail.documentId), schemas.detailSchema, "PUT", body), detail, "BROUILLON");
    },
    async finalize(detail: InsuranceDetail) {
      const body = input(schemas.finalizeDraft, { expectedVersion: detail.version, expectedPatientVersion: detail.beneficiary.version,
        expectedConsultationVersion: detail.consultation?.version });
      return updated(await request(path(detail.patientId, detail.documentId, "/finalize"), schemas.detailSchema, "POST", body), detail, "FINALISE");
    },
  };
}
export type InsuranceApi = ReturnType<typeof createInsuranceApi>;
