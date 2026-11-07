"use client";
import { useState } from "react";
import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ConsultationInput } from "@/lib/consultations/types";
import { ClinicalConfirmation } from "./clinical-confirmation";
export function TreatmentFields({
  form,
  disabled,
}: {
  form: UseFormReturn<ConsultationInput>;
  disabled: boolean;
}) {
  const {
    control,
    register,
    formState: { errors },
  } = form;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "treatments",
    keyName: "fieldKey",
  });
  const date = useWatch({ control, name: "consultationDate" });
  const [removing, setRemoving] = useState<number | null>(null);
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Soins réalisés</CardTitle>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Consignez les actions effectuées. La référence dentaire est un texte
          libre facultatif.
        </p>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {fields.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucun soin ajouté à cette consultation.
          </p>
        )}
        {fields.map((field, index) => (
          <fieldset
            key={field.fieldKey}
            disabled={disabled}
            className="space-y-4 rounded-lg border p-4"
          >
            <legend className="px-2 text-sm font-semibold">
              Soin {index + 1}
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  {
                    name: "treatmentDate",
                    label: "Date du soin (obligatoire)",
                    type: "date",
                    max: undefined,
                  },
                  {
                    name: "toothReference",
                    label: "Référence dentaire (facultatif)",
                    type: "text",
                    max: 50,
                  },
                ] as const
              ).map((item) => {
                const name = `treatments.${index}.${item.name}` as const;
                const error = errors.treatments?.[index]?.[item.name];
                const id = `care-${field.fieldKey}-${item.name}`;
                return (
                  <div key={name} className="space-y-2">
                    <label htmlFor={id} className="block text-sm font-semibold">
                      {item.label}
                    </label>
                    <Input
                      id={id}
                      type={item.type}
                      maxLength={item.max}
                      required={item.type === "date"}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? `${id}-error` : undefined}
                      {...register(name)}
                    />
                    {error && (
                      <p
                        role="alert"
                        id={`${id}-error`}
                        className="text-sm text-danger"
                      >
                        {error.message}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {(
              [
                {
                  name: "description",
                  label: "Description (obligatoire)",
                  max: 1000,
                },
                {
                  name: "notes",
                  label: "Notes du soin (facultatif)",
                  max: 2000,
                },
              ] as const
            ).map((item) => {
              const name = `treatments.${index}.${item.name}` as const;
              const id = `care-${field.fieldKey}-${item.name}`;
              const error = errors.treatments?.[index]?.[item.name];
              return (
                <div key={name} className="space-y-2">
                  <label htmlFor={id} className="block text-sm font-semibold">
                    {item.label}
                  </label>
                  <Textarea
                    id={id}
                    maxLength={item.max}
                    required={item.name === "description"}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${id}-error` : undefined}
                    {...register(name)}
                  />
                  {error && (
                    <p
                      role="alert"
                      id={`${id}-error`}
                      className="text-sm text-danger"
                    >
                      {error.message}
                    </p>
                  )}
                </div>
              );
            })}
            {!field.id ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setRemoving(index)}
              >
                <Trash2 aria-hidden="true" />
                Retirer ce soin non enregistré
              </Button>
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">
                Soin enregistré conservé dans le dossier. Son contenu reste
                modifiable tant que la consultation est en brouillon.
              </p>
            )}
          </fieldset>
        ))}
        {errors.treatments?.root?.message && (
          <p role="alert" className="text-sm text-danger">
            {errors.treatments.root.message}
          </p>
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || fields.length >= 50}
          onClick={() =>
            append(
              {
                treatmentDate: date,
                description: "",
                toothReference: "",
                notes: "",
              },
              { focusName: `treatments.${fields.length}.description` },
            )
          }
        >
          <Plus aria-hidden="true" />
          Ajouter un soin
        </Button>
        <ClinicalConfirmation
          open={removing !== null}
          title="Retirer le soin non enregistré ?"
          description="Le contenu saisi pour ce soin sera retiré du formulaire."
          confirmLabel="Retirer le soin"
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
