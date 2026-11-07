import assert from "node:assert/strict";
import test from "node:test";
import {
  prescriptionSchema,
  finalizedPrescriptionSchema,
  emptyPrescription,
  emptyMedication,
} from "../src/lib/prescriptions/schema.ts";
import {
  createInMemoryPrescriptionRepository,
  PrescriptionError,
  prescriptionPatient,
} from "../src/lib/prescriptions/repository.ts";
import { filterPrescriptions } from "../src/lib/prescriptions/selectors.ts";
import { createInMemoryPatientRepository } from "../src/lib/patients/repository.ts";
import { createInMemoryAppointmentRepository } from "../src/lib/appointments/repository.ts";
import { createInMemoryConsultationRepository } from "../src/lib/consultations/repository.ts";
import { patientFixtures } from "../src/data/patients.ts";
import { appointmentFixtures } from "../src/data/appointments.ts";
import { consultationFixtures } from "../src/data/consultations.ts";
import { prescriptionFixtures } from "../src/data/prescriptions.ts";
const clock = () => new Date("2026-11-07T10:00:00Z");
const medication = (overrides = {}) => ({
  medicationName: "Produit fictif Alpha",
  dosage: "Texte fictif",
  frequency: "Fréquence fictive",
  duration: "Durée fictive",
  instructions: "",
  ...overrides,
});
const input = (overrides = {}) => ({
  ...emptyPrescription("2026-11-07"),
  patientId: "patient-demo-001",
  ...overrides,
});
function setup(preflight = async () => {}) {
  const patients = createInMemoryPatientRepository(patientFixtures, clock);
  const appointments = createInMemoryAppointmentRepository(
    appointmentFixtures,
    patients,
  );
  const consultations = createInMemoryConsultationRepository(
    consultationFixtures,
    patients,
    appointments,
  );
  return {
    patients,
    consultations,
    repository: createInMemoryPrescriptionRepository(
      prescriptionFixtures,
      patients,
      consultations,
      preflight,
      clock,
    ),
  };
}
test("prescription drafts allow incomplete lines but require a patient and explicit valid date", () => {
  assert(prescriptionSchema.safeParse(input()).success);
  assert(
    prescriptionSchema.safeParse(input({ medications: [emptyMedication()] }))
      .success,
  );
  for (const record of [
    input({ patientId: "" }),
    input({ issuedDate: "2026-02-30" }),
    input({ medications: [medication({ medicationName: "x".repeat(201) })] }),
    input({ generalInstructions: "x".repeat(2001) }),
    input({ medications: Array.from({ length: 21 }, () => medication()) }),
  ])
    assert(!prescriptionSchema.safeParse(record).success);
  assert(
    prescriptionSchema.safeParse(input({ issuedDate: "2020-01-01" })).success,
  );
});
test("finalization requires every medication line to have four complete fields", () => {
  assert(!finalizedPrescriptionSchema.safeParse(input()).success);
  for (const field of ["medicationName", "dosage", "frequency", "duration"])
    assert(
      !finalizedPrescriptionSchema.safeParse(
        input({ medications: [medication(), medication({ [field]: " " })] }),
      ).success,
    );
  assert(
    finalizedPrescriptionSchema.safeParse(
      input({ medications: [medication()] }),
    ).success,
  );
});
test("deterministic fixtures retain valid patient and consultation references and no clinical copies", () => {
  for (const record of prescriptionFixtures) {
    assert(prescriptionSchema.safeParse(record).success);
    assert(patientFixtures.some((patient) => patient.id === record.patientId));
    if (record.consultationId)
      assert(
        consultationFixtures.some(
          (consultation) =>
            consultation.id === record.consultationId &&
            consultation.patientId === record.patientId,
        ),
      );
    if (record.status === "FINALISEE")
      assert(finalizedPrescriptionSchema.safeParse(record).success);
    assert(!("medicalHistory" in record));
    assert(!("pdf" in record));
  }
});
test("drafts can be saved incomplete then edited, reordered and reduced with stable medication ids", async () => {
  const { repository } = setup();
  const created = await repository.create(input());
  assert.equal(created.status, "BROUILLON");
  const first = await repository.updateDraft(created.id, {
    ...created,
    medications: [
      medication(),
      medication({ medicationName: "Produit fictif B" }),
    ],
  });
  const reordered = await repository.updateDraft(created.id, {
    ...first,
    medications: [...first.medications].reverse(),
  });
  assert.equal(reordered.medications[0].id, first.medications[1].id);
  const reduced = await repository.updateDraft(created.id, {
    ...reordered,
    medications: [reordered.medications[0]],
  });
  const expanded = await repository.updateDraft(created.id, {
    ...reduced,
    medications: [...reduced.medications, medication()],
  });
  assert(
    !first.medications.some((item) => item.id === expanded.medications[1].id),
  );
  assert.equal(expanded.createdAt, created.createdAt);
  assert.equal(expanded.patientId, created.patientId);
  await assert.rejects(
    repository.updateDraft(created.id, {
      ...expanded,
      patientId: "patient-demo-002",
    }),
    PrescriptionError,
  );
  await assert.rejects(
    repository.updateDraft(created.id, {
      ...expanded,
      medications: [expanded.medications[0], expanded.medications[0]],
    }),
    PrescriptionError,
  );
  await assert.rejects(
    repository.updateDraft(created.id, {
      ...expanded,
      medications: [medication({ id: "foreign" })],
    }),
    PrescriptionError,
  );
});
test("finalization validates pdf output before locking the record and writes its timestamp", async () => {
  let checked = false;
  const { repository } = setup(async (record, patient) => {
    checked = true;
    assert.equal(record.status, "FINALISEE");
    assert.equal(patient.id, record.patientId);
  });
  const record = await repository.create(
    input({ medications: [medication()] }),
  );
  const finalized = await repository.finalize(record.id);
  assert(checked);
  assert.equal(finalized.status, "FINALISEE");
  assert.equal(finalized.finalizedAt, clock().toISOString());
  await assert.rejects(
    repository.updateDraft(record.id, {
      ...finalized,
      generalInstructions: "Change",
    }),
    /lecture seule/,
  );
  await assert.rejects(repository.finalize(record.id), /lecture seule/);
});
test("invalid pdf output or incomplete medication never finalizes the draft", async () => {
  const { repository } = setup(async () => {
    throw new Error("PDF overflow");
  });
  const complete = await repository.create(
    input({ medications: [medication()] }),
  );
  await assert.rejects(repository.finalize(complete.id), /PDF overflow/);
  assert.equal((await repository.getById(complete.id)).status, "BROUILLON");
  const empty = await repository.create(input());
  await assert.rejects(repository.finalize(empty.id));
});
test("editing during pdf preflight is detected and simultaneous finalizations cannot rewrite a finalized record", async () => {
  let resolve;
  const gate = new Promise((done) => {
    resolve = done;
  });
  const { repository } = setup(async () => gate);
  const record = await repository.create(
    input({ medications: [medication()] }),
  );
  const pending = repository.finalize(record.id);
  await repository.updateDraft(record.id, {
    ...record,
    generalInstructions: "Texte corrigé",
  });
  resolve();
  await assert.rejects(pending, /brouillon a changé/);
  const results = await Promise.allSettled([
    repository.finalize(record.id),
    repository.finalize(record.id),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
});
test("patient and consultation checks reject invalid links while allowing multiple prescriptions for one consultation", async () => {
  const { repository, consultations } = setup();
  await assert.rejects(
    repository.create(input({ patientId: "missing" })),
    /patient est introuvable/,
  );
  await assert.rejects(
    repository.create(input({ consultationId: "missing" })),
    /consultation doit appartenir/,
  );
  await assert.rejects(
    repository.create(input({ consultationId: "consultation-demo-002" })),
    /consultation doit appartenir/,
  );
  const before = await consultations.getById("consultation-demo-001");
  const records = await Promise.all([
    repository.create(input({ consultationId: before.id })),
    repository.create(input({ consultationId: before.id })),
  ]);
  assert.notEqual(records[0].id, records[1].id);
  assert.deepEqual(await consultations.getById(before.id), before);
});
test("unknown ids, new patients, snapshots and instances keep shared mock state consistent", async () => {
  const { repository, patients } = setup();
  assert.equal(await repository.getById("missing"), undefined);
  await assert.rejects(
    repository.updateDraft("missing", input()),
    /introuvable/,
  );
  await assert.rejects(repository.finalize("missing"), /introuvable/);
  const patient = await patients.create(patientFixtures[0]);
  assert.equal(
    (await repository.create(input({ patientId: patient.id }))).patientId,
    patient.id,
  );
  const records = await repository.list();
  records[0].medications[0].medicationName = "Outside";
  assert.notEqual(
    (await repository.getById(records[0].id)).medications[0].medicationName,
    "Outside",
  );
  assert.equal(
    (await setup().repository.list()).length,
    prescriptionFixtures.length,
  );
});
test("directory filters date range and status, searches patient identity or phone and keeps deterministic sort", () => {
  const patients = patientFixtures.map(prescriptionPatient);
  const query = { search: "", status: "all", from: "", to: "", sort: "newest" };
  assert.equal(
    filterPrescriptions(prescriptionFixtures, patients, query).length,
    8,
  );
  assert.equal(
    filterPrescriptions(prescriptionFixtures, patients, {
      ...query,
      status: "FINALISEE",
    }).length,
    4,
  );
  assert(
    filterPrescriptions(prescriptionFixtures, patients, {
      ...query,
      from: "2026-11-03",
      to: "2026-11-04",
    }).every(
      (record) =>
        record.issuedDate >= "2026-11-03" && record.issuedDate <= "2026-11-04",
    ),
  );
  assert.equal(
    filterPrescriptions(prescriptionFixtures, patients, {
      ...query,
      search: patientFixtures[0].reference,
    }).length,
    1,
  );
  assert.equal(
    filterPrescriptions(prescriptionFixtures, patients, {
      ...query,
      search: "Produit fictif",
    }).length,
    0,
  );
  const projection = patients[0];
  assert(!("medicalHistory" in projection));
  assert(!("cin" in projection.identity));
});
