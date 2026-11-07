import { PDFDocument, PrintScaling, degrees, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { CreateInsuranceDraftInput, PatientInsurancePolicy } from "../types.ts";
import type { Patient } from "../../patients/types.ts";
import { isCalendarDate } from "../../patients/dates.ts";
import { neutralChartMark } from "../tooth-reference.ts";
import { visualToPdf } from "./coordinates.ts";
import { InsurancePdfError } from "./errors.ts";
import { farChartShape } from "./far-chart-mapping.ts";

export interface InsurancePdfInput {
  draft: CreateInsuranceDraftInput;
  patient: Pick<Patient, "id" | "identity">;
  policy?: PatientInsurancePolicy;
}
export interface OverlayField {
  page: 1 | 2;
  label: string;
  source: string;
  x: number;
  y: number;
  size: number;
  width: number;
  align: "left" | "center" | "right";
  format: "text" | "date" | "amount" | "check" | "slots";
  slots?: readonly number[];
  slotWidth?: number;
}
export interface OverlayPlacement { field: OverlayField; text: string }
export interface OverlayPlan {
  placements: readonly OverlayPlacement[];
  warnings: string[];
  chartMarks: readonly { tooth: string; x: number; y: number; page?: 1 | 2; symbol?: "CERCLE" | "CROIX" }[];
  lines?: readonly { page: 1 | 2; x1: number; x2: number; y: number }[];
}
export const insuranceDate = (value: string) =>
  `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
export function insuranceAmount(minor: number) {
  const exact = BigInt(minor);
  return `${exact / 100n},${String(exact % 100n).padStart(2, "0")}`;
}
export function overlayWriter(ErrorClass: typeof InsurancePdfError) {
  const placements: OverlayPlacement[] = [];
  const warnings: string[] = [];
  function put(field: OverlayField, value?: string | number) {
    if (value !== undefined && String(value).trim())
      placements.push({ field, text: String(value).trim().normalize("NFC") });
    else warnings.push(`${field.label} : non renseigné, laissé vide.`);
  }
  function date(field: OverlayField, value?: string) {
    if (value && !isCalendarDate(value))
      throw new ErrorClass(`${field.label} : saisissez une date valide.`);
    put(field, value ? (field.slots ? insuranceDate(value).replaceAll("/", "") : insuranceDate(value)) : undefined);
  }
  return { placements, warnings, put, date };
}

export interface OverlaySpec {
  provider: "CNSS" | "CNOPS" | "FAR";
  width: number;
  height: number;
  rotation: 0 | 270;
  ErrorClass: typeof InsurancePdfError;
  addressLines: readonly OverlayField[];
  pageOrigins?: readonly { x: number; y: number }[];
}
export async function renderInsuranceOverlay(
  plan: OverlayPlan,
  assets: { template: Uint8Array; font: Uint8Array },
  spec: OverlaySpec,
) {
  const { provider, ErrorClass } = spec;
  function requireValue(condition: unknown, message: string): asserts condition {
    if (!condition) throw new ErrorClass(message);
  }
  let document: PDFDocument;
  try { document = await PDFDocument.load(assets.template, { updateMetadata: false }); }
  catch { throw new ErrorClass(`Le modèle ${provider} ne peut pas être lu. Rechargez la page.`); }
  requireValue(document.getPageCount() === 2, `Le modèle ${provider} doit conserver ses deux pages.`);
  for (const [index, page] of document.getPages().entries()) {
    const origin = spec.pageOrigins?.[index] ?? { x: 0, y: 0 };
    const boxes = [page.getMediaBox(), page.getCropBox()];
    requireValue(page.getRotation().angle === spec.rotation && boxes.every(b =>
      Math.abs(b.x - origin.x) < .01 && Math.abs(b.y - origin.y) < .01 &&
      Math.abs(b.width - spec.width) < .01 && Math.abs(b.height - spec.height) < .01),
    `Les boîtes ou la rotation du modèle ${provider} ont changé. Vérifiez le fichier officiel.`);
  }
  document.registerFontkit(fontkit);
  let font: PDFFont;
  try { font = await document.embedFont(assets.font, { subset: true }); }
  catch { throw new ErrorClass("La police du PDF est indisponible. Rechargez la page."); }
  const supported = new Set(font.getCharacterSet());
  const measured: OverlayPlacement[] = [];
  for (const { field, text } of plan.placements) {
    requireValue(!/[\r\n\t]/.test(text) && [...text].every(c => supported.has(c.codePointAt(0)!)),
      `${field.label} : un caractère n’est pas pris en charge. Corrigez le texte.`);
    if (field === spec.addressLines[0] && font.widthOfTextAtSize(text, field.size) > field.width) {
      let line = "";
      const lines: string[] = [];
      for (const word of text.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, field.size) > field.width && line) {
          lines.push(line); line = word;
        } else line = next;
      }
      lines.push(line);
      requireValue(lines.length <= spec.addressLines.length,
        `L’adresse dépasse les deux lignes du modèle ${provider}. Abrégez-la sans perdre d’information.`);
      lines.forEach((text, i) => measured.push({ field: spec.addressLines[i], text }));
    } else measured.push({ field, text });
  }
  for (const { field, text } of measured) {
    const slotWidth = field.slotWidth ?? 8;
    requireValue(field.slots
      ? text.length <= field.slots.length && [...text].every(c => font.widthOfTextAtSize(c, field.size) <= slotWidth)
      : font.widthOfTextAtSize(text, field.size) <= field.width,
    `${field.label} : le texte dépasse la zone du modèle ${provider}. Corrigez ce champ ; aucun texte n’a été tronqué.`);
    const page = document.getPages()[field.page - 1];
    const box = { ...page.getCropBox(), rotation: page.getRotation().angle };
    function draw(value: string, x: number) {
      page.drawText(value, {
        ...visualToPdf(x, field.y, box), font, size: field.size,
        rotate: degrees(box.rotation), color: rgb(0, 0, 0),
      });
    }
    if (field.slots)
      [...text].forEach((c, i) => draw(c, field.x + field.slots![i] + (slotWidth - font.widthOfTextAtSize(c, field.size)) / 2));
    else {
      const spare = field.width - font.widthOfTextAtSize(text, field.size);
      draw(text, field.x + (field.align === "right" ? spare : field.align === "center" ? spare / 2 : 0));
    }
  }
  const markColor = rgb(94 / 255, 11 / 255, 27 / 255);
  for (const mark of plan.chartMarks) {
    const page = document.getPages()[(mark.page ?? 2) - 1];
    const box = { ...page.getCropBox(), rotation: page.getRotation().angle };
    const centre = visualToPdf(mark.x, mark.y, box);
    if (mark.symbol === "CERCLE") {
      page.drawEllipse({ ...centre, xScale: farChartShape.radiusX, yScale: farChartShape.radiusY,
        borderWidth: farChartShape.thickness, borderColor: markColor, borderOpacity: .85 });
    } else if (mark.symbol === "CROIX") {
      for (const direction of [-1, 1]) page.drawLine({
        start: { x: centre.x - farChartShape.crossX, y: centre.y - direction * farChartShape.crossY },
        end: { x: centre.x + farChartShape.crossX, y: centre.y + direction * farChartShape.crossY },
        thickness: farChartShape.thickness, color: markColor, opacity: .75,
      });
    } else page.drawRectangle({
      x: centre.x - neutralChartMark.size / 2, y: centre.y - neutralChartMark.size / 2,
      width: neutralChartMark.size, height: neutralChartMark.size,
      borderWidth: neutralChartMark.borderWidth, borderColor: markColor,
    });
  }
  for (const line of plan.lines ?? []) {
    const page = document.getPages()[line.page - 1];
    const box = { ...page.getCropBox(), rotation: page.getRotation().angle };
    page.drawLine({ start: visualToPdf(line.x1, line.y, box), end: visualToPdf(line.x2, line.y, box),
      thickness: .7, color: rgb(0, 0, 0) });
  }
  document.setTitle(`Feuille de soins dentaires ${provider}`);
  document.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  return { bytes: await document.save(), warnings: plan.warnings };
}

export function insuranceTotal(draft: CreateInsuranceDraftInput, ErrorClass: typeof InsurancePdfError) {
  const complete = draft.acts.every(a => a.amountMinor !== undefined);
  if (!draft.acts.every(a => a.amountMinor === undefined || (Number.isSafeInteger(a.amountMinor) && a.amountMinor >= 0)))
    throw new ErrorClass("Les honoraires dépassent la précision monétaire autorisée.");
  const exact = draft.acts.reduce((n, a) => n + BigInt(a.amountMinor ?? 0), 0n);
  if (exact > BigInt(Number.MAX_SAFE_INTEGER))
    throw new ErrorClass("Le total dépasse la précision monétaire autorisée.");
  const sum = Number(exact);
  const total = draft.manualFields.totalFeesMinor ?? (complete ? sum : undefined);
  if (total !== undefined && (!Number.isSafeInteger(total) || total < 0))
    throw new ErrorClass("Le total dépasse la précision monétaire autorisée.");
  if (complete && total !== sum)
    throw new ErrorClass("Le total des frais diffère des actes. Corrigez les montants avant de générer le PDF.");
  return total;
}
