"use client";
import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { clinicDate } from "@/lib/patients/dates";
import { minorInput } from "@/lib/billing/money";
import { useBillingData } from "./use-billing-data";
import { InvoiceForm } from "./invoice-form";
import {
  BillingErrorState,
  BillingLoading,
  BillingNotice,
  InvoiceMissing,
} from "./billing-states";
export function InvoiceFormPage({
  id,
  patientId = "",
  consultationId = "",
}: {
  id?: string;
  patientId?: string;
  consultationId?: string;
}) {
  const { state, retry } = useBillingData();
  if (state.status === "loading") return <BillingLoading />;
  if (state.status === "error") return <BillingErrorState retry={retry} />;
  const { invoices, patients, consultations, services } = state.data;
  const invoice = invoices.find((record) => record.id === id);
  if (id && !invoice) return <InvoiceMissing />;
  if (invoice && invoice.lifecycle !== "BROUILLON")
    return (
      <>
        <InvoiceMissing message="Cette facture est en lecture seule." />
        <Button asChild>
          <Link href={`/demo/facturation/${id}`}>Voir la facture</Link>
        </Button>
      </>
    );
  const consultation = consultations.find(
    (record) => record.id === consultationId,
  );
  const selectedPatient =
    invoice?.patientId ?? (patientId || consultation?.patientId || "");
  if (
    selectedPatient &&
    !patients.some((patient) => patient.id === selectedPatient)
  )
    return <InvoiceMissing message="Ce patient est introuvable." />;
  if (
    consultationId &&
    (!consultation || consultation.patientId !== selectedPatient)
  )
    return (
      <InvoiceMissing message="Le lien de consultation est invalide pour ce patient." />
    );
  const initial = invoice
    ? {
        ...invoice,
        lines: invoice.lines.map((line) => ({
          ...line,
          performedDate: line.performedDate || invoice.issueDate,
          toothNumber: line.toothNumber || "",
          quantity: 1,
          unitPrice: minorInput(line.lineTotalMinor),
        })),
      }
    : {
        patientId: selectedPatient,
        consultationId,
        issueDate: clinicDate(),
        lines: [],
      };
  return (
    <>
      <PageHeading
        eyebrow="Tarification du dentiste"
        title={
          invoice ? "Modifier le brouillon de facture" : "Nouvelle facture"
        }
        description="Choisissez les prestations et les prix convenus pour ce patient."
      />
      <BillingNotice />
      <InvoiceForm
        key={id ?? `${selectedPatient}-${consultationId}`}
        invoice={invoice}
        initial={initial}
        patients={patients}
        consultations={consultations}
        services={services}
        invoices={invoices}
      />
    </>
  );
}
