import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { renderPrescriptionPdf } from "../../lib/prescriptions/pdf/renderer.ts";
import type { PrescriptionPdfAssets } from "../../lib/prescriptions/pdf/renderer.ts";
import { PrescriptionPdfError } from "../../lib/prescriptions/pdf/layout.ts";
import { renderingRequestSchema, TEMPLATE_SHA256, FONT_SHA256, MAX_PDF_BYTES } from "./protocol.ts";

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Shared renderer is unchanged; only server metadata is normalized deterministically. */
export async function renderServerPrescription(input: unknown, assets: PrescriptionPdfAssets): Promise<Uint8Array> {
  const request = renderingRequestSchema.parse(input);
  const dynamicText = [request.patient.displayName, request.record.generalInstructions,
    ...request.record.medications.flatMap(line => [line.medicationName, line.dosage, line.frequency, line.duration, line.instructions])];
  // The unchanged layout has no validated shaping/bidi support. Never print misleading Arabic text.
  if (dynamicText.some(value => /\p{Script=Arabic}|\p{Bidi_Control}/u.test(value)))
    throw new PrescriptionPdfError("Unsupported PDF writing system", "UNSUPPORTED_CHARACTER");
  if (sha256(assets.template) !== TEMPLATE_SHA256 || sha256(assets.font) !== FONT_SHA256)
    throw new PrescriptionPdfError("PDF resources unavailable", "ASSET_INVALID");
  const record = {
    ...request.record,
    consultationId: request.record.consultationId ?? "",
    status: request.mode === "DRAFT" ? "BROUILLON" as const : "FINALISEE" as const,
  };
  const patient = {
    id: request.patient.id, reference: request.patient.reference, name: request.patient.displayName,
    identity: { firstName: request.patient.firstName, lastName: request.patient.lastName, gsm: "", landline: "" },
  };
  const rendered = await renderPrescriptionPdf(record, patient, assets);
  const document = await PDFDocument.load(rendered, { updateMetadata: false });
  document.setSubject("Ordonnance");
  document.setCreationDate(new Date(request.record.createdAt));
  document.setModificationDate(new Date(request.record.updatedAt));
  const bytes = await document.save();
  if (!bytes.length || bytes.length > MAX_PDF_BYTES) throw new Error("OUTPUT_INVALID");
  return bytes;
}
