import assert from "node:assert/strict";
import test from "node:test";
import { patientFixtures } from "../src/data/patients.ts";
import {
  patientSchema,
  emptyPatientInput,
} from "../src/lib/patients/schema.ts";
import { clinicDate, isCalendarDate } from "../src/lib/patients/dates.ts";
import {
  filterAndSortPatients,
  normalizeSearch,
  searchPatients,
  paginatePatients,
  patientIndicators,
} from "../src/lib/patients/directory.ts";
import {
  createInMemoryPatientRepository,
  nextPatientSequence,
  PatientNotFoundError,
} from "../src/lib/patients/repository.ts";
import { maskCIN, patientDirectoryEntry } from "../src/lib/patients/privacy.ts";

const today = "2026-11-07";
function validInput() {
  const value = emptyPatientInput();
  value.identity.firstName = "Prénom fictif";
  value.identity.lastName = "Nom Démo";
  return value;
}

test("all twenty fixtures conform to the dossier schema and remain explicitly fictional", () => {
  assert.equal(patientFixtures.length, 20);
  for (const patient of patientFixtures) {
    assert(patientSchema(today).safeParse(patient).success, patient.reference);
    assert.match(patient.identity.lastName, /Démo/);
    assert(!patient.identity.gsm || patient.identity.gsm.includes("X"));
    assert(!patient.identity.cin || patient.identity.cin.startsWith("DEMO-"));
    for (const entry of patient.treatments) {
      assert(Number.isSafeInteger(entry.priceCentimes));
      assert(Number.isSafeInteger(entry.receivedCentimes));
    }
  }
});

test("identity is required, optional answers remain unanswered, and names are normalized", () => {
  const schema = patientSchema(today);
  assert(!schema.safeParse(emptyPatientInput()).success);
  const input = validInput();
  input.identity.firstName = "  Prénom   fictif  ";
  const result = schema.parse(input);
  assert.equal(result.identity.firstName, "Prénom fictif");
  assert.deepEqual(result.medicalHistory.conditions, []);
  assert.equal(result.healthQuestionnaire.pregnant, "unanswered");
  assert.equal(result.healthQuestionnaire.underMedicalTreatment, "unanswered");
  input.identity.sex = "M";
  assert.equal(schema.parse(input).healthQuestionnaire.pregnant, "unanswered");
  input.healthQuestionnaire.pregnant = "no";
  assert.equal(schema.parse(input).healthQuestionnaire.pregnant, "no");
});

test("dates, international and masked phones, field lengths, and category values are validated", () => {
  const schema = patientSchema(today);
  for (const date of ["2027-01-01", "2026-02-30", "not-a-date"]) {
    const input = validInput();
    input.identity.dateOfBirth = date;
    assert(!schema.safeParse(input).success);
  }
  assert(isCalendarDate("2000-02-29"));
  assert(!isCalendarDate("2001-02-29"));
  for (const phone of [
    "06 12 34 56 78",
    "+212 (6) 12-34-56-78",
    "+33 1 23 45 67 89",
    "+212 6XX XX 00 01",
    "",
  ]) {
    const input = validInput();
    input.identity.gsm = phone;
    assert(schema.safeParse(input).success);
  }
  for (const phone of ["abc", "123", "1".repeat(41)]) {
    const input = validInput();
    input.identity.landline = phone;
    assert(!schema.safeParse(input).success);
  }
  const input = validInput();
  input.identity.lastName = "a".repeat(81);
  assert(!schema.safeParse(input).success);
  input.identity.lastName = "Démo";
  input.medicalHistory.conditions = ["Inconnu"];
  assert(!schema.safeParse(input).success);
});

test("medical and allergy selections preserve reported versus unanswered states", () => {
  const schema = patientSchema(today);
  const input = validInput();
  input.medicalHistory.conditions = ["Cardiaque", "Autres"];
  assert(!schema.safeParse(input).success);
  input.medicalHistory.reportStatus = "reported";
  input.medicalHistory.otherDetails = "Précision fictive";
  input.allergies.reportStatus = "reported";
  input.allergies.categories = ["Aliment"];
  const result = schema.parse(input);
  assert.deepEqual(result.medicalHistory.conditions, ["Cardiaque", "Autres"]);
  assert.deepEqual(result.allergies.categories, ["Aliment"]);
  input.medicalHistory.conditions = ["Cardiaque", "Cardiaque"];
  assert(!schema.safeParse(input).success);
  input.medicalHistory.conditions = [];
  input.medicalHistory.otherDetails = "";
  assert(schema.safeParse(input).success);
  input.healthQuestionnaire.pregnant = "";
  assert(!schema.safeParse(input).success);
});

test("search ignores accents, case, and repeated whitespace without searching CIN or health data", () => {
  assert.equal(normalizeSearch("  MÉRIEM   Démo  "), "meriem demo");
  assert.deepEqual(
    searchPatients(patientFixtures, " MERIEM   DEMO-IDRISSI ").map((p) => p.id),
    ["patient-demo-003"],
  );
  assert.equal(
    searchPatients(patientFixtures, "demo-pat-0003")[0].id,
    "patient-demo-003",
  );
  const patient = structuredClone(patientFixtures[0]);
  patient.identity.gsm = "+212 (6) 12-34-56-78";
  patient.identity.landline = "+212 (5) 33-44-55-66";
  patient.identity.cin = "PRIVATE-CIN-SENTINEL";
  patient.healthQuestionnaire.additionalInformation = "PRIVATE-HEALTH-SENTINEL";
  assert.equal(searchPatients([patient], "612345678").length, 1);
  assert.equal(searchPatients([patient], "533 44 55").length, 1);
  assert.equal(searchPatients([patient], "PRIVATE-CIN-SENTINEL").length, 0);
  assert.equal(searchPatients([patient], "PRIVATE-HEALTH-SENTINEL").length, 0);
  assert.equal(searchPatients([patient], "   ").length, 1);
  assert.equal(searchPatients([patient], "+").length, 0);
});

test("sorts and status filters are stable and do not mutate fixtures", () => {
  const before = patientFixtures.map((p) => p.id);
  const query = { search: "", status: "inactive", sort: "name" };
  const inactive = filterAndSortPatients(patientFixtures, query);
  assert.equal(inactive.length, 4);
  assert(inactive.every((p) => p.status === "inactive"));
  const newest = filterAndSortPatients(patientFixtures, {
    ...query,
    status: "all",
    sort: "newest",
  });
  const oldest = filterAndSortPatients(patientFixtures, {
    ...query,
    status: "all",
    sort: "oldest",
  });
  assert(newest[0].createdAt >= newest.at(-1).createdAt);
  assert(oldest[0].createdAt <= oldest.at(-1).createdAt);
  const ties = [
    structuredClone(patientFixtures[0]),
    structuredClone(patientFixtures[0]),
  ];
  ties[0].id = "first";
  ties[1].id = "second";
  for (const sort of ["name", "newest", "oldest"]) {
    assert.deepEqual(
      filterAndSortPatients(ties, { ...query, status: "all", sort }).map(
        (p) => p.id,
      ),
      ["first", "second"],
    );
  }
  assert.deepEqual(
    patientFixtures.map((p) => p.id),
    before,
  );
});

test("pagination clamps bounds and handles empty data and invalid numeric inputs", () => {
  const page = paginatePatients(patientFixtures, 2, 10);
  assert.equal(page.items.length, 10);
  assert.equal(page.first, 11);
  assert.equal(page.last, 20);
  assert.equal(paginatePatients(patientFixtures, 99, 10).page, 2);
  assert.equal(paginatePatients(patientFixtures, -1, 10).page, 1);
  assert.equal(paginatePatients([], 9, 10).first, 0);
  assert.equal(paginatePatients([], 9, 10).pageCount, 1);
  assert.equal(paginatePatients(patientFixtures, NaN, NaN).items.length, 10);
});

test("indicator dates use the clinic timezone and exclude future registrations", () => {
  const indicators = patientIndicators(patientFixtures, today);
  assert.equal(indicators.total, 20);
  assert.equal(indicators.newThisMonth, 5);
  const patient = structuredClone(patientFixtures[0]);
  patient.createdAt = "2026-11-01T10:00:00Z";
  assert.equal(clinicDate(new Date(patient.createdAt)), "2026-11-01");
  assert.equal(patientIndicators([patient], "2026-11-01").newThisMonth, 1);
  assert.equal(patientIndicators([patient], "2026-10-31").newThisMonth, 0);
});

test("references are deterministic and concurrent mock creates retain every dossier", async () => {
  assert.equal(nextPatientSequence([]), 1);
  assert.equal(nextPatientSequence(patientFixtures), 21);
  const repository = createInMemoryPatientRepository(
    patientFixtures,
    () => new Date("2026-11-07T10:00:00Z"),
  );
  const [first, second] = await Promise.all([
    repository.create(validInput()),
    repository.create(validInput()),
  ]);
  assert.equal(first.reference, "DEMO-PAT-0021");
  assert.equal(second.reference, "DEMO-PAT-0022");
  assert.equal((await repository.list()).length, 22);
  assert.equal(first.createdAt, "2026-11-07T10:00:00.000Z");
  assert.deepEqual(first.treatments, []);
  assert.equal(
    (await createInMemoryPatientRepository(patientFixtures).list()).length,
    20,
  );
});

test("updates preserve identity, references, clinical data and read-only treatment examples", async () => {
  let now = new Date("2026-11-07T10:00:00Z");
  const repository = createInMemoryPatientRepository(
    patientFixtures,
    () => now,
  );
  const original = await repository.getById("patient-demo-003");
  now = new Date("2026-11-07T11:00:00Z");
  const updated = await repository.update(original.id, {
    identity: { firstName: "Prénom modifié fictif" },
    status: "inactive",
    id: "injected",
    reference: "injected",
    treatments: [],
  });
  assert.equal(updated.id, original.id);
  assert.equal(updated.reference, original.reference);
  assert.equal(updated.createdAt, original.createdAt);
  assert.equal(updated.updatedAt, now.toISOString());
  assert.equal(updated.identity.lastName, original.identity.lastName);
  assert.deepEqual(updated.medicalHistory, original.medicalHistory);
  assert.deepEqual(updated.treatments, original.treatments);
  const clinical = { ...updated.healthQuestionnaire, pregnant: "no" };
  assert.equal(
    (await repository.update(updated.id, { healthQuestionnaire: clinical }))
      .healthQuestionnaire.pregnant,
    "no",
  );
  const copy = await repository.list();
  copy[0].identity.firstName = "outside mutation";
  copy[0].treatments.length = 0;
  assert.notEqual(
    (await repository.list())[0].identity.firstName,
    "outside mutation",
  );
  assert.equal((await repository.list())[0].treatments.length, 2);
  const size = (await repository.list()).length;
  await assert.rejects(repository.create(emptyPatientInput()));
  await assert.rejects(
    repository.update(original.id, { identity: { firstName: "" } }),
  );
  assert.equal((await repository.list()).length, size);
  assert.equal(
    (await repository.getById(original.id)).identity.firstName,
    "Prénom modifié fictif",
  );
});

test("unknown ids have explicit lookup and update behavior", async () => {
  const repository = createInMemoryPatientRepository([]);
  assert.equal(await repository.getById("unknown"), undefined);
  await assert.rejects(repository.update("unknown", {}), PatientNotFoundError);
});

test("directory projection and CIN masking exclude sensitive fields", () => {
  const patient = patientFixtures[2];
  const summary = patientDirectoryEntry(patient);
  assert.equal(maskCIN(patient.identity.cin), "•••••• (masquée)");
  assert.equal(maskCIN(""), "Non renseignée");
  assert(!JSON.stringify(summary).includes(patient.identity.cin));
  assert(!("medicalHistory" in summary));
  assert(!("allergies" in summary));
  assert(!("healthQuestionnaire" in summary));
  assert(!("treatments" in summary));
});
