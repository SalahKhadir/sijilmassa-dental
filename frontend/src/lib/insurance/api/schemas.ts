import { z } from "zod";
import { isCalendarDate } from "../../patients/dates";

export const insuranceId = z.string().regex(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i);
export const documentType = z.enum(["CNSS_DENTAIRE", "CNOPS_DENTAIRE", "FAR_DENTAIRE"]);
export const purpose = z.enum(["ENTENTE_PREALABLE", "EXECUTION", "DEVIS", "RECUS"]);
export const relationship = z.enum(["LUI_MEME", "CONJOINT", "ENFANT"]);
export const cnssCare = z.enum(["SOINS", "PROTHESE", "ORTHODONTIE_FACIALE", "AUTRES"]);
export const cnopsCare = z.enum(["SOINS", "PROTHESE", "ORTHODONTIE_ODF", "AUTRES"]);
export const farCare = z.enum(["SOINS", "PROTHESE"]);
export const farContext = z.enum(["MALADIE", "MATERNITE", "ACCIDENT"]);
export const symbol = z.enum(["CERCLE", "CROIX"]);
export const maxActs = { CNSS_DENTAIRE: 3, CNOPS_DENTAIRE: 9, FAR_DENTAIRE: 5 } as const;
export const variant = { CNSS_DENTAIRE: "cnss", CNOPS_DENTAIRE: "cnops", FAR_DENTAIRE: "far" } as const;
export const isExecuted = (value: Purpose) => value === "EXECUTION" || value === "RECUS";
export const purposesFor = (type: DocumentType): Purpose[] => type === "FAR_DENTAIRE" ? ["DEVIS", "RECUS"] : ["ENTENTE_PREALABLE", "EXECUTION"];

const text = (max: number) => z.string().regex(/^[^\u0000-\u001f\u007f-\u009f]*$/, "Retirez les caractères de contrôle.")
  .trim().max(max, `Saisissez au maximum ${max} caractères.`).transform(value => value || null).nullish();
const date = z.string().refine(value => !value.startsWith("0000") && isCalendarDate(value), "Saisissez une date valide.");
const instant = z.iso.datetime();
export const minor = z.number("Saisissez un montant en dirhams avec au plus deux décimales.").int("Saisissez un nombre entier de centimes.").nonnegative("Saisissez un montant positif ou nul.")
  .max(Number.MAX_SAFE_INTEGER, "Le montant dépasse la limite autorisée.");
const count = z.number("Saisissez un nombre entier.").int("Saisissez un nombre entier.").min(0, "Saisissez un nombre positif ou nul.").max(9999, "Saisissez au maximum 9 999.");
const practitioner = z.string().trim().regex(/^\d{9}$/, "Saisissez les neuf chiffres.").nullish();
const fdi = z.string("Choisissez une dent au format FDI.").regex(/^(?:[1-4][1-8]|[5-8][1-5])$/, "Saisissez une dent au format FDI.");
const unique = <T>(values: T[]) => new Set(values).size === values.length;
const insuredIdentity = { firstName: text(100), lastName: text(100), cin: text(30), address: text(300), phone: text(50) };
const insuredInput = z.object({ relationship: relationship.nullish(), ...insuredIdentity });
const declaration = z.object({ place: text(100), date: date.nullish() });
const dentalFields = {
  registrationNumber: text(50), priorAuthorizationNumber: text(50), accidentDate: date.nullish(),
  confirmedTeeth: z.array(fdi).max(52).refine(unique, "Chaque dent doit être unique.").nullish(),
  dentistDeclaration: declaration.nullish(),
};
const cnss = z.object({ ...dentalFields, practitionerInp: practitioner, careTypes: z.array(cnssCare).max(4).refine(unique).nullish() });
const cnops = z.object({
  ...dentalFields, affiliationNumber: text(50), practitionerInpe: practitioner,
  careTypes: z.array(cnopsCare).max(4).refine(unique).nullish(), accidentCauses: text(250),
  diagnosisCategory: z.string().trim().regex(/^[A-Z]\d{2}$/, "Saisissez une lettre majuscule suivie de deux chiffres.").nullish(),
});
const far = z.object({
  accountNumber: text(50), rank: text(100), unit: text(100), practitionerInpe: practitioner,
  care: farCare.nullish(), context: farContext.nullish(), prospectusCount: count.nullish(),
  insuredStatementDate: date.nullish(),
  marks: z.array(z.object({ tooth: fdi, symbol: symbol.nullish() })).max(52)
    .refine(marks => unique(marks.map(mark => mark.tooth)), "Chaque dent doit être unique.").nullish(),
});
const formFields = z.object({ insured: insuredInput.nullish(), attachmentCount: count.nullish(), cnss: cnss.nullish(), cnops: cnops.nullish(), far: far.nullish() });
const coefficient = z.number("Saisissez un coefficient avec au plus quatre décimales.").min(0, "Saisissez un coefficient positif ou nul.").max(999999, "Le coefficient dépasse 999 999.")
  .refine(value => /^\d+(?:\.\d{1,4})?$/.test(String(value)), "Saisissez au maximum quatre décimales.");
const act = z.object({
  treatmentId: insuranceId.nullish(), chargeId: insuranceId.nullish(),
  fields: z.object({
    plannedDate: date.nullish(), plannedDescription: text(1000), plannedTooth: text(50),
    actCode: text(50), keyLetter: text(10), coefficient: coefficient.nullish(),
    keyValueMinor: minor.nullish(), quotedFeeMinor: minor.nullish(),
  }),
});
const draftShape = z.object({ fields: formFields, acts: z.array(act).max(9).nullish() });
export function insuranceDraftSchema(type: DocumentType, mode: Purpose) {
  return draftShape.superRefine(({ fields, acts }, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    if (!fields[variant[type]] || Object.values(variant).some(key => key !== variant[type] && fields[key])) {
      issue(["fields"], "Le volet doit correspondre à l’organisme choisi.");
    }
    const holder = fields.insured;
    if (holder?.relationship === "LUI_MEME" && (holder.firstName || holder.lastName || holder.cin || holder.address || holder.phone)) {
      issue(["fields", "insured", "relationship"], "L’identité de l’assuré est reprise du dossier patient.");
    }
    if (type === "CNSS_DENTAIRE" && holder?.phone) issue(["fields", "insured", "phone"], "Le volet CNSS ne comporte pas de téléphone.");
    if ((acts?.length ?? 0) > maxActs[type]) issue(["acts"], `Ce volet accepte au maximum ${maxActs[type]} actes.`);
    const treatments = new Set<string>();
    acts?.forEach(({ treatmentId, chargeId, fields: data }, index) => {
      const key = treatmentId?.toLowerCase();
      if (key && treatments.has(key)) issue(["acts", index, "treatmentId"], "Ce soin est déjà associé à un autre acte.");
      if (key) treatments.add(key);
      if ((chargeId && !key) || (!isExecuted(mode) && (key || chargeId))) {
        issue(["acts", index, "treatmentId"], "Vérifiez le soin associé.");
      }
      if (isExecuted(mode) && [data.plannedDate, data.plannedDescription, data.plannedTooth, data.quotedFeeMinor].some(value => value != null)) {
        issue(["acts", index, "fields"], "Les champs prévus sont réservés aux actes à réaliser.");
      }
      if (type === "FAR_DENTAIRE" && [data.actCode, data.keyLetter, data.keyValueMinor].some(value => value != null)) {
        issue(["acts", index, "fields"], "Vérifiez les champs de l’acte FAR.");
      }
    });
  });
}
export const createDraft = z.strictObject({
  patientId: insuranceId, consultationId: insuranceId.nullish(), documentType, purpose, templateVersion: z.literal(1), draft: draftShape,
}).refine(value => purposesFor(value.documentType).includes(value.purpose));
export const editDraft = z.strictObject({ expectedVersion: minor, draft: draftShape });
export const finalizeDraft = z.strictObject({ expectedVersion: minor, expectedPatientVersion: minor, expectedConsultationVersion: minor.nullish() });

const lifecycle = z.enum(["BROUILLON", "FINALISE"]);
const historyItem = z.object({
  documentId: insuranceId, consultationId: insuranceId.nullish(), documentType,
  templateVersion: z.literal(1), lifecycle, createdAt: instant, finalizedAt: instant.nullish(),
});
export const cursorSchema = z.object({
  afterCreatedAt: instant.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/),
  afterDocumentId: insuranceId,
});
export const historyPage = z.object({ items: z.array(historyItem).max(50), nextCursor: cursorSchema.nullish() });

const beneficiary = z.object({
  patientId: insuranceId, version: minor, firstName: text(100), lastName: text(100), cin: text(30), dateOfBirth: date.nullish(), sex: z.string().nullish(),
});
const consultation = z.object({ consultationId: insuranceId, version: minor, date, finalized: z.boolean() });
const snapshot = z.object({
  schemaVersion: z.literal(1), templateSha256: z.string().regex(/^[\da-f]{64}$/i),
  insured: z.object({ relationship, source: z.enum(["PATIENT", "DOCUMENT_INPUT"]), ...insuredIdentity }),
  fields: formFields,
  acts: z.array(z.object({
    treatmentId: insuranceId.nullish(), chargeId: insuranceId.nullish(), date: date.nullish(),
    description: z.string().nullish(), tooth: z.string().nullish(), actCode: text(50), keyLetter: text(10),
    coefficient: coefficient.nullish(), keyValueMinor: minor.nullish(),
    feeSource: z.enum(["V9_AGREED_PRICE", "MANUAL_QUOTE"]).nullish(), feeMinor: minor.nullish(),
  })).max(9),
  knownCompleteFeeTotalMinor: z.string().regex(/^(?:0|[1-9]\d{0,16})$/).nullish(),
});
export const detailSchema = historyItem.extend({
  patientId: insuranceId, purpose, version: minor, currency: z.literal("MAD"), updatedAt: instant,
  beneficiary, consultation: consultation.nullish(), draft: draftShape.nullish(), snapshot: snapshot.nullish(),
}).refine(detail => purposesFor(detail.documentType).includes(detail.purpose)
  && detail.beneficiary.patientId === detail.patientId
  && (detail.consultation?.consultationId ?? null) === (detail.consultationId ?? null)
  && (detail.lifecycle === "BROUILLON"
    ? detail.draft && !detail.snapshot && !detail.finalizedAt && insuranceDraftSchema(detail.documentType, detail.purpose).safeParse(detail.draft).success
    : !detail.draft && detail.snapshot && detail.finalizedAt && detail.snapshot.acts.length <= maxActs[detail.documentType]));

export const problemCode = z.enum(["INVALID_INPUT", "UNSUPPORTED_TEMPLATE", "INVALID_TREATMENT", "INVALID_CHARGE",
  "NOT_FOUND", "VERSION_CONFLICT", "INVALID_CONSULTATION", "ARCHIVED_PATIENT", "READ_ONLY", "INCOMPLETE_DOCUMENT", "STORAGE_FAILURE",
  "INSURANCE_PDF_NOT_FINALIZED", "INSURANCE_PDF_FAR_UNAVAILABLE", "INSURANCE_PDF_TEMPLATE_UNSUPPORTED",
  "INSURANCE_PDF_LAYOUT_OVERFLOW", "INSURANCE_PDF_UNSUPPORTED_TEXT", "INSURANCE_PDF_INTEGRITY",
  "INSURANCE_PDF_RENDER_FAILED", "INSURANCE_PDF_BUSY"]);
export const insuranceProblem = z.object({
  status: z.number().int(), code: z.string().optional(), requestId: insuranceId.optional(),
});

export type DocumentType = z.infer<typeof documentType>;
export type Purpose = z.infer<typeof purpose>;
export type Draft = z.infer<typeof draftShape>;
export type InsuranceDetail = z.infer<typeof detailSchema>;
export type InsuranceCursor = z.infer<typeof cursorSchema>;
export type InsuranceHistoryPage = z.infer<typeof historyPage>;
