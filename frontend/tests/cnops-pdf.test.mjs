import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { PDFDocument, degrees } from "pdf-lib";
import { patientFixtures } from "../src/data/patients.ts";
import { insuranceDraftFixtures, insurancePolicyFixtures } from "../src/data/insurance.ts";
import { createInMemoryInsuranceRepository } from "../src/lib/insurance/repository.ts";
import { planCnopsPdf, renderCnopsPdf } from "../src/lib/insurance/pdf/cnops-renderer.ts";
import { cnopsChecks, cnopsFields } from "../src/lib/insurance/pdf/cnops-mapping.ts";
import { cnopsToothPositions, cnopsChartViewport } from "../src/lib/insurance/pdf/cnops-chart-mapping.ts";
import { fdiTeeth } from "../src/lib/insurance/tooth-reference.ts";
const assets = {
  template: new Uint8Array(await readFile("../docs/references/pdf-templates/feuille_dentaire_CNOPS.pdf")),
  font: new Uint8Array(await readFile("public/fonts/LiberationSans-Regular.ttf")),
};
function input() {
  const draft = structuredClone(insuranceDraftFixtures[1]);
  // Fictional identifier and explicitly supplied three-character category, for QA only.
  draft.cnopsDetails.practitionerInpe = "123456789";
  draft.cnopsDetails.diagnosisCodeCIM10 = "K02";
  return { draft, policy: structuredClone(insurancePolicyFixtures[1]), patient: structuredClone(patientFixtures[1]) };
}
async function qa(name, record) {
  const result = await renderCnopsPdf(record, assets);
  if (process.env.CNOPS_PDF_QA_DIR) {
    await mkdir(process.env.CNOPS_PDF_QA_DIR, { recursive: true });
    await writeFile(path.join(process.env.CNOPS_PDF_QA_DIR, `${name}.pdf`), result.bytes);
  }
  return result;
}

test("CNOPS preserves original two-page artwork, all boxes, rotation and template bytes", async () => {
  assert.deepEqual(new Uint8Array(await readFile("public/pdf-templates/feuille_dentaire_CNOPS.pdf")), assets.template);
  const before = await PDFDocument.load(assets.template);
  const record = input();
  const multiple = input();
  multiple.draft.acts.push({ ...multiple.draft.acts[0], id: "second", toothReference: "16", actCode: "SC12", ngapKeyLetter: "SC", ngapCoefficient: 12, description: "Obturation fictive", amountMinor: 40001 });
  multiple.draft.manualFields.totalFeesMinor = 190001;
  const marked = structuredClone(multiple);
  marked.policy.insuredPerson.relationship = "ENFANT";
  marked.patient.identity.firstName = "Lina";
  marked.patient.identity.sex = "F";
  marked.patient.identity.dateOfBirth = "2014-03-03";
  marked.patient.identity.cin = "ZZ000001";
  marked.policy.insuredPerson.address = "Adresse fictive de contrôle, résidence de démonstration, quartier sans adresse réelle, Témara";
  marked.draft.documentPurpose = "EXECUTION";
  marked.draft.cnopsDetails.careTypes = ["SOINS_1023746", "PROTHESE_1370746", "ODF_1023776", "AUTRES_1370776"];
  marked.draft.cnopsDetails.priorAuthorizationNumber = "00000001";
  marked.draft.cnopsDetails.accidentDate = "2026-10-01";
  marked.draft.cnopsDetails.accidentCauses = "Chute fictive";
  marked.draft.cnopsDetails.confirmedTeeth = ["11", "26", "36", "46", "51", "65", "75", "85"];
  for (const [name, value] of [["simple", record], ["multiple", multiple], ["marked", marked]]) {
    const { bytes } = await qa(name, value);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 2);
    for (let i = 0; i < 2; i++) {
      const page = pdf.getPages()[i], original = before.getPages()[i];
      assert.equal(page.getWidth(), 799.44); assert.equal(page.getHeight(), 574.08);
      assert.equal(page.getRotation().angle, 0);
      for (const box of ["getMediaBox", "getCropBox", "getTrimBox", "getBleedBox", "getArtBox"])
        assert.deepEqual(page[box](), original[box]());
      const oldImages = before.context.lookup(original.node.Resources().get(before.context.obj("XObject")));
      const newImages = pdf.context.lookup(page.node.Resources().get(pdf.context.obj("XObject")));
      for (const [key, ref] of oldImages.entries())
        assert.deepEqual(pdf.context.lookup(newImages.get(key)).contents, before.context.lookup(ref).contents);
    }
    const directory = await mkdtemp(path.join(tmpdir(), "cnops-text-"));
    try {
      const file = path.join(directory, "sample.pdf"); await writeFile(file, bytes);
      const text = spawnSync("pdftotext", [file, "-"], { encoding: "utf8" });
      assert.equal(text.status, 0, text.stderr);
      for (const word of [value.patient.identity.firstName, "Mohamed", "098765432", "1234567890", "1500,00", "12/10/2026", "SPR50"])
        assert(text.stdout.includes(word), word);
      assert(!text.stdout.includes("084209071"));
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});
test("insured, patient, affiliation, INPE and CIM-10 use distinct explicit sources", () => {
  const value = input(), plan = planCnopsPdf(value);
  const at = field => plan.placements.find(p => p.field === field)?.text;
  assert.equal(at(cnopsFields.inpe), "123456789");
  assert.equal(at(cnopsFields.cim10), "K02");
  assert.equal(at(cnopsFields.affiliation), value.policy.affiliationNumber);
  assert.equal(at(cnopsFields.insuredName), `${value.policy.insuredPerson.lastName} Mohamed`);
  assert.equal(at(cnopsFields.patientName), `${value.patient.identity.lastName} ${value.patient.identity.firstName}`);
  assert(!plan.placements.some(p => /Signature|Cachet|Valeur Clé|remboursement|INP -/i.test(p.field.label)));
});
test("relationships, purposes and all four care checkboxes use CNOPS positions", () => {
  for (const relationship of ["LUI_MEME", "CONJOINT", "ENFANT"]) {
    const value = input(); value.policy.insuredPerson.relationship = relationship;
    value.policy.insuredPerson.isPatient = relationship === "LUI_MEME";
    const checks = planCnopsPdf(value).placements.filter(p => p.field.source === "policy.insuredPerson.relationship");
    assert.equal(checks.length, relationship === "LUI_MEME" ? 0 : 1);
    if (checks.length) assert.equal(checks[0].field, cnopsChecks[relationship]);
  }
  const value = input();
  value.draft.documentPurpose = "EXECUTION";
  value.draft.cnopsDetails.careTypes = ["SOINS_1023746", "PROTHESE_1370746", "ODF_1023776", "AUTRES_1370776"];
  const plan = planCnopsPdf(value);
  assert(plan.placements.some(p => p.field === cnopsChecks.EXECUTION));
  for (const type of value.draft.cnopsDetails.careTypes)
    assert(plan.placements.some(p => p.field === cnopsChecks[type] && p.text === "X"));
});
test("unknown values stay blank, zero fees remain explicit and all nine act rows fit", async () => {
  const value = input();
  value.draft.acts[0].amountMinor = undefined;
  value.draft.acts[0].actCode = undefined;
  value.draft.acts[0].ngapCoefficient = undefined;
  value.draft.acts[0].ngapKeyLetter = undefined;
  value.draft.manualFields.totalFeesMinor = undefined;
  value.draft.cnopsDetails.diagnosisCodeCIM10 = "";
  let plan = planCnopsPdf(value);
  assert(!plan.placements.some(p => p.field === cnopsFields.total || p.field === cnopsFields.cim10));
  assert(!plan.placements.some(p => p.field.source === "acts[0].actCode"));
  assert(plan.warnings.some(w => w.startsWith("CIM - 10")));
  value.draft.acts[0].amountMinor = 0;
  plan = planCnopsPdf(value);
  assert.equal(plan.placements.find(p => p.field === cnopsFields.total).text, "0,00");
  value.draft.acts = Array.from({ length: 9 }, (_, i) => ({ ...value.draft.acts[0], id: `act-${i}` }));
  await renderCnopsPdf(value, assets);
});
test("invalid identity, policy, essential fields, dates, amounts and capacity block generation", () => {
  for (const mutate of [
    v => v.draft.provider = "CNSS", v => v.patient.id = "other", v => v.policy.id = "other",
    v => v.policy.affiliationNumber = "", v => v.policy.registrationNumber = "",
    v => v.policy.insuredPerson.relationship = "AUTRE", v => v.draft.cnopsDetails.practitionerInpe = "",
    v => v.draft.cnopsDetails.practitionerInpe = "123", v => v.draft.cnopsDetails.diagnosisCodeCIM10 = "K02.1",
    v => v.draft.acts[0].treatmentDate = "2026-02-30", v => v.draft.acts = [],
    v => v.draft.acts = Array.from({ length: 10 }, () => v.draft.acts[0]),
    v => v.draft.manualFields.totalFeesMinor = 1,
    v => v.draft.acts[0].amountMinor = Number.MAX_SAFE_INTEGER + 1,
  ]) { const value = input(); mutate(value); assert.throws(() => planCnopsPdf(value)); }
});
test("long text, boxed identifiers, accents, unsupported glyphs and wrong template geometry are handled", async () => {
  for (const mutate of [
    v => v.policy.insuredPerson.lastName = "É".repeat(100),
    v => v.policy.insuredPerson.address = "Adresse fictive ".repeat(20),
    v => v.draft.acts[0].actCode = "CODE_BEAUCOUP_TROP_LONG",
    v => v.draft.cnopsDetails.priorAuthorizationNumber = "123456789",
    v => v.patient.identity.lastName = "🦷",
  ]) { const value = input(); mutate(value); await assert.rejects(renderCnopsPdf(value, assets)); }
  const changed = await PDFDocument.load(assets.template); changed.getPages()[1].setRotation(degrees(270));
  await assert.rejects(renderCnopsPdf(input(), { ...assets, template: await changed.save() }), /rotation/);
  await assert.rejects(renderCnopsPdf(input(), { ...assets, template: new Uint8Array([0, 1]) }), /modèle/);
});
test("all 52 CNOPS centres follow the printed D/G and H/B directions without mirroring", async () => {
  assert.deepEqual(Object.keys(cnopsToothPositions).sort(), [...fdiTeeth].sort());
  for (const tooth of fdiTeeth) {
    const q = Number(tooth[0]), p = cnopsToothPositions[tooth];
    assert([1,4,5,8].includes(q) ? p.x < 601.2 : p.x > 601.2, tooth);
    assert([1,2,5,6].includes(q) ? p.y < 388.93 : p.y > 388.93, tooth);
    const v = cnopsChartViewport;
    assert(p.x > v.x && p.x < v.x + v.width && p.y > v.y && p.y < v.y + v.height);
    if (Number(tooth[1]) > 1) {
      const previous = cnopsToothPositions[String(Number(tooth) - 1)];
      assert([1,4,5,8].includes(q) ? p.x < previous.x : p.x > previous.x);
      assert([1,2,5,6].includes(q) ? p.y > previous.y : p.y < previous.y);
    }
    for (const other of fdiTeeth) if (tooth !== other) {
      const b = cnopsToothPositions[other];
      assert(Math.hypot(p.x - b.x, p.y - b.y) > 3, `${tooth}/${other}`);
    }
  }
  const value = input(); value.draft.cnopsDetails.confirmedTeeth = [...fdiTeeth];
  await qa("all-teeth", value);
});
test("confirmations remain provider-specific, persist in memory and remove only selected marks", async () => {
  const value = input();
  assert.deepEqual(planCnopsPdf(value).chartMarks, []);
  value.draft.cnssDetails = { careTypes: [], confirmedTeeth: ["16"] };
  assert.deepEqual(planCnopsPdf(value).chartMarks, []);
  value.draft.cnopsDetails.confirmedTeeth = ["11", "26", "55", "85"];
  assert.deepEqual(planCnopsPdf(value).chartMarks.map(m => m.tooth), ["11", "26", "55", "85"]);
  const repository = createInMemoryInsuranceRepository([value.policy], [value.draft]);
  await repository.updateDraft(value.draft.id, { cnopsDetails: { ...value.draft.cnopsDetails, confirmedTeeth: ["26"] } });
  let saved = await repository.getDraftById(value.draft.id);
  assert.deepEqual(planCnopsPdf({ ...value, draft: saved }).chartMarks.map(m => m.tooth), ["26"]);
  saved.cnopsDetails.confirmedTeeth.push("55");
  assert.deepEqual((await repository.getDraftById(saved.id)).cnopsDetails.confirmedTeeth, ["26"]);
  await repository.updateDraft(saved.id, { cnopsDetails: { ...saved.cnopsDetails, confirmedTeeth: [] } });
  saved = await repository.getDraftById(saved.id);
  assert.deepEqual(saved.cnopsDetails.confirmedTeeth, []);
  for (const teeth of [["19"], ["56"], ["11", "11"]]) {
    value.draft.cnopsDetails.confirmedTeeth = teeth;
    assert.throws(() => planCnopsPdf(value));
  }
});
test("raster changes stay inside confirmed marks; table, neighbours, page 1 and signature areas are untouched", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cnops-pixels-"));
  try {
    const record = input();
    const selections = ["11", "26", "36", "46", "51", "65", "75", "85"];
    for (const name of ["empty", "marked"]) {
      record.draft.cnopsDetails.confirmedTeeth = name === "empty" ? [] : selections;
      const { bytes } = await renderCnopsPdf(record, assets);
      const file = path.join(directory, `${name}.pdf`); await writeFile(file, bytes);
      const render = spawnSync("pdftoppm", ["-r", "144", "-png", file, path.join(directory, name)], { encoding: "utf8" });
      assert.equal(render.status, 0, render.stderr);
    }
    const script = `
from PIL import Image, ImageChops
from pathlib import Path
import json, sys
p=Path(sys.argv[1]); centres=json.loads(sys.argv[2]); counts=[0]*len(centres)
assert ImageChops.difference(Image.open(p/'empty-1.png'), Image.open(p/'marked-1.png')).getbbox() is None
im=ImageChops.difference(Image.open(p/'empty-2.png').convert('RGB'),Image.open(p/'marked-2.png').convert('RGB'))
for y in range(im.height):
 for x in range(im.width):
  if max(im.getpixel((x,y)))>0:
   hits=[i for i,c in enumerate(centres) if abs(x-2*c['x'])<=5 and abs(y-2*c['y'])<=5]
   assert len(hits)==1, (x,y)
   counts[hits[0]]+=1
assert all(n>4 for n in counts), counts
`;
    const compare = spawnSync("python3", ["-c", script, directory, JSON.stringify(selections.map(t => cnopsToothPositions[t]))], { encoding: "utf8" });
    assert.equal(compare.status, 0, compare.stderr);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("declaration date digits stay inside the CNOPS printed cells with their tighter grouping", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cnops-date-boxes-"));
  try {
    const file = path.join(directory, "date.pdf");
    await writeFile(file, (await renderCnopsPdf(input(), assets)).bytes);
    const result = spawnSync("pdftotext", ["-bbox", file, "-"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const words = [...result.stdout.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([0-9])<\/word>/g)]
      .map(m => ({ x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), digit: m[5] }))
      .filter(w => w.x1 > 480 && w.x2 < 566 && w.y1 > 472 && w.y1 < 474)
      .sort((a,b) => a.x1-b.x1);
    assert.equal(words.map(w => w.digit).join(""), "12102026");
    // Independent boundaries measured on the 4000px official template render.
    const cells = [[2411,2460],[2460,2509],[2519,2568],[2568,2617],
      [2627,2676],[2676,2725],[2725,2774],[2774,2823]];
    words.forEach((word,i) => {
      assert(word.x1 > cells[i][0]*799.44/4000 + .5, `cell ${i+1} left`);
      assert(word.x2 < cells[i][1]*799.44/4000 - .5, `cell ${i+1} right`);
    });
  } finally { await rm(directory, {recursive:true,force:true}); }
});
