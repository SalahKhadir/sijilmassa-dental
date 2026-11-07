"use client";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ClinicalConfirmation } from "@/components/consultations/clinical-confirmation";
import { clinicDate, formatPatientDate } from "@/lib/patients/dates";
import { BillingError, formatMinor, parseMinor } from "@/lib/billing/money";
import {
  paymentMethods,
  type Invoice,
  type Payment,
  type PaymentInput,
} from "@/lib/billing/types";
import { settlement, validatePaymentAmount } from "@/lib/billing/calculations";
import {
  paymentEditorSchema,
  type PaymentEditorValues,
} from "@/lib/billing/schema";
import { useBilling } from "./billing-provider";
export function PaymentForm({
  invoice,
  payments,
}: {
  invoice: Invoice;
  payments: readonly Payment[];
}) {
  const { pay } = useBilling();
  const prefix = useId();
  const sequence = useRef(0);
  const saving = useRef(false);
  const [pending, setPending] = useState<PaymentInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    setError: fieldError,
    setFocus,
    formState: { errors },
  } = useForm<PaymentEditorValues>({
    resolver: zodResolver(paymentEditorSchema),
    defaultValues: {
      invoiceId: invoice.id,
      paymentDate: clinicDate(),
      amount: "",
      method: "ESPECES",
      reference: "",
      notes: "",
    },
  });
  const remaining = settlement(invoice, payments).remaining;
  function review(values: PaymentEditorValues) {
    try {
      const amountMinor = parseMinor(values.amount);
      validatePaymentAmount(invoice, payments, amountMinor);
      sequence.current += 1;
      setPending({
        invoiceId: invoice.id,
        paymentDate: values.paymentDate,
        method: values.method,
        reference: values.reference,
        notes: values.notes,
        amountMinor,
        operationId: `${prefix}-${sequence.current}`,
      });
      setError("");
    } catch (error) {
      fieldError("amount", {
        message:
          error instanceof BillingError
            ? error.message
            : "Vérifiez le montant.",
      });
      setFocus("amount");
    }
  }
  async function confirm() {
    if (!pending || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await pay(pending);
      setPending(null);
    } catch (error) {
      setError(
        error instanceof BillingError
          ? error.message
          : error instanceof z.ZodError
            ? (error.issues[0]?.message ?? "Vérifiez le règlement.")
            : "Impossible d’enregistrer le règlement. Réessayez.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Enregistrer un règlement</CardTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          Reste à encaisser · {formatMinor(remaining)}
        </p>
      </CardHeader>
      <CardContent className="pt-6">
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            void handleSubmit(review)(event);
          }}
        >
          <input type="hidden" {...register("invoiceId")} />
          <div className="grid gap-5 sm:grid-cols-2">
            {(
              [
                {
                  name: "paymentDate",
                  label: "Date du règlement (obligatoire)",
                  type: "date",
                },
                {
                  name: "amount",
                  label: "Montant en DH (obligatoire)",
                  type: "text",
                },
              ] as const
            ).map((field) => (
              <div key={field.name} className="space-y-2">
                <label
                  htmlFor={`payment-${field.name}`}
                  className="block text-sm font-semibold"
                >
                  {field.label}
                </label>
                <Input
                  id={`payment-${field.name}`}
                  type={field.type}
                  inputMode={field.name === "amount" ? "decimal" : undefined}
                  required
                  disabled={busy}
                  aria-invalid={Boolean(errors[field.name])}
                  aria-describedby={
                    errors[field.name]
                      ? `payment-${field.name}-error`
                      : undefined
                  }
                  {...register(field.name)}
                />
                {errors[field.name] && (
                  <p
                    role="alert"
                    id={`payment-${field.name}-error`}
                    className="text-sm text-danger"
                  >
                    {errors[field.name]?.message}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <label
              htmlFor="payment-method"
              className="block text-sm font-semibold"
            >
              Mode de règlement (obligatoire)
            </label>
            <Select
              id="payment-method"
              required
              disabled={busy}
              aria-invalid={Boolean(errors.method)}
              aria-describedby={
                errors.method ? "payment-method-error" : undefined
              }
              {...register("method")}
            >
              {Object.entries(paymentMethods).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            {errors.method && (
              <p
                role="alert"
                id="payment-method-error"
                className="text-sm text-danger"
              >
                {errors.method.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label
              htmlFor="payment-reference"
              className="block text-sm font-semibold"
            >
              Référence (facultatif)
            </label>
            <Input
              id="payment-reference"
              maxLength={100}
              disabled={busy}
              aria-invalid={Boolean(errors.reference)}
              aria-describedby={
                errors.reference ? "payment-reference-error" : undefined
              }
              {...register("reference")}
            />
            {errors.reference && (
              <p
                role="alert"
                id="payment-reference-error"
                className="text-sm text-danger"
              >
                {errors.reference.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label
              htmlFor="payment-notes"
              className="block text-sm font-semibold"
            >
              Notes administratives (facultatif)
            </label>
            <Textarea
              id="payment-notes"
              maxLength={500}
              disabled={busy}
              aria-invalid={Boolean(errors.notes)}
              aria-describedby={
                errors.notes ? "payment-notes-error" : undefined
              }
              {...register("notes")}
            />
            {errors.notes && (
              <p
                role="alert"
                id="payment-notes-error"
                className="text-sm text-danger"
              >
                {errors.notes.message}
              </p>
            )}
          </div>
          <Button type="submit" disabled={busy}>
            Vérifier le règlement
          </Button>
        </form>
        <ClinicalConfirmation
          open={pending !== null}
          title="Confirmer ce règlement ?"
          description={
            pending
              ? `${formatMinor(pending.amountMinor)} · ${paymentMethods[pending.method]} · ${formatPatientDate(pending.paymentDate)} · Facture ${invoice.invoiceNumber}. Ce règlement sera conservé dans l’historique.`
              : ""
          }
          confirmLabel="Confirmer le règlement"
          busy={busy}
          error={error}
          onOpenChange={(open) => {
            if (!open) setPending(null);
          }}
          onConfirm={() => {
            void confirm();
          }}
        />
      </CardContent>
    </Card>
  );
}
