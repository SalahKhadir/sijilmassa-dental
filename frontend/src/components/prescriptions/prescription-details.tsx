"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ClinicalConfirmation } from "@/components/consultations/clinical-confirmation";
import {
  formatPatientDate,
  formatPatientTimestamp,
} from "@/lib/patients/dates";
import { PrescriptionError } from "@/lib/prescriptions/repository";
import { PrescriptionPdfError } from "@/lib/prescriptions/pdf/layout";
import { usePrescriptions } from "./prescription-provider";
import { usePrescriptionData } from "./use-prescription-data";
import { PrescriptionStatus } from "./prescription-status";
import { PdfPreview } from "./pdf-preview";
import {
  PrescriptionErrorState,
  PrescriptionLoading,
  PrescriptionMissing,
  PrescriptionNotice,
} from "./prescription-states";
export function PrescriptionDetails({ id }: { id: string }) {
  const { state, retry } = usePrescriptionData();
  const { finalize, feedback, clearFeedback } = usePrescriptions();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  useEffect(() => () => clearFeedback(), [clearFeedback, id]);
  async function finish() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await finalize(id);
      setConfirming(false);
    } catch (error) {
      setError(
        error instanceof z.ZodError
          ? error.issues
              .map(
                (issue) =>
                  `${typeof issue.path[1] === "number" ? `Ligne ${issue.path[1] + 1} · ` : ""}${issue.message}`,
              )
              .join(" ")
          : error instanceof PrescriptionError ||
              error instanceof PrescriptionPdfError
            ? error.message
            : "Impossible de finaliser l’ordonnance. Réessayez.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  if (state.status === "loading") return <PrescriptionLoading />;
  if (state.status === "error") return <PrescriptionErrorState retry={retry} />;
  const record = state.data.prescriptions.find((item) => item.id === id);
  if (!record) return <PrescriptionMissing />;
  const patient = state.data.patients.find(
    (item) => item.id === record.patientId,
  );
  if (!patient)
    return <PrescriptionMissing message="Ce patient est introuvable." />;
  const draft = record.status === "BROUILLON";
  return (
    <>
      <PageHeading
        eyebrow="Espace dentiste"
        title={`Ordonnance du ${formatPatientDate(record.issuedDate)}`}
        description={`${patient.name} · ${patient.reference}`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <PrescriptionStatus status={record.status} />
          {draft && (
            <Button asChild>
              <Link href={`/documents/ordonnances/${id}/modifier`}>
                Modifier le brouillon
              </Link>
            </Button>
          )}
        </div>
      </PageHeading>
      <PrescriptionNotice />
      {feedback?.id === id && (
        <p
          role="status"
          className="rounded-lg border border-secondary/30 bg-secondary-tint p-4 text-sm leading-6"
        >
          {feedback.message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href={`/patients/${patient.id}/clinique`}>
            Voir le dossier clinique
          </Link>
        </Button>
        {record.consultationId && (
          <Button asChild variant="outline">
            <Link href={`/consultations/${record.consultationId}`}>
              Voir la consultation liée
            </Link>
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link href="/documents">Retour aux documents</Link>
        </Button>
      </div>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Contenu de l’ordonnance</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            {draft
              ? "Brouillon · À relire et valider par le dentiste."
              : "Finalisée · Document en lecture seule."}
          </p>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {record.medications.length ? (
            <ol className="space-y-6">
              {record.medications.map((medication, index) => (
                <li
                  key={medication.id}
                  className="space-y-4 rounded-lg border p-4"
                >
                  <h3 className="text-base font-semibold break-words">
                    {index + 1}.{" "}
                    {medication.medicationName || "Nom non renseigné"}
                  </h3>
                  <dl className="grid gap-4 text-sm sm:grid-cols-3">
                    {[
                      ["Posologie", medication.dosage],
                      ["Fréquence", medication.frequency],
                      ["Durée", medication.duration],
                      ["Instructions complémentaires", medication.instructions],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="mt-1 leading-6 break-words whitespace-pre-wrap">
                          {value || "Non renseigné"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucun médicament renseigné.
            </p>
          )}
          <div>
            <h3 className="text-sm font-semibold">Instructions générales</h3>
            <p className="mt-2 text-sm leading-6 break-words whitespace-pre-wrap">
              {record.generalInstructions || "Non renseignées"}
            </p>
          </div>
          <p className="text-xs leading-6 text-muted-foreground">
            {record.finalizedAt
              ? `Finalisée le ${formatPatientTimestamp(record.finalizedAt)}`
              : `Brouillon modifié le ${formatPatientTimestamp(record.updatedAt)}`}
          </p>
          {draft ? (
            <Button
              onClick={() => {
                setError("");
                setConfirming(true);
              }}
            >
              Finaliser l’ordonnance
            </Button>
          ) : (
            <p className="text-xs leading-6 text-muted-foreground">
              Les corrections, annulations et signatures devront suivre un
              parcours sécurisé et audité. La finalisation de ce prototype ne
              constitue pas une signature électronique.
            </p>
          )}
        </CardContent>
      </Card>
      <PdfPreview prescription={record} patient={patient} />
      <ClinicalConfirmation
        open={confirming}
        title="Finaliser cette ordonnance ?"
        description={`Vérifiez le patient, les médicaments et la date d’émission du ${formatPatientDate(record.issuedDate)}. Le document deviendra en lecture seule.`}
        confirmLabel="Confirmer la finalisation"
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
