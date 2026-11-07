import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PDFDocument, degrees } from "pdf-lib";
import { patientFixtures } from "../src/data/patients.ts";
import { insuranceDraftFixtures, insurancePolicyFixtures } from "../src/data/insurance.ts";
import { planCnssPdf, renderCnssPdf, cnssAmount } from "../src/lib/insurance/pdf/cnss-renderer.ts";
import { visualToPdf } from "../src/lib/insurance/pdf/coordinates.ts";
const assets = {
  template: new Uint8Array(await readFile("../docs/references/pdf-templates/feuille_dentaire_CNSS.pdf")),
  font: new Uint8Array(await readFile("public/fonts/LiberationSans-Regular.ttf")),
};
import { cnssChecks } from "../src/lib/insurance/pdf/cnss-mapping.ts";
const base = { draft: insuranceDraftFixtures[0], policy: insurancePolicyFixtures[0], patient: patientFixtures[0] };
const clone = () => structuredClone(base);
const values = input => planCnssPdf(input).placements.map(p => p.text);
async function generate(input, name) {
  const result = await renderCnssPdf(input, assets);
  if (process.env.CNSS_PDF_QA_DIR) {
    await mkdir(process.env.CNSS_PDF_QA_DIR, { recursive: true });
    await writeFile(path.join(process.env.CNSS_PDF_QA_DIR, `${name}.pdf`), result.bytes);
  }
  return result;
}
test("visual coordinates account for rotation and box origin", () => {
  const box = { x: 7, y: 11, width: 728.4, height: 1031.76, rotation: 270 };
  assert.deepEqual(visualToPdf(100, 200, box), { x: 535.4, y: 942.76 });
  for (const [rotation, expected] of [[0, {x:107,y:842.76}], [90,{x:207,y:111}], [180,{x:635.4,y:211}]])
    assert.deepEqual(visualToPdf(100,200,{...box,rotation}),expected);
  assert.throws(() => visualToPdf(0,0,{...box,rotation:45}));
});
test("original template copy, two pages, page boxes, rotation and image artwork are preserved", async () => {
  assert.deepEqual(new Uint8Array(await readFile("public/pdf-templates/feuille_dentaire_CNSS.pdf")), assets.template);
  const original = await PDFDocument.load(assets.template);
  const simple = clone(); simple.draft.acts = simple.draft.acts.slice(0,1); simple.draft.manualFields.totalFeesMinor = 40000;
  for (const [name,input] of [["simple",simple],["multiple",base]]) {
    const { bytes } = await generate(input,name);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(),2);
    for (let i=0;i<2;i++) {
      const page = pdf.getPages()[i], before = original.getPages()[i];
      assert.deepEqual(page.getMediaBox(),before.getMediaBox());
      assert.deepEqual(page.getCropBox(),before.getCropBox());
      assert.equal(page.getRotation().angle,270);
      const dict = before.node.Resources().get(before.doc.context.obj("XObject"));
      const oldImages = original.context.lookup(dict);
      const newImages = pdf.context.lookup(page.node.Resources().get(pdf.context.obj("XObject")));
      for (const [key,ref] of oldImages.entries()) {
        assert.deepEqual(pdf.context.lookup(newImages.get(key)).contents, original.context.lookup(ref).contents);
      }
    }
    const directory = await mkdtemp(path.join(tmpdir(),"cnss-text-"));
    try {
      const file = path.join(directory,"test.pdf"); await writeFile(file,bytes);
      const text = spawnSync("pdftotext",[file,"-"],{encoding:"utf8"});
      assert.equal(text.status,0);
      for (const value of ["Aïcha","Démo-Amrani","10/10/2026","400,00","SC12"])
        assert(text.stdout.includes(value), value);
    } finally { await rm(directory,{recursive:true,force:true}); }
  }
});
test("insured and beneficiary remain distinct and relationship boxes use explicit values", () => {
  for (const relationship of ["CONJOINT","ENFANT","LUI_MEME"]) {
    const input=clone(); input.policy.insuredPerson.relationship=relationship;
    input.policy.insuredPerson.isPatient=relationship==="LUI_MEME";
    input.policy.insuredPerson.firstName="Émile";
    const plan=planCnssPdf(input);
    const checks=plan.placements.filter(p=>p.field.source==="policy.insuredPerson.relationship");
    assert.equal(checks.length,1); assert.equal(checks[0].text,"X"); assert.equal(checks[0].field,cnssChecks[relationship]);
    assert(values(input).includes("Démo-Amrani Émile"));
    assert(values(input).includes("Démo-Amrani Aïcha"));
  }
});
test("unknown data stays blank, exact centimes and zero amounts are retained, signatures never mapped", () => {
  const input=clone(); const a=input.draft.acts[0];
  delete a.actCode; delete a.ngapKeyLetter; delete a.ngapCoefficient; delete a.amountMinor;
  a.toothReference="dent du haut"; delete input.draft.manualFields.totalFeesMinor;
  input.patient.identity.sex="unanswered";
  const plan=planCnssPdf(input);
  assert(!plan.placements.some(p=>p.field.label==="Acte 1 - Dents traitées"));
  assert(!plan.placements.some(p=>p.field.label==="Acte 1 - Code des actes"));
  assert(!plan.placements.some(p=>p.field.label==="Montant des frais"));
  assert(!plan.placements.some(p=>/signature|cachet|valeur clé/i.test(p.field.label)));
  assert(plan.warnings.some(w=>/schéma/.test(w)));
  assert.equal(cnssAmount(123456),"1234,56"); assert.equal(cnssAmount(0),"0,00");
});
test("invalid drafts, mismatches, dates and unsafe amounts block generation", () => {
  for (const mutate of [
    i=>i.draft.provider="FAR", i=>i.patient.id="other", i=>i.policy.id="other",
    i=>i.policy.registrationNumber="", i=>i.policy.insuredPerson.relationship="AUTRE",
    i=>i.draft.acts=[], i=>i.draft.acts[0].treatmentDate="2026-02-30",
    i=>i.draft.manualFields.totalFeesMinor=1,
    i=>i.draft.acts[0].amountMinor=Number.MAX_SAFE_INTEGER+1,
    i=>i.draft.acts.push(...i.draft.acts),
  ]) { const input=clone(); mutate(input); assert.throws(()=>planCnssPdf(input)); }
});
test("overflow, unsupported glyphs and template changes block without clipping", async () => {
  for (const mutate of [
    i=>i.patient.identity.lastName="É".repeat(200),
    i=>i.policy.insuredPerson.address="Adresse très longue ".repeat(30),
    i=>i.policy.registrationNumber="1234567890",
    i=>i.draft.acts[0].actCode="CODE_TROP_LONG_POUR_LA_CASE",
    i=>i.policy.insuredPerson.firstName="🦷",
  ]) { const input=clone(); mutate(input); await assert.rejects(renderCnssPdf(input,assets)); }
  const altered=await PDFDocument.load(assets.template); altered.getPages()[1].setRotation(degrees(0));
  await assert.rejects(renderCnssPdf(base,{...assets,template:await altered.save()}),/rotation/);
  await assert.rejects(renderCnssPdf(base,{...assets,template:new Uint8Array([0,1])}),/modèle/);
});

test("three acts occupy separate rows, optional values and explicit zeros keep their meaning", async () => {
  const input=clone();
  input.draft.acts.push({...input.draft.acts[0],id:"third",amountMinor:0,toothReference:"55",actCode:""});
  const plan=planCnssPdf(input);
  assert.equal(plan.placements.find(p=>p.field.source==="acts[2].amountMinor").text,"0,00");
  assert.equal(plan.placements.find(p=>p.field.source==="acts[2].toothReference").text,"55");
  assert.equal(plan.placements.find(p=>p.field.source==="acts[2].treatmentDate").field.y,233);
  assert(!plan.placements.some(p=>p.field.source==="acts[2].actCode"));
  await renderCnssPdf(input,assets);
});
