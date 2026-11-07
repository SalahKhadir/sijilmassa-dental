"use client";
import { PageHeading } from "@/components/page-heading";
import {
  PatientDemoNotice,
  PatientError,
  PatientLoading,
  PatientNotFound,
} from "./patient-states";
import { PatientForm } from "./patient-form";
import { usePatientRecord } from "./use-patient-record";

export function NewPatientPage() {
  return (
    <>
      <PageHeading
        eyebrow="Dossier patient · Prototype dentiste"
        title="Nouveau patient"
        description="Créez un dossier fictif à partir des rubriques du formulaire du cabinet."
      />
      <PatientDemoNotice />
      <PatientForm />
    </>
  );
}
export function EditPatientPage({
  id,
  clinical = false,
}: {
  id: string;
  clinical?: boolean;
}) {
  const { state, retry } = usePatientRecord(id);
  if (state.status === "loading") return <PatientLoading />;
  if (state.status === "error") return <PatientError retry={retry} />;
  if (!state.data) return <PatientNotFound />;
  return (
    <>
      <PageHeading
        eyebrow={state.data.reference}
        title={
          clinical ? "Modifier le dossier de santé" : "Modifier le patient"
        }
        description={
          clinical
            ? "Questionnaire fictif · Prototype destiné au dentiste."
            : "Mettez à jour les informations personnelles et administratives."
        }
      />
      <PatientDemoNotice />
      <PatientForm
        key={`${state.data.id}-${state.data.updatedAt}`}
        patient={state.data}
        clinical={clinical}
      />
    </>
  );
}
