import { PDFDocument, PrintScaling, StandardFonts, degrees, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Invoice, InvoiceStatus, Payment } from "./types";
import { invoiceStatus, settlement } from "./calculations";
import { clinicFinancialIdentifiers } from "./pdf-config";
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

export function formatInvoicePdfStatus(status: InvoiceStatus): string {
  switch (status) {
    case "BROUILLON":
      return "BROUILLON";
    case "EMISE":
      return "ÉMISE";
    case "PARTIELLEMENT_PAYEE":
      return "PARTIELLEMENT PAYÉE";
    case "PAYEE":
      return "PAYÉE";
    case "ANNULEE":
      return "ANNULÉE";
  }
}

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
  const status = invoiceStatus(invoice, payments);
  const statusLabel = formatInvoicePdfStatus(status);

  const textToCheck = [
    invoice.invoiceNumber || "BROUILLON",
    identity.name,
    statusLabel,
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
  // Target clear gap: 10–15 mm below the horizontal divider
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

  // 3. Patient information only (no practitioner/address block, no patient reference ID)
  const patientLabel = "Patient : ";
  const labelWidth = boldFont.widthOfTextAtSize(patientLabel, 8.5);
  const availablePatientWidth = area.right - area.left - labelWidth;

  const patientNameLines = wrapInvoiceText(
    identity.name.trim(),
    font,
    availablePatientWidth,
    8.5,
  );

  page.drawText(patientLabel, {
    x: area.left,
    y: area.patientBaseline,
    font: boldFont,
    size: 8.5,
    color: ink,
  });

  patientNameLines.forEach((line, idx) => {
    page.drawText(line, {
      x: idx === 0 ? area.left + labelWidth : area.left + labelWidth,
      y: area.patientBaseline - idx * 11,
      font,
      size: 8.5,
      color: ink,
    });
  });

  // 4. Bordered dental treatment table
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

  // 5. Complete financial summary
  // Layout: Left side shows invoice status; right side shows the 3 totals.
  const summaryTop = tableBottom - 14;
  const summaryX = 220;

  // Left side: Invoice status
  page.drawText("Statut : ", {
    x: area.left,
    y: summaryTop,
    font: boldFont,
    size: 8,
    color: ink,
  });
  const statusPromptWidth = boldFont.widthOfTextAtSize("Statut : ", 8);
  page.drawText(statusLabel, {
    x: area.left + statusPromptWidth,
    y: summaryTop,
    font: boldFont,
    size: 8,
    color: burgundy,
  });

  // Right side: TOTAL DE LA FACTURE
  page.drawText("TOTAL DE LA FACTURE :", {
    x: summaryX,
    y: summaryTop,
    font: boldFont,
    size: 8,
    color: ink,
  });
  const totalValText = pdfMoney(balance.total);
  const totalValWidth = boldFont.widthOfTextAtSize(totalValText, 8);
  page.drawText(totalValText, {
    x: area.right - totalValWidth,
    y: summaryTop,
    font: boldFont,
    size: 8,
    color: ink,
  });

  // MONTANT REÇU
  const paidBaseline = summaryTop - 13;
  page.drawText("MONTANT REÇU :", {
    x: summaryX,
    y: paidBaseline,
    font: boldFont,
    size: 8,
    color: ink,
  });
  const paidValText = pdfMoney(balance.paid);
  const paidValWidth = font.widthOfTextAtSize(paidValText, 8);
  page.drawText(paidValText, {
    x: area.right - paidValWidth,
    y: paidBaseline,
    font,
    size: 8,
    color: ink,
  });

  // Separator line before RESTE À PAYER
  page.drawLine({
    start: { x: summaryX, y: paidBaseline - 4 },
    end: { x: area.right, y: paidBaseline - 4 },
    thickness: 0.5,
    color: ink,
  });

  // RESTE À PAYER (prominent, bold burgundy)
  const remainingBaseline = summaryTop - 27;
  page.drawText("RESTE À PAYER :", {
    x: summaryX,
    y: remainingBaseline,
    font: boldFont,
    size: 9,
    color: burgundy,
  });
  const remainingValue =
    invoice.lifecycle === "ANNULEE" ? 0 : balance.remaining;
  const remainingValText = pdfMoney(remainingValue);
  const remainingValWidth = boldFont.widthOfTextAtSize(remainingValText, 9.5);
  page.drawText(remainingValText, {
    x: area.right - remainingValWidth,
    y: remainingBaseline,
    font: boldFont,
    size: 9.5,
    color: burgundy,
  });

  // 6. Total amount written in French words (based on total)
  const sentence = invoiceAmountSentence(balance.total);
  const sentenceLines = wrapInvoiceText(
    sentence,
    font,
    area.right - area.left,
    7.8,
  );
  const wordsTop = remainingBaseline - 15;
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

  drawIdentifier(
    "IF : ",
    clinicFinancialIdentifiers.if,
    area.identifiers.ifBaseline,
  );
  drawIdentifier(
    "ICE : ",
    clinicFinancialIdentifiers.ice,
    area.identifiers.iceBaseline,
  );
  drawIdentifier(
    "INP : ",
    clinicFinancialIdentifiers.inp,
    area.identifiers.inpBaseline,
  );

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
