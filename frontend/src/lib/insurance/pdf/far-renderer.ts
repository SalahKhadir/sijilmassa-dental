import { farActColumns, farActRows, farMedicalColumns, farMedicalRows, farFields, farChecks, farPurposeStrikes } from "./far-mapping.ts";
import { farToothPositions } from "./far-chart-mapping.ts";
import { validateFarInput } from "./far-validation.ts";
import { FarPdfError } from "./errors.ts";
import { overlayWriter, insuranceAmount, insuranceDate, insuranceTotal, renderInsuranceOverlay, type InsurancePdfInput } from "./overlay.ts";
import type { FdiTooth } from "../tooth-reference.ts";
export function planFarPdf(input: InsurancePdfInput) {
  const { policy, details } = validateFarInput(input);
  const { draft, patient } = input;
  const { placements, warnings, put, date } = overlayWriter(FarPdfError);
  const insured = policy.insuredPerson;
  put(farFields.insuredCin, insured.cin);
  put(farFields.account, policy.militaryAccountNumber);
  put(farFields.phone, insured.phone);
  put(farFields.insuredName, `${insured.lastName} ${insured.firstName}`);
  put(farFields.grade, policy.militaryRank);
  put(farFields.unit, policy.militaryUnit);
  put(farFields.address, insured.address);
  put(farFields.patientName, `${patient.identity.lastName} ${patient.identity.firstName}`);
  date(farFields.birthDate, patient.identity.dateOfBirth);
  if (insured.relationship !== "AUTRE") put(farChecks[insured.relationship], "X");
  // No undefined/default value is interpreted as a checkbox selection.
  if (details.context) put(farChecks[details.context], "X");
  if (details.careType) put(farChecks[details.careType], "X");
  put(farFields.inpe, details.practitionerInpe);
  const total = insuranceTotal(draft, FarPdfError);
  put(farFields.total, total === undefined ? undefined : String(BigInt(total) / 100n));
  put(farFields.totalCentimes, total === undefined ? undefined : String(BigInt(total) % 100n).padStart(2, "0"));
  put(farFields.prospectusCount, details.prospectusCount);
  put(farFields.attachments, draft.manualFields.attachmentCount);
  date(farFields.declarationDate, draft.manualFields.declarationDate);
  draft.acts.forEach((act, index) => {
    const amount = act.amountMinor === undefined ? undefined : insuranceAmount(act.amountMinor);
    const values = {
      treatmentDate: insuranceDate(act.treatmentDate), toothReference: act.toothReference,
      description: `${act.description}${act.actCode ? ` (${act.actCode})` : ""}`,
      coefficient: act.ngapCoefficient, amountMinor: amount,
    };
    for (const [key, [x, width, label, format]] of Object.entries(farActColumns)) {
      put({ page: 1, label: `Acte ${index + 1} - ${label}`, source: `acts[${index}].${key}`,
        x, y: farActRows[index], width, size: 7, align: "center", format }, values[key as keyof typeof values]);
    }
    const medicalValues = {
      treatmentDate: values.treatmentDate,
      description: `${act.actCode || act.description}${act.ngapCoefficient === undefined ? "" : ` / coeff. ${act.ngapCoefficient}`}`,
      amountMinor: amount,
    };
    for (const [key, [x, width, label, format]] of Object.entries(farMedicalColumns)) {
      put({ page: 2, label: `Volet médecin/dentiste - acte ${index + 1} - ${label}`, source: `acts[${index}].${key}`,
        x, y: farMedicalRows[index], width, size: 6.5, align: "center", format }, medicalValues[key as keyof typeof medicalValues]);
    }
    if (!act.actCode) warnings.push(`Acte ${index + 1} : aucun code manuel renseigné ; la description est conservée sans cotation déduite.`);
  });
  const chartMarks = (details.toothMarks ?? []).map(mark => ({
    tooth: mark.tooth, ...farToothPositions[mark.tooth as FdiTooth], page: 1 as const, symbol: mark.symbol,
  }));
  if (!chartMarks.length) warnings.push("Schéma FAR : aucune dent sélectionnée, aucune marque ajoutée.");
  if (details.priorAuthorizationNumber)
    warnings.push("Accord préalable : référence conservée dans le brouillon, sans champ vérifié pour la reporter sur ce modèle. Les zones de contrôle médical restent vierges.");
  warnings.push("Page 2, ordonnance : identité et rédaction laissées à la main du médecin, conformément à la notice imprimée.",
    "Page 2 : compléter manuellement le cachet avec INPE. Les autres professions, signatures, cachets et approbations restent vierges.",
    "Le N° de compte est repris du champ FAR de la couverture, sans utiliser l’immatriculation. Vérifiez la référence attendue par la mutuelle.");
  return { placements, warnings, chartMarks,
    lines: details.dentalPurpose ? [farPurposeStrikes[details.dentalPurpose]] : [] };
}
export async function renderFarPdf(input: InsurancePdfInput, assets: { template: Uint8Array; font: Uint8Array }) {
  return renderInsuranceOverlay(planFarPdf(input), assets, {
    provider: "FAR", width: 842.25, height: 595.5, rotation: 0, ErrorClass: FarPdfError,
    addressLines: [], pageOrigins: [{ x: 0, y: 8.580014 }, { x: 0, y: 8.580014 }],
  });
}
