import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PDFDocument, degrees } from "pdf-lib";
import { patientFixtures } from "../src/data/patients.ts";
import { insuranceDraftFixtures, insurancePolicyFixtures } from "../src/data/insurance.ts";
import { insuranceDraftSchema, farDetailsSchema } from "../src/lib/insurance/schema.ts";
import { createInMemoryInsuranceRepository } from "../src/lib/insurance/repository.ts";
import { planFarPdf, renderFarPdf } from "../src/lib/insurance/pdf/far-renderer.ts";
import { farChecks, farFields, farPurposeStrikes } from "../src/lib/insurance/pdf/far-mapping.ts";
import { farToothPositions, farChartViewport } from "../src/lib/insurance/pdf/far-chart-mapping.ts";
import { planCnssPdf } from "../src/lib/insurance/pdf/cnss-renderer.ts";
import { planCnopsPdf } from "../src/lib/insurance/pdf/cnops-renderer.ts";
import { visualToPdf } from "../src/lib/insurance/pdf/coordinates.ts";
import { fdiTeeth } from "../src/lib/insurance/tooth-reference.ts";
const assets = {
  template: new Uint8Array(await readFile("../docs/references/pdf-templates/feuille_dentaire_FAR.pdf")),
  font: new Uint8Array(await readFile("public/fonts/LiberationSans-Regular.ttf")),
};
function input() {
  const value = { draft: structuredClone(insuranceDraftFixtures[2]), policy: structuredClone(insurancePolicyFixtures[2]), patient: structuredClone(patientFixtures[2]) };
  value.policy.insuredPerson.isPatient = false;
  value.policy.insuredPerson.relationship = "CONJOINT";
  value.draft.farDetails.practitionerInpe = "123456789"; // synthetic, supplied explicitly
  value.draft.farDetails.prospectusCount = 0;
  return value;
}
async function qa(name, value) {
  const result = await renderFarPdf(value, assets);
  if (process.env.FAR_PDF_QA_DIR) {
    await mkdir(process.env.FAR_PDF_QA_DIR, { recursive: true });
    await writeFile(path.join(process.env.FAR_PDF_QA_DIR, `${name}.pdf`), result.bytes);
  }
  return result;
}
test("FAR keeps both pages, five page boxes, orientation, original image streams and template bytes", async () => {
  assert.deepEqual(new Uint8Array(await readFile("public/pdf-templates/feuille_dentaire_FAR.pdf")), assets.template);
  const original = await PDFDocument.load(assets.template);
  const multiple = input();
  multiple.draft.farDetails.dentalPurpose = "RECUS";
  multiple.draft.acts.push({ id: "second", treatmentDate: "2026-10-16", toothReference: "16", description: "Obturation fictive", actCode: "SC12", ngapCoefficient: 12, ngapKeyLetter: "SC", amountMinor: 40001 });
  multiple.draft.manualFields.totalFeesMinor = 100001;
  const marked = structuredClone(multiple);
  marked.draft.farDetails.toothMarks = [
    { tooth: "16", symbol: "CERCLE" }, { tooth: "11", symbol: "CROIX" },
    { tooth: "26", symbol: "CROIX" }, { tooth: "36", symbol: "CERCLE" },
    { tooth: "46", symbol: "CERCLE" }, { tooth: "55", symbol: "CROIX" },
    { tooth: "65", symbol: "CERCLE" }, { tooth: "75", symbol: "CROIX" }, { tooth: "85", symbol: "CERCLE" },
  ];
  marked.draft.farDetails.markingApproved = true;
  marked.draft.farDetails.context = "ACCIDENT";
  marked.draft.farDetails.careType = "PROTHESE";
  for (const [name, value] of [["basic", input()], ["multiple", multiple], ["marked", marked]]) {
    const { bytes } = await qa(name, value);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 2);
    for (let i = 0; i < 2; i++) {
      const page = pdf.getPages()[i], before = original.getPages()[i];
      assert.equal(page.getWidth(), 842.25); assert.equal(page.getHeight(), before.getHeight());
      assert.equal(page.getRotation().angle, 0);
      for (const box of ["getMediaBox", "getCropBox", "getBleedBox", "getTrimBox", "getArtBox"])
        assert.deepEqual(page[box](), before[box]());
      assert(Math.abs(page.getCropBox().y - 8.580014) < .0001);
      const oldImages = original.context.lookup(before.node.Resources().get(original.context.obj("XObject")));
      const newImages = pdf.context.lookup(page.node.Resources().get(pdf.context.obj("XObject")));
      for (const [key, ref] of oldImages.entries())
        assert.deepEqual(pdf.context.lookup(newImages.get(key)).contents, original.context.lookup(ref).contents);
    }
    const directory = await mkdtemp(path.join(tmpdir(), "far-text-"));
    try {
      const file = path.join(directory, "sample.pdf"); await writeFile(file, bytes);
      const text = spawnSync("pdftotext", [file, "-"], { encoding: "utf8" });
      assert.equal(text.status, 0, text.stderr);
      for (const word of [value.patient.identity.firstName, "Rachid", "1234567", "Adjudant-chef", "600,00", "15/10/2026", "SC33"])
        assert(text.stdout.includes(word), word);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});
test("insured and beneficiary sources stay distinct and data is confined to its printed panel", () => {
  const value = input(), plan = planFarPdf(value);
  const at = field => plan.placements.find(p => p.field === field)?.text;
  assert.equal(at(farFields.account), value.policy.militaryAccountNumber);
  assert.notEqual(at(farFields.account), value.policy.registrationNumber);
  assert.equal(at(farFields.insuredName), `${value.policy.insuredPerson.lastName} Rachid`);
  assert.equal(at(farFields.patientName), `${value.patient.identity.lastName} ${value.patient.identity.firstName}`);
  assert.equal(at(farFields.inpe), "123456789");
  assert(!plan.placements.some(p => /signature|cachet|approbation|contrôle/i.test(p.field.label)));
  for (const p of plan.placements.filter(p => p.field.page === 2)) {
    assert(p.field.x >= 509 && p.field.x + p.field.width <= 719);
    assert(p.field.y >= 110 && p.field.y <= 164);
  }
  assert.equal(plan.placements.filter(p => p.text.includes("SC33")).length, 2);
});
test("FAR origin is applied per page and actual extracted text matches visual coordinates", async () => {
  const document = await PDFDocument.load(assets.template);
  for (const page of document.getPages()) {
    const box = { ...page.getCropBox(), rotation: page.getRotation().angle };
    const point = visualToPdf(585, 169, box);
    assert(Math.abs(point.x - 585) < .001);
    assert(Math.abs(point.y - (604.080014 - 169)) < .001);
  }
  const changed = await PDFDocument.load(assets.template);
  changed.getPages()[1].setCropBox(0, 0, 842.25, 595.5);
  await assert.rejects(renderFarPdf(input(), { ...assets, template: await changed.save() }), /boîtes|rotation/);
  const rotated = await PDFDocument.load(assets.template); rotated.getPages()[0].setRotation(degrees(270));
  await assert.rejects(renderFarPdf(input(), { ...assets, template: await rotated.save() }), /rotation/);
  const directory = await mkdtemp(path.join(tmpdir(), "far-origin-"));
  try {
    const file = path.join(directory, "sample.pdf"); await writeFile(file, (await renderFarPdf(input(), assets)).bytes);
    const text = spawnSync("pdftotext", ["-bbox", file, "-"], { encoding: "utf8" });
    assert.equal(text.status, 0, text.stderr);
    const cin = /<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>EF345678<\/word>/.exec(text.stdout);
    assert(cin); assert.equal(Number(cin[1]), 585);
    assert(Number(cin[2]) > 160 && Number(cin[2]) < 164); // visual 169 minus font ascent
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("provider categories are marked only when explicitly selected; absent FAR selections stay undefined", () => {
  const absent = farDetailsSchema.parse({});
  assert.equal(absent.careType, undefined); assert.equal(absent.context, undefined); assert.equal(absent.dentalPurpose, undefined);
  const ss = { draft: structuredClone(insuranceDraftFixtures[0]), policy: insurancePolicyFixtures[0], patient: patientFixtures[0] };
  ss.draft.cnssDetails.careTypes = [];
  assert.equal(planCnssPdf(ss).placements.filter(p => p.field.source === "cnssDetails.careTypes").length, 0);
  ss.draft.cnssDetails.careTypes = ["PROTHESE_626"];
  assert.deepEqual(planCnssPdf(ss).placements.filter(p => p.field.source === "cnssDetails.careTypes").map(p => p.field.label), ["Prothèse"]);
  const ops = { draft: structuredClone(insuranceDraftFixtures[1]), policy: insurancePolicyFixtures[1], patient: patientFixtures[1] };
  ops.draft.cnopsDetails.practitionerInpe = "123456789"; ops.draft.cnopsDetails.diagnosisCodeCIM10 = "";
  ops.draft.cnopsDetails.careTypes = [];
  assert.equal(planCnopsPdf(ops).placements.filter(p => p.field.source === "cnopsDetails.careTypes").length, 0);
  ops.draft.cnopsDetails.careTypes = ["AUTRES_1370776"];
  assert.deepEqual(planCnopsPdf(ops).placements.filter(p => p.field.source === "cnopsDetails.careTypes").map(p => p.field.label), ["Autres"]);
  for (const type of ["SOINS", "PROTHESE"]) for (const context of ["MALADIE", "MATERNITE", "ACCIDENT"]) {
    const value = input(); value.draft.farDetails.careType = type; value.draft.farDetails.context = context;
    const plan = planFarPdf(value);
    assert.deepEqual(plan.placements.filter(p => p.field.source === "farDetails.careType").map(p => p.field), [farChecks[type]]);
    assert.deepEqual(plan.placements.filter(p => p.field.source === "farDetails.context").map(p => p.field), [farChecks[context]]);
  }
  for (const field of ["careType", "context", "dentalPurpose"]) {
    const value = input(); delete value.draft.farDetails[field]; assert.throws(() => planFarPdf(value), /explicitement/);
  }
});
test("relationship checkboxes and purpose strike-outs preserve the explicit choice only", () => {
  for (const relationship of ["LUI_MEME", "CONJOINT", "ENFANT"]) {
    const value = input(); value.policy.insuredPerson.relationship = relationship;
    value.policy.insuredPerson.isPatient = relationship === "LUI_MEME";
    assert.deepEqual(planFarPdf(value).placements.filter(p => p.field.source === "policy.insuredPerson.relationship").map(p => p.field), [farChecks[relationship]]);
  }
  for (const purpose of ["DEVIS", "RECUS"]) {
    const value = input(); value.draft.farDetails.dentalPurpose = purpose;
    assert.deepEqual(planFarPdf(value).lines, [farPurposeStrikes[purpose]]);
  }
});
test("unknown optional codes, coefficients and authorization remain blank; exact zero is retained", async () => {
  const value = input(); delete value.draft.acts[0].actCode; delete value.draft.acts[0].ngapCoefficient;
  value.draft.acts[0].description = "Soin fictif court";
  value.draft.acts[0].amountMinor = 0; value.draft.manualFields.totalFeesMinor = 0;
  value.draft.farDetails.priorAuthorizationNumber = "REF-FICTIVE";
  const plan = planFarPdf(value);
  assert.equal(plan.placements.find(p => p.field === farFields.total).text, "0");
  assert(!plan.placements.some(p => p.text === "REF-FICTIVE" || p.field.source.includes("priorAuthorization")));
  assert(!plan.placements.some(p => p.field.source === "acts[0].coefficient"));
  assert(plan.warnings.some(w => w.includes("sans champ vérifié")));
  await renderFarPdf(value, assets);
});
test("five corresponding act lines fit both panels; sixth act, long fields and invalid data block safely", async () => {
  const five = input(); five.draft.acts = Array.from({length:5}, (_,i) => ({...five.draft.acts[0],id:`act-${i}`}));
  five.draft.manualFields.totalFeesMinor = 300000;
  await renderFarPdf(five, assets);
  for (const mutate of [
    v => v.draft.provider = "CNOPS", v => v.patient.id = "other", v => v.policy.id = "other",
    v => v.policy.militaryAccountNumber = "", v => v.policy.militaryRank = "", v => v.policy.militaryUnit = "",
    v => v.policy.insuredPerson.cin = "", v => v.policy.insuredPerson.relationship = "AUTRE",
    v => v.patient.identity.dateOfBirth = "2026-02-30", v => v.draft.manualFields.declarationDate = "",
    v => v.draft.farDetails.practitionerInpe = undefined, v => v.draft.farDetails.prospectusCount = undefined,
    v => v.draft.manualFields.attachmentCount = undefined, v => v.draft.acts[0].amountMinor = undefined,
    v => v.draft.acts[0].amountMinor = Number.MAX_SAFE_INTEGER+1,
    v => v.draft.acts = [], v => v.draft.acts = Array.from({length:6}, () => v.draft.acts[0]),
  ]) { const value = input(); mutate(value); await assert.rejects(renderFarPdf(value,assets)); }
  for (const mutate of [v => v.policy.insuredPerson.address = "Adresse très longue ".repeat(12),
    v => v.draft.acts[0].description = "Travaux fictifs ".repeat(15), v => v.policy.insuredPerson.firstName = "🦷"]) {
    const value = input(); mutate(value); await assert.rejects(renderFarPdf(value,assets));
  }
});
test("all 52 FAR cells match the actual printed order, with separate permanent and temporary rows", async () => {
  assert.deepEqual(Object.keys(farToothPositions).sort(), [...fdiTeeth].sort());
  for (const tooth of fdiTeeth) {
    const q = Number(tooth[0]), p = farToothPositions[tooth], box = farChartViewport;
    assert([1,4,5,8].includes(q) ? p.x < 220 : p.x > 220, tooth);
    const expectedY = q === 5 || q === 6 ? 276.9 : q === 1 || q === 2 ? 290.15 : q === 3 || q === 4 ? 304.0 : 317.5;
    assert(Math.abs(p.y-expectedY) < .2, tooth);
    assert(p.x > box.x && p.x < box.x+box.width && p.y > box.y && p.y < box.y+box.height);
    if (Number(tooth[1]) > 1) {
      const prev = farToothPositions[String(Number(tooth)-1)];
      assert([1,4,5,8].includes(q) ? p.x < prev.x : p.x > prev.x, tooth);
    }
  }
  const all = input(); all.draft.farDetails.toothMarks = fdiTeeth.map((tooth,i) => ({tooth,symbol:i%2 ? "CROIX" : "CERCLE"}));
  all.draft.farDetails.markingApproved = true;
  await qa("all-teeth", all);
});
test("FAR symbols need explicit choice and dentist approval; no automatic or cross-provider markings", () => {
  const value = input(); value.draft.cnssDetails = {careTypes:[],confirmedTeeth:["16"]};
  value.draft.cnopsDetails = {careTypes:[],confirmedTeeth:["26"]};
  assert.deepEqual(planFarPdf(value).chartMarks, []);
  value.draft.farDetails.toothMarks = [{tooth:"16"}];
  assert.throws(() => planFarPdf(value), /Cercle ou Croix/);
  value.draft.farDetails.toothMarks[0].symbol = "CERCLE";
  assert.throws(() => planFarPdf(value), /confirmer/);
  value.draft.farDetails.markingApproved = true;
  assert.deepEqual(planFarPdf(value).chartMarks.map(m=>[m.tooth,m.symbol,m.page]), [["16","CERCLE",1]]);
  for (const toothMarks of [[{tooth:"19",symbol:"CERCLE"}],[{tooth:"16",symbol:"CARRE"}],
    [{tooth:"16",symbol:"CROIX"},{tooth:"16",symbol:"CERCLE"}]]) {
    const wrong = input(); wrong.draft.farDetails.toothMarks = toothMarks;
    assert.equal(insuranceDraftSchema.safeParse(wrong.draft).success,false);
    assert.throws(() => planFarPdf(wrong));
  }
});
test("in-memory repository persists approval, removes individual marks and clears without changing clinical acts", async () => {
  const value = input(); value.draft.farDetails.toothMarks = [{tooth:"16",symbol:"CERCLE"},{tooth:"11",symbol:"CROIX"}];
  value.draft.farDetails.markingApproved = true;
  const repository = createInMemoryInsuranceRepository([], [value.draft]);
  let saved = await repository.getDraftById(value.draft.id);
  assert.deepEqual(saved.farDetails.toothMarks,value.draft.farDetails.toothMarks);
  saved.farDetails.toothMarks.pop();
  assert.equal((await repository.getDraftById(saved.id)).farDetails.toothMarks.length,2);
  await repository.updateDraft(saved.id,{farDetails:{...saved.farDetails,markingApproved:false}});
  saved = await repository.getDraftById(saved.id); assert.equal(saved.farDetails.toothMarks.length,1);
  await repository.updateDraft(saved.id,{farDetails:{...saved.farDetails,toothMarks:[],markingApproved:false}});
  saved = await repository.getDraftById(saved.id);
  assert.deepEqual(saved.farDetails.toothMarks,[]);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.acts)),JSON.parse(JSON.stringify(value.draft.acts)));
});
test("raster differences stay inside confirmed FAR cells on page 1; page 2 and all signatures remain unchanged", async () => {
  const directory = await mkdtemp(path.join(tmpdir(),"far-pixels-"));
  try {
    const value = input();
    const marks = [{tooth:"16",symbol:"CERCLE"},{tooth:"11",symbol:"CROIX"},{tooth:"26",symbol:"CROIX"},
      {tooth:"36",symbol:"CERCLE"},{tooth:"46",symbol:"CERCLE"},{tooth:"55",symbol:"CROIX"},
      {tooth:"65",symbol:"CERCLE"},{tooth:"75",symbol:"CROIX"},{tooth:"85",symbol:"CERCLE"}];
    for (const name of ["empty","marked"]) {
      value.draft.farDetails.toothMarks = name === "empty" ? [] : marks;
      value.draft.farDetails.markingApproved = name === "marked";
      const file = path.join(directory,`${name}.pdf`); await writeFile(file,(await renderFarPdf(value,assets)).bytes);
      const rendered = spawnSync("pdftoppm",["-r","144","-png",file,path.join(directory,name)],{encoding:"utf8"});
      assert.equal(rendered.status,0,rendered.stderr);
    }
    const script = `
from PIL import Image, ImageChops
from pathlib import Path
import json,sys
p=Path(sys.argv[1]); marks=json.loads(sys.argv[2]); counts=[0]*len(marks)
assert ImageChops.difference(Image.open(p/'empty-2.png'),Image.open(p/'marked-2.png')).getbbox() is None
im=ImageChops.difference(Image.open(p/'empty-1.png').convert('RGB'),Image.open(p/'marked-1.png').convert('RGB'))
for y in range(im.height):
 for x in range(im.width):
  if max(im.getpixel((x,y)))>0:
   hits=[i for i,c in enumerate(marks) if abs(x-2*c['x'])<=19 and abs(y-2*c['y'])<=14]
   assert hits,(x,y)
   for i in hits: counts[i]+=1
assert all(n>10 for n in counts),counts
`;
    const checked = spawnSync("python3",["-c",script,directory,JSON.stringify(marks.map(m=>farToothPositions[m.tooth]))],{encoding:"utf8"});
    assert.equal(checked.status,0,checked.stderr);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test("FAR rings fit the independently measured right-side cell boundaries and counts avoid printed Arabic labels", () => {
  const cells = [[815,909],[909,1002],[1002,1094],[1094,1185],[1185,1279]];
  for (let index=0; index<5; index++) {
    const point = farToothPositions[String(61+index)];
    assert(point.x - 8.6 > (250+cells[index][0])*842.25/4000 + .5);
    assert(point.x + 8.6 < (250+cells[index][1])*842.25/4000 - .5);
  }
  assert(farFields.prospectusCount.x + farFields.prospectusCount.width < 642);
  assert(farFields.attachments.x + farFields.attachments.width < 642);
});
test("repository invalidates FAR approval after an act or mark change unless approval is explicitly renewed", async () => {
  const value=input(); value.draft.farDetails.toothMarks=[{tooth:"16",symbol:"CERCLE"}];
  value.draft.farDetails.markingApproved=true;
  const repository=createInMemoryInsuranceRepository([], [value.draft]);
  await repository.updateDraft(value.draft.id,{acts:[{...value.draft.acts[0], description:"Acte fictif corrigé"}]});
  let saved=await repository.getDraftById(value.draft.id);
  assert.equal(saved.farDetails.markingApproved,false);
  assert.throws(()=>planFarPdf({...value,draft:saved}),/confirmer/);
  await repository.updateDraft(saved.id,{farDetails:{...saved.farDetails,markingApproved:true}});
  const {markingApproved: priorApproval, ...details}=saved.farDetails;
  assert.equal(priorApproval,false);
  await repository.updateDraft(saved.id,{farDetails:{...details,toothMarks:[{tooth:"16",symbol:"CROIX"}]}});
  saved=await repository.getDraftById(saved.id);
  assert.equal(saved.farDetails.markingApproved,false);
});
