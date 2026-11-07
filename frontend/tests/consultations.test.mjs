import assert from "node:assert/strict";
import test from "node:test";
import {
  consultationSchema,
  emptyConsultation,
} from "../src/lib/consultations/schema.ts";
import {
  createInMemoryConsultationRepository,
  ClinicalRecordError,
  LinkedConsultationError,
} from "../src/lib/consultations/repository.ts";
import {
  consultationDirectory,
  chronologicalTreatments,
} from "../src/lib/consultations/selectors.ts";
import { createInMemoryPatientRepository } from "../src/lib/patients/repository.ts";
import { createInMemoryAppointmentRepository } from "../src/lib/appointments/repository.ts";
import { patientFixtures } from "../src/data/patients.ts";
import { appointmentFixtures } from "../src/data/appointments.ts";
import { consultationFixtures } from "../src/data/consultations.ts";
const clock = () => new Date("2026-11-07T12:00:00Z");
const input = (overrides = {}) => ({
  ...emptyConsultation("2026-11-07"),
  patientId: "patient-demo-001",
  chiefComplaint: "Motif fictif",
  ...overrides,
});
const care = (overrides = {}) => ({
  treatmentDate: "2026-11-07",
  description: "Soin fictif",
  toothReference: "11, 12 / secteur 1",
  notes: "",
  ...overrides,
});
function setup(seed = []) {
  const patients = createInMemoryPatientRepository(patientFixtures, clock);
  let clinical;
  const appointments = createInMemoryAppointmentRepository(
    appointmentFixtures,
    patients,
    clock,
    undefined,
    (id) => clinical.canReassignAppointment(id),
  );
  clinical = createInMemoryConsultationRepository(
    seed,
    patients,
    appointments,
    clock,
  );
  return { patients, appointments, clinical };
}
test("clinical schema validates required fields, dates, text lengths and plain tooth references", () => {
  assert(consultationSchema.safeParse(input()).success);
  for (const value of [
    input({ patientId: "" }),
    input({ consultationDate: "2026-02-30" }),
    input({ chiefComplaint: "  " }),
    input({ chiefComplaint: "x".repeat(501) }),
    input({ notes: "x".repeat(5001) }),
    input({ treatments: [care({ description: "" })] }),
    input({ treatments: [care({ toothReference: "<script>" })] }),
    input({ treatments: Array.from({ length: 51 }, () => care()) }),
  ])
    assert(!consultationSchema.safeParse(value).success);
  assert.equal(
    consultationSchema.parse(input({ chiefComplaint: "  Motif  " }))
      .chiefComplaint,
    "Motif",
  );
  assert(
    consultationSchema.safeParse(
      input({ consultationDate: "2020-01-01", treatments: [care()] }),
    ).success,
  );
});
test("twenty deterministic draft and completed fixtures have consistent patient and appointment links", () => {
  assert.equal(consultationFixtures.length, 20);
  assert.equal(
    new Set(consultationFixtures.map((record) => record.id)).size,
    20,
  );
  assert(consultationFixtures.some((record) => record.status === "BROUILLON"));
  assert(consultationFixtures.some((record) => record.status === "TERMINEE"));
  for (const record of consultationFixtures) {
    assert(consultationSchema.safeParse(record).success);
    assert(patientFixtures.some((patient) => patient.id === record.patientId));
    if (record.appointmentId)
      assert(
        appointmentFixtures.some(
          (item) =>
            item.id === record.appointmentId &&
            item.patientId === record.patientId &&
            item.date === record.consultationDate,
        ),
      );
    for (const treatment of record.treatments) {
      assert.equal(treatment.consultationId, record.id);
      assert(!("priceCentimes" in treatment));
      assert(!("patientId" in treatment));
    }
  }
});
test("walk-in draft creation and editing preserve identity, status and creation metadata", async () => {
  const { clinical } = setup();
  const created = await clinical.create(input());
  assert.equal(created.status, "BROUILLON");
  assert.equal(created.appointmentId, "");
  const updated = await clinical.update(
    created.id,
    input({ chiefComplaint: "Motif modifié", treatments: [care()] }),
  );
  assert.equal(updated.id, created.id);
  assert.equal(updated.createdAt, created.createdAt);
  assert.equal(updated.chiefComplaint, "Motif modifié");
  assert.equal(updated.treatments.length, 1);
  await assert.rejects(
    clinical.update(
      created.id,
      input({ patientId: "patient-demo-002", treatments: updated.treatments }),
    ),
    ClinicalRecordError,
  );
});
test("treatments retain stable ids, support draft edits and sort chronologically", async () => {
  const { clinical } = setup();
  const record = await clinical.create(
    input({
      treatments: [
        care(),
        care({ treatmentDate: "2026-11-06", description: "Autre soin" }),
      ],
    }),
  );
  assert.notEqual(record.treatments[0].id, record.treatments[1].id);
  const entries = record.treatments.map((entry, index) => ({
    ...entry,
    notes: index ? "" : "Correction fictive",
  }));
  const updated = await clinical.update(record.id, {
    ...record,
    treatments: entries,
  });
  assert.equal(updated.treatments[0].id, record.treatments[0].id);
  assert.equal(updated.treatments[0].createdAt, record.treatments[0].createdAt);
  assert.equal(updated.treatments[0].notes, "Correction fictive");
  assert.equal(chronologicalTreatments(updated)[0].description, "Autre soin");
  await assert.rejects(
    clinical.update(record.id, { ...updated, treatments: [] }),
    ClinicalRecordError,
  );
  await assert.rejects(
    clinical.update(record.id, {
      ...updated,
      treatments: [updated.treatments[0], updated.treatments[0]],
    }),
    ClinicalRecordError,
  );
  await assert.rejects(
    clinical.update(record.id, {
      ...updated,
      treatments: [...updated.treatments, care({ id: "foreign" })],
    }),
    ClinicalRecordError,
  );
  assert.deepEqual(await clinical.getById(record.id), updated);
});
test("completion locks clinical and treatment writes and leaves appointment status unchanged", async () => {
  const { clinical, appointments } = setup();
  const before = await appointments.getById("appointment-demo-001");
  const draft = await clinical.create(
    input({ appointmentId: before.id, treatments: [care()] }),
  );
  const completed = await clinical.complete(draft.id);
  assert.equal(completed.status, "TERMINEE");
  await assert.rejects(
    clinical.update(draft.id, { ...completed, notes: "Change" }),
    ClinicalRecordError,
  );
  await assert.rejects(clinical.complete(draft.id), ClinicalRecordError);
  assert.deepEqual(await appointments.getById(before.id), before);
  assert.deepEqual(await clinical.getById(draft.id), completed);
});
test("unknown ids and mismatched appointment patient references reject without partial writes", async () => {
  const { clinical } = setup();
  assert.equal(await clinical.getById("missing"), undefined);
  await assert.rejects(clinical.update("missing", input()), /introuvable/);
  await assert.rejects(clinical.complete("missing"), /introuvable/);
  await assert.rejects(
    clinical.create(input({ patientId: "missing" })),
    /patient est introuvable/,
  );
  await assert.rejects(
    clinical.create(input({ appointmentId: "missing" })),
    /appartenir/,
  );
  await assert.rejects(
    clinical.create(input({ appointmentId: "appointment-demo-003" })),
    /appartenir/,
  );
  assert.equal((await clinical.list()).length, 0);
});
test("concurrent linked creates insert one draft and return a typed duplicate link", async () => {
  const { clinical } = setup();
  const payload = input({ appointmentId: "appointment-demo-001" });
  const results = await Promise.allSettled([
    clinical.create(payload),
    clinical.create(payload),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const rejected = results.find((result) => result.status === "rejected");
  assert(rejected.reason instanceof LinkedConsultationError);
  assert.equal(
    clinical.linkedConsultationId(payload.appointmentId),
    rejected.reason.consultationId,
  );
  assert.equal((await clinical.list()).length, 1);
});
test("duplicate links reject edits and remain reserved after completion", async () => {
  const { clinical } = setup();
  const first = await clinical.create(
    input({ appointmentId: "appointment-demo-001" }),
  );
  const second = await clinical.create(input());
  await assert.rejects(
    clinical.update(second.id, {
      ...second,
      appointmentId: first.appointmentId,
    }),
    LinkedConsultationError,
  );
  await clinical.complete(first.id);
  await assert.rejects(
    clinical.create(input({ appointmentId: first.appointmentId })),
    LinkedConsultationError,
  );
  assert.equal((await clinical.getById(second.id)).appointmentId, "");
});
test("linked appointment patient reassignment is refused while administrative edits work", async () => {
  const { clinical, appointments } = setup();
  const appointment = await appointments.getById("appointment-demo-001");
  await clinical.create(input({ appointmentId: appointment.id }));
  await assert.rejects(
    appointments.update(appointment.id, { patientId: "patient-demo-002" }),
  );
  assert.equal(
    (
      await appointments.update(appointment.id, {
        notes: "Organisation modifiée",
      })
    ).notes,
    "Organisation modifiée",
  );
  assert.equal(
    (await appointments.getById(appointment.id)).patientId,
    appointment.patientId,
  );
});
test("snapshots, fixtures and repository instances remain isolated under concurrent walk-ins", async () => {
  const { clinical } = setup(consultationFixtures);
  const first = await clinical.list();
  first[0].notes = "external";
  first[1].treatments[0].description = "external";
  assert.deepEqual(await clinical.list(), consultationFixtures);
  const { clinical: other } = setup(consultationFixtures);
  await clinical.create(input());
  assert.equal((await other.list()).length, 20);
  const concurrent = await Promise.all([
    clinical.create(input()),
    clinical.create(input()),
  ]);
  assert.notEqual(concurrent[0].id, concurrent[1].id);
});
test("new patients from the existing shared repository can receive encounters", async () => {
  const { clinical, patients } = setup();
  const patient = await patients.create(patientFixtures[0]);
  assert.equal(
    (await clinical.create(input({ patientId: patient.id }))).patientId,
    patient.id,
  );
});
test("directory searches identity only, scopes patients, filters statuses and sorts dates", () => {
  const records = consultationDirectory(consultationFixtures, patientFixtures, {
    search: "",
    status: "all",
    sort: "newest",
  });
  assert.equal(records.length, 20);
  assert.equal(records[0].consultationDate, "2026-11-07");
  const drafts = consultationDirectory(records, patientFixtures, {
    search: "",
    status: "BROUILLON",
    sort: "oldest",
    patientId: "patient-demo-001",
  });
  assert(
    drafts.every(
      (record) =>
        record.status === "BROUILLON" &&
        record.patientId === "patient-demo-001",
    ),
  );
  const matches = consultationDirectory(records, patientFixtures, {
    search: patientFixtures[0].reference,
    status: "all",
    sort: "oldest",
  });
  assert(matches.length > 0);
  assert(matches.every((record) => record.patientId === patientFixtures[0].id));
  assert.equal(
    consultationDirectory(records, patientFixtures, {
      search: "Observations de démonstration",
      status: "all",
      sort: "newest",
    }).length,
    0,
  );
  assert.equal(consultationFixtures[0].consultationDate, "2026-10-05");
});

test("a pending clinical link also prevents concurrent appointment reassignment and releases on failure", async () => {
  const { clinical, appointments } = setup();
  const results = await Promise.allSettled([
    clinical.create(input({ appointmentId: "appointment-demo-001" })),
    appointments.update("appointment-demo-001", {
      patientId: "patient-demo-002",
    }),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(
    (await appointments.getById("appointment-demo-001")).patientId,
    "patient-demo-001",
  );
  await assert.rejects(
    clinical.create(input({ appointmentId: "appointment-demo-002" })),
  );
  assert.equal(clinical.canReassignAppointment("appointment-demo-002"), true);
});
