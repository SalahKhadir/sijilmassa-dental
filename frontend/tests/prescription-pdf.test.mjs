import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  blankPrescriptionPdf,
  renderPrescriptionPdf,
  PrescriptionPdfError,
} from "../src/lib/prescriptions/pdf/renderer.ts";
import {
  wrapPdfText,
  prescriptionPage,
} from "../src/lib/prescriptions/pdf/layout.ts";
import { prescriptionFixtures } from "../src/data/prescriptions.ts";
import { patientFixtures } from "../src/data/patients.ts";
import { prescriptionPatient } from "../src/lib/prescriptions/repository.ts";
const template = new Uint8Array(
  await readFile("public/pdf-templates/ordonnance-a5.pdf"),
);
const font = new Uint8Array(
  await readFile("public/fonts/LiberationSans-Regular.ttf"),
);
const assets = { template, font };
const patient = prescriptionPatient(patientFixtures[0]);
const base = {
  ...prescriptionFixtures[0],
  patientId: patient.id,
  issuedDate: "2026-11-07",
  medications: [
    {
      id: "med-1",
      medicationName: "Produit fictif Émeraude",
      dosage: "Saisie fictive du dentiste",
      frequency: "Fréquence fictive",
      duration: "Durée fictive",
      instructions: "Exemple fictif : été, cœur, à, ç et œ.",
    },
  ],
  generalInstructions: "",
};
const pdfText = (bytes, bbox = false) => {
  const directory = mkdtempSync(path.join(tmpdir(), "sijilmassa-pdf-text-"));
  try {
    const file = path.join(directory, "prescription.pdf");
    writeFileSync(file, bytes);
    return spawnSync("pdftotext", [...(bbox ? ["-bbox"] : []), file, "-"], {
      encoding: "utf8",
      timeout: 10000,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
async function inspect(name, bytes) {
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 1);
  assert(
    Math.abs(document.getPages()[0].getWidth() - prescriptionPage.width) < 0.01,
  );
  assert(
    Math.abs(document.getPages()[0].getHeight() - prescriptionPage.height) <
      0.01,
  );
  if (process.env.PRESCRIPTION_PDF_QA_DIR) {
    await mkdir(process.env.PRESCRIPTION_PDF_QA_DIR, { recursive: true });
    await writeFile(
      path.join(process.env.PRESCRIPTION_PDF_QA_DIR, `${name}.pdf`),
      bytes,
    );
  }
  return document;
}
test("blank prescription preserves the official file byte for byte and actual A5 dimensions", async () => {
  const reference = await readFile(
    "../docs/references/pdf-templates/ordonnance-a5.pdf",
  );
  assert.equal(
    createHash("sha256").update(template).digest("hex"),
    createHash("sha256").update(reference).digest("hex"),
  );
  const bytes = await blankPrescriptionPdf(template);
  assert.deepEqual(bytes, template);
  assert.notEqual(bytes, template);
  await inspect("blank", bytes);
});
test("digital drafts embed a French font and carry a visible draft indicator", async (t) => {
  const bytes = await renderPrescriptionPdf(base, patient, assets);
  const document = await inspect("draft", bytes);
  assert.equal(document.getTitle(), "Ordonnance - BROUILLON");
  const text = pdfText(bytes);
  if (text.error?.code === "ENOENT") {
    t.diagnostic("Poppler unavailable, extraction omitted");
    return;
  }
  assert.equal(text.status, 0);
  for (const word of [
    "BROUILLON",
    "Émeraude",
    "Fréquence",
    "Durée",
    "cœur",
    "07/11/2026",
    "Patient",
  ])
    assert(text.stdout.includes(word));
  const resources = document.getPages()[0].node.Resources();
  assert(resources.toString().includes("Font"));
});
test("finalized PDF keeps the letterhead and footer while excluding the draft indicator", async () => {
  const bytes = await renderPrescriptionPdf(
    { ...base, status: "FINALISEE" },
    patient,
    assets,
  );
  await inspect("finalized", bytes);
  const text = pdfText(bytes);
  if (!text.error) {
    assert(!text.stdout.includes("BROUILLON"));
    assert(text.stdout.includes("Kaoutar"));
    assert(text.stdout.includes("Lotissement"));
  }
});
test("multiple medication lines fit without truncating text or changing page size", async () => {
  const record = {
    ...base,
    status: "FINALISEE",
    medications: [
      base.medications[0],
      {
        ...base.medications[0],
        id: "med-2",
        medicationName: "Produit fictif Opale",
        instructions: "",
      },
    ],
  };
  const bytes = await renderPrescriptionPdf(record, patient, assets);
  await inspect("multiple", bytes);
  const text = pdfText(bytes);
  if (!text.error) assert(text.stdout.includes("Opale"));
});
test("long instructions wrap and retain the last words within the usable area", async () => {
  const ending = "Fin exacte des instructions fictives.";
  const record = {
    ...base,
    medications: [
      {
        ...base.medications[0],
        instructions:
          "Texte fictif à vérifier par le dentiste. ".repeat(9) + ending,
      },
    ],
  };
  const bytes = await renderPrescriptionPdf(record, patient, assets);
  await inspect("long", bytes);
  const text = pdfText(bytes);
  if (!text.error) assert(text.stdout.replace(/\s+/g, " ").includes(ending));
});
test("overflow, unknown glyphs, invalid patient and invalid template block generation explicitly", async () => {
  await assert.rejects(
    renderPrescriptionPdf(
      {
        ...base,
        generalInstructions: "Texte fictif sans raccourcissement. ".repeat(50),
      },
      patient,
      assets,
    ),
    PrescriptionPdfError,
  );
  await assert.rejects(
    renderPrescriptionPdf(
      { ...base, generalInstructions: "🦷" },
      patient,
      assets,
    ),
    /caractère/,
  );
  await assert.rejects(
    renderPrescriptionPdf(base, { ...patient, id: "foreign" }, assets),
    /correspond/,
  );
  const invalid = await PDFDocument.create();
  invalid.addPage([595, 842]);
  await assert.rejects(
    blankPrescriptionPdf(await invalid.save()),
    /dimensions/,
  );
  await assert.rejects(
    blankPrescriptionPdf(new Uint8Array([0, 1, 2])),
    /modèle officiel/,
  );
});
test("wrapping preserves long unbroken words and explicit paragraph boundaries", () => {
  const measure = { widthOfTextAtSize: (text) => Array.from(text).length };
  const word = "É".repeat(40);
  const result = wrapPdfText(word + "\n\nFin", measure, 8, 1);
  assert.equal(result.slice(0, 5).join(""), word);
  assert.equal(result[5], "");
  assert.equal(result[6], "Fin");
});

test("date and patient placement account for the official CropBox vertical offset", async (t) => {
  const bytes = await renderPrescriptionPdf(base, patient, assets);
  const text = pdfText(bytes, true);
  if (text.error?.code === "ENOENT") {
    t.skip("Poppler unavailable");
    return;
  }
  assert.equal(text.status, 0);
  const date =
    /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">07\/11\/2026<\/word>/.exec(
      text.stdout,
    );
  const identity =
    /<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>Patient<\/word>/.exec(
      text.stdout,
    );
  assert(date);
  assert(identity);
  assert.equal(Number(date[1]), 60);
  assert(Number(date[2]) >= 149 && Number(date[2]) < 155);
  assert(Number(identity[2]) > 193 && Number(identity[2]) < 205);
});
