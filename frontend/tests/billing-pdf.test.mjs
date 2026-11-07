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

test("invoice PDF contains correct title, clinic block, patient, bordered table, total and amount in words", async (t) => {
  const bytes = await renderInvoicePdf(invoice, payments, patient, assets);
  const result = extract(bytes);
  if (result.error?.code === "ENOENT") {
    t.skip("Poppler unavailable");
    return;
  }
  assert.equal(result.status, 0);

  // Date and Title
  assert(result.stdout.includes("Témara, le : "), "Témara date prefix");
  assert(result.stdout.includes("FACTURE N° : 2026-002"), "Centered invoice title");

  // Clinic identification
  assert(result.stdout.includes("SAMGHOULI Kaoutar"), "Practitioner name");
  assert(
    result.stdout.includes("Lotissement Bourass N°22, 1er étage, App 04,"),
    "Clinic address line 1",
  );
  assert(result.stdout.includes("Témara"), "Clinic city");

  // Patient name displayed without administrative reference
  assert(result.stdout.includes("Patient : Mériem Démo-Idrissi"), "Patient name");
  assert(!result.stdout.includes("DEMO-PAT-0003"), "Patient reference ID must not appear in printed PDF");

  // Dental table column headers
  assert(result.stdout.includes("DATE"), "DATE column header");
  assert(result.stdout.includes("DENTS"), "DENTS column header");
  assert(result.stdout.includes("DESCRIPTION"), "DESCRIPTION column header");
  assert(result.stdout.includes("PRIX"), "PRIX column header");

  // Dental acts content
  assert(result.stdout.includes("02/11/2026"), "Act date 1");
  assert(result.stdout.includes("16"), "Tooth number 16");
  assert(result.stdout.includes("Détartrage fictif"), "Act description 1");
  assert(result.stdout.includes("450,00 DH"), "Act price 1");
  assert(result.stdout.includes("03/11/2026"), "Act date 2");
  assert(result.stdout.includes("Acte complémentaire fictif"), "Act description 2");
  assert(result.stdout.includes("500,00 DH"), "Act price 2");

  // Bold total
  assert(result.stdout.includes("TOTAL : 950,00 DH"), "Invoice total");

  // Total in French words
  assert(
    result.stdout.includes(
      "Arrêtée la présente facture à la somme de neuf cent cinquante dirhams.",
    ),
    "Invoice total in words",
  );

  // Clinic financial identifiers on separate lines
  for (const identifier of ["73149010", "003999044000004", "084209071"]) {
    assert.equal(
      result.stdout.split(identifier).length - 1,
      1,
      `Identifier ${identifier} should appear exactly once`,
    );
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

  // Hundreds (rule for terminal cents with 's')
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
