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
import { BillingError, formatMinor } from "@/lib/billing/money";
import { invoiceStatus, settlement } from "@/lib/billing/calculations";
import { useBilling } from "./billing-provider";
import { useBillingData } from "./use-billing-data";
import {
  BillingErrorState,
  BillingLoading,
  BillingNotice,
  InvoiceMissing,
} from "./billing-states";
import { InvoiceStatus } from "./invoice-status";
import { PaymentHistory } from "./payment-history";
import { PaymentForm } from "./payment-form";
import { InvoiceCancellation } from "./invoice-cancellation";
import { InvoicePdfPreview } from "./invoice-pdf-preview";
export function InvoiceDetails({ id }: { id: string }) {
  const { state, retry } = useBillingData();
  const { issue, feedback, clearFeedback } = useBilling();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  useEffect(() => () => clearFeedback(), [id, clearFeedback]);
  async function confirm() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await issue(id);
      setConfirming(false);
    } catch (error) {
      setError(
        error instanceof BillingError
          ? error.message
          : error instanceof z.ZodError
            ? (error.issues[0]?.message ?? "Vérifiez la facture.")
            : "Impossible d’émettre la facture. Réessayez.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  if (state.status === "loading") return <BillingLoading />;
  if (state.status === "error") return <BillingErrorState retry={retry} />;
  const invoice = state.data.invoices.find((record) => record.id === id);
  if (!invoice) return <InvoiceMissing />;
  const patient = state.data.patients.find(
    (record) => record.id === invoice.patientId,
  );
  if (!patient) return <InvoiceMissing message="Ce patient est introuvable." />;
  const draft = invoice.lifecycle === "BROUILLON";
  const balance = settlement(invoice, state.data.payments);
  const payments = state.data.payments.filter(
    (payment) => payment.invoiceId === id,
  );
  return (
    <>
      <PageHeading
        eyebrow="Facturation du cabinet"
        title={
          invoice.invoiceNumber
            ? `Facture ${invoice.invoiceNumber}`
            : "Brouillon de facture"
        }
        description={`${invoice.issuedPatient?.name ?? patient.name} · ${invoice.issuedPatient?.reference ?? patient.reference}`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <InvoiceStatus status={invoiceStatus(invoice, payments)} />
          {draft && (
            <Button asChild>
              <Link href={`/demo/facturation/${id}/modifier`}>
                Modifier le brouillon
              </Link>
            </Button>
          )}
        </div>
      </PageHeading>
      <BillingNotice />
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
          <Link href={`/demo/patients/${patient.id}`}>Voir le dossier patient</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/demo/facturation">Retour à la facturation</Link>
        </Button>
      </div>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>
            {draft
              ? "Aperçu du brouillon · Prix modifiables"
              : "Prestations facturées · Lecture seule"}
          </CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Date de facture · {formatPatientDate(invoice.issueDate)}
          </p>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          {invoice.lines.length ? (
            <ol className="divide-y">
              {invoice.lines.map((line) => (
                <li
                  key={line.id}
                  className="space-y-3 py-4 first:pt-0 last:pb-0"
                >
                  <h3 className="text-sm font-semibold break-words whitespace-pre-wrap">
                    {line.description}
                  </h3>
                  <dl className="grid gap-3 text-sm sm:grid-cols-3">
                    {[
                      [
                        "Date de l’acte",
                        formatPatientDate(
                          line.performedDate || invoice.issueDate,
                        ),
                      ],
                      ["N° de dent", line.toothNumber || "Non renseigné"],
                      ["Prix", formatMinor(line.lineTotalMinor)],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="mt-1 font-medium tabular-nums">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucune ligne ajoutée.
            </p>
          )}
          <dl className="space-y-3 border-t pt-5 text-sm">
            {[
              ["Sous-total", formatMinor(balance.total)],
              ["Total", formatMinor(balance.total)],
              ...(!draft
                ? [
                    ["Montant reçu", formatMinor(balance.paid)],
                    ["Reste à encaisser", formatMinor(balance.receivable)],
                  ]
                : []),
            ].map(([label, value]) => (
              <div key={label} className="flex flex-wrap justify-between gap-3">
                <dt>{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {invoice.lifecycle === "EMISE" && balance.total === 0 && (
            <p className="text-sm text-muted-foreground">
              Montant nul · Aucun règlement requis.
            </p>
          )}
          {invoice.consultationId && (
            <p className="text-xs text-muted-foreground">
              Consultation liée · {invoice.consultationId}
            </p>
          )}
          {invoice.finalizedAt && (
            <p className="text-xs text-muted-foreground">
              Émise le {formatPatientTimestamp(invoice.finalizedAt)}
            </p>
          )}
          {invoice.lifecycle === "ANNULEE" && (
            <div className="rounded-lg border p-4 text-sm leading-6">
              <p className="font-semibold">
                Facture annulée · Montant initial conservé pour l’historique
              </p>
              <p className="mt-2 break-words whitespace-pre-wrap">
                {invoice.cancellationReason}
              </p>
              {invoice.cancelledAt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Annulée le {formatPatientTimestamp(invoice.cancelledAt)}
                </p>
              )}
            </div>
          )}
          {draft && (
            <Button
              onClick={() => {
                setError("");
                setConfirming(true);
              }}
            >
              Émettre la facture
            </Button>
          )}
        </CardContent>
      </Card>
      {!draft && (
        <Card>
          <CardHeader>
            <CardTitle>Historique des règlements</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentHistory payments={payments} />
          </CardContent>
        </Card>
      )}
      {invoice.lifecycle === "EMISE" && balance.remaining > 0 && (
        <PaymentForm invoice={invoice} payments={payments} />
      )}
      {invoice.lifecycle === "EMISE" &&
        (payments.length ? (
          <p className="rounded-lg border p-4 text-sm leading-6 text-muted-foreground">
            Cette facture contient des règlements. Leur correction ou leur
            annulation nécessitera un parcours comptable contrôlé.
          </p>
        ) : (
          <InvoiceCancellation id={id} number={invoice.invoiceNumber} />
        ))}
      <InvoicePdfPreview
        invoice={invoice}
        payments={payments}
        patient={patient}
      />
      <ClinicalConfirmation
        open={confirming}
        title="Émettre cette facture ?"
        description={`Vérifiez les prestations, le prix de chaque ligne et le total de ${formatMinor(balance.total)}. Les lignes deviendront en lecture seule et un numéro sera attribué.`}
        confirmLabel="Confirmer l’émission"
        busy={busy}
        error={error}
        onOpenChange={setConfirming}
        onConfirm={() => {
          void confirm();
        }}
      />
    </>
  );
}
