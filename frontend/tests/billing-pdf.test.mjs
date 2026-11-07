import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import {
  renderInvoicePdf,
  InvoicePdfError,
} from "../src/lib/billing/pdf-renderer.ts";
import { invoicePage } from "../src/lib/billing/pdf-layout.ts";
import { invoiceFixtures, paymentFixtures } from "../src/data/billing.ts";
import {
  amountToFrenchWords,
  invoiceAmountSentence,
} from "../src/lib/billing/amount-to-words.ts";

const background = new Uint8Array(
  await readFile("public/pdf-templates/facture_background.png"),
);
const font = new Uint8Array(
  await readFile("public/fonts/LiberationSans-Regular.ttf"),
);
const boldFont = new Uint8Array(
  await readFile("public/fonts/LiberationSans-Bold.ttf"),
);
const assets = { background, font, boldFont };

const invoice = {
  ...invoiceFixtures[2],
  lines: invoiceFixtures[2].lines.map((line, index) => ({
    ...line,
    performedDate: index ? "2026-11-03" : "2026-11-02",
    toothNumber: index ? "" : "16",
    description: index
      ? "Acte complémentaire fictif"
      : "Détartrage fictif avec contrôle de l’émail",
  })),
};
const payments = paymentFixtures.filter(
  (payment) => payment.invoiceId === invoice.id,
);
const patient = invoice.issuedPatient;

function extract(bytes) {
  const directory = mkdtempSync(path.join(tmpdir(), "sijilmassa-invoice-"));
  try {
    const file = path.join(directory, "invoice.pdf");
    writeFileSync(file, bytes);
    return spawnSync("pdftotext", [file, "-"], {
      encoding: "utf8",
      timeout: 10000,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("approved PNG is copied byte-for-byte and generates one A5 invoice page", async () => {
  const reference = await readFile(
    "../docs/references/pdf-templates/facture_background.png",
  );
  assert.equal(
    createHash("sha256").update(background).digest("hex"),
    createHash("sha256").update(reference).digest("hex"),
  );
  const bytes = await renderInvoicePdf(invoice, payments, patient, assets);
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 1);
  assert(Math.abs(document.getPage(0).getWidth() - invoicePage.width) < 0.01);
  assert(Math.abs(document.getPage(0).getHeight() - invoicePage.height) < 0.01);
  if (process.env.INVOICE_PDF_QA_DIR) {
    await mkdir(process.env.INVOICE_PDF_QA_DIR, { recursive: true });
    await writeFile(
      path.join(process.env.INVOICE_PDF_QA_DIR, "facture-2026-002.pdf"),
      bytes,
    );
  }
});

test("date clearance below letterhead divider is strictly between 10 mm and 15 mm", () => {
  // Divider bottom in unscaled PDF points
  const dividerBottom = invoicePage.dividerBottom; // 489.55 pt
  const dateBaseline = invoicePage.dateBaseline; // 448.0 pt
  const dateFontSize = 8.5;
  // Font ascender for capital letters (T, DD, MM, YYYY) is ~0.75 * fontSize
  const dateGlyphTop = dateBaseline + dateFontSize * 0.75;
  const gapPt = dividerBottom - dateGlyphTop;
  const gapMm = (gapPt * 25.4) / 72;

  assert(
    gapMm >= 10 && gapMm <= 15,
    `Vertical gap below divider to date glyph top should be 10-15 mm, got ${gapMm.toFixed(2)} mm`,
  );
});

test("practitioner/address block and patient reference are absent from dynamic PDF text", async (t) => {
  const bytes = await renderInvoicePdf(invoice, payments, patient, assets);
  const result = extract(bytes);
  if (result.error?.code === "ENOENT") {
    t.skip("Poppler unavailable");
    return;
  }
  assert.equal(result.status, 0);

  // Dynamic practitioner block must NOT be rendered
  assert(
    !result.stdout.includes("SAMGHOULI Kaoutar"),
    "Practitioner name must be removed from dynamic text",
  );
  assert(
    !result.stdout.includes("Lotissement Bourass"),
    "Address line must be removed from dynamic text",
  );

  // Internal patient reference must NOT be printed
  assert(
    !result.stdout.includes("DEMO-PAT-0003"),
    "Patient reference ID must not appear in printed PDF",
  );

  // Patient name MUST be present
  assert(
    result.stdout.includes("Patient : Mériem Démo-Idrissi"),
    "Patient name must be rendered below centered title",
  );
});

test("invoice PDF renders complete financial summary with total, paid, and remaining balance", async (t) => {
  const bytes = await renderInvoicePdf(invoice, payments, patient, assets);
  const result = extract(bytes);
  if (result.error?.code === "ENOENT") {
    t.skip("Poppler unavailable");
    return;
  }
  assert.equal(result.status, 0);

  // Centered title
  assert(result.stdout.includes("FACTURE N° : 2026-002"));

  // Dental treatment table headers
  assert(result.stdout.includes("DATE"));
  assert(result.stdout.includes("DENTS"));
  assert(result.stdout.includes("DESCRIPTION"));
  assert(result.stdout.includes("PRIX"));

  // Dental treatment items
  assert(result.stdout.includes("02/11/2026"));
  assert(result.stdout.includes("16"));
  assert(result.stdout.includes("Détartrage fictif"));
  assert(result.stdout.includes("450,00 DH"));
  assert(result.stdout.includes("03/11/2026"));
  assert(result.stdout.includes("Acte complémentaire fictif"));
  assert(result.stdout.includes("500,00 DH"));

  // Complete financial summary
  assert(
    result.stdout.includes("TOTAL DE LA FACTURE :"),
    "Total invoice label",
  );
  assert(result.stdout.includes("950,00 DH"), "Total amount 950,00 DH");
  assert(result.stdout.includes("MONTANT REÇU :"), "Amount received label");
  assert(result.stdout.includes("700,00 DH"), "Paid amount 700,00 DH");
  assert(result.stdout.includes("RESTE À PAYER :"), "Remaining balance label");
  assert(result.stdout.includes("250,00 DH"), "Remaining balance 250,00 DH");

  // Status for partially paid invoice
  assert(result.stdout.includes("PARTIELLEMENT PAYÉE"));

  // Amount in French words
  assert(
    result.stdout.includes(
      "Arrêtée la présente facture à la somme de neuf cent cinquante dirhams.",
    ),
  );

  // Financial identifiers
  for (const identifier of ["73149010", "003999044000004", "084209071"]) {
    assert.equal(
      result.stdout.split(identifier).length - 1,
      1,
      `Identifier ${identifier} should appear exactly once`,
    );
  }
});

test("all five invoice statuses are derived and displayed accurately in the PDF", async () => {
  // 1. BROUILLON
  const draftInv = { ...invoiceFixtures[0] };
  const draftBytes = await renderInvoicePdf(
    draftInv,
    [],
    { name: "Patient Démo", reference: "DEMO-PAT-001" },
    assets,
  );
  const draftRes = extract(draftBytes);
  if (!draftRes.error) {
    assert(draftRes.stdout.includes("BROUILLON"));
    assert(draftRes.stdout.includes("FACTURE N° : BROUILLON"));
  }

  // 2. ÉMISE (unpaid)
  const issuedInv = {
    ...invoiceFixtures[2],
    invoiceNumber: "2026-003",
  };
  const issuedBytes = await renderInvoicePdf(issuedInv, [], patient, assets);
  const issuedRes = extract(issuedBytes);
  if (!issuedRes.error) {
    assert(issuedRes.stdout.includes("ÉMISE"));
    assert(issuedRes.stdout.includes("RESTE À PAYER :"));
    assert(issuedRes.stdout.includes("950,00 DH"));
    assert(issuedRes.stdout.includes("MONTANT REÇU :"));
    assert(issuedRes.stdout.includes("0,00 DH"));
  }

  // 3. PARTIELLEMENT PAYÉE
  const partialInv = { ...invoiceFixtures[2] };
  const partialPayments = [
    {
      id: "pay-1",
      invoiceId: partialInv.id,
      patientId: partialInv.patientId,
      amountMinor: 40000,
      paymentDate: "2026-11-03",
      paymentMethod: "ESPECES",
      recordedAt: "2026-11-03T10:00:00Z",
    },
  ];
  const partialBytes = await renderInvoicePdf(
    partialInv,
    partialPayments,
    patient,
    assets,
  );
  const partialRes = extract(partialBytes);
  if (!partialRes.error) {
    assert(partialRes.stdout.includes("PARTIELLEMENT PAYÉE"));
    assert(partialRes.stdout.includes("400,00 DH"));
    assert(partialRes.stdout.includes("550,00 DH"));
  }

  // 4. PAYÉE
  const paidInv = { ...invoiceFixtures[2] };
  const fullPayments = [
    {
      id: "pay-2",
      invoiceId: paidInv.id,
      patientId: paidInv.patientId,
      amountMinor: 95000,
      paymentDate: "2026-11-03",
      paymentMethod: "VIREMENT",
      recordedAt: "2026-11-03T10:00:00Z",
    },
  ];
  const paidBytes = await renderInvoicePdf(
    paidInv,
    fullPayments,
    patient,
    assets,
  );
  const paidRes = extract(paidBytes);
  if (!paidRes.error) {
    assert(paidRes.stdout.includes("PAYÉE"));
    assert(paidRes.stdout.includes("950,00 DH"));
    assert(paidRes.stdout.includes("0,00 DH"));
  }

  // 5. ANNULÉE
  const cancelledInv = {
    ...invoiceFixtures[2],
    lifecycle: "ANNULEE",
    cancellation: {
      reason: "Erreur de saisie",
      cancelledAt: "2026-11-04T12:00:00Z",
    },
  };
  const cancelledBytes = await renderInvoicePdf(
    cancelledInv,
    [],
    patient,
    assets,
  );
  const cancelledRes = extract(cancelledBytes);
  if (!cancelledRes.error) {
    assert(cancelledRes.stdout.includes("ANNULÉE"));
    assert(cancelledRes.stdout.includes("RESTE À PAYER :"));
    assert(cancelledRes.stdout.includes("0,00 DH"));
  }
});

test("French amount to words formatter handles zeros, singular/plural, hundreds, thousands and decimals", () => {
  // Zeros
  assert.equal(amountToFrenchWords(0), "zéro dirham");
  assert.equal(
    invoiceAmountSentence(0),
    "Arrêtée la présente facture à la somme de zéro dirham.",
  );

  // Singular
  assert.equal(amountToFrenchWords(100), "un dirham");
  assert.equal(amountToFrenchWords(101), "un dirham et un centime");

  // Plural dirhams
  assert.equal(amountToFrenchWords(200), "deux dirhams");
  assert.equal(amountToFrenchWords(5000), "cinquante dirhams");

  // Tens with 80
  assert.equal(amountToFrenchWords(8000), "quatre-vingts dirhams");
  assert.equal(amountToFrenchWords(8100), "quatre-vingt-un dirhams");
  assert.equal(amountToFrenchWords(9000), "quatre-vingt-dix dirhams");
  assert.equal(amountToFrenchWords(9100), "quatre-vingt-onze dirhams");

  // Hundreds
  assert.equal(amountToFrenchWords(60000), "six cents dirhams");
  assert.equal(
    invoiceAmountSentence(60000),
    "Arrêtée la présente facture à la somme de six cents dirhams.",
  );
  assert.equal(amountToFrenchWords(20000), "deux cents dirhams");
  assert.equal(amountToFrenchWords(20100), "deux cent un dirhams");
  assert.equal(amountToFrenchWords(28000), "deux cent quatre-vingts dirhams");

  // Thousands
  assert.equal(amountToFrenchWords(100000), "mille dirhams");
  assert.equal(amountToFrenchWords(200000), "deux mille dirhams");
  assert.equal(amountToFrenchWords(20000000), "deux cent mille dirhams");
  assert.equal(amountToFrenchWords(95000), "neuf cent cinquante dirhams");

  // Decimals / Centimes
  assert.equal(
    amountToFrenchWords(60050),
    "six cents dirhams et cinquante centimes",
  );
  assert.equal(
    amountToFrenchWords(60001),
    "six cents dirhams et un centime",
  );
  assert.equal(amountToFrenchWords(50), "zéro dirham et cinquante centimes");
  assert.equal(amountToFrenchWords(1), "zéro dirham et un centime");
});

test("draft invoice is visibly marked and long acts fail without truncation", async (t) => {
  const draft = {
    ...invoiceFixtures[0],
    lines: invoiceFixtures[0].lines.map((line) => ({
      ...line,
      performedDate: "2026-11-07",
    })),
  };
  const bytes = await renderInvoicePdf(
    draft,
    [],
    { name: "Patient Démo", reference: "DEMO-PAT-001" },
    assets,
  );
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getTitle(), "Facture - BROUILLON");
  const result = extract(bytes);
  if (!result.error) assert(result.stdout.includes("BROUILLON"));

  await assert.rejects(
    renderInvoicePdf(
      {
        ...draft,
        lines: Array.from({ length: 25 }, (_, index) => ({
          ...draft.lines[0],
          id: `overflow-${index}`,
          description: "Description fictive longue sans troncature ".repeat(5),
        })),
      },
      [],
      { name: "Patient Démo", reference: "DEMO-PAT-001" },
      assets,
    ),
    InvoicePdfError,
  );
  if (result.error?.code === "ENOENT") t.diagnostic("Poppler unavailable");
});
