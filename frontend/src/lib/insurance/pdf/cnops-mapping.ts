import type { OverlayField } from "./overlay.ts";
/** CNOPS visual points, top-left origin; y is the text baseline. */
function field(label: string, source: string, x: number, y: number, width: number,
  format: OverlayField["format"] = "text", slots?: readonly number[]): OverlayField {
  return { page: 1, label, source, x, y, width, size: 8, align: "left", format, slots };
}
const digitSlots = Array.from({ length: 9 }, (_, i) => i * 9.8);
const dateSlots = [0, 9.8, 23.4, 33.2, 47, 56.8, 66.6, 76.4];
const declarationDateSlots = [0, 9.8, 21.6, 31.4, 43.2, 53, 62.8, 72.6];
export const cnopsFields = {
  phone: field("N° du Tél (optionnel)", "policy.insuredPerson.phone", 579, 69.5, 100),
  insuredName: field("Nom et prénom - assuré", "policy.insuredPerson", 515, 101.5, 179),
  affiliation: field("N° Affiliation", "policy.affiliationNumber", 515, 115.5, 179),
  registration: field("N° Immatriculation", "policy.registrationNumber", 515, 129.5, 179),
  insuredCin: field("N° CIN - assuré", "policy.insuredPerson.cin", 515, 143.5, 179),
  address1: field("Adresse (ligne 1)", "policy.insuredPerson.address", 478, 191.5, 233),
  address2: field("Adresse (ligne 2)", "policy.insuredPerson.address", 478, 203, 233),
  total: { ...field("Montant des frais (Dhs)", "manualFields.totalFeesMinor / sum(acts.amountMinor)", 530, 214, 165, "amount"), align: "right" as const },
  attachments: field("Nombre de pièces jointes", "manualFields.attachmentCount", 535, 228.4, 160),
  patientName: field("Nom et prénom - bénéficiaire", "patient.identity", 513, 271.5, 196),
  birthDate: field("Date de naissance", "patient.identity.dateOfBirth", 565, 285.7, 90, "date", dateSlots),
  patientCin: field("N° CIN - bénéficiaire", "patient.identity.cin", 570, 299.5, 83, "slots", Array.from({ length: 8 }, (_, i) => i * 9.8)),
  inpe: field("INPE du médecin dentiste", "cnopsDetails.practitionerInpe", 574, 346, 90, "slots", digitSlots),
  priorAuth: field("N° Entente Préalable", "cnopsDetails.priorAuthorizationNumber", 575, 413.8, 83, "slots", Array.from({ length: 8 }, (_, i) => i * 9.8)),
  accidentDate: field("La date de l’accident", "cnopsDetails.accidentDate", 570, 438.5, 90, "date", dateSlots),
  accidentCauses: field("Les causes de l’accident", "cnopsDetails.accidentCauses", 531, 450.8, 212),
  insuredPlace: field("Fait à - assuré", "manualFields.declarationPlace", 474, 468, 92),
  insuredDate: field("Le - assuré", "manualFields.declarationDate", 482, 479.8, 90, "date", declarationDateSlots),
  dentistPlace: field("Fait à - dentiste", "manualFields.declarationPlace", 656, 468, 112),
  dentistDate: field("Le - dentiste", "manualFields.declarationDate", 663, 479.8, 90, "date", declarationDateSlots),
  cim10: { ...field("CIM - 10", "cnopsDetails.diagnosisCodeCIM10", 581, 236.5, 54, "slots", [0, 18.5, 37]), page: 2 as const, slotWidth: 16 },
} satisfies Record<string, OverlayField>;
function check(label: string, source: string, x: number, y: number): OverlayField {
  return { ...field(label, source, x, y, 7, "check"), size: 7 };
}
export const cnopsChecks = {
  ENTENTE_PREALABLE: check("Entente Préalable", "documentPurpose", 607.4, 52.9),
  EXECUTION: check("Exécution", "documentPurpose", 666.7, 52.9),
  CONJOINT: check("Conjoint", "policy.insuredPerson.relationship", 581.8, 164),
  ENFANT: check("Enfant", "policy.insuredPerson.relationship", 651.7, 164),
  M: check("Masculin", "patient.identity.sex", 570.5, 312),
  F: check("Féminin", "patient.identity.sex", 651, 312),
  SOINS_1023746: check("Soins", "cnopsDetails.careTypes", 513.7, 381.2),
  PROTHESE_1370746: check("Prothèse", "cnopsDetails.careTypes", 686.8, 381.2),
  ODF_1023776: check("Orthodontie et O.D.F", "cnopsDetails.careTypes", 513.7, 395.7),
  AUTRES_1370776: check("Autres", "cnopsDetails.careTypes", 686.8, 395.7),
} satisfies Record<string, OverlayField>;
export const cnopsActRows = [73, 90.5, 108.5, 126.7, 145.2, 163.2, 180.5, 199, 216.5] as const;
export const cnopsActColumns = {
  toothReference: [425, 38, "Dents traitées", "text"],
  actCode: [469, 41, "Code des actes", "text"],
  treatmentDate: [516, 42, "Dates des actes", "date"],
  ngap: [564, 41, "Lettre clé + Cotation NGAP", "text"],
  amountMinor: [651, 40, "Montant facturé", "amount"],
} as const;
