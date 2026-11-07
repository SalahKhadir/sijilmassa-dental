"use client";
import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { clinicDate } from "@/lib/patients/dates";
import { emptyConsultation } from "@/lib/consultations/schema";
import { useClinicalData } from "./use-clinical-data";
import {
  ClinicalError,
  ClinicalLoading,
  ClinicalMissing,
  ClinicalNotice,
} from "./clinical-states";
import { ConsultationForm } from "./consultation-form";
export function ConsultationFormPage({
  id,
  patientId = "",
  appointmentId = "",
}: {
  id?: string;
  patientId?: string;
  appointmentId?: string;
}) {
  const { state, retry } = useClinicalData();
  if (state.status === "loading") return <ClinicalLoading />;
  if (state.status === "error") return <ClinicalError retry={retry} />;
  const { consultations, patients, appointments } = state.data;
  const consultation = consultations.find((record) => record.id === id);
  if (id && !consultation) return <ClinicalMissing />;
  if (consultation?.status === "TERMINEE")
    return (
      <>
        <ClinicalMissing message="Cette consultation terminée est en lecture seule." />
        <Button asChild>
          <Link href={`/consultations/${id}`}>Voir la consultation</Link>
        </Button>
      </>
    );
  const appointment = appointments.find(
    (record) => record.id === appointmentId,
  );
  const selectedPatientId =
    consultation?.patientId ?? (patientId || appointment?.patientId || "");
  if (
    selectedPatientId &&
    !patients.some((record) => record.id === selectedPatientId)
  )
    return <ClinicalMissing message="Ce patient est introuvable." />;
  if (
    appointmentId &&
    (!appointment || appointment.patientId !== selectedPatientId)
  )
    return (
      <ClinicalMissing message="Le lien de rendez-vous est invalide pour ce patient." />
    );
  const duplicate =
    !id &&
    appointmentId &&
    consultations.find((record) => record.appointmentId === appointmentId);
  if (duplicate)
    return (
      <>
        <ClinicalMissing message="Ce rendez-vous possède déjà une consultation." />
        <Button asChild>
          <Link href={`/consultations/${duplicate.id}`}>
            Ouvrir la consultation existante
          </Link>
        </Button>
      </>
    );
  const initial = consultation ?? {
    ...emptyConsultation(appointment?.date ?? clinicDate()),
    patientId: selectedPatientId,
    appointmentId,
  };
  return (
    <>
      <PageHeading
        eyebrow="Espace clinique du dentiste"
        title={consultation ? "Modifier le brouillon" : "Nouvelle consultation"}
        description="Renseignez le contexte clinique et les soins de cette rencontre."
      />
      <ClinicalNotice />
      <ConsultationForm
        key={id ?? `${selectedPatientId}-${appointmentId}`}
        consultation={consultation}
        initial={initial}
        patients={patients}
        appointments={appointments}
        consultations={consultations}
      />
    </>
  );
}
