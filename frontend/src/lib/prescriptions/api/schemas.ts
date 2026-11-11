import { z } from "zod";
import { isCalendarDate } from "../../patients/dates";

// Java accepts canonical UUIDs without restricting their version/variant bits.
export const prescriptionIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Sélectionnez un dossier enregistré.");
export const prescriptionVersionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const prescriptionDateSchema = z.string().refine(v => isCalendarDate(v) && !v.startsWith("0000"), "Saisissez une date valide (AAAA-MM-JJ).");
const instant = z.iso.datetime({ precision: undefined }).refine(v => /^\d{4}-.*Z$/.test(v) && (!v.includes(".") || /\.\d{1,6}Z$/.test(v)));
const text = (max: number) => z.string().refine(v => v.length <= max, `Limitez ce champ à ${max} caractères.`).refine(v => {
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c < 32 && ![9, 10, 13].includes(c)) return false;
    if (c >= 0xd800 && c <= 0xdbff) { const next = v.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
    else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}, "Ce texte contient un caractère non autorisé.");
export const medicationInputSchema = z.object({ id: prescriptionIdSchema.optional(), medicationName: text(200), dosage: text(300),
  frequency: text(200), duration: text(200), instructions: text(1500) }).strict();
const medications = z.array(medicationInputSchema).max(20, "Une ordonnance peut contenir au plus 20 médicaments.")
  .refine(lines => { const ids = lines.flatMap(l => l.id ? [l.id.toLowerCase()] : []); return new Set(ids).size === ids.length; }, "Une ligne ne peut pas être répétée.");
export const prescriptionDraftSchema = z.object({ consultationId: prescriptionIdSchema.nullable(), issuedDate: prescriptionDateSchema,
  medications, generalInstructions: text(2000) }).strict();
export const createPrescriptionSchema = z.object({ patientId: prescriptionIdSchema, content: prescriptionDraftSchema }).strict()
  .refine(v => v.content.medications.every(l => l.id === undefined), "Les nouvelles lignes reçoivent leur identifiant à l’enregistrement.");
export const updatePrescriptionSchema = z.object({ version: prescriptionVersionSchema, content: prescriptionDraftSchema }).strict();
export const expectedPrescriptionVersionSchema = z.object({ version: prescriptionVersionSchema }).strict();
export const finalizePrescriptionSchema = expectedPrescriptionVersionSchema.extend({ patientVersion: prescriptionVersionSchema }).strict();
const storedContent = prescriptionDraftSchema.extend({ medications: z.array(medicationInputSchema.required({ id: true })).max(20)
  .refine(lines => new Set(lines.map(l => l.id.toLowerCase())).size === lines.length) });
const identity = z.object({ reference: z.string(), firstName: z.string(), lastName: z.string(), displayName: z.string() }).strict();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const prescriptionDocumentSchema = z.object({ snapshotSchemaVersion: z.literal(1), capturedAt: instant,
  patientIdentity: identity, practitionerDisplayName: z.string(), templateId: z.string(), templateSha256: hash,
  rendererId: z.string(), pdfSha256: hash, pdfBytes: z.number().int().min(1).max(2097152) }).strict();
const status = z.enum(["BROUILLON", "FINALISEE"]);
function lifecycle(v: { status: string; finalizedAt: string | null; archivedAt: string | null }) {
  return v.status === "BROUILLON" ? v.finalizedAt === null : v.finalizedAt !== null && v.archivedAt === null;
}
export const persistentPrescriptionSchema = z.object({ id: prescriptionIdSchema, patientId: prescriptionIdSchema,
  version: prescriptionVersionSchema, status, content: storedContent,
  patient: identity.extend({ id: prescriptionIdSchema, version: prescriptionVersionSchema, status: z.enum(["active", "inactive"]) }).strict(),
  createdAt: instant, updatedAt: instant, finalizedAt: instant.nullable(), archivedAt: instant.nullable(),
  document: prescriptionDocumentSchema.nullable() }).strict().refine(v => lifecycle(v)
    && v.patient.id.toLowerCase() === v.patientId.toLowerCase()
    && Date.parse(v.updatedAt) >= Date.parse(v.createdAt)
    && (v.status === "FINALISEE" ? v.document !== null && v.content.medications.length > 0 : v.document === null));
export const prescriptionCursorSchema = z.object({ date: prescriptionDateSchema, id: prescriptionIdSchema }).strict();
export const prescriptionSummarySchema = z.object({ id: prescriptionIdSchema, issuedDate: prescriptionDateSchema, status,
  version: prescriptionVersionSchema, consultationId: prescriptionIdSchema.nullable(), finalizedAt: instant.nullable(), archivedAt: instant.nullable() }).strict().refine(lifecycle);
export function prescriptionOrder(a: { date: string; id: string }, b: { date: string; id: string }) {
  const left = `${a.date}:${a.id.toLowerCase()}`, right = `${b.date}:${b.id.toLowerCase()}`;
  return left < right ? -1 : left > right ? 1 : 0;
}
export const prescriptionHistorySchema = z.object({ items: z.array(prescriptionSummarySchema).max(50), nextCursor: prescriptionCursorSchema.nullable() }).strict()
  .refine(p => new Set(p.items.map(i => i.id.toLowerCase())).size === p.items.length
    && p.items.every((item, i) => i === 0 || prescriptionOrder({ date: p.items[i - 1].issuedDate, id: p.items[i - 1].id }, { date: item.issuedDate, id: item.id }) > 0)
    && (p.items.length === 50 ? Boolean(p.nextCursor && prescriptionOrder({ date: p.items[49].issuedDate, id: p.items[49].id }, p.nextCursor) === 0) : p.nextCursor === null));
export const prescriptionHistoryQuerySchema = z.object({ patientId: prescriptionIdSchema, status: status.optional(),
  archive: z.enum(["active", "archived", "all"]).optional(), consultationId: prescriptionIdSchema.optional(), before: prescriptionCursorSchema.optional() }).strict();
export type PrescriptionDraft = z.infer<typeof prescriptionDraftSchema>;
export type MedicationInput = z.infer<typeof medicationInputSchema>;
export type CreatePrescription = z.infer<typeof createPrescriptionSchema>;
export type UpdatePrescription = z.infer<typeof updatePrescriptionSchema>;
export type FinalizePrescription = z.infer<typeof finalizePrescriptionSchema>;
export type PersistentPrescription = z.infer<typeof persistentPrescriptionSchema>;
export type PrescriptionDocument = z.infer<typeof prescriptionDocumentSchema>;
export type PrescriptionCursor = z.infer<typeof prescriptionCursorSchema>;
export type PrescriptionSummary = z.infer<typeof prescriptionSummarySchema>;
export type PrescriptionHistory = z.infer<typeof prescriptionHistorySchema>;
export type PrescriptionHistoryQuery = z.infer<typeof prescriptionHistoryQuerySchema>;
