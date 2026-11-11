"use client";
import Link from "next/link";
import { ClinicalBoundary } from "@/components/consultations/persistent/shared";
import { Button } from "@/components/ui/button";
import { PrescriptionApiError } from "@/lib/prescriptions/api/client";
import { PatientApiError } from "@/lib/patients/api/client";
import { ClinicalApiError } from "@/lib/consultations/api/client";
import type { PersistentPrescription } from "@/lib/prescriptions/api/schemas";
export { useClinicalLoad as usePrescriptionLoad } from "@/components/consultations/persistent/shared";
export const PrescriptionBoundary = ClinicalBoundary;
export function prescriptionHref(record: Pick<PersistentPrescription, "id" | "patientId">, suffix = "", notice?: string) {
  return `/documents/ordonnances/${record.id}${suffix}?${new URLSearchParams({ patientId: record.patientId, ...(notice ? { notice } : {}) })}`;
}
export function PrescriptionFailure({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof PrescriptionApiError || error instanceof PatientApiError || error instanceof ClinicalApiError
    ? error.message : "Les ordonnances ne peuvent pas être chargées.";
  return <section className="space-y-3 rounded-xl border bg-surface p-5"><p role="alert">{message}</p>
    {retry && <Button variant="outline" onClick={retry}>Recharger les données</Button>}</section>;
}
export function PrescriptionLoading() { return <p role="status" aria-live="polite">Chargement des ordonnances…</p>; }
export function PrescriptionNavigation({ patientId, consultationId }: { patientId: string; consultationId?: string | null }) {
  return <nav className="flex flex-wrap gap-4" aria-label="Navigation des ordonnances">
    <Link className="text-primary underline" href={`/patients/${patientId}`}>Fiche patient</Link>
    <Link className="text-primary underline" href={`/documents?patientId=${patientId}`}>Ordonnances du patient</Link>
    {consultationId && <Link className="text-primary underline" href={`/consultations/${consultationId}?patientId=${patientId}`}>Voir la consultation liée</Link>}
    <Link className="text-primary underline" href="/documents">Tous les patients</Link>
  </nav>;
}
export function StoredPrescriptionStatus({ status, archivedAt }: { status: "BROUILLON" | "FINALISEE"; archivedAt: string | null }) {
  return <span className="rounded-md border bg-surface px-3 py-1 text-sm font-semibold">{archivedAt ? "Brouillon archivé" : status === "FINALISEE" ? "Finalisée" : "Brouillon"}</span>;
}
