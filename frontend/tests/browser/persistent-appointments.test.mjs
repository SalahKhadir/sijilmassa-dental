import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { browserHarness, authenticationFixture } from "./browser-harness.mjs";
import { wallClockCandidates } from "../../src/lib/appointments/api/time.ts";
const harness=browserHarness({port:3114});before(async()=>{await authenticationFixture();await harness.start();});after(harness.stop);
const url=path=>`${harness.baseURL}${path}`;
async function mutate(context,path,method,data){const csrf=await(await context.request.get(url("/api/v1/auth/csrf"))).json();return context.request.fetch(url(path),{method,headers:{[csrf.headerName]:csrf.token},data});}
async function login(page,role){const value=(await authenticationFixture())[role];await page.goto(url("/login"));await page.getByLabel("Identifiant (obligatoire)",{exact:true}).fill(value.identifier);await page.getByLabel("Mot de passe (obligatoire)",{exact:true}).fill(value.password);await page.getByRole("button",{name:"Se connecter",exact:true}).click();await page.getByRole("button",{name:"Se déconnecter",exact:true}).waitFor();}
async function patient(context,lastName="Partage84B"){
 const response=await mutate(context,"/api/v1/patients","POST",{identity:{firstName:"Agenda84B",lastName,sex:"unanswered",dateOfBirth:null,address:"",gsm:"",landline:"",profession:"",cin:"",medicalCoverage:""},status:"active"});assert.equal(response.status(),201);return response.json();
}
function slot(person,time="10:00",date="2026-11-24"){const startAt=wallClockCandidates(date,time)[0];return {patientId:person.id,startAt,endAt:new Date(Date.parse(startAt)+1800000).toISOString(),type:"CONSULTATION"};}
async function booking(context,person,time="10:00",date="2026-11-24"){const response=await mutate(context,"/api/v1/appointments","POST",slot(person,time,date));assert.equal(response.status(),201);return response.json();}
async function openEvent(page,person){await page.getByRole("link",{name:new RegExp(`${person.identity.firstName} ${person.identity.lastName}`)}).first().click();await page.getByRole("heading",{name:"Détails du rendez-vous",exact:true}).waitFor();}

test("real receptionist booking is persisted, shared with dentist, edited and revalidated across both roles",async()=>{
 const first=await harness.context({anonymous:true});let second;
 try{
  await login(first.page,"receptionist");const person=await patient(first.value);
  await first.page.goto(url(`/patients/${person.id}`));await first.page.getByRole("link",{name:"Prendre rendez-vous",exact:true}).click();
  await first.page.getByRole("status").filter({hasText:"Patient sélectionné"}).waitFor();
  await first.page.getByLabel("Date du rendez-vous",{exact:true}).fill("2026-11-24");await first.page.getByLabel("Heure du cabinet",{exact:true}).fill("10:00");
  await first.page.getByRole("button",{name:"Créer le rendez-vous",exact:true}).dblclick();
  await first.page.waitForURL(/\/rendez-vous\?date=2026-11-24&view=day&saved=1$/);
  await first.page.getByRole("status").filter({hasText:"1 rendez-vous sur cette période"}).waitFor();
  await first.page.reload();await first.page.getByRole("status").filter({hasText:"1 rendez-vous sur cette période"}).waitFor();
  assert(!(await first.page.locator("footer").last().innerText()).includes("Modifications temporaires en mémoire"));
  if(process.env.APPOINTMENTS_TEST_SCREENSHOT_DIR) await first.page.screenshot({path:`${process.env.APPOINTMENTS_TEST_SCREENSHOT_DIR}/persistent-calendar-desktop.png`,fullPage:true});
  await openEvent(first.page,person);const id=first.page.url().split("/").at(-1);
  assert.equal(first.page.url().includes("appointment-demo"),false);assert.equal(await first.page.locator('option[value="TERMINE"]').count(),0);
  await first.page.getByRole("button",{name:"Se déconnecter",exact:true}).click();await first.page.waitForURL("**/login");await login(first.page,"dentist");
  await first.page.goto(url("/rendez-vous?date=2026-11-24"));await openEvent(first.page,person);await first.page.getByRole("link",{name:"Modifier le rendez-vous",exact:true}).click();
  await first.page.getByLabel("Heure du cabinet",{exact:true}).fill("11:00");await first.page.getByLabel("Durée (minutes)",{exact:true}).fill("60");
  await first.page.getByRole("button",{name:"Enregistrer le rendez-vous",exact:true}).click();await first.page.waitForURL(/\/rendez-vous\?date=2026-11-24/);
  second=await harness.context({anonymous:true});await login(second.page,"receptionist");await second.page.goto(url(`/rendez-vous/${id}`));await second.page.getByRole("heading",{name:"Détails du rendez-vous",exact:true}).waitFor();
  assert((await second.page.locator("main").innerText()).includes("11:00"));assert((await second.page.locator("main").innerText()).includes("60 minutes"));
  await second.page.getByLabel("Statut du rendez-vous",{exact:true}).selectOption("CONFIRME");const confirmed=second.page.waitForResponse(response=>response.url().endsWith(`/api/v1/appointments/${id}/status`)&&response.request().method()==="PUT");await second.page.getByRole("button",{name:"Appliquer le statut",exact:true}).click();assert.equal((await confirmed).status(),200);
  await first.page.evaluate(()=>window.dispatchEvent(new Event("focus")));await first.page.getByRole("link",{name:new RegExp(`${person.identity.firstName} ${person.identity.lastName}.*Confirmé`)}).waitFor();
  const record=await(await second.value.request.get(url(`/api/v1/appointments/${id}`))).json();assert.equal(record.status,"CONFIRME");assert.equal(record.version,2);
  assert.equal((await mutate(second.value,`/api/v1/appointments/${id}/status`,"PUT",{version:record.version,status:"TERMINE"})).status(),403);
  assert.equal(await first.page.evaluate(()=>localStorage.length+sessionStorage.length),0);assert.deepEqual(first.errors,[]);assert.deepEqual(second.errors,[]);
 }finally{await first.value.close();await second?.value.close();}
});

test("real overlap and stale-version conflicts preserve drafts and never overwrite the concurrent writer",async()=>{
 const {value,page}=await harness.context();
 try{
  const person=await patient(value,"Conflit84B"),record=await booking(value,person,"10:00","2026-11-25");
  await page.goto(url("/rendez-vous/nouveau?date=2026-11-25"));await page.getByRole("searchbox",{name:"Rechercher un patient",exact:true}).fill("Conflit84B");await page.getByRole("button",{name:/Agenda84B Conflit84B/}).click();await page.getByRole("status").filter({hasText:"Patient sélectionné"}).waitFor();await page.getByLabel("Heure du cabinet",{exact:true}).fill("10:00");
  await page.getByRole("button",{name:"Créer le rendez-vous",exact:true}).click();await page.getByRole("alert").filter({hasText:"créneau est occupé"}).waitFor();
  assert.equal(await page.getByLabel("Heure du cabinet",{exact:true}).inputValue(),"10:00");
  await page.getByRole("button",{name:"Conserver mes saisies et choisir un autre horaire",exact:true}).click();await page.getByLabel("Heure du cabinet",{exact:true}).fill("10:30");await page.getByRole("button",{name:"Créer le rendez-vous",exact:true}).click();await page.waitForURL(/\/rendez-vous\?date=2026-11-25/);
  await page.goto(url(`/rendez-vous/${record.id}/modifier`));await page.getByLabel("Heure du cabinet",{exact:true}).fill("12:00");
  const fresh={...slot(person,"11:00","2026-11-25"),version:record.version};assert.equal((await mutate(value,`/api/v1/appointments/${record.id}`,"PUT",fresh)).status(),200);
  await page.getByRole("button",{name:"Enregistrer le rendez-vous",exact:true}).click();await page.getByRole("alert").filter({hasText:"rendez-vous a changé"}).waitFor();
  assert.equal(await page.getByLabel("Heure du cabinet",{exact:true}).inputValue(),"12:00");assert.equal(await page.getByRole("button",{name:"Enregistrer le rendez-vous",exact:true}).isDisabled(),true);
  page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"Recharger les données",exact:true}).click();assert.equal(await page.getByLabel("Heure du cabinet",{exact:true}).inputValue(),"11:00");
  const body=await(await value.request.get(url(`/api/v1/appointments/${record.id}`))).json();assert.equal(body.startAt,fresh.startAt.replace(".000Z","Z"));assert.equal(body.version,1);
 }finally{await value.close();}
});

test("terminal status, cancellation/reactivation and archived patients obey the real backend lifecycle",async()=>{
 const {value,page}=await harness.context();
 try{
  const person=await patient(value,"Cycle84B"),record=await booking(value,person,"10:00","2026-11-26");
  await page.goto(url(`/rendez-vous/${record.id}`));await page.getByLabel("Statut du rendez-vous",{exact:true}).selectOption("ANNULE");const cancelled=page.waitForResponse(response=>response.url().endsWith(`/api/v1/appointments/${record.id}/status`)&&response.request().method()==="PUT");await page.getByRole("button",{name:"Appliquer le statut",exact:true}).click();assert.equal((await cancelled).status(),200);
  await page.getByLabel("Statut du rendez-vous",{exact:true}).waitFor();await booking(value,person,"10:00","2026-11-26");
  await page.getByLabel("Statut du rendez-vous",{exact:true}).selectOption("CONFIRME");await page.getByRole("button",{name:"Appliquer le statut",exact:true}).click();await page.getByRole("alert").filter({hasText:"créneau est occupé"}).waitFor();
  await page.goto(url(`/rendez-vous/${record.id}`));await page.getByRole("link",{name:"Voir la fiche patient",exact:true}).click();await page.getByRole("heading",{name:"Agenda84B Cycle84B",exact:true}).waitFor();
  const active=await(await value.request.get(url(`/api/v1/appointments/${record.id}`))).json();
  const replacement=await(await value.request.get(url(`/api/v1/appointments?${new URLSearchParams({from:slot(person,"00:00","2026-11-26").startAt,to:slot(person,"00:00","2026-11-27").startAt})}`))).json();
  const occupied=replacement.items.find(item=>item.id!==active.id);
  await page.goto(url(`/rendez-vous/${occupied.id}`));await page.getByLabel("Statut du rendez-vous",{exact:true}).selectOption("TERMINE");page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"Appliquer le statut",exact:true}).click();await page.getByText("Ce rendez-vous terminé est immuable.",{exact:true}).waitFor();
  assert.equal(await page.getByRole("link",{name:"Modifier le rendez-vous",exact:true}).count(),0);
  assert.equal((await mutate(value,`/api/v1/patients/${person.id}`,"PUT",{version:person.version,identity:person.identity,status:"inactive"})).status(),200);
  await page.goto(url(`/patients/${person.id}`));await page.getByRole("heading",{name:"Agenda84B Cycle84B",exact:true}).waitFor();assert.equal(await page.getByRole("link",{name:"Prendre rendez-vous",exact:true}).count(),0);
 }finally{await value.close();}
});

test("calendar mobile/week and Moroccan offset transitions preserve visible instants and data isolation",async()=>{
 const {value,page}=await harness.context({viewport:{width:390,height:900},timezoneId:"America/New_York"});
 try{
  const person=await patient(value,"Fuseau84B");const instants=wallClockCandidates("2026-02-15","02:15");assert.equal(instants.length,2);
  for(const startAt of instants){const response=await mutate(value,"/api/v1/appointments","POST",{...slot(person),startAt,endAt:new Date(Date.parse(startAt)+1800000).toISOString()});assert.equal(response.status(),201);}
  await page.goto(url("/rendez-vous?date=2026-02-15"));await page.getByRole("status").filter({hasText:"2 rendez-vous sur cette période"}).waitFor();await page.getByText("Changement d’heure",{exact:false}).waitFor();
  if(process.env.APPOINTMENTS_TEST_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.APPOINTMENTS_TEST_SCREENSHOT_DIR}/persistent-calendar-mobile-offset.png`,fullPage:true});
  const text=await page.getByRole("list",{name:"Liste des rendez-vous",exact:true}).innerText();assert(text.includes("UTC+01:00"));assert(text.includes("UTC+00:00"));
  await page.getByRole("button",{name:"Semaine",exact:true}).click();await page.getByRole("status").filter({hasText:"2 rendez-vous sur cette période"}).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.goto(url(`/rendez-vous/nouveau?patientId=${person.id}&date=2026-03-22`));await page.getByRole("status").filter({hasText:"Patient sélectionné"}).waitFor();await page.getByLabel("Heure du cabinet",{exact:true}).fill("02:15");await page.getByRole("button",{name:"Créer le rendez-vous",exact:true}).click();await page.getByRole("alert").filter({hasText:"n’existe pas"}).waitFor();
  page.once("dialog",dialog=>dialog.accept());await page.goto(url("/demo/rendez-vous?date=2026-11-02"));await page.getByText("Agenda synthétique",{exact:false}).first().waitFor();assert.equal(await page.getByRole("link",{name:new RegExp("Fuseau84B")}).count(),0);
 }finally{await value.close();}
});

test("appointment API outage and invalid session never display synthetic bookings",async()=>{
 const {value,page}=await harness.context();
 try{
  await page.route("**/api/v1/appointments?**",route=>route.abort("connectionfailed"));await page.goto(url("/rendez-vous?date=2026-11-24"));await page.getByRole("alert").filter({hasText:"service de rendez-vous est indisponible"}).waitFor();assert.equal(await page.locator('a[href*="appointment-demo"]').count(),0);
  await page.unroute("**/api/v1/appointments?**");
  assert.equal((await value.request.get(url("/api/v1/appointments/appointment-demo-001"))).status(),404);
  assert.equal((await value.request.post(url("/api/v1/appointments"),{data:{}})).status(),403);
  assert.equal((await value.request.get(url("/api/v1/appointments?from=2026-11-24T00:00:00Z&to=2026-11-25T00:00:00Z"),{headers:{Cookie:"JSESSIONID=synthetic-expired"}})).status(),401);
  assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 }finally{await value.close();}
});
