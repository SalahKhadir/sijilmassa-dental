import { PDFDocument, PrintScaling, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Prescription, PrescriptionPatient } from "../types.ts";
import { finalizedPrescriptionSchema, prescriptionSchema } from "../schema.ts";
import {
  prescriptionPage as area,
  PrescriptionPdfError,
  wrapPdfText,
} from "./layout.ts";
export { PrescriptionPdfError } from "./layout.ts";
export interface PrescriptionPdfAssets {
  template: Uint8Array;
  font: Uint8Array;
}
async function openTemplate(template: Uint8Array) {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(template, { updateMetadata: false });
  } catch {
    throw new PrescriptionPdfError(
      "Le modèle officiel ne peut pas être lu. Rechargez-le avant de réessayer.",
      "ASSET_INVALID",
    );
  }
  const page = document.getPages()[0];
  if (
    document.getPageCount() !== 1 ||
    !page ||
    Math.abs(page.getWidth() - area.width) > 0.01 ||
    Math.abs(page.getHeight() - area.height) > 0.01 ||
    page.getRotation().angle !== 0
  )
    throw new PrescriptionPdfError(
      "Les dimensions du modèle diffèrent du document A5 officiel attendu.",
      "ASSET_INVALID",
    );
  return document;
}
export async function blankPrescriptionPdf(
  template: Uint8Array,
): Promise<Uint8Array> {
  await openTemplate(template);
  // The blank document is byte-for-byte identical to the supplied official template.
  return template.slice();
}
const frenchDate = (date: string) =>
  `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
export async function renderPrescriptionPdf(
  record: Prescription,
  patient: PrescriptionPatient,
  assets: PrescriptionPdfAssets,
): Promise<Uint8Array> {
  (record.status === "FINALISEE"
    ? finalizedPrescriptionSchema
    : prescriptionSchema
  ).parse(record);
  if (patient.id !== record.patientId)
    throw new PrescriptionPdfError(
      "Le patient du PDF ne correspond pas à l’ordonnance.",
    );
  const document = await openTemplate(assets.template);
  document.registerFontkit(fontkit);
  const font = await document.embedFont(assets.font, { subset: true });
  const supported = new Set(font.getCharacterSet());
  const paragraphs = record.medications.flatMap((medication, index) => [
    `${index + 1}. ${medication.medicationName || "Nom non renseigné"}`,
    `Posologie : ${medication.dosage || "Non renseignée"}`,
    `Fréquence : ${medication.frequency || "Non renseignée"}`,
    `Durée : ${medication.duration || "Non renseignée"}`,
    ...(medication.instructions ? [medication.instructions] : []),
    "",
  ]);
  if (!record.medications.length)
    paragraphs.push("Aucun médicament renseigné.");
  if (record.generalInstructions)
    paragraphs.push("Instructions générales", record.generalInstructions);
  const allText = [patient.name, ...paragraphs];
  for (const text of allText) {
    for (const character of text.normalize("NFC").replace(/[\r\n]/g, "")) {
      if (!supported.has(character.codePointAt(0)!))
        throw new PrescriptionPdfError(
          "Un caractère saisi n’est pas pris en charge par la police du PDF. Vérifiez le texte avant de réessayer.",
          "UNSUPPORTED_CHARACTER",
        );
    }
  }
  const width = area.right - area.left;
  const patientLines = wrapPdfText(
    `Patient : ${patient.name}`,
    font,
    width,
    10,
  );
  if (patientLines.length > 2)
    throw new PrescriptionPdfError(
      "Le nom du patient dépasse la zone d’identification du modèle.",
      "LAYOUT_OVERFLOW",
    );
  // Reserve the same area for both statuses so finalization never removes content.
  const lines = paragraphs.map((text) =>
    wrapPdfText(text, font, width, area.fontSize),
  );
  let baseline = area.contentTop - (patientLines.length - 1) * 13;
  const placed: { text: string; y: number }[] = [];
  for (const paragraph of lines) {
    for (const text of paragraph) {
      placed.push({ text, y: baseline });
      baseline -= area.lineHeight;
    }
    baseline -= area.paragraphGap;
  }
  if (placed.some((line) => line.y < area.bottom))
    throw new PrescriptionPdfError(
      "Le contenu dépasse la zone d’écriture d’une page A5. Réorganisez l’ordonnance avant de réessayer. Aucun texte n’a été tronqué.",
      "LAYOUT_OVERFLOW",
    );
  const page = document.getPages()[0];
  const origin = page.getCropBox();
  const color = rgb(0.08, 0.08, 0.08);
  page.drawText(frenchDate(record.issuedDate), {
    x: origin.x + area.dateX,
    y: origin.y + area.dateBaseline,
    font,
    size: 8.5,
    color,
  });
  patientLines.forEach((text, index) =>
    page.drawText(text, {
      x: origin.x + area.left,
      y: origin.y + area.patientBaseline - index * 13,
      font,
      size: 10,
      color,
    }),
  );
  if (record.status === "BROUILLON")
    page.drawText("BROUILLON - À VALIDER", {
      x: origin.x + area.left,
      y: origin.y + area.stateBaseline - (patientLines.length - 1) * 13,
      font,
      size: 10,
      color: rgb(94 / 255, 11 / 255, 27 / 255),
    });
  for (const line of placed)
    if (line.text)
      page.drawText(line.text, {
        x: origin.x + area.left,
        y: origin.y + line.y,
        font,
        size: area.fontSize,
        color,
      });
  document.setTitle(
    record.status === "BROUILLON" ? "Ordonnance - BROUILLON" : "Ordonnance",
  );
  document.setSubject("Ordonnance de démonstration");
  document.catalog
    .getOrCreateViewerPreferences()
    .setPrintScaling(PrintScaling.None);
  return document.save();
}
