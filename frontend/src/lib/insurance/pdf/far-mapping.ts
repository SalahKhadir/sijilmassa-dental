import type { OverlayField } from "./overlay.ts";
type Panel = "DENTAIRE" | "ADHERENT" | "BENEFICIAIRE" | "DECLARATION" | "ACTES_MEDICAUX";
export interface FarField extends OverlayField { panel: Panel }
/** Visual coordinates from each displayed CropBox, NOT raw native y values. */
function field(panel: Panel, label: string, source: string, x: number, y: number, width: number,
  format: OverlayField["format"] = "text", page: 1 | 2 = 1): FarField {
  return { panel, label, source, x, y, width, format, page, size: 8, align: "left" };
}
export const farFields = {
  insuredCin: field("ADHERENT", "N° Carte Nationale d’Identité", "policy.insuredPerson.cin", 585, 169, 110),
  account: field("ADHERENT", "N° de Compte", "policy.militaryAccountNumber", 539, 189, 164),
  phone: field("ADHERENT", "N° de Téléphone", "policy.insuredPerson.phone", 549, 208, 177),
  insuredName: field("ADHERENT", "Nom et Prénom - adhérent", "policy.insuredPerson", 525, 237, 190),
  grade: field("ADHERENT", "Grade", "policy.militaryRank", 480, 254, 234),
  unit: field("ADHERENT", "Unité", "policy.militaryUnit", 480, 271, 234),
  address: field("ADHERENT", "Adresse", "policy.insuredPerson.address", 490, 287, 240),
  patientName: field("BENEFICIAIRE", "Nom et Prénom - bénéficiaire", "patient.identity", 537, 333, 180),
  birthDate: { ...field("BENEFICIAIRE", "Date de Naissance", "patient.identity.dateOfBirth", 542, 348, 171, "date"),
    slots: [17, 23, 62, 68, 116, 122, 128, 134] },
  inpe: field("DECLARATION", "N° INPE", "farDetails.practitionerInpe", 548, 437, 114),
  total: { ...field("DECLARATION", "Frais engagés", "manualFields.totalFeesMinor / sum(acts.amountMinor)", 447, 495, 28, "amount"), align: "right" as const },
  totalCentimes: field("DECLARATION", "Frais engagés - centimes", "manualFields.totalFeesMinor / sum(acts.amountMinor)", 484, 495, 18, "amount"),
  prospectusCount: field("DECLARATION", "Nombre prospectus", "farDetails.prospectusCount", 616, 466, 22),
  attachments: field("DECLARATION", "Nombre pièces", "manualFields.attachmentCount", 616, 489, 22),
  declarationDate: field("DECLARATION", "Le", "manualFields.declarationDate", 493, 513, 140, "date"),
} satisfies Record<string, FarField>;
function check(panel: Panel, label: string, source: string, x: number, y: number): FarField {
  return { ...field(panel, label, source, x, y, 8, "check"), size: 9 };
}
export const farChecks = {
  LUI_MEME: check("BENEFICIAIRE", "Adhérent", "policy.insuredPerson.relationship", 558, 373),
  CONJOINT: check("BENEFICIAIRE", "Conjoint", "policy.insuredPerson.relationship", 657, 373),
  ENFANT: check("BENEFICIAIRE", "Enfant", "policy.insuredPerson.relationship", 745, 373),
  MALADIE: check("BENEFICIAIRE", "Maladie", "farDetails.context", 507, 397),
  MATERNITE: check("BENEFICIAIRE", "Maternité", "farDetails.context", 632, 397),
  ACCIDENT: check("BENEFICIAIRE", "Accident", "farDetails.context", 752, 397),
  SOINS: check("DENTAIRE", "Soins", "farDetails.careType", 184, 206),
  PROTHESE: check("DENTAIRE", "Prothèse", "farDetails.careType", 293, 206),
} satisfies Record<string, FarField>;
// Page 1 has six dotted lines; page 2's related dentist band only has five.
// Fill five corresponding rows on both pages, leaving all other professions blank.
export const farActRows = [94, 110.2, 126.3, 142.5, 158.7] as const;
export const farMedicalRows = [115.5, 128.5, 140, 151.8, 163] as const;
export const farActColumns = {
  treatmentDate: [39, 63, "Date", "date"],
  toothReference: [108, 40, "Position dent", "text"],
  description: [154, 137, "Nature des travaux", "text"],
  coefficient: [298, 36, "Coefficient", "text"],
  amountMinor: [341, 62, "Montant honoraires", "amount"],
} as const;
export const farMedicalColumns = {
  treatmentDate: [509, 49, "Date des actes", "date"],
  description: [564, 105, "Natures des actes & coefficients", "text"],
  amountMinor: [675, 43, "Montants des Honoraires", "amount"],
} as const;
export const farPurposeStrikes = {
  DEVIS: { page: 1 as const, x1: 177, x2: 221, y: 45.3 }, // strike REÇUS
  RECUS: { page: 1 as const, x1: 126, x2: 166, y: 45.3 }, // strike DEVIS
};
