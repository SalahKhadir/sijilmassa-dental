import { insuranceDraftSchema, policySchema } from "../schema.ts";
import { isCalendarDate } from "../../patients/dates.ts";
import { cnssActColumns, cnssActRows, cnssChecks, cnssFields, type CnssField } from "./cnss-mapping.ts";
import { cnssToothPositions, isCnssTooth } from "./cnss-chart-mapping.ts";

import { CnssPdfError } from "./errors.ts";
export { CnssPdfError } from "./errors.ts";
import { renderInsuranceOverlay, insuranceAmount, insuranceDate, insuranceTotal, overlayWriter, type InsurancePdfInput } from "./overlay.ts";
export type CnssPdfInput = InsurancePdfInput;
export interface CnssPlacement { field: CnssField; text: string }
export const cnssAmount = insuranceAmount;
const frenchDate = insuranceDate;
const fdi = /^(?:[1-4][1-8]|[5-8][1-5])$/;
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CnssPdfError(message);
}

/** Pure data plan. No diagnosis, cotation, tooth or reimbursement is inferred. */
export function planCnssPdf({ draft, patient, policy }: CnssPdfInput) {
  const validDraft = insuranceDraftSchema.safeParse(draft);
  requireValue(validDraft.success, "Vérifiez les champs du brouillon avant de générer le PDF.");
  requireValue(draft.provider === "CNSS", "Seule la feuille CNSS peut être générée.");
  requireValue(patient.id === draft.patientId, "Sélectionnez le patient correspondant au brouillon.");
  requireValue(policy && policySchema.safeParse(policy).success && policy.id === draft.policyId && policy.patientId === patient.id && policy.provider === "CNSS",
    "Associez une police CNSS à ce patient avant de générer le PDF.");
  requireValue(policy.registrationNumber?.trim(), "Renseignez le numéro d’immatriculation de l’assuré dans sa couverture CNSS.");
  const insured = policy.insuredPerson;
  requireValue(insured.relationship !== "AUTRE", "Précisez le lien CNSS : conjoint, enfant ou lui-même. La case « Autre » n’existe pas sur ce formulaire.");
  requireValue(insured.isPatient === (insured.relationship === "LUI_MEME"), "Vérifiez la concordance entre l’assuré et le lien de parenté.");
  requireValue(patient.identity.firstName.trim() && patient.identity.lastName.trim(), "Renseignez le nom et le prénom du bénéficiaire.");
  requireValue(draft.acts.length > 0 && draft.acts.length <= 3, "Le modèle CNSS accepte de 1 à 3 actes. Répartissez les actes sur plusieurs feuilles.");
  const { placements, warnings, put, date } = overlayWriter(CnssPdfError);
  put(cnssFields.insuredName, `${insured.lastName} ${insured.firstName}`);
  put(cnssFields.registration, policy.registrationNumber);
  put(cnssFields.insuredCin, insured.cin);
  // Wrapping to the two printed address lines is measured after embedding the font.
  put(cnssFields.address1, insured.address);
  put(cnssFields.patientName, `${patient.identity.lastName} ${patient.identity.firstName}`);
  date(cnssFields.birthDate, patient.identity.dateOfBirth);
  put(cnssFields.patientCin, patient.identity.cin);
  put(cnssChecks[insured.relationship], "X");
  put(cnssChecks[draft.documentPurpose], "X");
  if (patient.identity.sex === "M" || patient.identity.sex === "F") put(cnssChecks[patient.identity.sex], "X");
  else warnings.push("Sexe du bénéficiaire : non renseigné, cases laissées vides.");
  put(cnssFields.inp, "084209071");
  if (!draft.cnssDetails?.careTypes.length) warnings.push("Type de soins : aucune case sélectionnée.");
  for (const type of draft.cnssDetails?.careTypes ?? []) put(cnssChecks[type], "X");
  put(cnssFields.priorAuth, draft.cnssDetails?.priorAuthorizationNumber);
  date(cnssFields.accidentDate, draft.cnssDetails?.accidentDate);
  put(cnssFields.attachments, draft.manualFields.attachmentCount);
  put(cnssFields.insuredPlace, draft.manualFields.declarationPlace);
  put(cnssFields.dentistPlace, draft.manualFields.declarationPlace);
  date(cnssFields.insuredDate, draft.manualFields.declarationDate);
  date(cnssFields.dentistDate, draft.manualFields.declarationDate);
  const total = insuranceTotal(draft, CnssPdfError);
  put({ ...cnssFields.total, align: "right" }, total === undefined ? undefined : cnssAmount(total));
  draft.acts.forEach((act, index) => {
    requireValue(isCalendarDate(act.treatmentDate), `Acte ${index + 1} : saisissez une date de soin valide.`);
    const tooth = act.toothReference?.trim();
    const values = {
      toothReference: tooth && fdi.test(tooth) ? tooth : undefined,
      actCode: act.actCode,
      treatmentDate: frenchDate(act.treatmentDate),
      ngap: [act.ngapKeyLetter, act.ngapCoefficient].filter(v => v !== undefined && v !== "").join(" "),
      amountMinor: act.amountMinor === undefined ? undefined : cnssAmount(act.amountMinor),
    };
    for (const [key, [x, width, label, format]] of Object.entries(cnssActColumns)) {
      put({ page: 2, label: `Acte ${index + 1} - ${label}`, source: `acts[${index}].${key}`, x, y: cnssActRows[index], width, size: 7, align: "center", format }, values[key as keyof typeof values]);
    }
  });
  const chartMarks = (validDraft.data.cnssDetails?.confirmedTeeth ?? []).map(tooth => {
    requireValue(isCnssTooth(tooth), "La dent confirmée ne correspond pas au schéma CNSS.");
    return { tooth, ...cnssToothPositions[tooth] };
  });
  if (!chartMarks.length) warnings.push("Schéma dentaire : aucune dent confirmée, aucune marque ajoutée.");
  warnings.push("Les carrés du schéma sont des repères de sélection neutres, sans signification clinique ou convention officielle de soin.",
    "Le modèle ne comporte pas de colonne de description libre. Vérifiez les codes saisis ; aucune cotation n’est déduite des descriptions.",
    "Valeur clé, remboursements, signatures et cachets : à compléter manuellement si nécessaire.");
  return { placements, warnings, chartMarks };
}

export async function renderCnssPdf(input: CnssPdfInput, assets: { template: Uint8Array; font: Uint8Array }) {
  const plan = planCnssPdf(input);
  return renderInsuranceOverlay(plan, assets, {
    provider: "CNSS", width: 728.4, height: 1031.76, rotation: 270,
    ErrorClass: CnssPdfError, addressLines: [cnssFields.address1, cnssFields.address2],
  });
}
