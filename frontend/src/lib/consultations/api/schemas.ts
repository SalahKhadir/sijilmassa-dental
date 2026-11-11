import { z } from "zod";
import { isCalendarDate } from "../../patients/dates";

export const clinicalIdSchema = z.uuid("Sélectionnez un dossier enregistré.");
export const clinicalDateSchema = z.string().refine(value => isCalendarDate(value) && !value.startsWith("0000"), "Saisissez une date valide (AAAA-MM-JJ).");
export const clinicalVersionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const instant = z.iso.datetime();
const text = (limit: number) => z.string().max(limit, `Limitez ce champ à ${limit.toLocaleString("fr-MA")} caractères.`)
  .refine(value => !value.includes("\0"), "Ce texte contient un caractère non autorisé.");
export const draftContentSchema = z.object({
  appointmentId: clinicalIdSchema.nullable(), consultationDate: clinicalDateSchema,
  chiefComplaint: text(500).refine(value => value.trim().length > 0, "Indiquez le motif de consultation."),
  clinicalObservations: text(5000), assessment: text(5000), treatmentPlan: text(5000), notes: text(5000),
}).strict();
export const treatmentContentSchema = z.object({ treatmentDate: clinicalDateSchema,
  description: text(1000).refine(value => value.trim().length > 0, "Décrivez le soin réalisé."),
  toothReference: text(50).regex(/^[\p{L}\p{N}\s.,/()\-]*$/u, "Utilisez des lettres, chiffres ou séparateurs simples."), notes: text(2000),
}).strict();
export const createConsultationSchema = z.object({ patientId: clinicalIdSchema, content: draftContentSchema }).strict();
export const updateConsultationSchema = z.object({ version: clinicalVersionSchema, content: draftContentSchema }).strict();
export const treatmentMutationSchema = z.object({ version: clinicalVersionSchema, content: treatmentContentSchema }).strict();
export const expectedClinicalVersionSchema = z.object({ version: clinicalVersionSchema }).strict();
// Response text is not transformed; retired legacy references may fail today's input validation.
const storedTreatmentContent = treatmentContentSchema.extend({ toothReference: text(50) });
export const treatmentDetailsSchema = z.object({ id: clinicalIdSchema, version: clinicalVersionSchema,
  content: storedTreatmentContent, createdAt: instant, updatedAt: instant,
}).strict().refine(t => Date.parse(t.updatedAt) >= Date.parse(t.createdAt));
export const persistentConsultationSchema = z.object({ id: clinicalIdSchema, patientId: clinicalIdSchema,
  version: clinicalVersionSchema, status: z.enum(["BROUILLON", "TERMINEE"]), content: draftContentSchema,
  treatments: z.array(treatmentDetailsSchema).max(50), createdAt: instant, updatedAt: instant,
}).strict().refine(c => Date.parse(c.updatedAt) >= Date.parse(c.createdAt)
  && new Set(c.treatments.map(t => t.id)).size === c.treatments.length);
export const clinicalCursorSchema = z.object({ date: clinicalDateSchema, id: clinicalIdSchema }).strict();
export function clinicalOrder(a: { date: string; id: string }, b: { date: string; id: string }) {
  const left = `${a.date}:${a.id.toLowerCase()}`, right = `${b.date}:${b.id.toLowerCase()}`;
  return left < right ? -1 : left > right ? 1 : 0;
}
function pageValid(items: { date: string; id: string }[], next: ClinicalCursor | null, direction: number) {
  const last = items.at(-1);
  return new Set(items.map(i => i.id.toLowerCase())).size === items.length
    && items.every((item, index) => index === 0 || clinicalOrder(items[index - 1], item) * direction < 0)
    && (items.length === 50 ? Boolean(next && last && clinicalOrder(last, next) === 0) : next === null);
}
export const clinicalHistorySchema = z.object({ items: z.array(z.object({ id: clinicalIdSchema,
  consultationDate: clinicalDateSchema, status: z.enum(["BROUILLON", "TERMINEE"]), version: clinicalVersionSchema,
}).strict()).max(50), nextCursor: clinicalCursorSchema.nullable() }).strict()
  .refine(p => pageValid(p.items.map(i => ({ date: i.consultationDate, id: i.id })), p.nextCursor, -1));
export const removedTreatmentSchema = z.object({ treatment: treatmentDetailsSchema, removedAt: instant }).strict()
  .refine(t => Date.parse(t.removedAt) >= Date.parse(t.treatment.createdAt) && Date.parse(t.removedAt) <= Date.parse(t.treatment.updatedAt));
export const removedClinicalHistorySchema = z.object({ items: z.array(removedTreatmentSchema).max(50), nextCursor: clinicalCursorSchema.nullable() }).strict()
  .refine(p => pageValid(p.items.map(i => ({ date: i.treatment.content.treatmentDate, id: i.treatment.id })), p.nextCursor, 1));
export type ClinicalDraftContent = z.infer<typeof draftContentSchema>;
export type ClinicalTreatmentContent = z.infer<typeof treatmentContentSchema>;
export type CreateConsultation = z.infer<typeof createConsultationSchema>;
export type UpdateConsultation = z.infer<typeof updateConsultationSchema>;
export type TreatmentMutation = z.infer<typeof treatmentMutationSchema>;
export type PersistentConsultation = z.infer<typeof persistentConsultationSchema>;
export type PersistentTreatment = z.infer<typeof treatmentDetailsSchema>;
export type ClinicalCursor = z.infer<typeof clinicalCursorSchema>;
export type ClinicalHistoryPage = z.infer<typeof clinicalHistorySchema>;
export type RemovedClinicalHistoryPage = z.infer<typeof removedClinicalHistorySchema>;
