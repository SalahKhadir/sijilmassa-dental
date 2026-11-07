import assert from "node:assert/strict";
import test from "node:test";
import {
  policySchema,
  insuranceDraftSchema,
  insuredPersonSchema,
  dentalInsuranceActSchema,
} from "../src/lib/insurance/schema.ts";
import {
  createInMemoryInsuranceRepository,
  InsuranceError,
} from "../src/lib/insurance/repository.ts";
import {
  insurancePolicyFixtures,
  insuranceDraftFixtures,
} from "../src/data/insurance.ts";
import { createInMemoryPatientRepository } from "../src/lib/patients/repository.ts";
import { patientFixtures } from "../src/data/patients.ts";
import { createInMemoryAppointmentRepository } from "../src/lib/appointments/repository.ts";
import { appointmentFixtures } from "../src/data/appointments.ts";
import { createInMemoryConsultationRepository } from "../src/lib/consultations/repository.ts";
import { consultationFixtures } from "../src/data/consultations.ts";

const clock = () => new Date("2026-11-07T12:00:00Z");

function setupRepositories() {
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
  const insurance = createInMemoryInsuranceRepository(
    insurancePolicyFixtures,
    insuranceDraftFixtures,
    patients,
    consultations,
    clock,
  );

  return { patients, consultations, insurance };
}

test("insuredPersonSchema validates insured person profiles", () => {
  const valid = {
    isPatient: true,
    firstName: "Aïcha",
    lastName: "Amrani",
    cin: "AB123456",
    address: "Témara",
    phone: "0600000000",
    relationship: "LUI_MEME",
  };
  assert.doesNotThrow(() => insuredPersonSchema.parse(valid));

  // Empty first name should throw
  assert.throws(() =>
    insuredPersonSchema.parse({
      ...valid,
      firstName: "",
    }),
  );

  // Invalid relationship should throw
  assert.throws(() =>
    insuredPersonSchema.parse({
      ...valid,
      relationship: "INVALIDE",
    }),
  );
});

test("policySchema validates CNSS, CNOPS, and FAR policies", () => {
  const cnssPolicy = {
    patientId: "patient-demo-001",
    provider: "CNSS",
    registrationNumber: "182930419",
    insuredPerson: {
      isPatient: true,
      firstName: "Aïcha",
      lastName: "Amrani",
      cin: "AB123456",
      address: "Errachidia",
      phone: "+212 600000001",
      relationship: "LUI_MEME",
    },
  };
  assert.doesNotThrow(() => policySchema.parse(cnssPolicy));

  const cnopsPolicy = {
    patientId: "patient-demo-002",
    provider: "CNOPS",
    registrationNumber: "098765432",
    affiliationNumber: "1234567890",
    insuredPerson: {
      isPatient: false,
      firstName: "Mohamed",
      lastName: "Alami",
      cin: "CD789012",
      address: "Témara",
      phone: "+212 600000002",
      relationship: "CONJOINT",
    },
  };
  assert.doesNotThrow(() => policySchema.parse(cnopsPolicy));

  const farPolicy = {
    patientId: "patient-demo-003",
    provider: "FAR",
    registrationNumber: "77654321",
    militaryAccountNumber: "1234567",
    militaryRank: "Adjudant-chef",
    militaryUnit: "1er B.I.M.",
    insuredPerson: {
      isPatient: true,
      firstName: "Rachid",
      lastName: "Bennani",
      cin: "EF345678",
      address: "Salé",
      phone: "+212 600000003",
      relationship: "LUI_MEME",
    },
  };
  assert.doesNotThrow(() => policySchema.parse(farPolicy));

  // Invalid provider should throw
  assert.throws(() =>
    policySchema.parse({
      ...cnssPolicy,
      provider: "UNKNOWN",
    }),
  );
});

test("dentalInsuranceActSchema validates individual acts", () => {
  const act = {
    treatmentDate: "2026-10-10",
    toothReference: "16",
    description: "Obturation composite 3 faces",
    actCode: "SC12",
    ngapKeyLetter: "SC",
    ngapCoefficient: 12,
    amountMinor: 40000,
  };
  assert.doesNotThrow(() => dentalInsuranceActSchema.parse(act));

  // Invalid date format
  assert.throws(() =>
    dentalInsuranceActSchema.parse({
      ...act,
      treatmentDate: "10/10/2026",
    }),
  );

  // Missing description
  assert.throws(() =>
    dentalInsuranceActSchema.parse({
      ...act,
      description: "",
    }),
  );
});

test("insuranceDraftSchema validates complete drafts with provider details", () => {
  const draftInput = {
    patientId: "patient-demo-001",
    provider: "CNSS",
    status: "BROUILLON",
    documentPurpose: "EXECUTION",
    acts: [
      {
        treatmentDate: "2026-10-10",
        toothReference: "16",
        description: "Obturation composite",
        actCode: "SC12",
        amountMinor: 40000,
      },
    ],
    cnssDetails: {
      careTypes: ["SOINS_600"],
      priorAuthorizationNumber: "AP-1234",
    },
    manualFields: {
      totalFeesMinor: 40000,
      declarationPlace: "Témara",
      declarationDate: "2026-10-10",
    },
  };
  assert.doesNotThrow(() => insuranceDraftSchema.parse(draftInput));
});

test("InsuranceRepository loads seeded fixtures accurately", async () => {
  const { insurance } = setupRepositories();

  const policies = await insurance.listPolicies();
  assert.equal(policies.length, insurancePolicyFixtures.length);

  const drafts = await insurance.listDrafts();
  assert.equal(drafts.length, insuranceDraftFixtures.length);

  const p1Policies = await insurance.getPoliciesByPatientId("patient-demo-001");
  assert.equal(p1Policies.length, 1);
  assert.equal(p1Policies[0].provider, "CNSS");
  assert.equal(p1Policies[0].registrationNumber, "182930419");
});

test("InsuranceRepository creates, updates, and deletes policies", async () => {
  const { insurance } = setupRepositories();

  const created = await insurance.createPolicy({
    patientId: "patient-demo-004",
    provider: "CNOPS",
    registrationNumber: "555444333",
    affiliationNumber: "999888777",
    insuredPerson: {
      isPatient: true,
      firstName: "Karim",
      lastName: "Tazi",
      cin: "CD998877",
      address: "Rabat",
      phone: "+212 600000004",
      relationship: "LUI_MEME",
    },
    active: true,
  });

  assert.ok(created.id);
  assert.equal(created.patientId, "patient-demo-004");
  assert.equal(created.provider, "CNOPS");

  const fetched = await insurance.getPolicyById(created.id);
  assert.ok(fetched);
  assert.equal(fetched.registrationNumber, "555444333");

  const updated = await insurance.updatePolicy(created.id, {
    registrationNumber: "555444333-REV",
  });
  assert.equal(updated.registrationNumber, "555444333-REV");

  const deleted = await insurance.deletePolicy(created.id);
  assert.equal(deleted, true);

  const gone = await insurance.getPolicyById(created.id);
  assert.equal(gone, undefined);
});

test("InsuranceRepository checks patient existence when creating policy", async () => {
  const { insurance } = setupRepositories();

  await assert.rejects(
    async () => {
      await insurance.createPolicy({
        patientId: "patient-nonexistent-999",
        provider: "CNSS",
        insuredPerson: {
          isPatient: true,
          firstName: "Inconnu",
          lastName: "Inconnu",
          cin: "",
          address: "",
          phone: "",
          relationship: "LUI_MEME",
        },
        active: true,
      });
    },
    (err) => err instanceof InsuranceError && err.field === "patientId",
  );
});

test("InsuranceRepository creates, updates, and deletes drafts", async () => {
  const { insurance } = setupRepositories();

  const createdDraft = await insurance.createDraft({
    patientId: "patient-demo-001",
    provider: "CNSS",
    status: "BROUILLON",
    documentPurpose: "EXECUTION",
    acts: [
      {
        treatmentDate: "2026-11-01",
        toothReference: "21",
        description: "Détartrage complet",
        actCode: "D10",
        amountMinor: 30000,
      },
    ],
    cnssDetails: {
      careTypes: ["SOINS_600"],
    },
    manualFields: {
      declarationPlace: "Témara",
      declarationDate: "2026-11-01",
      totalFeesMinor: 30000,
    },
  });

  assert.ok(createdDraft.id);
  assert.equal(createdDraft.acts.length, 1);
  assert.ok(createdDraft.acts[0].id, "Act ID was auto-generated");

  const fetched = await insurance.getDraftById(createdDraft.id);
  assert.ok(fetched);
  assert.equal(fetched.status, "BROUILLON");

  const updated = await insurance.updateDraft(createdDraft.id, {
    status: "VALIDE",
  });
  assert.equal(updated.status, "VALIDE");

  const deleted = await insurance.deleteDraft(createdDraft.id);
  assert.equal(deleted, true);

  const missing = await insurance.getDraftById(createdDraft.id);
  assert.equal(missing, undefined);
});

test("InsuranceRepository ensures clone isolation", async () => {
  const { insurance } = setupRepositories();

  const draft = await insurance.getDraftById("draft-ins-demo-001");
  assert.ok(draft);

  // Attempt in-place mutation
  draft.acts.push({
    id: "mutated-act",
    treatmentDate: "2026-11-07",
    description: "Mutated Act",
    amountMinor: 999999,
  });

  // Re-fetch must not reflect the mutation
  const pristine = await insurance.getDraftById("draft-ins-demo-001");
  assert.ok(pristine);
  assert.equal(pristine.acts.some((a) => a.id === "mutated-act"), false);
});
