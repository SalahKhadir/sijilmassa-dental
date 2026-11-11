import { z } from "zod";
import { isCalendarDate } from "../../lib/patients/dates.ts";

const safeText = (max: number) => z.string().max(max).refine(value =>
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value) && value.isWellFormed());
const uuid = z.uuid();
const version = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const instant = z.iso.datetime({ precision: null }).refine(value => Number.isFinite(Date.parse(value)));
const medication = z.strictObject({
  id: uuid, medicationName: safeText(200), dosage: safeText(300),
  frequency: safeText(200), duration: safeText(200), instructions: safeText(1500),
});
export const renderingRequestSchema = z.strictObject({
  protocolVersion: z.literal(1), requestId: uuid,
  mode: z.enum(["DRAFT", "FINAL_LAYOUT_CHECK"]),
  record: z.strictObject({
    id: uuid, patientId: uuid, consultationId: uuid.nullable(), version,
    issuedDate: z.string().refine(value => value.slice(0, 4) !== "0000" && isCalendarDate(value)),
    medications: z.array(medication).max(20), generalInstructions: safeText(2000),
    createdAt: instant, updatedAt: instant,
  }),
  patient: z.strictObject({
    id: uuid, reference: z.string().regex(/^PAT-\d{6,19}$/),
    firstName: safeText(80).refine(value => value.trim().length > 0),
    lastName: safeText(80).refine(value => value.trim().length > 0),
    displayName: safeText(161).min(1), version,
  }),
}).superRefine((request, context) => {
  if (request.record.patientId !== request.patient.id ||
      request.patient.displayName !== `${request.patient.firstName} ${request.patient.lastName}` ||
      Date.parse(request.record.updatedAt) < Date.parse(request.record.createdAt) ||
      new Set(request.record.medications.map(line => line.id)).size !== request.record.medications.length) {
    context.addIssue({ code: "custom", message: "Invalid rendering input" });
  }
  if (request.mode === "FINAL_LAYOUT_CHECK" && (!request.record.medications.length || request.record.medications.some(line =>
    [line.medicationName, line.dosage, line.frequency, line.duration].some(value => !value.trim())))) {
    context.addIssue({ code: "custom", message: "Incomplete rendering input" });
  }
});
export type RenderingRequest = z.infer<typeof renderingRequestSchema>;
export type RenderingErrorCode = "INVALID_INPUT" | "ASSET_INVALID" | "LAYOUT_OVERFLOW" | "UNSUPPORTED_CHARACTER" | "OUTPUT_INVALID";
export const MAX_INPUT_BYTES = 1024 * 1024;
export const MAX_PDF_BYTES = 2 * 1024 * 1024;
export const TEMPLATE_SHA256 = "9b988a24085101a888a9feac3271dd7e76e310dfff264abb7f1ce27d8a8d0bdd";
export const FONT_SHA256 = "76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8";
