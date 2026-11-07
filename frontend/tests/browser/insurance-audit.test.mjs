import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { browserHarness } from "./browser-harness.mjs";
const harness=browserHarness({port:3110});
before(harness.start);after(harness.stop);
for(const [index,provider] of ["CNSS","CNOPS","FAR"].entries()) {
  test(`${provider}: profile, policy edit, clinical import, confirmation, save, PDF actions and beneficiary isolation`,async()=>{
    const {value,page,errors,external}=await harness.context();
    const patientId=`patient-demo-00${index+1}`;
    try {
      await page.goto(`${harness.baseURL}/patients/${patientId}`);
      await page.getByRole("button",{name:"Modifier la police",exact:true}).click();
      const dialog=page.getByRole("dialog");
      if(index===0) {
        const self=dialog.getByRole("checkbox",{name:"Le patient est l’assuré(e)",exact:true});
        await self.uncheck();
        for(const field of ["#policy-fname","#policy-lname","#policy-cin","#policy-phone","#policy-addr"])
          assert.equal(await dialog.locator(field).inputValue(),"");
        await self.check();
      }
      await dialog.locator("#policy-addr").fill("Adresse fictive audit, Témara");
      await dialog.getByRole("button",{name:"Mettre à jour",exact:true}).click();
      await dialog.waitFor({state:"hidden"});
      if(index===0) {
        page.once("dialog",prompt=>prompt.accept());
        await page.getByTitle("Supprimer la police",{exact:true}).click();
        await page.getByRole("alert").filter({hasText:"liée à un brouillon"}).waitFor();
      }
      await page.getByRole("link",{name:"Nouvelle feuille de soins",exact:true}).click();
      await page.waitForFunction(expected=>document.querySelector("#draft-provider")?.value===expected,provider);
      const importer=page.getByRole("button",{name:"Importer",exact:true}).first();
      await importer.click();
      assert.equal(await page.getByRole("button",{name:"Importé",exact:true}).count(),1);
      assert.equal(await page.locator("tbody tr").count(),2);
      await page.getByTitle("Supprimer la ligne",{exact:true}).first().click();
      assert.equal(await page.locator("tbody tr").count(),1);
      await page.getByPlaceholder("Description de l'acte...").fill("Soin fictif audit");
      const row=page.locator("tbody tr").first();
      await row.locator('input[placeholder="FDI"]').fill("16");
      await row.locator('input[placeholder="SC12"]').fill("SC12");
      await row.locator('input[placeholder="0.00"]').fill("1000.01");
      await page.locator("#decl-date").fill("2026-11-07");
      await page.locator("#decl-place").fill("Témara fictif");
      await page.locator("#decl-attach").fill("0");
      if(index===1){await page.locator("#cnops-inpe").fill("123456789");await page.locator("#cnops-cim10").fill("K02");}
      if(index===2){
        await page.locator("#far-purpose").selectOption("RECUS");await page.locator("#far-care-type").selectOption("SOINS");
        await page.locator("#far-context").selectOption("MALADIE");await page.locator("#far-inpe").fill("123456789");await page.locator("#far-prospectus").fill("0");
      }
      const chart=page.getByRole("region",{name:"Schéma dentaire",exact:true});
      const tooth=chart.getByRole("checkbox",{name:`${index===2?"Sélectionner":"Confirmer"} la dent FDI 16`,exact:true});
      await tooth.check();
      if(index===2){await page.getByLabel("Symbole FAR de la dent 16",{exact:true}).selectOption("CERCLE");await page.getByRole("checkbox",{name:/Je confirme, en tant que dentiste/}).check();}
      await page.getByRole("button",{name:"Enregistrer en brouillon",exact:true}).click();
      await page.waitForURL(`**/patients/${patientId}`);
      const hrefs=await page.locator('a[href^="/documents/assurances/draft-ins-"]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute("href")));
      const href=hrefs.find(href=>!href.includes("draft-ins-demo"));assert(href);
      await page.locator(`a[href="${href}"]`).click();await chart.waitFor();assert(await tooth.isChecked());
      const pdf=page.getByRole("region",{name:`PDF ${provider}`,exact:true});
      const preview=pdf.getByRole("button",{name:index===0?"Prévisualiser":`Prévisualiser la feuille ${provider}`,exact:true});
      await preview.click();const link=pdf.getByRole("link",{name:"Télécharger le PDF",exact:true});await link.waitFor();
      const oldUrl=await link.getAttribute("href");
      const bytes=await page.evaluate(async url=>Array.from(new Uint8Array(await(await fetch(url)).arrayBuffer())),oldUrl);
      const document=await PDFDocument.load(new Uint8Array(bytes));assert.equal(document.getPageCount(),2);assert.equal(document.getPages()[0].getRotation().angle,index===0?270:0);
      const download=page.waitForEvent("download");await link.click();assert.equal((await download).suggestedFilename(),`feuille-soins-${provider.toLowerCase()}.pdf`);
      await page.waitForFunction(()=>!Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Imprimer")?.disabled);
      await page.evaluate(()=>{window.__auditPrint=0;document.querySelector("iframe").contentWindow.print=()=>window.__auditPrint++;});
      await pdf.getByRole("button",{name:"Imprimer",exact:true}).click();assert.equal(await page.evaluate(()=>window.__auditPrint),1);
      await page.locator("#decl-place").fill("Rabat fictif");assert.equal(await link.count(),0);
      assert(await page.evaluate(async url=>{try{await fetch(url);return false;}catch{return true;}},oldUrl));
      await preview.click();await link.waitFor();assert.notEqual(await link.getAttribute("href"),oldUrl);
      await page.getByPlaceholder("Description de l'acte...").fill("Acte corrigé fictif");assert.equal(await link.count(),0);
      if(index<2)assert.equal(await tooth.isChecked(),false);
      else assert.equal(await page.getByRole("checkbox",{name:/Je confirme, en tant que dentiste/}).isChecked(),false);
      // Reverting text must never resurrect an old confirmation.
      await page.getByPlaceholder("Description de l'acte...").fill("Soin fictif audit");
      if(index<2)assert.equal(await tooth.isChecked(),false);
      else assert.equal(await page.getByRole("checkbox",{name:/Je confirme, en tant que dentiste/}).isChecked(),false);
      await page.getByRole("link",{name:"Retour",exact:true}).click();await page.waitForURL(`**/patients/${patientId}`);
      await page.getByRole("link",{name:"Nouvelle feuille de soins",exact:true}).click();
      await page.getByPlaceholder("Description de l'acte...").fill("Secret fictif du premier patient");
      await page.locator("#decl-place").fill("Lieu fictif privé");
      const other=`patient-demo-00${index===2?1:index+2}`;
      await page.locator("#draft-patient").selectOption(other);
      await page.waitForFunction(id=>document.querySelector("#draft-patient")?.value===id,other);
      assert.equal(await page.getByPlaceholder("Description de l'acte...").inputValue(),"");
      assert.equal(await page.locator("#decl-place").inputValue(),"");
      assert.equal(await page.locator('a[download]').count(),0);
      await page.locator("#draft-patient").selectOption(patientId);
      assert.equal(await page.getByPlaceholder("Description de l'acte...").inputValue(),"");
      assert.equal(await page.locator("#decl-place").inputValue(),"");
      assert.deepEqual(await page.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage)})),{local:[],session:[]});
      assert.deepEqual(errors,[]);assert.deepEqual(external.filter(url=>!url.startsWith("blob:")),[]);
    } finally {await value.close();}
  });
}

test("switching same-patient policies revokes previews and chart confirmation; total overflow stays recoverable",async()=>{
  const {value,page,errors}=await harness.context();
  try {
    await page.goto(`${harness.baseURL}/patients/patient-demo-001`);
    await page.getByRole("button",{name:"Modifier la police",exact:true}).click();
    const dialog=page.getByRole("dialog");await dialog.locator("#policy-active").uncheck();
    await dialog.getByRole("button",{name:"Mettre à jour",exact:true}).click();await dialog.waitFor({state:"hidden"});
    await page.getByRole("link",{name:"Nouvelle feuille de soins",exact:true}).click();
    await page.getByPlaceholder("N° Immatriculation / Matricule").fill("000000001");
    await page.getByRole("button",{name:"Enregistrer cette couverture",exact:true}).click();
    const policy=page.locator("#draft-policy");await policy.waitFor();
    const newId=await policy.inputValue();assert.notEqual(newId,"pol-demo-001-cnss");
    await page.getByPlaceholder("Description de l'acte...").fill("Acte fictif de contrôle");
    await page.getByPlaceholder("0.00",{exact:true}).fill("400.01");
    const chart=page.getByRole("region",{name:"Schéma dentaire",exact:true});
    const tooth=chart.getByRole("checkbox",{name:"Confirmer la dent FDI 16",exact:true});await tooth.check();
    const pdf=page.getByRole("region",{name:"PDF CNSS",exact:true});
    await pdf.getByRole("button",{name:"Prévisualiser",exact:true}).click();
    const link=pdf.getByRole("link",{name:"Télécharger le PDF",exact:true});await link.waitFor();
    const oldUrl=await link.getAttribute("href");await policy.selectOption("pol-demo-001-cnss");
    assert.equal(await link.count(),0);assert.equal(await tooth.isChecked(),false);
    assert(await page.evaluate(async url=>{try{await fetch(url);return false;}catch{return true;}},oldUrl));
    await policy.selectOption(newId);assert.equal(await tooth.isChecked(),false);
    await page.getByPlaceholder("0.00",{exact:true}).fill("90071992547409.91");
    await page.getByRole("button",{name:/Ajouter une ligne/}).click();
    await page.getByPlaceholder("Description de l'acte...").nth(1).fill("Acte fictif complémentaire");
    await page.getByPlaceholder("0.00",{exact:true}).nth(1).fill("0.01");
    await page.getByText("Total hors limite : corrigez les honoraires.",{exact:true}).first().waitFor();
    await page.getByPlaceholder("0.00",{exact:true}).first().fill("400.01");
    assert.equal(await page.getByText("Total hors limite : corrigez les honoraires.",{exact:true}).count(),0);
    assert.deepEqual(errors,[]);
  } finally {await value.close();}
});
