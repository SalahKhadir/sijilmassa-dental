"use client";
import Link from "next/link";
import { PatientPrescriptions } from "@/components/prescriptions/patient-prescriptions";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PatientClinicalSections } from "@/components/patients/patient-clinical-sections";
import { formatPatientDate } from "@/lib/patients/dates";
import { consultationDirectory } from "@/lib/consultations/selectors";
import { useClinicalData } from "./use-clinical-data";
import {
  ClinicalError,
  ClinicalLoading,
  ClinicalMissing,
} from "./clinical-states";
import { ConsultationList } from "./consultation-list";
export function PatientClinicalOverview({ id }: { id: string }) {
  const { state, retry } = useClinicalData();
  if (state.status === "loading") return <ClinicalLoading />;
  if (state.status === "error") return <ClinicalError retry={retry} />;
  const patient = state.data.patients.find((record) => record.id === id);
  if (!patient)
    return <ClinicalMissing message="Ce patient est introuvable." />;
  const records = consultationDirectory(state.data.consultations, [patient], {
    search: "",
    status: "all",
    sort: "newest",
    patientId: id,
  });
  return (
    <>
      <PageHeading
        eyebrow={`${patient.reference} · Espace dentiste`}
        title={`${patient.identity.firstName} ${patient.identity.lastName}`}
        description="Vue clinique · Questionnaire rapporté et consultations."
      >
        <Button asChild>
          <Link href={`/consultations/nouveau?patientId=${id}`}>
            Nouvelle consultation
          </Link>
        </Button>
      </PageHeading>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href={`/patients/${id}`}>Retour au dossier patient</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={`/consultations?patientId=${id}`}>
            Voir les consultations
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href={`/patients/${id}/dossier`}>
            Ouvrir le questionnaire et l’historique papier
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Identification du patient</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-5 text-sm sm:grid-cols-3">
            {[
              [
                "Nom et prénom",
                `${patient.identity.firstName} ${patient.identity.lastName}`,
              ],
              ["Référence", patient.reference],
              [
                "Date de naissance",
                formatPatientDate(patient.identity.dateOfBirth),
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-2 font-medium break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <PatientPrescriptions patientId={id} />
      <PatientClinicalSections patient={patient} factualAnswers />
      <ConsultationList
        records={records}
        patients={[patient]}
        clinicalHistory
      />
    </>
  );
}
