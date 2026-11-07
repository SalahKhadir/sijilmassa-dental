"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowLeft, Pencil, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/page-heading";
import { formatPatientTimestamp } from "@/lib/patients/dates";
import { PatientAppointments } from "@/components/appointments/patient-appointments";
import { PatientIdentitySummary } from "./patient-identity-summary";
import { PatientStatus } from "./patient-status";
import {
  PatientDemoNotice,
  PatientError,
  PatientLoading,
  PatientNotFound,
} from "./patient-states";
import { usePatients } from "./patient-provider";
import { usePatientRecord } from "./use-patient-record";
import { PatientClinicalSections } from "./patient-clinical-sections";

export function PatientProfile({
  id,
  clinical = false,
}: {
  id: string;
  clinical?: boolean;
}) {
  const { state, retry } = usePatientRecord(id);
  const { feedback, clearFeedback } = usePatients();
  useEffect(() => () => clearFeedback(), [clearFeedback, id, clinical]);
  if (state.status === "loading") return <PatientLoading />;
  if (state.status === "error") return <PatientError retry={retry} />;
  if (!state.data) return <PatientNotFound />;
  const patient = state.data;
  const identity = patient.identity;
  const details = [
    { label: "Inscription", value: formatPatientTimestamp(patient.createdAt) },
    {
      label: "Dernière mise à jour du dossier",
      value: formatPatientTimestamp(patient.updatedAt),
    },
  ];
  return (
    <>
      <Link
        href="/patients"
        className="inline-flex min-h-10 items-center gap-2 rounded-sm text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Retour à l’annuaire
      </Link>
      <PageHeading
        eyebrow={patient.reference}
        title={`${identity.firstName} ${identity.lastName}`}
        description={
          clinical
            ? "Dossier patient · Questionnaire et historique de démonstration."
            : "Dossier patient · Informations personnelles et administratives."
        }
      >
        <Button asChild>
          <Link
            href={`/patients/${patient.id}/${clinical ? "dossier/modifier" : "modifier"}`}
          >
            <Pencil aria-hidden="true" />
            {clinical ? "Modifier le dossier de santé" : "Modifier le patient"}
          </Link>
        </Button>
      </PageHeading>
      <PatientDemoNotice />
      {feedback?.patientId === id && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-secondary/30 bg-secondary-tint p-4">
          <p role="status" aria-live="polite" className="text-sm leading-6">
            {feedback.message}
          </p>
          <Button
            variant="ghost"
            className="shrink-0 px-2"
            onClick={clearFeedback}
            aria-label="Fermer la confirmation"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      )}
      <nav
        aria-label="Sections du dossier"
        className="flex flex-wrap gap-2 border-b pb-3"
      >
        <Button asChild variant={clinical ? "ghost" : "secondary"}>
          <Link
            href={`/patients/${id}`}
            aria-current={!clinical ? "page" : undefined}
          >
            Informations personnelles
          </Link>
        </Button>
        <Button asChild variant={clinical ? "secondary" : "ghost"}>
          <Link
            href={`/patients/${id}/dossier`}
            aria-current={clinical ? "page" : undefined}
          >
            Questionnaire et traitements · Prototype dentiste
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href={`/patients/${id}/clinique`}>
            Espace clinique · Dentiste
          </Link>
        </Button>
      </nav>
      {clinical ? (
        <PatientClinicalSections
          patient={patient}
          treatments={patient.treatments}
        />
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b">
              <CardTitle>Informations personnelles</CardTitle>
              <PatientStatus status={patient.status} />
            </CardHeader>
            <CardContent className="pt-6">
              <PatientIdentitySummary identity={identity} />
              <dl className="mt-6 grid gap-6 border-t pt-6 sm:grid-cols-2">
                {details.map((item) => (
                  <div key={item.label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">
                      {item.label}
                    </dt>
                    <dd className="mt-2 text-sm leading-6 font-medium break-words whitespace-pre-wrap">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <p className="text-xs leading-5 text-muted-foreground">
            Le questionnaire et l’historique de traitement disposent d’un écran
            dédié au prototype dentiste. L’autorisation de consulter ces
            informations sera contrôlée côté serveur lors de l’intégration.
          </p>
          <PatientAppointments patientId={id} />
        </>
      )}
    </>
  );
}
