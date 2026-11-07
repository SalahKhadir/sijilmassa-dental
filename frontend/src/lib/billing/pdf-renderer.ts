import { PDFDocument, PrintScaling, StandardFonts, degrees, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Invoice, Payment } from "./types";
import { settlement } from "./calculations";
import { clinicIdentity, clinicFinancialIdentifiers } from "./pdf-config";
import {
  invoicePage as area,
  tableColumns,
  InvoicePdfError,
  wrapInvoiceText,
} from "./pdf-layout";
import { invoiceAmountSentence } from "./amount-to-words";

export { InvoicePdfError } from "./pdf-layout";

export interface InvoicePdfAssets {
  background: Uint8Array;
  font: Uint8Array;
  boldFont?: Uint8Array;
}

const ink = rgb(42 / 255, 26 / 255, 29 / 255);
const burgundy = rgb(94 / 255, 11 / 255, 27 / 255);
const headerBg = rgb(240 / 255, 240 / 255, 240 / 255);

const frenchDate = (date: string) =>
  `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

const formatThousands = (val: bigint) =>
  val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const pdfMoney = (minor: number) => {
  const value = BigInt(minor);
  const whole = formatThousands(value / 100n);
  return `${whole},${String(value % 100n).padStart(2, "0")} DH`;
};

export async function renderInvoicePdf(
  invoice: Invoice,
  payments: readonly Payment[],
  patient: { name: string; reference: string },
  assets: InvoicePdfAssets,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);

  const [background, font, boldFont] = await Promise.all([
    document.embedPng(assets.background).catch(() => {
      throw new InvoicePdfError(
        "Le fond officiel de facture ne peut pas être lu.",
      );
    }),
    document.embedFont(assets.font, { subset: true }).catch(() => {
      throw new InvoicePdfError("La police française du PDF est indisponible.");
    }),
    assets.boldFont
      ? document.embedFont(assets.boldFont, { subset: true }).catch(() =>
          document.embedFont(StandardFonts.HelveticaBold),
        )
      : document.embedFont(StandardFonts.HelveticaBold),
  ]);

  if (background.width !== 1410 || background.height !== 2000)
    throw new InvoicePdfError(
      "Les dimensions du fond diffèrent du modèle officiel 1410 × 2000 px.",
    );

  const imageRatio = background.width / background.height;
  const pageRatio = area.width / area.height;
  if (Math.abs(imageRatio - pageRatio) / pageRatio > 0.002)
    throw new InvoicePdfError(
      "Le rapport de proportions du fond est incompatible avec une page A5.",
    );

  const identity = invoice.issuedPatient ?? patient;
  if (!identity.name.trim())
    throw new InvoicePdfError("Le nom du patient est requis dans la facture.");

  const balance = settlement(invoice, payments);
  const textToCheck = [
    invoice.invoiceNumber || "BROUILLON",
    identity.name,
    clinicIdentity.practitioner,
    clinicIdentity.addressLine1,
    clinicIdentity.city,
    ...invoice.lines.flatMap((line) => [
      line.description,
      line.toothNumber ?? "",
    ]),
    invoiceAmountSentence(balance.total),
  ];

  if (typeof font.getCharacterSet === "function") {
    const supported = new Set(font.getCharacterSet());
    for (const text of textToCheck) {
      for (const character of text.normalize("NFC").replace(/[\r\n]/g, "")) {
        const codePoint = character.codePointAt(0);
        if (codePoint !== undefined && !supported.has(codePoint)) {
          throw new InvoicePdfError(
            "Un caractère saisi n’est pas pris en charge par la police du PDF.",
          );
        }
      }
    }
  }

  const page = document.addPage([area.width, area.height]);
  const scale = Math.min(
    area.width / background.width,
    area.height / background.height,
  );
  const imageWidth = background.width * scale;
  const imageHeight = background.height * scale;

  page.drawImage(background, {
    x: (area.width - imageWidth) / 2,
    y: (area.height - imageHeight) / 2,
    width: imageWidth,
    height: imageHeight,
  });

  // 1. Date aligned right: Témara, le : DD/MM/YYYY
  const dateText = `Témara, le : ${frenchDate(invoice.issueDate)}`;
  const dateWidth = font.widthOfTextAtSize(dateText, 8.5);
  page.drawText(dateText, {
    x: area.right - dateWidth,
    y: area.dateBaseline,
    font,
    size: 8.5,
    color: ink,
  });

  // 2. Large centered invoice title: FACTURE N° : 2026-002
  const titleText = invoice.invoiceNumber
    ? `FACTURE N° : ${invoice.invoiceNumber}`
    : "FACTURE N° : BROUILLON";
  const titleSize = 14.5;
  const titleWidth = boldFont.widthOfTextAtSize(titleText, titleSize);
  page.drawText(titleText, {
    x: (area.width - titleWidth) / 2,
    y: area.titleBaseline,
    font: boldFont,
    size: titleSize,
    color: burgundy,
  });

  // 3. Clinic and patient identification
  // On the left: Clinic details
  page.drawText(clinicIdentity.practitioner, {
    x: area.left,
    y: area.identityTop,
    font: boldFont,
    size: 8.5,
    color: ink,
  });
  page.drawText(clinicIdentity.addressLine1, {
    x: area.left,
    y: area.identityTop - 12,
    font,
    size: 7.5,
    color: ink,
  });
  page.drawText(clinicIdentity.city, {
    x: area.left,
    y: area.identityTop - 23,
    font,
    size: 7.5,
    color: ink,
  });

  // On the right: Patient name (wrapping safely without patient reference ID)
  const patientLabel = "Patient : ";
  const labelWidth = boldFont.widthOfTextAtSize(patientLabel, 8.5);
  const availablePatientWidth = area.right - area.patientColumnLeft;
  const firstLineWidth = Math.max(0, availablePatientWidth - labelWidth);

  const nameWords = identity.name.trim().split(/\s+/);
  let firstLine = "";
  let restWords: string[] = [];

  for (let i = 0; i < nameWords.length; i++) {
    const candidate = firstLine ? `${firstLine} ${nameWords[i]}` : nameWords[i];
    if (font.widthOfTextAtSize(candidate, 8.5) <= firstLineWidth) {
      firstLine = candidate;
    } else {
      restWords = nameWords.slice(i);
      break;
    }
  }

  page.drawText(patientLabel, {
    x: area.patientColumnLeft,
    y: area.identityTop,
    font: boldFont,
    size: 8.5,
    color: ink,
  });

  if (firstLine) {
    page.drawText(firstLine, {
      x: area.patientColumnLeft + labelWidth,
      y: area.identityTop,
      font,
      size: 8.5,
      color: ink,
    });
  }

  if (restWords.length > 0) {
    const restLines = wrapInvoiceText(
      restWords.join(" "),
      font,
      availablePatientWidth,
      8.5,
    );
    restLines.forEach((rLine, idx) => {
      page.drawText(rLine, {
        x: area.patientColumnLeft,
        y: area.identityTop - (idx + 1) * 11,
        font,
        size: 8.5,
        color: ink,
      });
    });
  }

  // 4. Bordered dental acts table
  // Header background
  page.drawRectangle({
    x: area.left,
    y: area.tableTop - area.tableHeaderHeight,
    width: area.right - area.left,
    height: area.tableHeaderHeight,
    color: headerBg,
  });

  // Header column titles
  const headerY = area.tableTop - 12;
  page.drawText("DATE", {
    x: tableColumns.date.left + 6,
    y: headerY,
    font: boldFont,
    size: 7.5,
    color: ink,
  });

  const dentsTitleWidth = boldFont.widthOfTextAtSize("DENTS", 7.5);
  page.drawText("DENTS", {
    x:
      tableColumns.tooth.left +
      (tableColumns.tooth.width - dentsTitleWidth) / 2,
    y: headerY,
    font: boldFont,
    size: 7.5,
    color: ink,
  });

  page.drawText("DESCRIPTION", {
    x: tableColumns.description.left + 6,
    y: headerY,
    font: boldFont,
    size: 7.5,
    color: ink,
  });

  const prixTitleWidth = boldFont.widthOfTextAtSize("PRIX", 7.5);
  page.drawText("PRIX", {
    x: tableColumns.price.left + tableColumns.price.width - 6 - prixTitleWidth,
    y: headerY,
    font: boldFont,
    size: 7.5,
    color: ink,
  });

  // Data rows
  let currentY = area.tableTop - area.tableHeaderHeight;
  const availableDescWidth = tableColumns.description.width - 12;

  for (const line of invoice.lines) {
    const descLines = wrapInvoiceText(
      line.description,
      font,
      availableDescWidth,
      7.2,
    );
    const rowHeight = Math.max(18, descLines.length * 9.5 + 8.5);

    if (currentY - rowHeight < area.tableMinBottom) {
      throw new InvoicePdfError(
        "Les actes dépassent la zone disponible d’une page A5. Réduisez leur nombre ou leur description. Aucun texte n’a été tronqué.",
      );
    }

    const rowBaseline = currentY - 12;

    // Date
    page.drawText(frenchDate(line.performedDate || invoice.issueDate), {
      x: tableColumns.date.left + 6,
      y: rowBaseline,
      font,
      size: 6.8,
      color: ink,
    });

    // Tooth
    const toothText = line.toothNumber?.trim() || "";
    if (toothText) {
      const toothWidth = font.widthOfTextAtSize(toothText, 7);
      page.drawText(toothText, {
        x:
          tableColumns.tooth.left +
          (tableColumns.tooth.width - toothWidth) / 2,
        y: rowBaseline,
        font,
        size: 7,
        color: ink,
      });
    }

    // Description (multi-line supported)
    descLines.forEach((text, index) => {
      page.drawText(text, {
        x: tableColumns.description.left + 6,
        y: rowBaseline - index * 9.5,
        font,
        size: 7.2,
        color: ink,
      });
    });

    // Price
    const priceText = pdfMoney(line.lineTotalMinor);
    const priceWidth = font.widthOfTextAtSize(priceText, 7.2);
    page.drawText(priceText, {
      x: tableColumns.price.left + tableColumns.price.width - 6 - priceWidth,
      y: rowBaseline,
      font,
      size: 7.2,
      color: ink,
    });

    currentY -= rowHeight;

    // Horizontal separator line under row
    page.drawLine({
      start: { x: area.left, y: currentY },
      end: { x: area.right, y: currentY },
      thickness: 0.5,
      color: ink,
    });
  }

  // Outer table rectangle border
  page.drawRectangle({
    x: area.left,
    y: currentY,
    width: area.right - area.left,
    height: area.tableTop - currentY,
    borderWidth: 0.75,
    borderColor: ink,
    opacity: 0,
    borderOpacity: 1,
  });

  // Header separator line
  page.drawLine({
    start: { x: area.left, y: area.tableTop - area.tableHeaderHeight },
    end: { x: area.right, y: area.tableTop - area.tableHeaderHeight },
    thickness: 0.75,
    color: ink,
  });

  // Vertical column separators
  const vSeparators = [
    tableColumns.tooth.left,
    tableColumns.description.left,
    tableColumns.price.left,
  ];

  for (const sepX of vSeparators) {
    page.drawLine({
      start: { x: sepX, y: area.tableTop },
      end: { x: sepX, y: currentY },
      thickness: 0.5,
      color: ink,
    });
  }

  const tableBottom = currentY;

  // 5. Bold total: TOTAL : 600,00 DH
  const totalBaseline = tableBottom - 16;
  const totalText = `TOTAL : ${pdfMoney(balance.total)}`;
  const totalWidth = boldFont.widthOfTextAtSize(totalText, 9.5);
  page.drawText(totalText, {
    x: area.right - totalWidth,
    y: totalBaseline,
    font: boldFont,
    size: 9.5,
    color: ink,
  });

  // 6. Total amount written in French words
  const sentence = invoiceAmountSentence(balance.total);
  const sentenceLines = wrapInvoiceText(
    sentence,
    font,
    area.right - area.left,
    7.8,
  );
  const wordsTop = totalBaseline - 15;
  sentenceLines.forEach((sLine, idx) => {
    page.drawText(sLine, {
      x: area.left,
      y: wordsTop - idx * 10,
      font,
      size: 7.8,
      color: ink,
    });
  });

  // 7. Official IF / ICE / INP block
  const drawIdentifier = (label: string, value: string, baseline: number) => {
    page.drawText(label, {
      x: area.left,
      y: baseline,
      font: boldFont,
      size: 7.2,
      color: ink,
    });
    const lWidth = boldFont.widthOfTextAtSize(label, 7.2);
    page.drawText(value, {
      x: area.left + lWidth,
      y: baseline,
      font,
      size: 7.2,
      color: ink,
    });
  };

  drawIdentifier("IF : ", clinicFinancialIdentifiers.if, area.identifiers.ifBaseline);
  drawIdentifier("ICE : ", clinicFinancialIdentifiers.ice, area.identifiers.iceBaseline);
  drawIdentifier("INP : ", clinicFinancialIdentifiers.inp, area.identifiers.inpBaseline);

  // Watermarks
  if (invoice.lifecycle === "BROUILLON") {
    page.drawText("BROUILLON", {
      x: 100,
      y: 285,
      font: boldFont,
      size: 38,
      color: burgundy,
      rotate: degrees(28),
      opacity: 0.18,
    });
  }

  if (invoice.lifecycle === "ANNULEE") {
    page.drawText("ANNULÉE", {
      x: 116,
      y: 285,
      font: boldFont,
      size: 34,
      color: burgundy,
      rotate: degrees(28),
      opacity: 0.22,
    });
  }

  document.setTitle(
    invoice.invoiceNumber
      ? `Facture ${invoice.invoiceNumber}`
      : "Facture - BROUILLON",
  );
  document.setSubject("Facture dentaire");
  document.catalog
    .getOrCreateViewerPreferences()
    .setPrintScaling(PrintScaling.None);

  return document.save();
}
