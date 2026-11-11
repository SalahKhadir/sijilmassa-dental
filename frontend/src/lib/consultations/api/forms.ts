import { z } from "zod";
import { clinicalIdSchema, draftContentSchema, treatmentContentSchema, type ClinicalDraftContent, type CreateConsultation } from "./schemas";

// Separate models: a persisted draft never batches prototype treatment entries or synthetic IDs.
export const clinicalDraftFormSchema = draftContentSchema.omit({ appointmentId: true }).extend({
  patientId: clinicalIdSchema, appointmentId: z.union([z.literal(""), clinicalIdSchema]),
}).strict();
export const clinicalTreatmentFormSchema = treatmentContentSchema;
export type ClinicalDraftFormValues = z.infer<typeof clinicalDraftFormSchema>;
export type ClinicalTreatmentFormValues = z.infer<typeof clinicalTreatmentFormSchema>;
export function clinicalDraftCommand(values: ClinicalDraftFormValues): CreateConsultation {
  const { patientId, appointmentId, ...content } = clinicalDraftFormSchema.parse(values);
  return { patientId, content: { ...content, appointmentId: appointmentId || null } };
}
export function clinicalDraftValues(patientId: string, content: ClinicalDraftContent): ClinicalDraftFormValues {
  return { ...content, patientId, appointmentId: content.appointmentId ?? "" };
}
