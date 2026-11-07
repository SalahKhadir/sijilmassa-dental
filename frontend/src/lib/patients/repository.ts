import type {
  CreatePatientInput,
  Patient,
  PatientRepository,
  UpdatePatientInput,
} from "./types.ts";
import { patientSchema } from "./schema.ts";
import { clinicDate } from "./dates.ts";

export class PatientNotFoundError extends Error {
  constructor() {
    super("Ce dossier patient est introuvable.");
    this.name = "PatientNotFoundError";
  }
}
export function nextPatientSequence(patients: readonly Patient[]): number {
  return (
    patients.reduce((maximum, patient) => {
      const number = /^DEMO-PAT-(\d+)$/.exec(patient.reference);
      return Math.max(maximum, number ? Number(number[1]) : 0);
    }, 0) + 1
  );
}

/** Isolated per browser provider. Values are cloned at every boundary.
 * Mutations finish before their promises resolve, including concurrent creates.
 */
export function createInMemoryPatientRepository(
  seed: readonly Patient[],
  clock: () => Date = () => new Date(),
): PatientRepository {
  const records = new Map(
    seed.map((patient) => [patient.id, structuredClone(patient)]),
  );
  return {
    async list() {
      return structuredClone(Array.from(records.values()));
    },
    async getById(id) {
      const patient = records.get(id);
      return patient ? structuredClone(patient) : undefined;
    },
    async create(input: CreatePatientInput) {
      const now = clock();
      const details = patientSchema(clinicDate(now)).parse(input);
      let sequence = nextPatientSequence(Array.from(records.values()));
      while (records.has(`patient-demo-${String(sequence).padStart(3, "0")}`))
        sequence += 1;
      const timestamp = now.toISOString();
      const patient: Patient = {
        ...details,
        id: `patient-demo-${String(sequence).padStart(3, "0")}`,
        reference: `DEMO-PAT-${String(sequence).padStart(4, "0")}`,
        createdAt: timestamp,
        updatedAt: timestamp,
        treatments: [],
      };
      records.set(patient.id, patient);
      return structuredClone(patient);
    },
    async update(id: string, input: UpdatePatientInput) {
      const existing = records.get(id);
      if (!existing) throw new PatientNotFoundError();
      const now = clock();
      const details = patientSchema(clinicDate(now)).parse({
        ...existing,
        ...input,
        identity: { ...existing.identity, ...input.identity },
      });
      const patient: Patient = {
        ...existing,
        ...details,
        updatedAt: now.toISOString(),
      };
      records.set(id, patient);
      return structuredClone(patient);
    },
  };
}
