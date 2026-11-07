"use client";
import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { clinicDate } from "@/lib/patients/dates";
import { emptyPrescription } from "@/lib/prescriptions/schema";
import { usePrescriptionData } from "./use-prescription-data";
import { PrescriptionForm } from "./prescription-form";
import {
  PrescriptionErrorState,
  PrescriptionLoading,
  PrescriptionMissing,
  PrescriptionNotice,
} from "./prescription-states";
export function PrescriptionFormPage({
  id,
  patientId = "",
  consultationId = "",
}: {
  id?: string;
  patientId?: string;
  consultationId?: string;
}) {
  const { state, retry } = usePrescriptionData();
  if (state.status === "loading") return <PrescriptionLoading />;
  if (state.status === "error") return <PrescriptionErrorState retry={retry} />;
  const { prescriptions, patients, consultations } = state.data;
  const prescription = prescriptions.find((record) => record.id === id);
  if (id && !prescription) return <PrescriptionMissing />;
  if (prescription?.status === "FINALISEE")
    return (
      <>
        <PrescriptionMissing message="Cette ordonnance finalisée est en lecture seule." />
        <Button asChild>
          <Link href={`/documents/ordonnances/${id}`}>Voir l’ordonnance</Link>
        </Button>
      </>
    );
  const consultation = consultations.find(
    (record) => record.id === consultationId,
  );
  const selectedPatientId =
    prescription?.patientId ?? (patientId || consultation?.patientId || "");
  if (
    selectedPatientId &&
    !patients.some((patient) => patient.id === selectedPatientId)
  )
    return <PrescriptionMissing message="Ce patient est introuvable." />;
  if (
    consultationId &&
    (!consultation || consultation.patientId !== selectedPatientId)
  )
    return (
      <PrescriptionMissing message="Le lien de consultation est invalide pour ce patient." />
    );
  return (
    <>
      <PageHeading
        eyebrow="Espace dentiste"
        title={
          prescription
            ? "Modifier le brouillon d’ordonnance"
            : "Nouvelle ordonnance"
        }
        description="Saisissez les médicaments et instructions validés par le dentiste."
      />
      <PrescriptionNotice />
      <PrescriptionForm
        key={id ?? `${selectedPatientId}-${consultationId}`}
        prescription={prescription}
        initial={
          prescription ?? {
            ...emptyPrescription(clinicDate()),
            patientId: selectedPatientId,
            consultationId,
          }
        }
        patients={patients}
        consultations={consultations}
      />
    </>
  );
}
