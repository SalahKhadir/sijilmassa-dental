"use client";

import { useMemo } from "react";
import { z } from "zod";
import { FormProvider, useFieldArray, useForm, useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useUnsavedChanges } from "@/components/patients/persistent/shared";
import { Button } from "@/components/ui/button";
import { formatMad } from "@/lib/financial/money";
import { insuranceDraftSchema, isExecuted, maxActs, type DocumentType, type Draft, type Purpose } from "@/lib/insurance/api/schemas";
import { formatPatientDate } from "@/lib/patients/dates";
import { CnopsFields, CnssFields, DraftField, FarFields, InsuredFields, normalizeNumbers } from "./form-fields";
import type { ConsultationSource } from "./shared";

const variantForms = { CNSS_DENTAIRE: CnssFields, CNOPS_DENTAIRE: CnopsFields, FAR_DENTAIRE: FarFields };

export function InsuranceEditor({ initial, type, purpose, source, busy, blocked, onSave, onCancel }: {
  initial: Draft;
  type: DocumentType;
  purpose: Purpose;
  source?: ConsultationSource;
  busy: boolean;
  blocked?: boolean;
  onSave(draft: Draft): void;
  onCancel?: () => void;
}) {
  const resolver = useMemo(
    () => zodResolver(z.preprocess(normalizeNumbers, insuranceDraftSchema(type, purpose))),
    [type, purpose],
  );
  const form = useForm<Draft>({ defaultValues: initial, resolver });
  const { isDirty, errors } = form.formState;
  useUnsavedChanges(isDirty);
  const VariantFields = variantForms[type];
  function cancel() {
    if (!isDirty || window.confirm("Abandonner les modifications non enregistrées ?")) onCancel?.();
  }
  return <FormProvider {...form}>
    <form noValidate onSubmit={form.handleSubmit(onSave)} className="space-y-5">
      <fieldset className="space-y-5" disabled={busy}>
        <InsuredFields cnss={type === "CNSS_DENTAIRE"} far={type === "FAR_DENTAIRE"} />
        <VariantFields />
        <Acts type={type} executed={isExecuted(purpose)} source={source} />
      </fieldset>
      {Object.keys(errors).length > 0 && <p role="alert">Vérifiez les champs signalés et les associations de soins avant d’enregistrer.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || blocked}>{busy ? "Enregistrement…" : "Enregistrer le brouillon"}</Button>
        {onCancel && <Button type="button" variant="outline" disabled={busy} onClick={cancel}>Annuler les modifications</Button>}
        {isDirty && <p role="status" className="text-sm text-muted-foreground">Modifications non enregistrées.</p>}
      </div>
    </form>
  </FormProvider>;
}

function Acts({ type, executed, source }: { type: DocumentType; executed: boolean; source?: ConsultationSource }) {
  const { fields, append, remove } = useFieldArray<Draft, "acts">({ name: "acts" });
  const max = maxActs[type];
  return <fieldset className="space-y-4 rounded-xl border bg-surface p-4">
    <legend className="px-2 font-semibold">Actes</legend>
    <p className="text-sm text-muted-foreground">{fields.length} / {max} actes</p>
    {executed && !source?.treatments.length && <p>Aucun soin actif à associer. Les soins sont ajoutés depuis la consultation.</p>}
    {fields.map((row, index) => <fieldset key={row.id} className="space-y-3 rounded-lg border p-4">
      <legend className="px-2 font-medium">Acte {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {executed ? <TreatmentFields index={index} source={source} far={type === "FAR_DENTAIRE"} /> : <>
          <DraftField name={`acts.${index}.fields.plannedDescription`} label="Libellé prévu" required />
          <DraftField name={`acts.${index}.fields.plannedDate`} label="Date prévue" kind="date" />
          <DraftField name={`acts.${index}.fields.plannedTooth`} label="Référence dentaire prévue" />
          <DraftField name={`acts.${index}.fields.quotedFeeMinor`} label="Honoraires du devis (DH)" kind="money" required={type === "FAR_DENTAIRE"} />
        </>}
        {type !== "FAR_DENTAIRE" && <>
          <DraftField name={`acts.${index}.fields.actCode`} label="Code de l’acte" />
          <DraftField name={`acts.${index}.fields.keyLetter`} label="Lettre-clé" />
          <DraftField name={`acts.${index}.fields.keyValueMinor`} label="Valeur de la lettre-clé (DH)" kind="money" />
        </>}
        <DraftField name={`acts.${index}.fields.coefficient`} label="Coefficient" kind="coefficient" />
      </div>
      <Button type="button" variant="outline" onClick={() => remove(index)}>Retirer l’acte {index + 1}</Button>
    </fieldset>)}
    <Button type="button" variant="outline" disabled={fields.length >= max || (executed && !source?.treatments.length)}
      onClick={() => append({ fields: {} })}>Ajouter un acte</Button>
  </fieldset>;
}

function TreatmentFields({ index, source, far }: { index: number; source?: ConsultationSource; far: boolean }) {
  const { setValue } = useFormContext<Draft>();
  const acts = useWatch<Draft, "acts">({ name: "acts" });
  const act = acts?.[index];
  const selected = source?.treatments.find(item => item.id === act?.treatmentId);
  const elsewhere = new Set(acts?.filter((_, position) => position !== index).map(item => item.treatmentId));
  const available = Object.fromEntries(source?.treatments.filter(item => !elsewhere.has(item.id))
    .map(item => [item.id, `${formatPatientDate(item.date)} · ${item.description}${item.tooth ? ` · ${item.tooth}` : ""}`]) ?? []);
  if (act?.treatmentId && !available[act.treatmentId]) available[act.treatmentId] = "Soin associé indisponible";
  const price = selected?.price;
  const prices: Record<string, string> = price?.state === "PRICED" ? { [price.chargeId]: formatMad(price.priceMinor) } : {};
  if (act?.chargeId && !prices[act.chargeId]) prices[act.chargeId] = "Prix associé indisponible";
  return <>
    <DraftField name={`acts.${index}.treatmentId`} label="Soin de la consultation" options={available} required
      onValueChange={value => { if (value !== act?.treatmentId) setValue(`acts.${index}.chargeId`, null, { shouldDirty: true }); }} />
    <DraftField name={`acts.${index}.chargeId`} label="Prix convenu associé" options={prices} required={far} />
  </>;
}
