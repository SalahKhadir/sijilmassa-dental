/** Calibrated on the original two-page scan, not on the generic CNSS form.
 * All positions are visual points, origin top-left, y = text baseline.
 * source documents the domain source; width never includes printed labels.
 */
export interface CnssField {
  page: 1 | 2; label: string; source: string; x: number; y: number;
  size: number; width: number; align: "left" | "center" | "right";
  format: "text" | "date" | "amount" | "check" | "slots";
  slots?: readonly number[];
}
function field(label: string, source: string, x: number, y: number, width: number,
  format: CnssField["format"] = "text", slots?: readonly number[]): CnssField {
  return { page: 1, label, source, x, y, width, size: 8, align: "left", format, slots };
}
const digits = (count: number, step = 10) => Array.from({ length: count }, (_, i) => i * step);
// DD MM YYYY: extra spacing between the day/month/year groups in printed boxes.
const dateSlots = [0, 10, 24, 34, 48, 58, 68, 78];
export const cnssFields = {
  insuredName: field("Nom et prénom - assuré", "policy.insuredPerson", 650, 108, 273),
  registration: field("N° Immatriculation", "policy.registrationNumber", 671, 127, 89, "slots", digits(9)),
  insuredCin: field("CIN - assuré", "policy.insuredPerson.cin", 814, 142, 89, "slots", digits(9)),
  address1: field("Adresse (ligne 1)", "policy.insuredPerson.address", 629, 187, 322),
  address2: field("Adresse (ligne 2)", "policy.insuredPerson.address", 629, 199, 322),
  total: field("Montant des frais", "manualFields.totalFeesMinor / sum(acts.amountMinor)", 659, 215, 90, "amount"),
  attachments: field("Nombre de pièces jointes", "manualFields.attachmentCount", 819, 230, 53),
  patientName: field("Nom et prénom - bénéficiaire", "patient.identity", 650, 274, 272),
  birthDate: field("Date de naissance", "patient.identity.dateOfBirth", 773, 290, 90, "date", dateSlots),
  patientCin: field("CIN - bénéficiaire", "patient.identity.cin", 780, 311, 89, "slots", digits(9)),
  inp: field("N° INP", "clinic INP confirmed in handoff", 628, 367, 90, "slots", digits(9)),
  priorAuth: field("N° Entente préalable", "cnssDetails.priorAuthorizationNumber", 762, 464, 90, "slots", digits(9)),
  accidentDate: field("Date d’accident", "cnssDetails.accidentDate", 767, 482, 90, "date", dateSlots),
  insuredPlace: field("Fait à - assuré", "manualFields.declarationPlace", 647, 528, 86),
  insuredDate: field("Le - assuré", "manualFields.declarationDate", 646, 543, 90, "date", dateSlots),
  dentistPlace: field("Fait à - dentiste", "manualFields.declarationPlace", 863, 528, 86),
  dentistDate: field("Le - dentiste", "manualFields.declarationDate", 857, 543, 90, "date", dateSlots),
} satisfies Record<string, CnssField>;
function check(label: string, source: string, x: number, y: number): CnssField {
  return field(label, source, x, y, 6, "check");
}
export const cnssChecks = {
  ENTENTE_PREALABLE: check("Entente préalable", "documentPurpose", 757, 72),
  EXECUTION: check("Exécution", "documentPurpose", 845, 72),
  CONJOINT: check("Conjoint", "policy.insuredPerson.relationship", 732, 172),
  ENFANT: check("Enfant", "policy.insuredPerson.relationship", 799, 172),
  LUI_MEME: check("Lui-même", "policy.insuredPerson.relationship", 873, 172),
  M: check("Sexe M", "patient.identity.sex", 840, 330),
  F: check("Sexe F", "patient.identity.sex", 895, 330),
  SOINS_600: check("Soins", "cnssDetails.careTypes", 788, 397),
  PROTHESE_626: check("Prothèse", "cnssDetails.careTypes", 788, 413),
  ODF_650: check("Orthodontie faciale", "cnssDetails.careTypes", 788, 429),
  AUTRES_675: check("Autres", "cnssDetails.careTypes", 788, 445),
} satisfies Record<string, CnssField>;
export const cnssActRows = [88, 162, 233] as const;
export const cnssActColumns = {
  toothReference: [588, 44, "Dents traitées", "text"],
  actCode: [637, 40, "Code des actes", "text"],
  treatmentDate: [683, 48, "Dates des actes", "date"],
  ngap: [738, 43, "Lettre clé + Cotation NGAP", "text"],
  amountMinor: [837, 44, "Montant facturé", "amount"],
} as const;
