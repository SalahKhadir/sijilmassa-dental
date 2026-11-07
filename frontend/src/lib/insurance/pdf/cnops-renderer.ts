import { cnopsActColumns, cnopsActRows, cnopsChecks, cnopsFields } from "./cnops-mapping.ts";
import { cnopsToothPositions } from "./cnops-chart-mapping.ts";
import { validateCnopsInput } from "./cnops-validation.ts";
import { CnopsPdfError } from "./errors.ts";
import { insuranceAmount, insuranceDate, insuranceTotal, overlayWriter, renderInsuranceOverlay, type InsurancePdfInput } from "./overlay.ts";
import type { FdiTooth } from "../tooth-reference.ts";

export function planCnopsPdf(input: InsurancePdfInput) {
  const { policy, details } = validateCnopsInput(input);
  const { draft, patient } = input;
  const { placements, warnings, put, date } = overlayWriter(CnopsPdfError);
  const insured = policy.insuredPerson;
  put(cnopsFields.phone, insured.phone);
  put(cnopsFields.insuredName, `${insured.lastName} ${insured.firstName}`);
  put(cnopsFields.affiliation, policy.affiliationNumber);
  put(cnopsFields.registration, policy.registrationNumber);
  put(cnopsFields.insuredCin, insured.cin);
  put(cnopsFields.address1, insured.address);
  if (insured.relationship === "CONJOINT" || insured.relationship === "ENFANT")
    put(cnopsChecks[insured.relationship], "X");
  else warnings.push("Lui-même : aucune case dédiée n’est imprimée ; Conjoint et Enfant restent vides.");
  const total = insuranceTotal(draft, CnopsPdfError);
  put(cnopsFields.total, total === undefined ? undefined : insuranceAmount(total));
  put(cnopsFields.attachments, draft.manualFields.attachmentCount);
  put(cnopsFields.patientName, `${patient.identity.lastName} ${patient.identity.firstName}`);
  date(cnopsFields.birthDate, patient.identity.dateOfBirth);
  put(cnopsFields.patientCin, patient.identity.cin);
  if (patient.identity.sex === "M" || patient.identity.sex === "F") put(cnopsChecks[patient.identity.sex], "X");
  else warnings.push("Sexe du bénéficiaire : non renseigné, cases laissées vides.");
  put(cnopsFields.inpe, details.practitionerInpe);
  put(cnopsChecks[draft.documentPurpose], "X");
  if (!details.careTypes.length) warnings.push("Type de soins : aucune case sélectionnée.");
  for (const type of details.careTypes) put(cnopsChecks[type], "X");
  put(cnopsFields.priorAuth, details.priorAuthorizationNumber);
  date(cnopsFields.accidentDate, details.accidentDate);
  put(cnopsFields.accidentCauses, details.accidentCauses);
  put(cnopsFields.insuredPlace, draft.manualFields.declarationPlace);
  put(cnopsFields.dentistPlace, draft.manualFields.declarationPlace);
  date(cnopsFields.insuredDate, draft.manualFields.declarationDate);
  date(cnopsFields.dentistDate, draft.manualFields.declarationDate);
  put(cnopsFields.cim10, details.diagnosisCodeCIM10);
  draft.acts.forEach((act, index) => {
    const values = {
      toothReference: act.toothReference,
      actCode: act.actCode,
      treatmentDate: insuranceDate(act.treatmentDate),
      ngap: [act.ngapKeyLetter, act.ngapCoefficient].filter(v => v !== undefined && v !== "").join(" "),
      amountMinor: act.amountMinor === undefined ? undefined : insuranceAmount(act.amountMinor),
    };
    for (const [key, [x, width, label, format]] of Object.entries(cnopsActColumns)) {
      put({ page: 2, label: `Acte ${index + 1} - ${label}`, source: `acts[${index}].${key}`,
        x, y: cnopsActRows[index], width, size: 6.5, align: "center", format }, values[key as keyof typeof values]);
    }
  });
  const chartMarks = (details.confirmedTeeth ?? []).map(tooth => ({ tooth, ...cnopsToothPositions[tooth as FdiTooth] }));
  if (!chartMarks.length) warnings.push("Schéma dentaire : aucune dent confirmée, aucune marque ajoutée.");
  warnings.push("Les carrés sont des repères neutres à valider par le dentiste. L’arcade temporaire ne porte pas de numéros lisibles sur ce modèle.",
    "Aucune colonne de description libre n’est imprimée ; aucun code ni diagnostic n’est déduit des descriptions.",
    "Valeurs clés, remboursements, INP des autres professionnels, signatures et cachets restent à compléter manuellement si nécessaire.");
  return { placements, warnings, chartMarks };
}
export async function renderCnopsPdf(input: InsurancePdfInput, assets: { template: Uint8Array; font: Uint8Array }) {
  return renderInsuranceOverlay(planCnopsPdf(input), assets, {
    provider: "CNOPS", width: 799.44, height: 574.08, rotation: 0,
    ErrorClass: CnopsPdfError, addressLines: [cnopsFields.address1, cnopsFields.address2],
  });
}
