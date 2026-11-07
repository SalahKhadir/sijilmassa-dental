import { z } from "zod";
import { isCalendarDate } from "../patients/dates.ts";
import {
  insuranceProviders,
  beneficiaryRelationships,
  documentPurposes,
  cnssCareTypes,
  cnopsCareTypes,
  farDentalPurposes,
  farCareTypes,
  farCareContexts,
} from "./types.ts";

export const insuredPersonSchema = z.object({
  isPatient: z.boolean(),
  firstName: z
    .string()
    .trim()
    .min(1, "Le prénom de l’assuré(e) est requis.")
    .max(100),
  lastName: z
    .string()
    .trim()
    .min(1, "Le nom de l’assuré(e) est requis.")
    .max(100),
  cin: z.string().trim().max(30).default(""),
  address: z.string().trim().max(250).default(""),
  phone: z.string().trim().max(50).default(""),
  relationship: z.enum(beneficiaryRelationships, {
    message: "Le lien de parenté est requis.",
  }),
});

export const policySchema = z.object({
  patientId: z.string().min(1, "Le patient est requis."),
  provider: z.enum(insuranceProviders, {
    message: "L’organisme d’assurance est requis (CNSS, CNOPS ou FAR).",
  }),
  registrationNumber: z.string().trim().max(50).optional().default(""),
  affiliationNumber: z.string().trim().max(50).optional().default(""),
  militaryAccountNumber: z.string().trim().max(50).optional().default(""),
  militaryRank: z.string().trim().max(100).optional().default(""),
  militaryUnit: z.string().trim().max(100).optional().default(""),
  insuredPerson: insuredPersonSchema,
  active: z.boolean().default(true),
});

export const dentalInsuranceActSchema = z.object({
  id: z.string().optional(),
  treatmentDate: z
    .string()
    .refine(isCalendarDate, "Saisissez une date de soin valide au format AAAA-MM-JJ."),
  toothReference: z.string().trim().max(20).optional().default(""),
  description: z
    .string()
    .trim()
    .min(1, "La description de l’acte est requise.")
    .max(300),
  actCode: z.string().trim().max(50).optional().default(""),
  ngapKeyLetter: z.string().trim().max(10).optional().default(""),
  ngapCoefficient: z.number().nonnegative().optional(),
  amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  sourceTreatmentId: z.string().optional(),
});

const confirmedTeethSchema = z.array(z.string().regex(/^(?:[1-4][1-8]|[5-8][1-5])$/,
    "Sélectionnez une référence FDI permanente ou temporaire valide."))
    .max(52)
    .refine(teeth => new Set(teeth).size === teeth.length, "Une dent ne peut être confirmée qu’une fois.")
    .optional();

export const cnssDetailsSchema = z.object({
  confirmedTeeth: confirmedTeethSchema,
  careTypes: z.array(z.enum(cnssCareTypes)).default([]),
  priorAuthorizationNumber: z.string().trim().max(50).optional().default(""),
  accidentDate: z.string().trim().max(20).refine(v => !v || isCalendarDate(v), "Saisissez une date d’accident valide.").optional().default(""),
});

export const cnopsDetailsSchema = z.object({
  confirmedTeeth: confirmedTeethSchema,
  practitionerInpe: z.string().trim().max(9).optional().default(""),
  careTypes: z.array(z.enum(cnopsCareTypes)).default([]),
  priorAuthorizationNumber: z.string().trim().max(50).optional().default(""),
  accidentDate: z.string().trim().max(20).refine(v => !v || isCalendarDate(v), "Saisissez une date d’accident valide.").optional().default(""),
  accidentCauses: z.string().trim().max(250).optional().default(""),
  diagnosisCodeCIM10: z.string().trim().max(30).optional().default(""),
});

export const farDetailsSchema = z.object({
  practitionerInpe: z.string().trim().max(9).optional(),
  prospectusCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  toothMarks: z.array(z.object({
    tooth: z.string().regex(/^(?:[1-4][1-8]|[5-8][1-5])$/),
    symbol: z.enum(["CERCLE", "CROIX"]).optional(),
  })).max(52).refine(marks => new Set(marks.map(m => m.tooth)).size === marks.length,
    "Une dent FAR ne peut porter qu’un symbole confirmé.").optional(),
  markingApproved: z.boolean().optional(),
  dentalPurpose: z.enum(farDentalPurposes).optional(),
  careType: z.enum(farCareTypes).optional(),
  context: z.enum(farCareContexts).optional(),
  priorAuthorizationNumber: z.string().trim().max(50).optional().default(""),
});

export const manualFieldsSchema = z.object({
  totalFeesMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  attachmentCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  declarationPlace: z.string().trim().max(100).optional().default(""),
  declarationDate: z.string().trim().max(20).refine(v => !v || isCalendarDate(v), "Saisissez une date de déclaration valide.").optional().default(""),
});

export const insuranceDraftSchema = z.object({
  patientId: z.string().min(1, "Le patient est requis."),
  provider: z.enum(insuranceProviders, {
    message: "L’organisme est requis.",
  }),
  policyId: z.string().optional(),
  status: z.enum(["BROUILLON", "VALIDE"]).default("BROUILLON"),
  documentPurpose: z.enum(documentPurposes).default("EXECUTION"),
  selectedConsultationId: z.string().optional(),
  selectedTreatmentIds: z.array(z.string()).refine(ids => new Set(ids).size === ids.length, "Un soin ne peut être importé qu’une fois.").default([]),
  acts: z.array(dentalInsuranceActSchema).refine(acts => {
    const sources = acts.flatMap(act => act.sourceTreatmentId ? [act.sourceTreatmentId] : []);
    return new Set(sources).size === sources.length;
  }, "Un soin ne peut être importé qu’une fois.").refine(acts =>
    (!acts.every(act => act.amountMinor === undefined || Number.isSafeInteger(act.amountMinor)) ||
      acts.reduce((total, act) => total + BigInt(act.amountMinor ?? 0), 0n) <= BigInt(Number.MAX_SAFE_INTEGER)),
    "Le total dépasse la précision monétaire autorisée.").default([]),
  cnssDetails: cnssDetailsSchema.optional(),
  cnopsDetails: cnopsDetailsSchema.optional(),
  farDetails: farDetailsSchema.optional(),
  manualFields: manualFieldsSchema.default({
    declarationPlace: "",
    declarationDate: "",
  }),
}).superRefine((draft, context) => {
  if (draft.manualFields.totalFeesMinor !== undefined && Number.isSafeInteger(draft.manualFields.totalFeesMinor) && draft.acts.every(act =>
    act.amountMinor !== undefined && Number.isSafeInteger(act.amountMinor))) {
    const sum = draft.acts.reduce((total, act) => total + BigInt(act.amountMinor!), 0n);
    if (sum !== BigInt(draft.manualFields.totalFeesMinor)) context.addIssue({
      code: "custom", path: ["manualFields", "totalFeesMinor"],
      message: "Le total des frais diffère des actes. Corrigez les montants.",
    });
  }
});
