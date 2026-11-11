import { z } from "zod";
import { prescriptionDraftSchema, prescriptionIdSchema, type CreatePrescription, type PrescriptionDraft } from "./schemas";
export const prescriptionDraftFormSchema = prescriptionDraftSchema.extend({ patientId: prescriptionIdSchema,
  consultationId: z.union([z.literal(""), prescriptionIdSchema]) }).strict();
export type PrescriptionDraftFormValues = z.infer<typeof prescriptionDraftFormSchema>;
export function prescriptionDraftCommand(values: PrescriptionDraftFormValues): CreatePrescription {
  const { patientId, consultationId, ...content } = prescriptionDraftFormSchema.parse(values);
  return { patientId, content: { ...content, consultationId: consultationId || null } };
}
export function prescriptionDraftValues(patientId: string, content: PrescriptionDraft): PrescriptionDraftFormValues {
  return { ...content, patientId, consultationId: content.consultationId ?? "" };
}
