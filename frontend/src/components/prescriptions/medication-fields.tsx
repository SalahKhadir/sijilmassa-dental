"use client";
import { useState } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ClinicalConfirmation } from "@/components/consultations/clinical-confirmation";
import { emptyMedication } from "@/lib/prescriptions/schema";
import type { PrescriptionInput } from "@/lib/prescriptions/types";
const fieldsDefinition = [
  { name: "medicationName", label: "Nom du médicament", max: 200 },
  { name: "dosage", label: "Posologie", max: 300 },
  { name: "frequency", label: "Fréquence", max: 200 },
  { name: "duration", label: "Durée", max: 200 },
  { name: "instructions", label: "Instructions complémentaires", max: 1500 },
] as const;
export function MedicationFields({
  form,
  disabled,
}: {
  form: UseFormReturn<PrescriptionInput>;
  disabled: boolean;
}) {
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "medications",
    keyName: "fieldKey",
  });
  const [removing, setRemoving] = useState<number | null>(null);
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Médicaments</CardTitle>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Saisissez les choix du dentiste. Chaque ligne devra préciser le nom,
          la posologie, la fréquence et la durée avant la finalisation.
        </p>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {!fields.length && (
          <p className="text-sm text-muted-foreground">
            Aucun médicament ajouté. Vous pouvez conserver ce brouillon
            incomplet.
          </p>
        )}
        {fields.map((field, index) => (
          <fieldset
            key={field.fieldKey}
            disabled={disabled}
            className="space-y-5 rounded-lg border p-4"
          >
            <legend className="px-2 text-sm font-semibold">
              Médicament {index + 1}
            </legend>
            <div className="grid gap-5 sm:grid-cols-2">
              {fieldsDefinition.map((item) => {
                const path = `medications.${index}.${item.name}` as const;
                const error = errors.medications?.[index]?.[item.name];
                const id = `med-${field.fieldKey}-${item.name}`;
                const props = {
                  id,
                  maxLength: item.max,
                  "aria-invalid": Boolean(error),
                  "aria-describedby": error ? `${id}-error` : undefined,
                  ...register(path),
                };
                return (
                  <div
                    key={path}
                    className={`space-y-2 ${item.name === "instructions" ? "sm:col-span-2" : ""}`}
                  >
                    <label htmlFor={id} className="block text-sm font-semibold">
                      {item.label}
                    </label>
                    {item.name === "instructions" ? (
                      <Textarea rows={3} {...props} />
                    ) : (
                      <Input {...props} />
                    )}
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
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
                aria-label={`Monter le médicament ${index + 1}`}
              >
                Monter
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={index === fields.length - 1}
                onClick={() => move(index, index + 1)}
                aria-label={`Descendre le médicament ${index + 1}`}
              >
                Descendre
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRemoving(index)}
                aria-label={`Retirer le médicament ${index + 1}`}
              >
                Retirer
              </Button>
            </div>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || fields.length >= 20}
          onClick={() =>
            append(emptyMedication(), {
              focusName: `medications.${fields.length}.medicationName`,
            })
          }
        >
          <Plus aria-hidden="true" />
          Ajouter un médicament
        </Button>
        <ClinicalConfirmation
          open={removing !== null}
          title="Retirer cette ligne ?"
          description="Cette ligne sera retirée du brouillon lors de son prochain enregistrement."
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
