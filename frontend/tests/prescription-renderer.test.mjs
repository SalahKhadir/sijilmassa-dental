import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { renderServerPrescription } from "../src/server/prescription-renderer/render.ts";
import { renderPrescriptionPdf } from "../src/lib/prescriptions/pdf/renderer.ts";
import { PrescriptionPdfError } from "../src/lib/prescriptions/pdf/layout.ts";
import { renderingRequestSchema } from "../src/server/prescription-renderer/protocol.ts";

const assets = { template: await readFile("public/pdf-templates/ordonnance-a5.pdf"), font: await readFile("public/fonts/LiberationSans-Regular.ttf") };
const directory = realpathSync(".prescription-renderer");
const modules = realpathSync("node_modules");
const command = ["--permission", `--allow-fs-read=${directory}`, `--allow-fs-read=${modules}`, path.join(directory, "server/prescription-renderer/worker.js")];
function request(mode = "DRAFT") {
  const patientId = randomUUID();
  return { protocolVersion: 1, requestId: randomUUID(), mode,
    record: { id: randomUUID(), patientId, consultationId: null, version: 0, issuedDate: "2026-11-10",
      medications: [{ id: randomUUID(), medicationName: "Produit fictif Émeraude", dosage: "Texte fictif", frequency: "Texte fictif", duration: "Texte fictif", instructions: "Été, cœur, à, ç et œ." }],
      generalInstructions: "", createdAt: "2026-11-10T09:00:00Z", updatedAt: "2026-11-10T09:01:00Z" },
    patient: { id: patientId, reference: "PAT-000001", firstName: "Patient", lastName: "Synthétique", displayName: "Patient Synthétique", version: 0 } };
}
function worker(input) {
  const result = spawnSync(process.execPath, command, { input: typeof input === "string" ? input : JSON.stringify(input),
    cwd: directory, env: { LANG: "C.UTF-8", TZ: "UTC" }, encoding: "utf8", timeout: 10000, maxBuffer: 3 * 1024 * 1024 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0); assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}
function compatible(input) {
  return [{ ...input.record, consultationId: "", status: input.mode === "DRAFT" ? "BROUILLON" : "FINALISEE" },
    { id: input.patient.id, reference: input.patient.reference, name: input.patient.displayName,
      identity: { firstName: input.patient.firstName, lastName: input.patient.lastName, gsm: "", landline: "" } }];
}
async function text(bytes, bbox = false) {
  const temp = await mkdtemp(path.join(tmpdir(), "rx-render-text-"));
  try {
    const file = path.join(temp, "synthetic.pdf"); await writeFile(file, bytes);
    const result = spawnSync("pdftotext", [...(bbox ? ["-bbox"] : []), file, "-"], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0); return result.stdout;
  } finally { await rm(temp, { recursive: true, force: true }); }
}
test("private compiled worker renders one A5 page with French text and a draft marker", async () => {
  const result = worker(request()); assert(result.ok);
  const bytes = Buffer.from(result.pdfBase64, "base64"); assert.equal(bytes.length, result.pdfBytes);
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false }); const page = pdf.getPage(0);
  assert.equal(pdf.getPageCount(), 1); assert.equal(page.getWidth(), 419.25); assert(Math.abs(page.getHeight() - 595.499986) < .01);
  const extracted = await text(bytes); for (const word of ["BROUILLON", "Émeraude", "cœur", "10/11/2026", "Patient Synthétique"]) assert(extracted.includes(word));
  assert.equal(pdf.getSubject(), "Ordonnance"); assert.equal(pdf.getModificationDate().toISOString(), "2026-11-10T09:01:00.000Z");
});
test("server rendering preserves all existing text, positions, boxes and background streams", async () => {
  for (const mode of ["DRAFT", "FINAL_LAYOUT_CHECK"]) {
    const input = request(mode); const [record, patient] = compatible(input);
    const original = await renderPrescriptionPdf(record, patient, assets);
    const server = await renderServerPrescription(input, assets);
    const pageMarkup = value => value.slice(value.indexOf("<body>"));
    assert.equal(pageMarkup(await text(server, true)), pageMarkup(await text(original, true)));
    const [a, b] = await Promise.all([PDFDocument.load(original), PDFDocument.load(server)]);
    assert.deepEqual(a.getPage(0).getCropBox(), b.getPage(0).getCropBox());
    // Content streams include the original official background and exactly the same overlay.
    assert.deepEqual(a.getPage(0).node.Contents().asArray().map(ref => Buffer.from(a.context.lookup(ref).getContents())),
      b.getPage(0).node.Contents().asArray().map(ref => Buffer.from(b.context.lookup(ref).getContents())));
  }
});
test("identical inputs and assets produce byte-identical PDFs across distinct processes", async () => {
  const input = request(); const a = worker(input);
  await new Promise(resolve => setTimeout(resolve, 1100));
  const b = worker({ ...input, requestId: randomUUID() });
  assert(a.ok && b.ok); assert.equal(a.pdfBase64, b.pdfBase64); assert.equal(a.sha256, b.sha256);
});
test("line order and full long instructions survive server mapping without clinical substitutions", async () => {
  const input = request("FINAL_LAYOUT_CHECK");
  input.record.medications[0].instructions = "Phrase fictive à examiner. ".repeat(5) + "Fin exacte.";
  input.record.medications.push({ ...input.record.medications[0], id: randomUUID(), medicationName: "Produit fictif Opale", instructions: "" });
  const result = worker(input); assert(result.ok);
  const extracted = await text(Buffer.from(result.pdfBase64, "base64"));
  assert(extracted.indexOf("Émeraude") < extracted.indexOf("Opale")); assert(extracted.replace(/\s+/g, " ").includes("Fin exacte."));
  assert(!extracted.includes("BROUILLON"));
});
test("Arabic dynamic text and unsupported glyphs are explicitly rejected while the Arabic background is preserved", () => {
  for (const value of ["دواء", "🦷", "\u202eabc"]) {
    const input = request(); input.record.generalInstructions = value;
    const result = worker(input); assert.equal(result.ok, false); assert.equal(result.code, "UNSUPPORTED_CHARACTER");
    assert(!JSON.stringify(result).includes(value));
  }
});
test("overflow returns a typed safe failure instead of truncation or a new page", () => {
  const input = request(); input.record.generalInstructions = "Instruction synthétique très longue. ".repeat(50);
  const result = worker(input); assert.equal(result.ok, false); assert.equal(result.code, "LAYOUT_OVERFLOW");
  assert(!JSON.stringify(result).includes("Instruction"));
});
test("strict protocol rejects missing fields, foreign ownership, extra resource paths and incomplete final layout", () => {
  for (const change of [input => { delete input.record.issuedDate; }, input => { input.patient.id = randomUUID(); },
    input => { input.record.issuedDate = "0000-01-01"; }, input => { input.patient.firstName = " "; input.patient.displayName = "  Synthétique"; },
    input => { input.templatePath = "/tmp/arbitrary.pdf"; }, input => { input.record.medications[0].instructions = "bad\0"; },
    input => { input.record.medications[0].id = input.record.id; input.record.medications.push(input.record.medications[0]); },
    input => { input.mode = "FINAL_LAYOUT_CHECK"; input.record.medications[0].dosage = ""; }]) {
    const input = request(); change(input); assert(!renderingRequestSchema.safeParse(input).success);
    const result = worker(input); assert.equal(result.ok, false); assert.equal(result.code, "INVALID_INPUT");
  }
  assert.equal(worker("not-json").code, "INVALID_INPUT"); assert.equal(worker(" ".repeat(1024 * 1024 + 1)).code, "INVALID_INPUT");
});
test("pinned assets reject template/font substitution before rendering", async () => {
  await assert.rejects(renderServerPrescription(request(), { ...assets, template: new Uint8Array([1]) }), error => error instanceof PrescriptionPdfError && error.code === "ASSET_INVALID");
  await assert.rejects(renderServerPrescription(request(), { ...assets, font: new Uint8Array([1]) }), error => error instanceof PrescriptionPdfError && error.code === "ASSET_INVALID");
});
test("Node permissions deny unrelated reads, writes and subprocess creation", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "rx-permissions-"));
  try {
    const probe = path.join(temp, "probe.cjs");
    await writeFile(probe, `const fs=require('node:fs');let denied=0;
      for(const op of [()=>fs.readFileSync('/synthetic-not-authorized'),()=>fs.writeFileSync(__dirname+'/write','x'),()=>require('node:child_process').spawnSync(process.execPath,['--version'])]){
      try{op()}catch(e){if(e.code==='ERR_ACCESS_DENIED')denied++}}process.stdout.write(String(denied));`);
    const result = spawnSync(process.execPath, ["--permission", `--allow-fs-read=${temp}`, probe], { env: {}, encoding: "utf8", timeout: 5000 });
    assert.equal(result.error, undefined); assert.equal(result.status, 0); assert.equal(result.stdout, "3");
  } finally { await rm(temp, { recursive: true, force: true }); }
});
