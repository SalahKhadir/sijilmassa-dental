export const invoicePage = {
  width: 419.5276,
  height: 595.2756,
  left: 28,
  right: 391.5,
  dividerBottom: 489.55,
  dateBaseline: 448,
  titleBaseline: 418,
  patientBaseline: 392,
  tableTop: 370,
  tableHeaderHeight: 18,
  tableMinBottom: 175,
  identifiers: {
    ifBaseline: 104,
    iceBaseline: 92,
    inpBaseline: 80,
  },
} as const;

export const tableColumns = {
  date: { left: 28, width: 60 },
  tooth: { left: 88, width: 38 },
  description: { left: 126, width: 189.5 },
  price: { left: 315.5, width: 76 },
} as const;

export class InvoicePdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoicePdfError";
  }
}

export interface PdfTextMeasure {
  widthOfTextAtSize(text: string, size: number): number;
}

/** Wraps every character and fails instead of clipping an oversized glyph. */
export function wrapInvoiceText(
  text: string,
  font: PdfTextMeasure,
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
          throw new InvoicePdfError(
            "Un caractère dépasse la largeur disponible dans la facture.",
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
