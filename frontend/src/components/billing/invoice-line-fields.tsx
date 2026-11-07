"use client";
import { useState } from "react";
import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ClinicalConfirmation } from "@/components/consultations/clinical-confirmation";
import type { BillableService } from "@/lib/billing/types";
import type { InvoiceEditorValues } from "@/lib/billing/schema";
import {
  formatMinor,
  lineTotal,
  minorInput,
  parseMinor,
  sumMinor,
} from "@/lib/billing/money";
function total(lines: InvoiceEditorValues["lines"]) {
  try {
    return sumMinor(
      lines.map((line) => lineTotal(line.quantity, parseMinor(line.unitPrice))),
    );
  } catch {
    return null;
  }
}
export function InvoiceLineFields({
  form,
  services,
  disabled,
}: {
  form: UseFormReturn<InvoiceEditorValues>;
  services: readonly BillableService[];
  disabled: boolean;
}) {
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "lines",
    keyName: "fieldKey",
  });
  const lines = useWatch({ control, name: "lines" });
  const invoiceDate = useWatch({ control, name: "issueDate" });
  const [serviceId, setServiceId] = useState("");
  const [removing, setRemoving] = useState<number | null>(null);
  const service = services.find((item) => item.id === serviceId && item.active);
  const subtotal = total(lines);
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Prestations et prix</CardTitle>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Le dentiste choisit le prix convenu pour ce patient. Les prix du
          catalogue sont des exemples modifiables.
        </p>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-3 rounded-lg bg-muted p-4">
          <label
            htmlFor="invoice-catalog"
            className="block text-sm font-semibold"
          >
            Catalogue facultatif · Données fictives
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select
              id="invoice-catalog"
              value={serviceId}
              disabled={disabled || fields.length >= 100}
              onChange={(event) => setServiceId(event.target.value)}
            >
              <option value="">Choisir une prestation</option>
              {services
                .filter((item) => item.active)
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                    {item.suggestedPriceMinor !== undefined
                      ? ` · Suggestion ${formatMinor(item.suggestedPriceMinor)}`
                      : " · Prix à saisir"}
                  </option>
                ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || !service || fields.length >= 100}
              onClick={() => {
                if (service)
                  append(
                    {
                      performedDate: invoiceDate,
                      toothNumber: "",
                      description: service.name,
                      quantity: 1,
                      unitPrice:
                        service.suggestedPriceMinor !== undefined
                          ? minorInput(service.suggestedPriceMinor)
                          : "",
                      serviceId: service.id,
                      sourceTreatmentId: "",
                    },
                    { focusName: `lines.${fields.length}.unitPrice` },
                  );
              }}
            >
              Ajouter la prestation
            </Button>
          </div>
        </div>
        {!fields.length && (
          <p className="text-sm text-muted-foreground">
            Aucune ligne ajoutée. Ajoutez une prestation ou une ligne
            personnalisée avant l’émission.
          </p>
        )}
        {fields.map((field, index) => {
          const current = lines[index];
          const amount = current ? total([current]) : null;
          return (
            <fieldset
              key={field.fieldKey}
              disabled={disabled}
              className="space-y-4 rounded-lg border p-4"
            >
              <legend className="px-2 text-sm font-semibold">
                Ligne {index + 1}
              </legend>
              <input
                type="hidden"
                {...register(`lines.${index}.quantity`, {
                  valueAsNumber: true,
                })}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor={`line-${field.fieldKey}-date`}
                    className="block text-sm font-semibold"
                  >
                    Date de l’acte (obligatoire)
                  </label>
                  <Input
                    id={`line-${field.fieldKey}-date`}
                    type="date"
                    required
                    aria-invalid={Boolean(errors.lines?.[index]?.performedDate)}
                    aria-describedby={
                      errors.lines?.[index]?.performedDate
                        ? `line-${field.fieldKey}-date-error`
                        : undefined
                    }
                    {...register(`lines.${index}.performedDate`)}
                  />
                  {errors.lines?.[index]?.performedDate && (
                    <p
                      role="alert"
                      id={`line-${field.fieldKey}-date-error`}
                      className="text-sm text-danger"
                    >
                      {errors.lines[index]?.performedDate?.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor={`line-${field.fieldKey}-tooth`}
                    className="block text-sm font-semibold"
                  >
                    N° de dent (facultatif)
                  </label>
                  <Input
                    id={`line-${field.fieldKey}-tooth`}
                    maxLength={20}
                    aria-invalid={Boolean(errors.lines?.[index]?.toothNumber)}
                    aria-describedby={
                      errors.lines?.[index]?.toothNumber
                        ? `line-${field.fieldKey}-tooth-error`
                        : undefined
                    }
                    {...register(`lines.${index}.toothNumber`)}
                  />
                  {errors.lines?.[index]?.toothNumber && (
                    <p
                      role="alert"
                      id={`line-${field.fieldKey}-tooth-error`}
                      className="text-sm text-danger"
                    >
                      {errors.lines[index]?.toothNumber?.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor={`line-${field.fieldKey}-description`}
                  className="block text-sm font-semibold"
                >
                  Désignation de l’acte (obligatoire)
                </label>
                <Textarea
                  id={`line-${field.fieldKey}-description`}
                  rows={2}
                  maxLength={700}
                  required
                  aria-invalid={Boolean(errors.lines?.[index]?.description)}
                  aria-describedby={
                    errors.lines?.[index]?.description
                      ? `line-${field.fieldKey}-description-error`
                      : undefined
                  }
                  {...register(`lines.${index}.description`)}
                />
                {errors.lines?.[index]?.description && (
                  <p
                    role="alert"
                    id={`line-${field.fieldKey}-description-error`}
                    className="text-sm text-danger"
                  >
                    {errors.lines[index]?.description?.message}
                  </p>
                )}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor={`line-${field.fieldKey}-price`}
                    className="block text-sm font-semibold"
                  >
                    Prix de l’acte en DH (obligatoire)
                  </label>
                  <Input
                    id={`line-${field.fieldKey}-price`}
                    inputMode="decimal"
                    required
                    aria-invalid={Boolean(errors.lines?.[index]?.unitPrice)}
                    aria-describedby={
                      errors.lines?.[index]?.unitPrice
                        ? `line-${field.fieldKey}-price-error`
                        : "invoice-price-help"
                    }
                    {...register(`lines.${index}.unitPrice`)}
                  />
                  {errors.lines?.[index]?.unitPrice && (
                    <p
                      role="alert"
                      id={`line-${field.fieldKey}-price-error`}
                      className="text-sm text-danger"
                    >
                      {errors.lines[index]?.unitPrice?.message}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold">Prix retenu</p>
                  <output className="mt-3 block text-sm tabular-nums">
                    {amount !== null ? formatMinor(amount) : "À compléter"}
                  </output>
                </div>
              </div>
              {field.sourceTreatmentId && (
                <p className="text-xs text-muted-foreground">
                  Soin lié · {field.sourceTreatmentId}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                  aria-label={`Monter la ligne ${index + 1}`}
                >
                  Monter
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={index === fields.length - 1}
                  onClick={() => move(index, index + 1)}
                  aria-label={`Descendre la ligne ${index + 1}`}
                >
                  Descendre
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRemoving(index)}
                  aria-label={`Retirer la ligne ${index + 1}`}
                >
                  Retirer
                </Button>
              </div>
            </fieldset>
          );
        })}
        <Button
          type="button"
          variant="outline"
          disabled={disabled || fields.length >= 100}
          onClick={() =>
            append(
              {
                performedDate: invoiceDate,
                toothNumber: "",
                description: "",
                quantity: 1,
                unitPrice: "",
                serviceId: "",
                sourceTreatmentId: "",
              },
              { focusName: `lines.${fields.length}.description` },
            )
          }
        >
          Ajouter une ligne personnalisée
        </Button>
        <p
          id="invoice-price-help"
          className="text-xs leading-5 text-muted-foreground"
        >
          Montants en dirhams, deux décimales au maximum. Chaque ligne
          représente un acte dentaire. Le prix peut être fixé à zéro
          explicitement.
        </p>
        <div className="space-y-2 border-t pt-4 text-right text-sm">
          <p>
            Sous-total ·{" "}
            {subtotal !== null ? formatMinor(subtotal) : "À compléter"}
          </p>
          <p className="text-lg font-semibold">
            Total · {subtotal !== null ? formatMinor(subtotal) : "À compléter"}
          </p>
        </div>
        <ClinicalConfirmation
          open={removing !== null}
          title="Retirer cette ligne du brouillon ?"
          description="La ligne sera retirée lors du prochain enregistrement du brouillon."
          confirmLabel="Retirer la ligne"
          onOpenChange={(open) => {
            if (!open) setRemoving(null);
          }}
          onConfirm={() => {
            if (removing !== null) remove(removing);
            setRemoving(null);
          }}
        />
      </CardContent>
    </Card>
  );
}
