import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { insuranceDraftFixtures, insurancePolicyFixtures } from "../src/data/insurance.ts";
import { patientFixtures } from "../src/data/patients.ts";
import { consultationFixtures } from "../src/data/consultations.ts";
import { createInMemoryPatientRepository } from "../src/lib/patients/repository.ts";
import { createInMemoryInsuranceRepository } from "../src/lib/insurance/repository.ts";
import { insuranceDraftSchema, dentalInsuranceActSchema } from "../src/lib/insurance/schema.ts";
import { insuranceTotal, insuranceAmount } from "../src/lib/insurance/pdf/overlay.ts";
import { InsurancePdfError } from "../src/lib/insurance/pdf/errors.ts";
import { planCnssPdf, renderCnssPdf } from "../src/lib/insurance/pdf/cnss-renderer.ts";
import { planCnopsPdf, renderCnopsPdf } from "../src/lib/insurance/pdf/cnops-renderer.ts";
import { planFarPdf, renderFarPdf } from "../src/lib/insurance/pdf/far-renderer.ts";
const providers = ["CNSS", "CNOPS", "FAR"];
const planners = [planCnssPdf, planCnopsPdf, planFarPdf];
const renderers = [renderCnssPdf, renderCnopsPdf, renderFarPdf];
function input(index) {
  const value = structuredClone({ draft: insuranceDraftFixtures[index], policy: insurancePolicyFixtures[index], patient: patientFixtures[index] });
  if (index === 1) Object.assign(value.draft.cnopsDetails, { practitionerInpe: "123456789", diagnosisCodeCIM10: "K02" });
  if (index === 2) Object.assign(value.draft.farDetails, { practitionerInpe: "123456789", prospectusCount: 0 });
  return value;
}
function repository() {
  const patients = createInMemoryPatientRepository(patientFixtures);
  let clinical = structuredClone(consultationFixtures);
  const consultations = { list: async () => structuredClone(clinical), getById: async id => structuredClone(clinical.find(c => c.id === id)) };
  const insurance = createInMemoryInsuranceRepository(insurancePolicyFixtures, insuranceDraftFixtures, patients, consultations);
  return { patients, insurance, consultations, removeSources: () => { clinical = []; } };
}

test("draft create/update reject cross-patient, cross-provider, missing policy and clinical links", async () => {
  const { insurance } = repository();
  const base = input(0).draft;
  delete base.id;
  for (const patch of [
    {patientId:"missing"}, {policyId:"missing"}, {policyId:insurancePolicyFixtures[1].id},
    {provider:"FAR"}, {selectedConsultationId:consultationFixtures[1].id},
    {selectedTreatmentIds:[consultationFixtures[1].treatments[0].id]},
    {acts:[{...base.acts[0],sourceTreatmentId:consultationFixtures[1].treatments[0].id}]},
  ]) {
    await assert.rejects(insurance.createDraft({...base,...patch}));
    await assert.rejects(insurance.updateDraft(insuranceDraftFixtures[0].id,patch));
  }
  assert.deepEqual((await insurance.getDraftById(insuranceDraftFixtures[0].id)).acts,insuranceDraftFixtures[0].acts);
});
test("policy ownership and linked provider are immutable; linked deletion is rejected", async () => {
  const { insurance } = repository();
  await assert.rejects(insurance.updatePolicy(insurancePolicyFixtures[0].id,{patientId:patientFixtures[1].id}));
  await assert.rejects(insurance.updatePolicy(insurancePolicyFixtures[0].id,{provider:"FAR"}));
  await assert.rejects(insurance.deletePolicy(insurancePolicyFixtures[0].id));
  const draft = await insurance.getDraftById(insuranceDraftFixtures[0].id);
  assert.equal(draft.policyId,insurancePolicyFixtures[0].id);
  await insurance.updateDraft(draft.id,{policyId:undefined});
  assert(await insurance.deletePolicy(draft.policyId));
  await assert.rejects(insurance.updateDraft(draft.id,{policyId:draft.policyId}));
});
test("same-patient policy switching succeeds, missing patient and duplicate draft IDs cannot overwrite data", async () => {
  const { insurance, patients } = repository();
  const policy = await insurance.createPolicy({...insurancePolicyFixtures[0],registrationNumber:"000000001"});
  await insurance.updateDraft(insuranceDraftFixtures[0].id,{policyId:policy.id});
  assert.equal((await insurance.getDraftById(insuranceDraftFixtures[0].id)).policyId,policy.id);
  await assert.rejects(insurance.createDraft(insuranceDraftFixtures[0]));
  // Simulate a deleted entity with an injected repository, without modifying patient modules.
  const ghost = createInMemoryInsuranceRepository(insurancePolicyFixtures,insuranceDraftFixtures,{...patients,getById:async()=>undefined});
  await assert.rejects(ghost.updateDraft(insuranceDraftFixtures[0].id,{status:"VALIDE"}));
});
test("clinical imports are copies, duplicate sources are rejected and deleted sources block saving", async () => {
  const { insurance, consultations, removeSources } = repository();
  const original = await consultations.getById(consultationFixtures[1].id);
  const treatment = original.treatments[0];
  const draft = input(1).draft; delete draft.id;
  draft.selectedTreatmentIds=[treatment.id];
  draft.acts=[{id:"imported",treatmentDate:treatment.treatmentDate,description:treatment.description,toothReference:treatment.toothReference,sourceTreatmentId:treatment.id}];
  const saved = await insurance.createDraft(draft);
  await insurance.updateDraft(saved.id,{acts:[{...saved.acts[0],description:"Copie modifiée fictive"}]});
  assert.deepEqual(await consultations.getById(original.id),original);
  await assert.rejects(insurance.updateDraft(saved.id,{acts:[saved.acts[0],{...saved.acts[0],id:"duplicate"}]}));
  await assert.rejects(insurance.updateDraft(saved.id,{selectedTreatmentIds:[treatment.id,treatment.id]}));
  removeSources();
  await assert.rejects(insurance.updateDraft(saved.id,{status:"VALIDE"}));
  assert((await insurance.getDraftById(saved.id)).acts.length===1);
});
test("neutral chart confirmations are cleared by repository act edits unless explicitly reconfirmed", async () => {
  for (const index of [0,1]) {
    const {insurance} = repository(); const record=input(index); const key=index===0?"cnssDetails":"cnopsDetails";
    await insurance.updateDraft(record.draft.id,{[key]:{...record.draft[key],confirmedTeeth:["16","51"]}});
    const acts=record.draft.acts.map(a=>({...a,description:"Acte corrigé fictif"}));
    const changed=await insurance.updateDraft(record.draft.id,{acts});
    assert.deepEqual(changed[key].confirmedTeeth,[]);
    const renewed=await insurance.updateDraft(record.draft.id,{[key]:{...record.draft[key],confirmedTeeth:["11"]}});
    assert.deepEqual(renewed[key].confirmedTeeth,["11"]);
  }
});
test("all provider planners reject mismatched beneficiary/policy/provider and invalid calendar dates", () => {
  for (let index=0;index<3;index++) for (const mutate of [
    v=>v.patient.id="other",v=>v.policy.patientId="other",v=>v.policy.id="other",v=>v.policy.provider="OTHER",
    v=>v.draft.acts[0].treatmentDate="2026-02-30",v=>v.draft.manualFields.declarationDate="2026-13-01",
  ]) { const value=input(index);mutate(value);assert.throws(()=>planners[index](value)); }
});
test("calendar dates, unsafe fees, fractional centimes and invalid totals cannot be stored", () => {
  for(const amountMinor of [-1,0.01,Number.NaN,Infinity,Number.MAX_SAFE_INTEGER+1])
    assert.equal(dentalInsuranceActSchema.safeParse({...input(0).draft.acts[0],amountMinor}).success,false);
  assert.equal(dentalInsuranceActSchema.safeParse({...input(0).draft.acts[0],treatmentDate:"2026-02-30"}).success,false);
  const inconsistent=input(0).draft; inconsistent.manualFields.totalFeesMinor=1;
  assert.equal(insuranceDraftSchema.safeParse(inconsistent).success,false);
  const draft=input(0).draft;
  draft.acts=[{...draft.acts[0],amountMinor:Number.MAX_SAFE_INTEGER},{...draft.acts[1],amountMinor:1}];
  assert.equal(insuranceDraftSchema.safeParse(draft).success,false);
});
test("integer centimes and exact totals hold across providers, maximum table capacity and missing values", () => {
  for(let index=0;index<3;index++) {
    for(const amount of [0,1,40001,100001,99999999,Number.MAX_SAFE_INTEGER]) {
      const value=input(index);const count=[3,9,5][index];
      value.draft.acts=Array.from({length:count},(_,n)=>({...value.draft.acts[0],id:`act-${n}`,sourceTreatmentId:undefined,amountMinor:n?0:amount}));
      value.draft.manualFields.totalFeesMinor=amount;
      const plan=planners[index](value);
      assert.equal(insuranceTotal(value.draft,InsurancePdfError),amount);
      assert(plan.placements.some(p=>p.field.source==="acts[0].amountMinor"&&p.text===insuranceAmount(amount)));
    }
    const value=input(index);value.draft.manualFields.totalFeesMinor=1;
    assert.throws(()=>planners[index](value),/total/i);
  }
  const draft=input(0).draft;delete draft.acts[0].amountMinor;delete draft.manualFields.totalFeesMinor;
  assert.equal(insuranceTotal(draft,InsurancePdfError),undefined);
});
test("CNSS missing category arrays remain unchecked without throwing or inventing defaults", () => {
  const value=input(0);value.draft.cnssDetails={};
  const plan=planCnssPdf(value);
  assert(!plan.placements.some(p=>p.field.source==="cnssDetails.careTypes"));
  assert(plan.warnings.some(w=>w.includes("aucune case")));
});
test("representative marked PDFs preserve all native boxes, two pages and byte-identical official templates", async () => {
  const font=new Uint8Array(await readFile("public/fonts/LiberationSans-Regular.ttf"));
  for(let index=0;index<3;index++) {
    const provider=providers[index];const value=input(index);
    if(index===0)value.draft.cnssDetails.confirmedTeeth=["16","11","26","36","46","51","65","75","85"];
    if(index===1){value.draft.cnopsDetails.confirmedTeeth=["16","11","26","36","46","51","65","75","85"];value.draft.cnopsDetails.diagnosisCodeCIM10="K02";}
    if(index===2){value.draft.farDetails.toothMarks=["16","11","26","36","46","51","65","75","85"].map((tooth,n)=>({tooth,symbol:n%2?"CROIX":"CERCLE"}));value.draft.farDetails.markingApproved=true;}
    const template=new Uint8Array(await readFile(`../docs/references/pdf-templates/feuille_dentaire_${provider}.pdf`));
    assert.deepEqual(template,new Uint8Array(await readFile(`public/pdf-templates/feuille_dentaire_${provider}.pdf`)));
    const hash=createHash("sha256").update(template).digest("hex");
    const before=await PDFDocument.load(template);
    const result=await renderers[index](value,{template,font});
    assert.equal(hash,createHash("sha256").update(template).digest("hex"));
    const after=await PDFDocument.load(result.bytes);assert.equal(after.getPageCount(),2);
    for(let page=0;page<2;page++)for(const box of ["getMediaBox","getCropBox","getBleedBox","getTrimBox","getArtBox","getRotation"])
      assert.deepEqual(after.getPages()[page][box](),before.getPages()[page][box]());
    if(process.env.INSURANCE_AUDIT_QA_DIR){await mkdir(process.env.INSURANCE_AUDIT_QA_DIR,{recursive:true});await writeFile(`${process.env.INSURANCE_AUDIT_QA_DIR}/${provider.toLowerCase()}.pdf`,result.bytes);}
  }
});
