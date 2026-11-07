"use client";
import Link from "next/link";
import { PatientFinancialHistory } from "@/components/billing/patient-financial-history";
import { PatientPrescriptions } from "@/components/prescriptions/patient-prescriptions";
import { useEffect, useRef, useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  formatPatientDate,
  formatPatientTimestamp,
} from "@/lib/patients/dates";
import { ClinicalRecordError } from "@/lib/consultations/repository";
import { useClinicalData } from "./use-clinical-data";
import { useConsultations } from "./consultation-provider";
import {
  ClinicalError,
  ClinicalLoading,
  ClinicalMissing,
  ClinicalNotice,
} from "./clinical-states";
import { ConsultationStatus } from "./consultation-status";
import { ClinicalConfirmation } from "./clinical-confirmation";
import { TreatmentHistory } from "./treatment-history";
export function ConsultationDetails({ id }: { id: string }) {
  const { state, retry } = useClinicalData();
  const { complete, feedback, clearFeedback } = useConsultations();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  useEffect(() => () => clearFeedback(), [id, clearFeedback]);
  async function finish() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await complete(id);
      setConfirming(false);
    } catch (error) {
      setError(
        error instanceof ClinicalRecordError
          ? error.message
          : "Impossible de terminer la consultation. Réessayez.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  if (state.status === "loading") return <ClinicalLoading />;
  if (state.status === "error") return <ClinicalError retry={retry} />;
  const consultation = state.data.consultations.find(
    (record) => record.id === id,
  );
  if (!consultation) return <ClinicalMissing />;
  const patient = state.data.patients.find(
    (record) => record.id === consultation.patientId,
  );
  if (!patient)
    return <ClinicalMissing message="Ce patient est introuvable." />;
  const appointment = state.data.appointments.find(
    (record) => record.id === consultation.appointmentId,
  );
  const draft = consultation.status === "BROUILLON";
  return (
    <>
      <PageHeading
        eyebrow="Espace clinique du dentiste"
        title={`Consultation du ${formatPatientDate(consultation.consultationDate)}`}
        description={`${patient.identity.firstName} ${patient.identity.lastName} · ${patient.reference}`}
      >
        <ConsultationStatus status={consultation.status} />
        {draft && (
          <Button asChild>
            <Link href={`/consultations/${id}/modifier`}>
              Modifier le brouillon
            </Link>
          </Button>
        )}
      </PageHeading>
      <ClinicalNotice />
      {feedback?.id === id && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg border border-secondary/30 bg-secondary-tint p-4 text-sm leading-6"
        >
          {feedback.message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="secondary">
          <Link href={`/patients/${patient.id}/clinique`}>
            Voir le contexte médical
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/consultations?patientId=${patient.id}`}>
            Consultations du patient
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/consultations">Toutes les consultations</Link>
        </Button>
      </div>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Compte rendu clinique</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            {draft
              ? "Brouillon · Contenu clinique modifiable."
              : "Terminée · Compte rendu en lecture seule."}
          </p>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <dl className="space-y-6">
            {[
              ["Motif de consultation", consultation.chiefComplaint],
              ["Observations cliniques", consultation.clinicalObservations],
              ["Évaluation clinique", consultation.assessment],
              ["Plan de traitement", consultation.treatmentPlan],
              ["Notes complémentaires", consultation.notes],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm font-semibold">{label}</dt>
                <dd className="mt-2 text-sm leading-7 break-words whitespace-pre-wrap">
                  {value || "Non renseigné"}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <TreatmentHistory consultation={consultation} />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm">
            {appointment && appointment.patientId === patient.id ? (
              <Link
                className="text-primary underline"
                href={`/rendez-vous/${appointment.id}`}
              >
                Rendez-vous du {formatPatientDate(appointment.date)} à{" "}
                {appointment.startTime}
              </Link>
            ) : consultation.appointmentId ? (
              "Lien de rendez-vous invalide · À vérifier."
            ) : (
              "Visite spontanée · Sans rendez-vous lié"
            )}
          </p>
          <p className="text-xs leading-6 text-muted-foreground">
            Création le {formatPatientTimestamp(consultation.createdAt)} ·
            Dernière modification le{" "}
            {formatPatientTimestamp(consultation.updatedAt)}
          </p>
          {draft ? (
            <Button
              onClick={() => {
                setError("");
                setConfirming(true);
              }}
            >
              Terminer la consultation
            </Button>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              La correction et la traçabilité des dossiers terminés
              nécessiteront un parcours dédié côté backend.
            </p>
          )}
        </CardContent>
      </Card>
      <PatientFinancialHistory patientId={patient.id} consultationId={id} />
      <PatientPrescriptions patientId={patient.id} consultationId={id} />
      <ClinicalConfirmation
        open={confirming}
        title="Terminer cette consultation ?"
        description="Le compte rendu et les soins enregistrés deviendront en lecture seule dans ce prototype. Confirmez après avoir vérifié le contenu."
        confirmLabel="Confirmer la clôture"
        busy={busy}
        error={error}
        onOpenChange={setConfirming}
        onConfirm={() => {
          void finish();
        }}
      />
    </>
  );
}
