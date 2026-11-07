"use client";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { searchPatients } from "@/lib/patients/directory";
import { formatPatientDate } from "@/lib/patients/dates";
import type {
  PrescriptionPatient,
  PrescriptionConsultation,
} from "@/lib/prescriptions/types";
import type { BillableService, Invoice } from "@/lib/billing/types";
import {
  invoiceEditorSchema,
  editorInput,
  type InvoiceEditorValues,
} from "@/lib/billing/schema";
import { BillingError } from "@/lib/billing/money";
import { useBilling } from "./billing-provider";
import { InvoiceLineFields } from "./invoice-line-fields";
const subscribe = () => () => {};
export function InvoiceForm({
  invoice,
  initial,
  patients,
  consultations,
  services,
  invoices,
}: {
  invoice?: Invoice;
  initial: InvoiceEditorValues;
  patients: readonly PrescriptionPatient[];
  consultations: readonly PrescriptionConsultation[];
  services: readonly BillableService[];
  invoices: readonly Invoice[];
}) {
  const { create, updateDraft } = useBilling();
  const router = useRouter();
  const saving = useRef(false);
  const [search, setSearch] = useState("");
  const [saveError, setSaveError] = useState("");
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const form = useForm<InvoiceEditorValues>({
    resolver: zodResolver(invoiceEditorSchema),
    defaultValues: initial,
  });
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = form;
  const patientId = useWatch({ control, name: "patientId" });
  const consultationId = useWatch({ control, name: "consultationId" });
  const found = searchPatients(patients, search);
  const selected = patients.find((patient) => patient.id === patientId);
  const options =
    selected && !found.some((patient) => patient.id === patientId)
      ? [selected, ...found]
      : found;
  const related = invoices.filter(
    (record) =>
      record.id !== invoice?.id &&
      record.consultationId &&
      record.consultationId === consultationId &&
      record.lifecycle !== "ANNULEE",
  );
  const disabled = !hydrated || isSubmitting;
  async function save(values: InvoiceEditorValues) {
    if (saving.current) return;
    saving.current = true;
    setSaveError("");
    try {
      const input = editorInput(values);
      const record = invoice
        ? await updateDraft(invoice.id, input)
        : await create(input);
      router.push(`/facturation/${record.id}`);
    } catch (error) {
      if (
        error instanceof BillingError &&
        error.field &&
        error.field !== "amountMinor"
      ) {
        setError(error.field, { message: error.message });
        setFocus(error.field);
      } else
        setSaveError(
          error instanceof BillingError
            ? error.message
            : error instanceof z.ZodError
              ? (error.issues[0]?.message ?? "Vérifiez les lignes.")
              : "Impossible d’enregistrer le brouillon. Réessayez.",
        );
    } finally {
      saving.current = false;
    }
  }
  return (
    <form
      noValidate
      className="space-y-6"
      aria-busy={isSubmitting}
      onSubmit={(event) => {
        void handleSubmit(save)(event);
      }}
    >
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Patient et date</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {!invoice && (
            <div className="space-y-2">
              <label
                htmlFor="bill-patient-search"
                className="block text-sm font-semibold"
              >
                Rechercher un patient
              </label>
              <Input
                id="bill-patient-search"
                value={search}
                disabled={disabled}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nom, référence ou téléphone"
              />
              {!found.length && (
                <p role="status" className="text-sm text-muted-foreground">
                  Aucun patient ne correspond. La sélection courante est
                  conservée.
                </p>
              )}
            </div>
          )}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="bill-patient"
                className="block text-sm font-semibold"
              >
                Patient (obligatoire)
              </label>
              <Select
                id="bill-patient"
                required
                disabled={disabled}
                aria-invalid={Boolean(errors.patientId)}
                aria-describedby={
                  errors.patientId ? "bill-patient-error" : undefined
                }
                {...register("patientId", {
                  onChange: () =>
                    setValue("consultationId", "", { shouldValidate: true }),
                })}
              >
                {!invoice && <option value="">Sélectionner un patient</option>}
                {(invoice && selected ? [selected] : options).map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} · {patient.reference}
                  </option>
                ))}
              </Select>
              {errors.patientId && (
                <p
                  role="alert"
                  id="bill-patient-error"
                  className="text-sm text-danger"
                >
                  {errors.patientId.message}
                </p>
              )}
              {invoice && (
                <p className="text-xs text-muted-foreground">
                  Le patient est conservé après la création.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label
                htmlFor="bill-date"
                className="block text-sm font-semibold"
              >
                Date de facture (obligatoire)
              </label>
              <Input
                id="bill-date"
                type="date"
                required
                disabled={disabled}
                aria-invalid={Boolean(errors.issueDate)}
                aria-describedby={
                  errors.issueDate ? "bill-date-error" : undefined
                }
                {...register("issueDate")}
              />
              {errors.issueDate && (
                <p
                  role="alert"
                  id="bill-date-error"
                  className="text-sm text-danger"
                >
                  {errors.issueDate.message}
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="bill-consultation"
              className="block text-sm font-semibold"
            >
              Consultation liée (facultatif)
            </label>
            <Select
              id="bill-consultation"
              disabled={disabled || !patientId}
              aria-invalid={Boolean(errors.consultationId)}
              aria-describedby={
                errors.consultationId ? "bill-consultation-error" : undefined
              }
              {...register("consultationId")}
            >
              <option value="">Sans consultation liée</option>
              {consultations
                .filter((record) => record.patientId === patientId)
                .map((record) => (
                  <option key={record.id} value={record.id}>
                    {formatPatientDate(record.consultationDate)} · {record.id}
                  </option>
                ))}
            </Select>
            {errors.consultationId && (
              <p
                role="alert"
                id="bill-consultation-error"
                className="text-sm text-danger"
              >
                {errors.consultationId.message}
              </p>
            )}
          </div>
          {related.length > 0 && (
            <div className="rounded-lg border bg-muted p-4 text-sm leading-6">
              <p>
                Cette consultation possède déjà {related.length} facture(s) ou
                brouillon(s). Vérifiez les prestations avant de créer de
                nouvelles lignes.
              </p>
              <ul className="mt-2 space-y-1">
                {related.map((record) => (
                  <li key={record.id}>
                    <Link
                      className="text-primary underline"
                      href={`/facturation/${record.id}`}
                    >
                      {record.invoiceNumber ||
                        `Brouillon ${record.id.slice(-3)}`}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
      <InvoiceLineFields form={form} services={services} disabled={disabled} />
      {saveError && (
        <p
          role="alert"
          className="rounded-lg border border-danger p-4 text-sm text-danger"
        >
          {saveError}
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-3">
        <Button asChild variant="outline">
          <Link href={invoice ? `/facturation/${invoice.id}` : "/facturation"}>
            Annuler la saisie
          </Link>
        </Button>
        <Button type="submit" disabled={disabled}>
          {isSubmitting ? "Enregistrement…" : "Enregistrer le brouillon"}
        </Button>
      </div>
    </form>
  );
}
