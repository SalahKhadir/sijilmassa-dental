import { PDFDocument, degrees, PrintScaling, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { insuranceDraftSchema, policySchema } from "../schema.ts";
import type { CreateInsuranceDraftInput, PatientInsurancePolicy } from "../types.ts";
import type { Patient } from "../../patients/types.ts";
import { isCalendarDate } from "../../patients/dates.ts";
import { cnssActColumns, cnssActRows, cnssChecks, cnssFields, type CnssField } from "./cnss-mapping.ts";
import { visualToPdf } from "./coordinates.ts";
import { cnssChartMark, cnssToothPositions, isCnssTooth } from "./cnss-chart-mapping.ts";

import { CnssPdfError } from "./errors.ts";
export { CnssPdfError } from "./errors.ts";
export interface CnssPdfInput {
  draft: CreateInsuranceDraftInput;
  patient: Pick<Patient, "id" | "identity">;
  policy?: PatientInsurancePolicy;
}
export interface CnssPlacement { field: CnssField; text: string }
export const cnssAmount = (minor: number) =>
  `${Math.floor(minor / 100)},${String(minor % 100).padStart(2, "0")}`;
const frenchDate = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
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
  const placements: CnssPlacement[] = [];
  const warnings: string[] = [];
  function put(field: CnssField, value?: string | number) {
    if (value !== undefined && String(value).trim()) placements.push({ field, text: String(value).trim().normalize("NFC") });
    else warnings.push(`${field.label} : non renseigné, laissé vide.`);
  }
  function date(field: CnssField, value?: string) {
    if (value) requireValue(isCalendarDate(value), `${field.label} : saisissez une date valide.`);
    put(field, value ? (field.slots ? frenchDate(value).replaceAll("/", "") : frenchDate(value)) : undefined);
  }
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
  const completeAmounts = draft.acts.every(a => a.amountMinor !== undefined);
  const sum = draft.acts.reduce((n, a) => n + (a.amountMinor ?? 0), 0);
  requireValue(Number.isSafeInteger(sum) && draft.acts.every(a => a.amountMinor === undefined || Number.isSafeInteger(a.amountMinor)), "Les honoraires dépassent la précision monétaire autorisée.");
  const total = draft.manualFields.totalFeesMinor ?? (completeAmounts ? sum : undefined);
  requireValue(total === undefined || Number.isSafeInteger(total), "Le total dépasse la précision monétaire autorisée.");
  requireValue(!completeAmounts || total === sum, "Le total des frais diffère des actes. Corrigez les montants avant de générer le PDF.");
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
  let document: PDFDocument;
  try { document = await PDFDocument.load(assets.template, { updateMetadata: false }); }
  catch { throw new CnssPdfError("Le modèle CNSS ne peut pas être lu. Rechargez la page."); }
  requireValue(document.getPageCount() === 2, "Le modèle CNSS doit conserver ses deux pages.");
  for (const page of document.getPages()) {
    const media = page.getMediaBox(), crop = page.getCropBox();
    requireValue(page.getRotation().angle === 270 && [media, crop].every(b => Math.abs(b.x) < .01 && Math.abs(b.y) < .01 && Math.abs(b.width - 728.4) < .01 && Math.abs(b.height - 1031.76) < .01), "Les boîtes ou la rotation du modèle CNSS ont changé. Vérifiez le fichier officiel.");
  }
  document.registerFontkit(fontkit);
  let font: PDFFont;
  try { font = await document.embedFont(assets.font, { subset: true }); }
  catch { throw new CnssPdfError("La police du PDF est indisponible. Rechargez la page."); }
  const supported = new Set(font.getCharacterSet());
  const measured: CnssPlacement[] = [];
  for (const { field, text } of plan.placements) {
    requireValue(!/[\r\n\t]/.test(text) && [...text].every(c => supported.has(c.codePointAt(0)!)), `${field.label} : un caractère n’est pas pris en charge. Corrigez le texte.`);
    if (field === cnssFields.address1 && font.widthOfTextAtSize(text, field.size) > field.width) {
      const words = text.split(/\s+/); let line = ""; const lines: string[] = [];
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, field.size) > field.width && line) { lines.push(line); line = word; } else line = next;
      }
      lines.push(line);
      requireValue(lines.length <= 2, "L’adresse dépasse les deux lignes du modèle CNSS. Abrégez-la sans perdre d’information.");
      lines.forEach((text, i) => measured.push({ field: i ? cnssFields.address2 : field, text }));
    } else measured.push({ field, text });
  }
  for (const { field, text } of measured) {
    const slotWidth = 8;
    requireValue(field.slots ? text.length <= field.slots.length && [...text].every(c => font.widthOfTextAtSize(c, field.size) <= slotWidth) : font.widthOfTextAtSize(text, field.size) <= field.width,
      `${field.label} : le texte dépasse la zone du modèle CNSS. Corrigez ce champ ; aucun texte n’a été tronqué.`);
    const page = document.getPages()[field.page - 1];
    const box = { ...page.getCropBox(), rotation: page.getRotation().angle };
    function draw(value: string, x: number) {
      const position = visualToPdf(x, field.y, box);
      page.drawText(value, { ...position, font, size: field.size, rotate: degrees(box.rotation), color: rgb(0, 0, 0) });
    }
    if (field.slots) [...text].forEach((c, i) => draw(c, field.x + field.slots![i] + (slotWidth - font.widthOfTextAtSize(c, field.size)) / 2));
    else {
      const spare = field.width - font.widthOfTextAtSize(text, field.size);
      draw(text, field.x + (field.align === "right" ? spare : field.align === "center" ? spare / 2 : 0));
    }
  }
  const chartPage = document.getPages()[1];
  const chartBox = { ...chartPage.getCropBox(), rotation: chartPage.getRotation().angle };
  for (const mark of plan.chartMarks) {
    // A square is invariant under the page rotation. Position its native centre
    // with the same visual transform as text, then offset by half its size.
    const centre = visualToPdf(mark.x, mark.y, chartBox);
    chartPage.drawRectangle({
      x: centre.x - cnssChartMark.size / 2,
      y: centre.y - cnssChartMark.size / 2,
      width: cnssChartMark.size,
      height: cnssChartMark.size,
      borderWidth: cnssChartMark.borderWidth,
      borderColor: rgb(94 / 255, 11 / 255, 27 / 255),
    });
  }
  document.setTitle("Feuille de soins dentaires CNSS");
  document.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  return { bytes: await document.save(), warnings: plan.warnings };
}
