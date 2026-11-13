"use client";

import { useId } from "react";
import { useController, useFieldArray, useWatch, type FieldPath } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { parseMad } from "@/lib/financial/money";
import { cnopsCare, cnssCare, type Draft } from "@/lib/insurance/api/schemas";
import { fdiTeeth } from "@/lib/insurance/tooth-reference";
import { careLabels, contextLabels, relationshipLabels, symbolLabels } from "./shared";

export function DraftField({ name, label, kind = "text", options, required, onValueChange }: {
  name: FieldPath<Draft>;
  label: string;
  kind?: "text" | "date" | "count" | "money" | "coefficient" | "digits";
  options?: Readonly<Record<string, string>>;
  required?: boolean;
  onValueChange?(value: string | null): void;
}) {
  const { field, fieldState } = useController<Draft>({ name });
  const id = useId();
  const { value, onChange, ...input } = field;
  // Raw numeric input stays in the form until validated, so an invalid amount cannot become zero.
  const attributes = { ...input, id, "aria-invalid": fieldState.invalid, "aria-describedby": fieldState.error ? `${id}-error` : undefined };
  const shown = typeof value === "number" && kind === "money"
    ? `${BigInt(value) / 100n},${String(BigInt(value) % 100n).padStart(2, "0")}`
    : typeof value === "string" || typeof value === "number" ? value : "";
  return <div className="min-w-0 space-y-2">
    <label className="block text-sm font-semibold" htmlFor={id}>{label}{required && <span className="font-normal text-muted-foreground"> · requis pour finaliser</span>}</label>
    {options
      ? <Select {...attributes} value={shown} onChange={event => {
        const selected = event.target.value || null;
        onChange(selected);
        onValueChange?.(selected);
      }}>
        <option value="">Non renseigné</option>
        {Object.entries(options).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </Select>
      : <Input {...attributes} type={kind === "date" ? "date" : "text"}
        inputMode={kind === "count" || kind === "digits" ? "numeric" : kind === "money" || kind === "coefficient" ? "decimal" : undefined}
        value={shown} onChange={event => onChange(event.target.value || null)} />}
    {fieldState.error && <p id={`${id}-error`} className="text-sm text-danger" role="alert">{fieldState.error.message}</p>}
  </div>;
}

function readNumber(value: unknown, kind: "count" | "money" | "coefficient") {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return null;
  if (kind === "money") return parseMad(text) ?? value;
  if (kind === "count") return /^\d+$/.test(text) ? Number(text) : value;
  return /^\d+(?:[,.]\d{1,4})?$/.test(text) ? Number(text.replace(",", ".")) : value;
}

/** RHF retains the typed text, while the resolver converts valid decimal inputs into DTO values. */
export function normalizeNumbers(draft: Draft) {
  return {
    ...draft,
    fields: {
      ...draft.fields,
      ...(draft.fields.insured?.relationship === "LUI_MEME" && { insured: { relationship: "LUI_MEME" } }),
      attachmentCount: readNumber(draft.fields.attachmentCount, "count"),
      ...(draft.fields.far && { far: { ...draft.fields.far, prospectusCount: readNumber(draft.fields.far.prospectusCount, "count") } }),
    },
    acts: draft.acts?.map(act => ({
      ...act, fields: {
        ...act.fields, coefficient: readNumber(act.fields.coefficient, "coefficient"),
        keyValueMinor: readNumber(act.fields.keyValueMinor, "money"), quotedFeeMinor: readNumber(act.fields.quotedFeeMinor, "money"),
      },
    })),
  };
}

export function InsuredFields({ cnss, far }: { cnss: boolean; far: boolean }) {
  const relationship = useWatch<Draft, "fields.insured.relationship">({ name: "fields.insured.relationship" });
  return <fieldset className="space-y-3 rounded-xl border bg-surface p-4">
    <legend className="px-2 font-semibold">Assuré</legend>
    <DraftField name="fields.insured.relationship" label="Lien du patient avec l’assuré" options={relationshipLabels} required />
    {relationship === "LUI_MEME"
      ? <p className="text-sm text-muted-foreground">L’identité de l’assuré est reprise de la fiche du patient.</p>
      : <div className="grid gap-4 sm:grid-cols-2">
        <DraftField name="fields.insured.firstName" label="Prénom de l’assuré" required />
        <DraftField name="fields.insured.lastName" label="Nom de l’assuré" required />
        <DraftField name="fields.insured.cin" label="CIN de l’assuré" required={far} />
        <DraftField name="fields.insured.address" label="Adresse de l’assuré" required={far} />
        {!cnss && <DraftField name="fields.insured.phone" label="Téléphone de l’assuré" required={far} />}
      </div>}
    <DraftField name="fields.attachmentCount" label="Nombre de pièces jointes" kind="count" required={far} />
  </fieldset>;
}

function DentalFields({ branch }: { branch: "cnss" | "cnops" }) {
  const care = useController<Draft>({ name: `fields.${branch}.careTypes` });
  const teeth = useController<Draft>({ name: `fields.${branch}.confirmedTeeth` });
  const available = branch === "cnss" ? cnssCare.options : cnopsCare.options;
  return <>
    <DraftField name={`fields.${branch}.registrationNumber`} label="Numéro d’immatriculation" required />
    <DraftField name={`fields.${branch}.priorAuthorizationNumber`} label="Numéro d’entente préalable" />
    <DraftField name={`fields.${branch}.accidentDate`} label="Date de l’accident" kind="date" />
    <DraftField name={`fields.${branch}.dentistDeclaration.place`} label="Lieu de la déclaration du dentiste" />
    <DraftField name={`fields.${branch}.dentistDeclaration.date`} label="Date de la déclaration du dentiste" kind="date" />
    <fieldset className="space-y-2 sm:col-span-2">
      <legend className="mb-2 text-sm font-medium">Catégories de soins</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">{available.map(option => {
        const selected = (care.field.value ?? []) as string[];
        return <label key={option} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={selected.includes(option)} onChange={event => care.field.onChange(
            event.target.checked ? [...selected, option] : selected.filter(value => value !== option),
          )} />{careLabels[option]}
        </label>;
      })}</div>
    </fieldset>
    <fieldset className="space-y-2 sm:col-span-2">
      <legend className="mb-2 text-sm font-medium">Dents confirmées (FDI)</legend>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">{fdiTeeth.map(tooth => {
        const selected = (teeth.field.value ?? []) as string[];
        return <label key={tooth} className="flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border text-sm has-checked:border-primary has-checked:bg-primary-tint">
          <input type="checkbox" className="size-4" checked={selected.includes(tooth)} onChange={event => teeth.field.onChange(
            event.target.checked ? [...selected, tooth] : selected.filter(value => value !== tooth),
          )} />{tooth}
        </label>;
      })}</div>
    </fieldset>
  </>;
}

export function CnssFields() {
  return <fieldset className="grid gap-4 rounded-xl border bg-surface p-4 sm:grid-cols-2">
    <legend className="px-2 font-semibold">Volet CNSS</legend>
    <DraftField name="fields.cnss.practitionerInp" label="INP du praticien" kind="digits" required />
    <DentalFields branch="cnss" />
  </fieldset>;
}

export function CnopsFields() {
  return <fieldset className="grid gap-4 rounded-xl border bg-surface p-4 sm:grid-cols-2">
    <legend className="px-2 font-semibold">Volet CNOPS</legend>
    <DraftField name="fields.cnops.affiliationNumber" label="Numéro d’affiliation" required />
    <DraftField name="fields.cnops.practitionerInpe" label="INPE du praticien" kind="digits" required />
    <DraftField name="fields.cnops.diagnosisCategory" label="Catégorie CIM-10 (facultatif)" />
    <DraftField name="fields.cnops.accidentCauses" label="Causes de l’accident" />
    <DentalFields branch="cnops" />
  </fieldset>;
}

export function FarFields() {
  const { fields, append, remove } = useFieldArray<Draft, "fields.far.marks">({ name: "fields.far.marks" });
  const teeth = Object.fromEntries(fdiTeeth.map(tooth => [tooth, tooth]));
  return <fieldset className="space-y-4 rounded-xl border bg-surface p-4">
    <legend className="px-2 font-semibold">Volet FAR</legend>
    <p className="text-sm text-muted-foreground">La référence de compte se saisit manuellement. La référence attendue par la mutuelle, les frais à déclarer et les justificatifs de paiement restent à confirmer.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <DraftField name="fields.far.accountNumber" label="Référence de compte FAR" required />
      <DraftField name="fields.far.rank" label="Grade" required />
      <DraftField name="fields.far.unit" label="Unité" required />
      <DraftField name="fields.far.practitionerInpe" label="INPE du praticien" kind="digits" required />
      <DraftField name="fields.far.care" label="Nature des soins" options={{ SOINS: careLabels.SOINS, PROTHESE: careLabels.PROTHESE }} required />
      <DraftField name="fields.far.context" label="Contexte" options={contextLabels} required />
      <DraftField name="fields.far.prospectusCount" label="Nombre de prospectus" kind="count" required />
      <DraftField name="fields.far.insuredStatementDate" label="Date de la déclaration de l’assuré" kind="date" required />
    </div>
    <fieldset className="space-y-3">
      <legend className="mb-2 font-medium">Marques dentaires</legend>
      {fields.map((row, index) => <div key={row.id} className="flex flex-wrap items-end gap-3">
        <DraftField name={`fields.far.marks.${index}.tooth`} label={`Dent FDI ${index + 1}`} options={teeth} />
        <DraftField name={`fields.far.marks.${index}.symbol`} label={`Symbole ${index + 1}`} options={symbolLabels} />
        <Button type="button" variant="outline" onClick={() => remove(index)}>Retirer la marque {index + 1}</Button>
      </div>)}
      <Button type="button" variant="outline" disabled={fields.length >= 52} onClick={() => append({ tooth: "", symbol: null })}>Ajouter une marque</Button>
    </fieldset>
  </fieldset>;
}
