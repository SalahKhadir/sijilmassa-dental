import type { ReactNode } from "react";
import { formatMad } from "@/lib/financial/money";
import type { InsuranceDetail } from "@/lib/insurance/api/schemas";
import type { AdministrativePatient } from "@/lib/patients/api/client";
import { formatPatientDate } from "@/lib/patients/dates";
import { careLabels, contextLabels, familyLabels, purposeLabels, relationshipLabels, symbolLabels, type ConsultationSource } from "./shared";

const civil = (value?: string | null) => value ? formatPatientDate(value) : undefined;
const money = (value?: number | string | null) => value == null ? undefined : formatMad(value);
const sexLabels: Record<string, string> = { F: "Féminin", M: "Masculin" };

function Values({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
    {rows.map(([label, value]) => <div className="min-w-0" key={label}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-words">{value == null || value === "" ? "Non renseigné" : value}</dd>
    </div>)}
  </dl>;
}

export function documentHolder(detail: InsuranceDetail, patient?: AdministrativePatient) {
  const holder = detail.draft?.fields.insured;
  if (detail.snapshot) return detail.snapshot.insured;
  if (holder?.relationship !== "LUI_MEME") return holder;
  return {
    relationship: holder.relationship, firstName: detail.beneficiary.firstName, lastName: detail.beneficiary.lastName,
    cin: detail.beneficiary.cin, address: patient?.identity.address,
    phone: detail.documentType === "CNSS_DENTAIRE" ? undefined : patient?.identity.gsm,
  };
}

export function finalizationWarnings(detail: InsuranceDetail, patient: AdministrativePatient, source?: ConsultationSource) {
  const draft = detail.draft;
  if (!draft) return [];
  const holder = documentHolder(detail, patient);
  const warnings: string[] = [];
  const required = (values: [string, unknown][]) => {
    const missing = values.filter(([, value]) => value == null || (typeof value === "string" && !value.trim())).map(([label]) => label);
    if (missing.length) warnings.push(`À renseigner — ${missing.join(", ")}.`);
  };
  const { fields, acts } = draft;
  required([
    ["lien avec l’assuré", holder?.relationship], ["prénom de l’assuré", holder?.firstName], ["nom de l’assuré", holder?.lastName],
    ["prénom du patient", detail.beneficiary.firstName], ["nom du patient", detail.beneficiary.lastName],
  ]);
  if (fields.cnss) required([["numéro d’immatriculation", fields.cnss.registrationNumber], ["INP", fields.cnss.practitionerInp]]);
  if (fields.cnops) required([["numéro d’immatriculation", fields.cnops.registrationNumber],
    ["numéro d’affiliation", fields.cnops.affiliationNumber], ["INPE", fields.cnops.practitionerInpe]]);
  const far = fields.far;
  if (far) {
    required([["référence de compte FAR", far.accountNumber], ["grade", far.rank], ["unité", far.unit], ["INPE", far.practitionerInpe],
      ["nature des soins", far.care], ["contexte", far.context], ["nombre de prospectus", far.prospectusCount],
      ["nombre de pièces jointes", fields.attachmentCount], ["date de déclaration de l’assuré", far.insuredStatementDate],
      ["CIN de l’assuré", holder?.cin], ["adresse de l’assuré", holder?.address], ["téléphone de l’assuré", holder?.phone],
      ["date de naissance du patient", detail.beneficiary.dateOfBirth]]);
    if (far.marks?.some(mark => !mark.symbol)) warnings.push("Choisissez un symbole pour chaque dent marquée.");
  }
  const executed = detail.purpose === "EXECUTION" || detail.purpose === "RECUS";
  if (executed && !detail.consultation?.finalized) warnings.push(detail.consultation
    ? "Terminez la consultation liée avant de finaliser le document."
    : "Créez un brouillon lié à une consultation pour finaliser des soins exécutés ou des reçus.");
  if (!acts?.length) warnings.push("Ajoutez au moins un acte.");
  acts?.forEach((act, index) => {
    const number = index + 1;
    if (executed) {
      const treatment = source?.treatments.find(item => item.id === act.treatmentId);
      if (!treatment) warnings.push(`Acte ${number} — sélectionnez un soin actif de la consultation.`);
      const price = treatment?.price;
      if ((far || act.chargeId) && (price?.state !== "PRICED" || price.chargeId !== act.chargeId)) {
        warnings.push(`Acte ${number} — associez le prix convenu du soin.`);
      }
    } else {
      required([[`libellé de l’acte ${number}`, act.fields.plannedDescription]]);
      if (far) required([[`honoraires du devis pour l’acte ${number}`, act.fields.quotedFeeMinor]]);
    }
  });
  return warnings;
}

export function DocumentValues({ detail, patient, source }: { detail: InsuranceDetail; patient?: AdministrativePatient; source?: ConsultationSource }) {
  const fields = detail.snapshot?.fields ?? detail.draft?.fields;
  const holder = documentHolder(detail, patient);
  const dental = fields?.cnss ?? fields?.cnops;
  const cnops = fields?.cnops;
  const far = fields?.far;
  const beneficiary = detail.beneficiary;
  const acts = detail.snapshot?.acts ?? detail.draft?.acts?.map(act => {
    const treatment = source?.treatments.find(item => item.id === act.treatmentId);
    const price = treatment?.price;
    const hasPrice = price?.state === "PRICED" && price.chargeId === act.chargeId;
    const data = act.fields;
    return {
      ...act, date: treatment?.date ?? data.plannedDate, description: treatment?.description ?? data.plannedDescription,
      tooth: treatment?.tooth ?? data.plannedTooth, feeMinor: hasPrice ? price.priceMinor : data.quotedFeeMinor,
      feeSource: hasPrice ? "V9_AGREED_PRICE" : data.quotedFeeMinor != null ? "MANUAL_QUOTE" : null,
      actCode: data.actCode, keyLetter: data.keyLetter, keyValueMinor: data.keyValueMinor, coefficient: data.coefficient,
    };
  });
  return <div className="space-y-5">
    <Values rows={[
      ["Organisme", familyLabels[detail.documentType]], ["Objet", purposeLabels[detail.purpose]],
      ["Patient", [beneficiary.firstName, beneficiary.lastName].filter(Boolean).join(" ")],
      ["CIN du patient", beneficiary.cin], ["Naissance du patient", civil(beneficiary.dateOfBirth)],
      ["Sexe", beneficiary.sex ? sexLabels[beneficiary.sex] ?? beneficiary.sex : undefined],
      ["Consultation", detail.consultation ? `${formatPatientDate(detail.consultation.date)} · ${detail.consultation.finalized ? "Terminée" : "Brouillon"}` : "Sans consultation liée"],
      ["Pièces jointes", fields?.attachmentCount],
    ]} />
    <section className="space-y-2 border-t pt-4">
      <h3 className="font-semibold">Assuré</h3>
      <Values rows={[
        ["Lien", holder?.relationship ? relationshipLabels[holder.relationship] : undefined],
        ["Prénom", holder?.firstName], ["Nom", holder?.lastName], ["CIN", holder?.cin], ["Adresse", holder?.address],
        ...(detail.documentType !== "CNSS_DENTAIRE" ? [["Téléphone", holder?.phone] as [string, ReactNode]] : []),
      ]} />
    </section>
    <section className="space-y-2 border-t pt-4">
      <h3 className="font-semibold">Déclarations</h3>
      {dental && <Values rows={[
        ["Numéro d’immatriculation", dental.registrationNumber],
        ...(cnops ? [
          ["Numéro d’affiliation", cnops.affiliationNumber], ["INPE", cnops.practitionerInpe],
          ["Catégorie CIM-10", cnops.diagnosisCategory], ["Causes de l’accident", cnops.accidentCauses],
        ] as [string, ReactNode][] : [["INP", fields?.cnss?.practitionerInp] as [string, ReactNode]]),
        ["Catégories de soins", dental.careTypes?.map(care => careLabels[care]).join(", ")],
        ["Numéro d’entente préalable", dental.priorAuthorizationNumber], ["Date de l’accident", civil(dental.accidentDate)],
        ["Dents confirmées", dental.confirmedTeeth?.join(", ")],
        ["Lieu de la déclaration du dentiste", dental.dentistDeclaration?.place],
        ["Date de la déclaration du dentiste", civil(dental.dentistDeclaration?.date)],
      ]} />}
      {far && <Values rows={[
        ["Référence de compte FAR", far.accountNumber], ["Grade", far.rank], ["Unité", far.unit],
        ["INPE", far.practitionerInpe], ["Nature des soins", far.care ? careLabels[far.care] : undefined],
        ["Contexte", far.context ? contextLabels[far.context] : undefined],
        ["Nombre de prospectus", far.prospectusCount], ["Date de la déclaration de l’assuré", civil(far.insuredStatementDate)],
        ["Marques dentaires", far.marks?.map(mark => `${mark.tooth} · ${mark.symbol ? symbolLabels[mark.symbol] : "Symbole manquant"}`).join(", ")],
      ]} />}
    </section>
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">Actes</h3>
      {!acts?.length && <p>Aucun acte renseigné.</p>}
      {acts?.map((act, index) => <div className="space-y-2 rounded-lg border p-3" key={index}>
        <h4 className="font-medium">Acte {index + 1}</h4>
        <Values rows={[
          ["Libellé", act.description], ["Date", civil(act.date)], ["Référence dentaire", act.tooth],
          ...(detail.documentType !== "FAR_DENTAIRE" ? [
            ["Code de l’acte", act.actCode], ["Lettre-clé", act.keyLetter], ["Valeur de la lettre-clé", money(act.keyValueMinor)],
          ] as [string, ReactNode][] : []),
          ["Coefficient", act.coefficient],
          ["Honoraires", money(act.feeMinor)], ["Origine des honoraires", act.feeSource === "V9_AGREED_PRICE" ? "Prix convenu du soin"
            : act.feeSource === "MANUAL_QUOTE" ? "Devis saisi" : undefined],
          ...(act.treatmentId ? [["Référence du soin associé", act.treatmentId] as [string, ReactNode]] : []),
          ...(act.chargeId ? [["Référence du prix associé", act.chargeId] as [string, ReactNode]] : []),
        ]} />
      </div>)}
      {detail.snapshot && <p>Total des honoraires · {money(detail.snapshot.knownCompleteFeeTotalMinor) ?? "Indéterminé"}</p>}
    </section>
  </div>;
}
