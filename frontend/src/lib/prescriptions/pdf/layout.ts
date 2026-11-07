/** Coordinates measured against the unscaled official template, in PDF points. */
export const prescriptionPage = {
  width: 419.25,
  height: 595.499986,
  left: 28,
  right: 391,
  patientBaseline: 388,
  stateBaseline: 370,
  dateX: 60,
  dateBaseline: 437,
  contentTop: 348,
  bottom: 86,
  fontSize: 10,
  lineHeight: 14,
  paragraphGap: 5,
} as const;
export class PrescriptionPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrescriptionPdfError";
  }
}
export interface TextMeasure {
  widthOfTextAtSize(text: string, size: number): number;
}
/** Wrap all paragraphs, including unbroken words, without dropping characters. */
export function wrapPdfText(
  text: string,
  font: TextMeasure,
  width: number,
  size: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.normalize("NFC").split(/\r\n|\n|\r/)) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const token of paragraph.split(/( +)/)) {
      if (!token) continue;
      if (font.widthOfTextAtSize(line + token, size) <= width) {
        line += token;
        continue;
      }
      if (line.trim()) {
        lines.push(line.trimEnd());
        line = "";
      }
      if (!token.trim()) continue;
      for (const character of token) {
        if (font.widthOfTextAtSize(character, size) > width)
          throw new PrescriptionPdfError(
            "Un caractère dépasse la largeur disponible.",
          );
        if (font.widthOfTextAtSize(line + character, size) > width) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
    }
    if (line.trim()) lines.push(line.trimEnd());
  }
  return lines;
}
