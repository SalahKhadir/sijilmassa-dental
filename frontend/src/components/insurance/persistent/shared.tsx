"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { useSessionBillingApi } from "@/components/financial/session";
import { Button } from "@/components/ui/button";
import { createConsultationApi } from "@/lib/consultations/api/client";
import { createFinancialApi } from "@/lib/financial/client";
import type { TreatmentPricing } from "@/lib/financial/schemas";
import { createInsuranceApi, InsuranceApiError } from "@/lib/insurance/api/client";
import { createPatientApi } from "@/lib/patients/api/client";
import type { DocumentType, Purpose } from "@/lib/insurance/api/schemas";

export const familyLabels: Record<DocumentType, string> = {
  CNSS_DENTAIRE: "CNSS — Feuille de soins dentaires",
  CNOPS_DENTAIRE: "CNOPS — Feuille de soins dentaires",
  FAR_DENTAIRE: "FAR — Document de soins dentaires",
};
export const purposeLabels: Record<Purpose, string> = {
  ENTENTE_PREALABLE: "Entente préalable", EXECUTION: "Soins exécutés", DEVIS: "Devis", RECUS: "Reçus",
};
export const careLabels = {
  SOINS: "Soins dentaires", PROTHESE: "Prothèse", ORTHODONTIE_FACIALE: "Orthodontie faciale",
  ORTHODONTIE_ODF: "Orthodontie (ODF)", AUTRES: "Autres soins",
};
export const relationshipLabels = { LUI_MEME: "Le patient est l’assuré", CONJOINT: "Conjoint de l’assuré", ENFANT: "Enfant de l’assuré" };
export const contextLabels = { MALADIE: "Maladie", MATERNITE: "Maternité", ACCIDENT: "Accident" };
export const symbolLabels = { CERCLE: "Cercle", CROIX: "Croix" };

export const historyHref = (patientId: string) => `/patients/${patientId}/assurances`;
export const detailHref = (patientId: string, documentId: string) => `/documents/assurances/${documentId}?patientId=${patientId}`;
export const newHref = (patientId: string, consultationId?: string) =>
  `/documents/assurances/nouvelle?patientId=${patientId}${consultationId ? `&consultationId=${consultationId}` : ""}`;
export const consultationHref = (patientId: string, consultationId: string) => `/consultations/${consultationId}?patientId=${patientId}`;

function createWorkspaceApi(options: Parameters<typeof createInsuranceApi>[0]) {
  const allowed = () => options.access() === "DENTIST";
  const fetchRead: typeof fetch = async (url, request) => {
    const signal = options.signal();
    if (!allowed() || !signal || signal.aborted) throw new InsuranceApiError(403);
    const response = await fetch(url, { ...request, signal: AbortSignal.any(request?.signal ? [signal, request.signal] : [signal]) });
    if (signal.aborted || !allowed()) throw new InsuranceApiError(403);
    return response;
  };
  const patients = createPatientApi(fetchRead, options.unauthenticated);
  const clinical = createConsultationApi({ canAccess: allowed, fetcher: fetchRead, unauthenticated: options.unauthenticated });
  const financial = createFinancialApi(options);
  return {
    insurance: createInsuranceApi(options),
    async patient(patientId: string) {
      const patient = await patients.get(patientId);
      if (patient.id.toLowerCase() !== patientId.toLowerCase()) throw new InsuranceApiError(502);
      return patient;
    },
    consultationHistory: clinical.history,
    async consultation(patientId: string, consultationId: string, withPricing: boolean) {
      const record = await clinical.get(patientId, consultationId);
      const prices = withPricing && record.treatments.length ? await financial.consultationPricing(record) : new Map<string, TreatmentPricing>();
      return {
        id: record.id, version: record.version, date: record.content.consultationDate, finalized: record.status === "TERMINEE",
        treatments: record.treatments.map(treatment => ({
          id: treatment.id, date: treatment.content.treatmentDate, description: treatment.content.description,
          tooth: treatment.content.toothReference,
          price: prices.get(treatment.id.toLowerCase()),
        })),
      };
    },
  };
}
export type WorkspaceApi = ReturnType<typeof createWorkspaceApi>;
export type ConsultationSource = Awaited<ReturnType<WorkspaceApi["consultation"]>>;

export function InsuranceBoundary({ children }: { children: (api: WorkspaceApi, owner: string) => React.ReactNode }) {
  const { api, role, owner } = useSessionBillingApi(createWorkspaceApi);
  const { state, checking } = useAuth();
  if (checking || state.status !== "authenticated") return null;
  if (role !== "DENTIST" || !owner) return <p role="alert">Accès réservé au dentiste.</p>;
  return children(api, owner);
}

export function InsuranceFailure({ error, retry, retryLabel = "Réessayer la lecture" }: { error: unknown; retry?: () => void; retryLabel?: string }) {
  const message = error instanceof Error && "status" in error ? error.message : "Les données d’assurance n’ont pas pu être chargées.";
  return <div className="space-y-2">
    <p role="alert" className="rounded-md border border-danger/40 bg-surface p-3 text-sm">{message}</p>
    {retry && <Button type="button" variant="outline" onClick={retry}>{retryLabel}</Button>}
  </div>;
}
