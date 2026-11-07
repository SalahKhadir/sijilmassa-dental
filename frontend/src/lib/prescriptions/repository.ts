import type { PatientRepository } from "../patients/types.ts";
import type { ConsultationRepository } from "../consultations/types.ts";
import { prescriptionSchema, finalizedPrescriptionSchema } from "./schema.ts";
import type {
  Prescription,
  PrescriptionInput,
  PrescriptionPatient,
  PrescriptionRepository,
} from "./types.ts";
export class PrescriptionError extends Error {
  constructor(
    message: string,
    public readonly field?: "patientId" | "consultationId",
  ) {
    super(message);
    this.name = "PrescriptionError";
  }
}
export function prescriptionPatient(
  patient: Awaited<ReturnType<PatientRepository["list"]>>[number],
): PrescriptionPatient {
  return {
    id: patient.id,
    reference: patient.reference,
    name: `${patient.identity.firstName} ${patient.identity.lastName}`,
    identity: {
      firstName: patient.identity.firstName,
      lastName: patient.identity.lastName,
      gsm: patient.identity.gsm,
      landline: patient.identity.landline,
    },
  };
}
export function createInMemoryPrescriptionRepository(
  seed: readonly Prescription[],
  patients: PatientRepository,
  consultations: ConsultationRepository,
  preflight: (
    record: Prescription,
    patient: PrescriptionPatient,
  ) => Promise<void>,
  clock: () => Date = () => new Date(),
): PrescriptionRepository {
  const records = new Map(
    seed.map((record) => [record.id, structuredClone(record)]),
  );
  const medicationSequences = new Map(
    seed.map((record) => [
      record.id,
      Math.max(
        0,
        ...record.medications.map(
          (item) => Number(item.id.split("-med-")[1]) || 0,
        ),
      ),
    ]),
  );
  function editable(id: string) {
    const record = records.get(id);
    if (!record)
      throw new PrescriptionError("Cette ordonnance est introuvable.");
    if (record.status !== "BROUILLON")
      throw new PrescriptionError(
        "Cette ordonnance finalisée est en lecture seule.",
      );
    return record;
  }
  async function validateLinks(input: PrescriptionInput) {
    const [patient, consultation] = await Promise.all([
      patients.getById(input.patientId),
      input.consultationId
        ? consultations.getById(input.consultationId)
        : Promise.resolve(undefined),
    ]);
    if (!patient)
      throw new PrescriptionError("Ce patient est introuvable.", "patientId");
    if (
      input.consultationId &&
      (!consultation || consultation.patientId !== input.patientId)
    )
      throw new PrescriptionError(
        "La consultation doit appartenir au patient sélectionné.",
        "consultationId",
      );
    return prescriptionPatient(patient);
  }
  function build(
    input: PrescriptionInput,
    id: string,
    previous?: Prescription,
  ): Prescription {
    const ids = input.medications.flatMap((item) => (item.id ? [item.id] : []));
    if (
      new Set(ids).size !== ids.length ||
      ids.some((key) => !previous?.medications.some((item) => item.id === key))
    )
      throw new PrescriptionError("Une référence de ligne est invalide.");
    let sequence = medicationSequences.get(id) ?? 0;
    const medications = input.medications.map((item) => ({
      ...item,
      id: item.id ?? `${id}-med-${++sequence}`,
    }));
    const timestamp = clock().toISOString();
    const record: Prescription = {
      ...input,
      id,
      medications,
      status: "BROUILLON",
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    medicationSequences.set(id, sequence);
    records.set(id, record);
    return structuredClone(record);
  }
  return {
    async list() {
      return structuredClone(Array.from(records.values()));
    },
    async getById(id) {
      const record = records.get(id);
      return record ? structuredClone(record) : undefined;
    },
    async create(input) {
      const parsed = prescriptionSchema.parse(input);
      await validateLinks(parsed);
      const sequence =
        Math.max(
          0,
          ...Array.from(records.keys(), (id) =>
            Number(/^prescription-demo-(\d+)$/.exec(id)?.[1] ?? 0),
          ),
        ) + 1;
      return build(
        parsed,
        `prescription-demo-${String(sequence).padStart(3, "0")}`,
      );
    },
    async updateDraft(id, input) {
      editable(id);
      const parsed = prescriptionSchema.parse(input);
      await validateLinks(parsed);
      const previous = editable(id);
      if (previous.patientId !== parsed.patientId)
        throw new PrescriptionError(
          "Le patient de l’ordonnance enregistrée doit être conservé.",
          "patientId",
        );
      return build(parsed, id, previous);
    },
    async finalize(id) {
      const snapshot = structuredClone(editable(id));
      finalizedPrescriptionSchema.parse(snapshot);
      const patient = await validateLinks(snapshot);
      await preflight({ ...snapshot, status: "FINALISEE" }, patient);
      const current = editable(id);
      if (JSON.stringify(current) !== JSON.stringify(snapshot))
        throw new PrescriptionError(
          "Le brouillon a changé pendant la vérification. Relisez-le avant de finaliser.",
        );
      const timestamp = clock().toISOString();
      const record: Prescription = {
        ...current,
        status: "FINALISEE",
        finalizedAt: timestamp,
        updatedAt: timestamp,
      };
      records.set(id, record);
      return structuredClone(record);
    },
  };
}
