import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import { cnssToothPositions, cnssChartViewport, cnssChartMark } from "../src/lib/insurance/pdf/cnss-chart-mapping.ts";
import { visualToPdf } from "../src/lib/insurance/pdf/coordinates.ts";
import { planCnssPdf, renderCnssPdf } from "../src/lib/insurance/pdf/cnss-renderer.ts";
import { cnssDetailsSchema } from "../src/lib/insurance/schema.ts";
import { createInMemoryInsuranceRepository } from "../src/lib/insurance/repository.ts";
import { insuranceDraftFixtures, insurancePolicyFixtures } from "../src/data/insurance.ts";
import { patientFixtures } from "../src/data/patients.ts";
const assets = {
  template: new Uint8Array(await readFile("../docs/references/pdf-templates/feuille_dentaire_CNSS.pdf")),
  font: new Uint8Array(await readFile("public/fonts/LiberationSans-Regular.ttf")),
};
function input(teeth) {
  const draft = structuredClone(insuranceDraftFixtures[0]);
  if (teeth !== undefined) draft.cnssDetails.confirmedTeeth = teeth;
  return { draft, policy: insurancePolicyFixtures[0], patient: patientFixtures[0] };
}

test("52 unique calibrated centres respect all permanent and temporary FDI quadrants", () => {
  const expected = [];
  for (let q = 1; q <= 8; q++) {
    const positions = [];
    for (let n = 1; n <= (q <= 4 ? 8 : 5); n++) {
      const tooth = `${q}${n}`; expected.push(tooth);
      const point = cnssToothPositions[tooth]; assert(point, tooth);
      // Printed vertical axis: x=778.0 pt. Horizontal D/G axis: y=443.0 pt.
      // D is patient right (reader left); G is patient left (reader right).
      assert([1,4,5,8].includes(q) ? point.x < 778 : point.x > 778, tooth);
      assert([1,2,5,6].includes(q) ? point.y < 443 : point.y > 443, tooth);
      const {x,y,width,height} = cnssChartViewport;
      assert(point.x > x && point.x < x+width && point.y > y && point.y < y+height);
      if (positions.length) {
        const previous=positions.at(-1);
        assert([1,4,5,8].includes(q) ? point.x < previous.x : point.x > previous.x, tooth);
        assert([1,2,5,6].includes(q) ? point.y > previous.y : point.y < previous.y, tooth);
      }
      positions.push(point);
    }
  }
  assert.deepEqual(Object.keys(cnssToothPositions).sort(),expected.sort());
  for (const a of expected) for (const b of expected) if (a!==b) {
    const pa=cnssToothPositions[a], pb=cnssToothPositions[b];
    assert(Math.hypot(pa.x-pb.x,pa.y-pb.y)>cnssChartMark.size+cnssChartMark.borderWidth, `${a}/${b}`);
  }
  assert.deepEqual(cnssToothPositions["16"],{x:741.835,y:397.228});
  assert.deepEqual(cnssToothPositions["11"],{x:772.788,y:351.572});
});
test("empty and absent confirmation never infer marks from acts or NGAP", () => {
  assert.deepEqual(planCnssPdf(input()).chartMarks,[]);
  assert.deepEqual(planCnssPdf(input([])).chartMarks,[]);
});
test("multiple selections and removal only render the exact confirmed teeth", () => {
  const selected=["16","11","26","36","46","55","65","75","85"];
  assert.deepEqual(planCnssPdf(input(selected)).chartMarks.map(m=>m.tooth),selected);
  assert.deepEqual(planCnssPdf(input(["11"])).chartMarks.map(m=>m.tooth),["11"]);
  const original=planCnssPdf(input());
  assert.deepEqual(planCnssPdf(input(selected)).placements,original.placements);
});
test("invalid notation and duplicates are rejected at the schema and renderer boundary", () => {
  for (const teeth of [["19"],["50"],["56"],["86"],["16-18"],["16","16"],[16]]) {
    assert.equal(cnssDetailsSchema.safeParse({careTypes:[],confirmedTeeth:teeth}).success,false);
    assert.throws(()=>planCnssPdf(input(teeth)));
  }
});
test("in-memory repository stores, clones, removes and clears confirmations without changing acts", async () => {
  const repository=createInMemoryInsuranceRepository([],insuranceDraftFixtures);
  const before=await repository.getDraftById(insuranceDraftFixtures[0].id);
  await repository.updateDraft(before.id,{cnssDetails:{...before.cnssDetails,confirmedTeeth:["16","11"]}});
  const saved=await repository.getDraftById(before.id);
  assert.deepEqual(saved.cnssDetails.confirmedTeeth,["16","11"]);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.acts)),JSON.parse(JSON.stringify(before.acts)));
  saved.cnssDetails.confirmedTeeth.push("26");
  assert.deepEqual((await repository.getDraftById(before.id)).cnssDetails.confirmedTeeth,["16","11"]);
  await repository.updateDraft(before.id,{cnssDetails:{...before.cnssDetails,confirmedTeeth:["11"]}});
  assert.deepEqual((await repository.getDraftById(before.id)).cnssDetails.confirmedTeeth,["11"]);
  await repository.updateDraft(before.id,{cnssDetails:{...before.cnssDetails,confirmedTeeth:[]}});
  assert.deepEqual((await repository.getDraftById(before.id)).cnssDetails.confirmedTeeth,[]);
  const created=await repository.createDraft(input(["51"]).draft);
  assert.deepEqual(created.cnssDetails.confirmedTeeth,["51"]);
});
test("selected 16/11 and all eight quadrants preserve two pages and the 270 degree transform", async () => {
  for (const [name,teeth] of [["teeth-16-11",["16","11"]],["eight-quadrants",["16","26","36","46","55","65","75","85"]],["all-teeth",Object.keys(cnssToothPositions)]]) {
    const {bytes}=await renderCnssPdf(input(teeth),assets);
    const pdf=await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(),2);
    for (const page of pdf.getPages()) {
      assert.equal(page.getWidth(),728.4); assert.equal(page.getHeight(),1031.76);
      assert.equal(page.getRotation().angle,270);
    }
    const centre=cnssToothPositions["16"];
    const native=visualToPdf(centre.x,centre.y,{...pdf.getPages()[1].getCropBox(),rotation:270});
    assert(Math.abs(native.x-(728.4-centre.y))<.001);
    assert(Math.abs(native.y-(1031.76-centre.x))<.001);
    if (process.env.CNSS_CHART_QA_DIR) {
      await mkdir(process.env.CNSS_CHART_QA_DIR,{recursive:true});
      await writeFile(path.join(process.env.CNSS_CHART_QA_DIR,`${name}.pdf`),bytes);
    }
  }
});
test("raster differences stay inside selected tooth centres; page 1, table, signatures and adjacent teeth are unchanged", async () => {
  const directory=await mkdtemp(path.join(tmpdir(),"cnss-chart-pixels-"));
  try {
    const selected=["16","11","55","65","75","85"];
    const empty=(await renderCnssPdf(input([]),assets)).bytes;
    const marked=(await renderCnssPdf(input(selected),assets)).bytes;
    for (const [name,bytes] of [["empty",empty],["marked",marked]]) {
      const file=path.join(directory,`${name}.pdf`); await writeFile(file,bytes);
      const render=spawnSync("pdftoppm",["-r","144","-png",file,path.join(directory,name)],{encoding:"utf8"});
      assert.equal(render.status,0,render.stderr);
    }
    const boxes=selected.map(tooth=>cnssToothPositions[tooth]);
    const script=`
import json, sys
from PIL import Image, ImageChops
from pathlib import Path
p=Path(sys.argv[1]); centres=json.loads(sys.argv[2])
a=Image.open(p/'empty-1.png').convert('RGB'); b=Image.open(p/'marked-1.png').convert('RGB')
assert ImageChops.difference(a,b).getbbox() is None, 'Page 1 changed'
a=Image.open(p/'empty-2.png').convert('RGB'); b=Image.open(p/'marked-2.png').convert('RGB')
diff=ImageChops.difference(a,b); counts=[0]*len(centres)
for y in range(diff.height):
 for x in range(diff.width):
  if max(diff.getpixel((x,y))) > 0:
   matches=[i for i,c in enumerate(centres) if abs(x-2*c['x'])<=5 and abs(y-2*c['y'])<=5]
   assert len(matches)==1, f'Unexpected changed pixel {x},{y}'
   counts[matches[0]]+=1
assert all(n>4 for n in counts), counts
print(counts)
`;
    const compare=spawnSync("python3",["-c",script,directory,JSON.stringify(boxes)],{encoding:"utf8"});
    assert.equal(compare.status,0,compare.stderr);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
