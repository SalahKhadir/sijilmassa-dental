import test from "node:test";
import assert from "node:assert/strict";
import { createAppointmentApi, AppointmentApiError, appointmentSchema } from "../src/lib/appointments/api/client.ts";
import { clinicParts, wallClockCandidates, calendarWindow, calendarDates, isTransitionPeriod, appointmentFormSchema, appointmentInput, calendarEvent, instantLabel } from "../src/lib/appointments/api/time.ts";
import { statusChoices } from "../src/lib/appointments/api/permissions.ts";
import { proxyAuthentication } from "../src/lib/auth/backend-proxy.ts";
const id = "00000000-0000-4000-8000-000000000001", patientId = "00000000-0000-4000-8000-000000000002";
const appointment = { id, patientId, startAt: "2026-11-10T09:00:00Z", endAt: "2026-11-10T09:30:00Z", type: "CONSULTATION", status: "EN_ATTENTE", version: 0, createdAt: "2026-11-09T00:00:00Z", updatedAt: "2026-11-09T00:00:00Z" };
const input = { patientId, startAt: appointment.startAt, endAt: appointment.endAt, type: "CONSULTATION" };
const form = { patientId, date: "2026-11-10", time: "10:00", duration: 30, type: "CONSULTATION", occurrence: "" };
function harness(body = appointment) {
 const calls = []; const api = createAppointmentApi(async (url, options) => {
  calls.push({ url, ...options }); return Response.json(url.endsWith("/csrf") ? { headerName: "X-CSRF-TOKEN", token: "synthetic" } : body);
 }); return { api, calls };
}
test("appointment DTO is strict, has separate safe version and no prototype/free-text fields", () => {
 assert(appointmentSchema.safeParse(appointment).success);
 for(const extra of [{notes:"private"},{reason:"private"},{version:0.5},{version:Number.MAX_SAFE_INTEGER+1},{patientId:"patient-demo-001"},{endAt:appointment.startAt}]) assert(!appointmentSchema.safeParse({...appointment,...extra}).success);
});
test("create/update/status forward exact DTO/version with fresh CSRF and no automatic write retry", async () => {
 const {api,calls}=harness(); await api.create(input);await api.update(id,3,input);await api.status(id,4,"ANNULE");
 assert.equal(calls.length,6);assert.equal(calls[0].url,"/api/v1/auth/csrf");assert.equal(calls[1].headers["X-CSRF-TOKEN"],"synthetic");
 assert.equal(calls[1].credentials,"same-origin");assert.equal(calls[1].cache,"no-store");assert.deepEqual(JSON.parse(calls[1].body),input);
 assert.equal(JSON.parse(calls[3].body).version,3);assert.deepEqual(JSON.parse(calls[5].body),{version:4,status:"ANNULE"});
});
test("calendar traverses all server pages, preserving bounded query and deterministic ordering", async () => {
 const calls=[];
 const api=createAppointmentApi(async url=>{calls.push(url);const page=Number(new URL(url,"http://clinic").searchParams.get("page"));return Response.json({items:[{...appointment,id:page===1?id:patientId}],total:2,page,pageSize:100,pageCount:2});});
 const query={...calendarWindow("2026-11-10","week"),patientId};const entries=await api.list(query);
 assert.equal(entries.length,2);assert.equal(calls.length,2);const params=new URL(calls[1],"http://clinic").searchParams;assert.equal(params.get("patientId"),patientId);assert.equal(params.get("from"),query.from);assert.equal(params.get("page"),"2");
});
test("pagination changes/duplicates fail explicitly instead of exposing a partial or duplicated calendar",async()=>{
 const api=createAppointmentApi(async url=>{const page=Number(new URL(url,"http://clinic").searchParams.get("page"));return Response.json({items:[appointment],total:2,page,pageSize:100,pageCount:2});});
 await assert.rejects(api.list(calendarWindow("2026-11-10","day")),{status:409});
 const huge=harness({items:[],total:10001,page:1,pageSize:100,pageCount:101});await assert.rejects(huge.api.list(calendarWindow("2026-11-10","day")),{status:413});
});
test("unbounded, offsetless and synthetic-identity calendar requests never reach the network",async()=>{
 const {api,calls}=harness();
 for(const query of [{from:"2026-01-01T00:00:00Z",to:"2026-04-01T00:00:00Z"},{from:"2026-01-01T00:00:00",to:"2026-01-02T00:00:00"},{...calendarWindow("2026-11-10","day"),patientId:"patient-demo-001"}]) await assert.rejects(api.list(query));
 assert.equal(calls.length,0);assert.throws(()=>api.get("appointment-demo-001"),{status:404});
});
for(const status of [400,401,403,404,409,429,500,502,503]) test(`appointment error ${status} maps safely and never replays a mutation`,async()=>{
 let writes=0,expired=0;
 const api=createAppointmentApi(async url=>{if(url.endsWith("csrf"))return Response.json({headerName:"X-CSRF-TOKEN",token:"synthetic"});writes++;return Response.json({detail:"PRIVATE-PAYLOAD"},{status});},()=>expired++);
 await assert.rejects(api.update(id,0,input),error=>error instanceof AppointmentApiError&&error.status===status&&!error.message.includes("PRIVATE-PAYLOAD"));assert.equal(writes,1);assert.equal(expired,status===401?1:0);
});
test("CSRF failure prevents booking; malformed response and network timeout have no fallback",async()=>{
 let calls=0;const api=createAppointmentApi(async()=>{calls++;return Response.json({}, {status:403});});await assert.rejects(api.create(input),{status:403});assert.equal(calls,1);
 await assert.rejects(harness({}).api.get(id),{status:502});await assert.rejects(createAppointmentApi(async()=>{throw new DOMException("internal-host","TimeoutError");}).get(id),{status:503});
});
test("Morocco repeated hour retains two distinct instants and requires explicit occurrence",()=>{
 const values=wallClockCandidates("2026-02-15","02:15");assert.equal(values.length,2);assert.equal(Date.parse(values[1])-Date.parse(values[0]),3600000);
 assert.equal(appointmentFormSchema.safeParse({...form,date:"2026-02-15",time:"02:15"}).success,false);
 const selected=appointmentInput({...form,date:"2026-02-15",time:"02:15",occurrence:values[1]});assert.equal(selected.startAt,values[1]);assert.equal(Date.parse(selected.endAt)-Date.parse(selected.startAt),1800000);
 assert.notEqual(instantLabel(values[0]),instantLabel(values[1]));
});
test("Morocco missing hour is rejected and local calendar days may last 23/25 hours",()=>{
 assert.deepEqual(wallClockCandidates("2026-03-22","02:15"),[]);
 assert.equal(appointmentFormSchema.safeParse({...form,date:"2026-03-22",time:"02:15"}).success,false);
 const fall=calendarWindow("2026-02-15","day"),spring=calendarWindow("2026-03-22","day");
 assert.equal((Date.parse(fall.to)-Date.parse(fall.from))/3600000,25);assert.equal((Date.parse(spring.to)-Date.parse(spring.from))/3600000,23);
 assert(isTransitionPeriod("2026-02-15","week"));
});
test("date/week navigation and UTC projection use clinic timezone, not browser timezone",()=>{
 assert.deepEqual(calendarDates("2026-11-10","week"),["2026-11-09","2026-11-10","2026-11-11","2026-11-12","2026-11-13","2026-11-14","2026-11-15"]);
 assert.equal(clinicParts("2026-02-14T23:30:00Z").date,"2026-02-15");
 const event=calendarEvent(appointment);assert.equal(event.id,id);assert.equal(event.durationMinutes,30);assert(!("notes" in event));
});
test("form validates duration, midnight, category and patient; all weekdays remain possible",()=>{
 assert(appointmentFormSchema.safeParse({...form,date:"2026-11-15"}).success);
 for(const bad of [{duration:29},{duration:181},{duration:30.5},{patientId:"patient-demo-001"},{type:"DIAGNOSIS"},{time:"23:45",duration:30}])assert(!appointmentFormSchema.safeParse({...form,...bad}).success);
 const input=appointmentInput(form);assert.deepEqual(Object.keys(input).sort(),["endAt","patientId","startAt","type"]);
});
test("presentation permissions reserve completion for dentist and terminal records have no actions",()=>{
 assert(!statusChoices("RECEPTIONIST","EN_ATTENTE").includes("TERMINE"));assert(statusChoices("DENTIST","CONFIRME").includes("TERMINE"));assert.deepEqual(statusChoices("DENTIST","TERMINE"),[]);
});
test("appointment proxy explicitly allows paths/methods, retains query/status and rejects arbitrary forwarding",async()=>{
 const result=await proxyAuthentication(new Request(`http://clinic/api/v1/appointments/${id}/status`,{method:"PUT",headers:{Origin:"http://clinic","X-CSRF-TOKEN":"synthetic",Cookie:"JSESSIONID=synthetic; other=no"},body:"{}"}),`appointments/${id}/status`,{origin:"http://internal",fetcher:async(url,options)=>{
  assert.equal(url,`http://internal/api/v1/appointments/${id}/status`);assert.equal(options.headers.get("Cookie"),"JSESSIONID=synthetic");assert.equal(options.headers.get("X-CSRF-TOKEN"),"synthetic");return Response.json({status:409},{status:409,headers:{"Content-Type":"application/problem+json"}});
 }});assert.equal(result.status,409);assert.match(result.headers.get("cache-control"),/no-store/);
 for(const path of ["appointments/appointment-demo-001",`appointments/${id}/clinical`,`appointments/${id}/../../auth/me`])assert.equal((await proxyAuthentication(new Request("http://clinic"),path)).status,404);
 assert.equal((await proxyAuthentication(new Request("http://clinic",{method:"DELETE"}),`appointments/${id}`)).status,405);
 await proxyAuthentication(new Request("http://clinic/api/v1/appointments?from=test&to=test"),"appointments",{origin:"http://internal",fetcher:async url=>{assert.equal(url,"http://internal/api/v1/appointments?from=test&to=test");return Response.json({});}});
});
