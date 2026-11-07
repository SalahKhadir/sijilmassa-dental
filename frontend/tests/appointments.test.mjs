import assert from "node:assert/strict";
import test from "node:test";
import { appointmentFixtures } from "../src/data/appointments.ts";
import { patientFixtures } from "../src/data/patients.ts";
import { appointmentSchema } from "../src/lib/appointments/schema.ts";
import {
  developmentSchedule,
  withinWorkingHours,
  describeDevelopmentSchedule,
} from "../src/lib/appointments/schedule.ts";
import {
  parseLocalTime,
  endTime,
  addLocalDays,
  mondayOfWeek,
  weekDates,
  formatLocalDate,
  formatMinutes,
} from "../src/lib/appointments/local-time.ts";
import {
  findAppointmentConflict,
  intervalsOverlap,
  blocksScheduling,
} from "../src/lib/appointments/conflicts.ts";
import {
  createInMemoryAppointmentRepository,
  AppointmentConflictError,
  AppointmentPatientError,
  AppointmentNotFoundError,
} from "../src/lib/appointments/repository.ts";
import { createInMemoryPatientRepository } from "../src/lib/patients/repository.ts";
import { emptyPatientInput } from "../src/lib/patients/schema.ts";
import {
  searchPatients,
  patientIndicators,
} from "../src/lib/patients/directory.ts";
import {
  appointmentPatient,
  appointmentDashboardStats,
  positionAppointments,
  upcomingAppointments,
} from "../src/lib/appointments/selectors.ts";
import {
  appointmentStatusValues,
  allowedStatusTransitions,
} from "../src/lib/appointments/types.ts";
const clock = () => new Date("2026-11-09T08:00:00Z");
function input(overrides = {}) {
  return {
    patientId: "patient-demo-001",
    date: "2026-11-09",
    startTime: "09:00",
    durationMinutes: 30,
    type: "CONSULTATION",
    reason: "",
    notes: "",
    ...overrides,
  };
}
function record(id = "appointment-demo-001", overrides = {}) {
  return {
    ...input(),
    id,
    status: "EN_ATTENTE",
    createdAt: clock().toISOString(),
    updatedAt: clock().toISOString(),
    ...overrides,
  };
}
function repository(seed = []) {
  return createInMemoryAppointmentRepository(
    seed,
    createInMemoryPatientRepository(patientFixtures),
    clock,
  );
}

test("appointment schema validates dates, time, duration, category, patient selection and lengths", () => {
  const schema = appointmentSchema();
  assert(schema.safeParse(input()).success);
  assert(schema.safeParse(input({ date: "2020-01-06" })).success);
  for (const change of [
    { patientId: "" },
    { date: "2026-02-30" },
    { date: "" },
    { startTime: "24:00" },
    { startTime: "9:00" },
    { startTime: "10:60" },
    { durationMinutes: 0 },
    { durationMinutes: -1 },
    { durationMinutes: 30.5 },
    { durationMinutes: NaN },
    { durationMinutes: 181 },
    { type: "UNKNOWN" },
    { notes: "a".repeat(1001) },
  ])
    assert(!schema.safeParse(input(change)).success, JSON.stringify(change));
  assert.equal(
    schema.parse(input({ reason: "  Motif fictif  " })).reason,
    "Motif fictif",
  );
});

test("working hours are centralized development values and include exact closing boundaries", () => {
  assert(withinWorkingHours("2026-11-09", "12:00", 30));
  assert(!withinWorkingHours("2026-11-09", "12:15", 30));
  assert(!withinWorkingHours("2026-11-09", "13:00", 30));
  assert(withinWorkingHours("2026-11-09", "17:30", 30));
  assert(!withinWorkingHours("2026-11-09", "17:45", 30));
  assert(withinWorkingHours("2026-11-07", "12:30", 30));
  assert(!withinWorkingHours("2026-11-08", "09:00", 30));
  assert(
    !appointmentSchema().safeParse(
      input({ startTime: "23:45", durationMinutes: 30 }),
    ).success,
  );
  const custom = {
    ...developmentSchedule,
    weeklyHours: { 1: [{ start: "08:00", end: "10:00" }] },
  };
  assert(withinWorkingHours("2026-11-09", "08:00", 30, custom));
  assert(describeDevelopmentSchedule(custom).includes("08:00–10:00"));
});

test("local wall-clock parsing and duration arithmetic never roll an appointment into another date", () => {
  assert.equal(parseLocalTime("00:00"), 0);
  assert.equal(parseLocalTime("23:59"), 1439);
  assert.equal(parseLocalTime("09:30"), 570);
  for (const value of [
    "24:00",
    "09:60",
    "9:30",
    "09:30Z",
    "2026-11-09T09:30:00Z",
  ])
    assert.equal(parseLocalTime(value), null);
  assert.equal(endTime("09:45", 45), "10:30");
  assert.equal(endTime("23:30", 30), "24:00");
  assert.equal(endTime("23:30", 31), null);
  assert.equal(endTime("09:00", 0), null);
  assert.equal(formatMinutes(1440), "24:00");
  assert.throws(() => formatMinutes(1441));
});

test("Monday-first weeks and date navigation cross months, leap days and years", () => {
  assert.equal(mondayOfWeek("2026-11-07"), "2026-11-02");
  assert.equal(mondayOfWeek("2026-11-08"), "2026-11-02");
  assert.equal(mondayOfWeek("2027-01-01"), "2026-12-28");
  assert.deepEqual(weekDates("2027-01-01"), [
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
  ]);
  assert.equal(addLocalDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addLocalDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addLocalDays("2027-01-01", -1), "2026-12-31");
  assert(formatLocalDate("2027-01-01").includes("2027"));
  assert.throws(() => addLocalDays("not-a-date", 1));
});

test("half-open intervals allow adjacent appointments and reject partial, contained and full overlap", () => {
  assert(!intervalsOverlap(540, 570, 570, 600));
  assert(!intervalsOverlap(540, 540, 530, 600));
  for (const [from, to] of [
    [540, 570],
    [550, 580],
    [530, 550],
    [545, 555],
    [530, 600],
  ])
    assert(intervalsOverlap(540, 570, from, to));
  assert(
    !findAppointmentConflict(record("new", { startTime: "09:30" }), [record()]),
  );
  for (const change of [
    { startTime: "09:15" },
    { startTime: "08:45" },
    { startTime: "09:00", durationMinutes: 60 },
  ])
    assert(findAppointmentConflict(record("new", change), [record()]));
  assert(
    !findAppointmentConflict(record("new", { date: "2026-11-10" }), [record()]),
  );
});

test("only waiting, confirmed and completed statuses block, including historical entries", () => {
  for (const status of appointmentStatusValues) {
    const expected = ["EN_ATTENTE", "CONFIRME", "TERMINE"].includes(status);
    assert.equal(blocksScheduling(status), expected);
    assert.equal(
      Boolean(
        findAppointmentConflict(record("new"), [record("old", { status })]),
      ),
      expected,
    );
    if (!expected)
      assert.equal(
        findAppointmentConflict(record("new", { status }), [record()]),
        undefined,
      );
  }
  assert(
    findAppointmentConflict(record("new", { date: "2020-01-06" }), [
      record("old", { date: "2020-01-06", status: "TERMINE" }),
    ]),
  );
});

test("conflict lookup excludes the edited id, preserves input and deterministically identifies a time", () => {
  const appointments = [record("b"), record("a")];
  const before = structuredClone(appointments);
  assert.equal(
    findAppointmentConflict(record(), [record()], "appointment-demo-001"),
    undefined,
  );
  assert.equal(findAppointmentConflict(record("new"), appointments).id, "a");
  assert.deepEqual(appointments, before);
  assert.match(
    new AppointmentConflictError(appointments[0]).message,
    /09:00 à 09:30/,
  );
});

test("fixtures reference real mock patients and store no copied identity or Date objects", async () => {
  const patients = createInMemoryPatientRepository(patientFixtures);
  for (const appointment of appointmentFixtures) {
    assert(await patients.getById(appointment.patientId));
    assert(appointmentSchema().safeParse(appointment).success);
    assert.equal(typeof appointment.date, "string");
    assert.equal(typeof appointment.startTime, "string");
    assert(!("name" in appointment));
    assert(!("phone" in appointment));
    assert(!("medicalHistory" in appointment));
  }
});

test("creation references the shared patient repository including newly created patients", async () => {
  const patients = createInMemoryPatientRepository(patientFixtures, clock);
  const value = emptyPatientInput();
  value.identity.firstName = "Prénom fictif";
  value.identity.lastName = "Démo-RendezVous";
  const patient = await patients.create(value);
  const appointments = createInMemoryAppointmentRepository([], patients, clock);
  const created = await appointments.create(
    input({ patientId: patient.id, name: "ignored", status: "TERMINE" }),
  );
  assert.equal(created.id, "appointment-demo-001");
  assert.equal(created.status, "EN_ATTENTE");
  assert.equal(created.patientId, patient.id);
  assert(!("name" in created));
  assert.equal(created.createdAt, clock().toISOString());
  assert.equal((await patients.getById(patient.id)).treatments.length, 0);
});

test("unknown patient and appointment ids reject writes without partial changes", async () => {
  const appointments = repository();
  await assert.rejects(
    appointments.create(input({ patientId: "unknown" })),
    AppointmentPatientError,
  );
  assert.equal(await appointments.getById("unknown"), undefined);
  await assert.rejects(
    appointments.update("unknown", {}),
    AppointmentNotFoundError,
  );
  await assert.rejects(
    appointments.updateStatus("unknown", "ANNULE"),
    AppointmentNotFoundError,
  );
  assert.equal((await appointments.list()).length, 0);
});

test("concurrent creations recheck conflicts after patient lookup and keep adjacent slots", async () => {
  const appointments = repository();
  const results = await Promise.allSettled([
    appointments.create(input()),
    appointments.create(input()),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert(
    results.find((result) => result.status === "rejected").reason instanceof
      AppointmentConflictError,
  );
  await appointments.create(input({ startTime: "09:30" }));
  await appointments.create(input({ date: "2026-11-10" }));
  assert.equal((await appointments.list()).length, 3);
});

test("editing excludes its own slot, preserves status and creation metadata, and rejects conflicts atomically", async () => {
  const appointments = repository([
    record(),
    record("appointment-demo-002", { startTime: "10:00" }),
  ]);
  const updated = await appointments.update("appointment-demo-001", {
    startTime: "09:00",
    notes: "Note fictive",
    id: "injected",
    status: "ANNULE",
  });
  assert.equal(updated.id, "appointment-demo-001");
  assert.equal(updated.status, "EN_ATTENTE");
  assert.equal(updated.createdAt, clock().toISOString());
  await assert.rejects(
    appointments.update(updated.id, { startTime: "09:45" }),
    AppointmentConflictError,
  );
  await assert.rejects(
    appointments.update(updated.id, { patientId: "unknown" }),
    AppointmentPatientError,
  );
  assert.equal((await appointments.getById(updated.id)).startTime, "09:00");
});

test("cancellation and absence free a slot, preserve history and recheck reactivation", async () => {
  const appointments = repository([record()]);
  await appointments.updateStatus("appointment-demo-001", "ANNULE");
  const created = await appointments.create(input());
  await assert.rejects(
    appointments.updateStatus("appointment-demo-001", "CONFIRME"),
    AppointmentConflictError,
  );
  assert.equal(
    (await appointments.getById("appointment-demo-001")).status,
    "ANNULE",
  );
  await appointments.updateStatus(created.id, "ABSENT");
  await appointments.updateStatus("appointment-demo-001", "TERMINE");
  await assert.rejects(appointments.create(input()), AppointmentConflictError);
  assert.equal((await appointments.list()).length, 2);
  const same = await appointments.updateStatus(
    "appointment-demo-001",
    "TERMINE",
  );
  assert.equal(same.updatedAt, clock().toISOString());
});

test("repository instances and returned snapshots remain isolated", async () => {
  const seed = [record()];
  const appointments = repository(seed);
  seed[0].notes = "outside";
  const snapshot = await appointments.list();
  snapshot[0].notes = "changed";
  assert.equal((await appointments.getById(seed[0].id)).notes, "");
  await appointments.updateStatus(seed[0].id, "ABSENT");
  assert.equal((await repository([record()]).list())[0].status, "EN_ATTENTE");
});

test("historical overlaps receive distinct lanes while adjacent events regain full width", () => {
  const entries = [
    record("a", { durationMinutes: 60 }),
    record("b", { startTime: "09:15", status: "ANNULE" }),
    record("c", { startTime: "09:30", status: "ABSENT" }),
    record("d", { startTime: "10:00" }),
  ];
  const positioned = positionAppointments(entries);
  assert.equal(positioned.length, 4);
  assert(positioned.find((entry) => entry.appointment.id === "a").columns >= 2);
  assert.equal(
    positioned.find((entry) => entry.appointment.id === "d").columns,
    1,
  );
  for (const a of positioned)
    for (const b of positioned) {
      if (a === b || a.column !== b.column) continue;
      const fromA = parseLocalTime(a.appointment.startTime);
      const fromB = parseLocalTime(b.appointment.startTime);
      assert(
        !intervalsOverlap(
          fromA,
          fromA + a.appointment.durationMinutes,
          fromB,
          fromB + b.appointment.durationMinutes,
        ),
      );
    }
});

test("dashboard and patient counters derive from shared status and date data", () => {
  const statistics = appointmentDashboardStats(
    appointmentFixtures,
    "2026-11-07",
    "08:00",
  );
  assert.equal(statistics.todayCount, 3);
  assert.equal(statistics.pendingCount, 2);
  assert.equal(statistics.upcoming.length, 2);
  assert.equal(
    upcomingAppointments(appointmentFixtures, "2026-11-07", "10:00").length,
    1,
  );
  assert.equal(
    upcomingAppointments(appointmentFixtures, "2026-11-07", "12:00").length,
    0,
  );
  const ids = new Set(
    statistics.upcoming.map((appointment) => appointment.patientId),
  );
  assert.equal(
    patientIndicators(patientFixtures, "2026-11-07", ids)
      .withUpcomingAppointments,
    2,
  );
  const changed = appointmentFixtures.map((appointment) =>
    appointment.id === "appointment-demo-008"
      ? { ...appointment, status: "ANNULE" }
      : appointment,
  );
  assert.equal(
    appointmentDashboardStats(changed, "2026-11-07", "08:00").todayCount,
    2,
  );
  assert.equal(
    appointmentDashboardStats(changed, "2026-11-07", "08:00").pendingCount,
    1,
  );
});

test("patient selector reuses normalization while its projection excludes clinical and CIN values", () => {
  const values = patientFixtures.map(appointmentPatient);
  assert.equal(
    searchPatients(values, "  MERIEM    demo-idrissi ")[0].id,
    "patient-demo-003",
  );
  assert.equal(
    searchPatients(values, "demo-pat-0003")[0].id,
    "patient-demo-003",
  );
  const projection = JSON.stringify(values);
  assert(!projection.includes("DEMO-CIN"));
  assert(!projection.includes("medicalHistory"));
  assert(!projection.includes("healthQuestionnaire"));
});

test("administrative corrections expose all other statuses explicitly", () => {
  for (const status of appointmentStatusValues) {
    assert.equal(allowedStatusTransitions(status).length, 4);
    assert(!allowedStatusTransitions(status).includes(status));
  }
});
