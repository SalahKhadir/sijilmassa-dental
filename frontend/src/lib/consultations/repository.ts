import type { PatientRepository } from "../patients/types.ts";
import type { AppointmentRepository } from "../appointments/types.ts";
import type {
  Consultation,
  ConsultationInput,
  ConsultationRepository,
  TreatmentEntry,
} from "./types.ts";
import { consultationSchema } from "./schema.ts";
export class ClinicalRecordError extends Error {
  constructor(
    message: string,
    public readonly field?: "patientId" | "appointmentId",
  ) {
    super(message);
    this.name = "ClinicalRecordError";
  }
}
export class LinkedConsultationError extends ClinicalRecordError {
  constructor(public readonly consultationId: string) {
    super(
      "Ce rendez-vous possède déjà une consultation. Ouvrez la consultation existante.",
      "appointmentId",
    );
  }
}
export function createInMemoryConsultationRepository(
  seed: readonly Consultation[],
  patients: PatientRepository,
  appointments: AppointmentRepository,
  clock: () => Date = () => new Date(),
): ConsultationRepository {
  const records = new Map(
    seed.map((record) => [record.id, structuredClone(record)]),
  );
  const pendingLinks = new Map<string, number>();
  function existing(id: string) {
    const record = records.get(id);
    if (!record)
      throw new ClinicalRecordError("Cette consultation est introuvable.");
    return record;
  }
  function editable(id: string) {
    const record = existing(id);
    if (record.status !== "BROUILLON")
      throw new ClinicalRecordError(
        "Cette consultation terminée est en lecture seule.",
      );
    return record;
  }
  async function validateLinks(input: ConsultationInput) {
    const [patient, appointment] = await Promise.all([
      patients.getById(input.patientId),
      input.appointmentId
        ? appointments.getById(input.appointmentId)
        : Promise.resolve(undefined),
    ]);
    if (!patient)
      throw new ClinicalRecordError("Ce patient est introuvable.", "patientId");
    if (
      input.appointmentId &&
      (!appointment || appointment.patientId !== input.patientId)
    )
      throw new ClinicalRecordError(
        "Le rendez-vous doit exister et appartenir au patient sélectionné.",
        "appointmentId",
      );
  }
  async function validatedWrite(
    input: ConsultationInput,
    write: () => Consultation,
  ) {
    const key = input.appointmentId;
    if (key) pendingLinks.set(key, (pendingLinks.get(key) ?? 0) + 1);
    try {
      await validateLinks(input);
      return write();
    } finally {
      const remaining = (pendingLinks.get(key) ?? 1) - 1;
      if (remaining > 0) pendingLinks.set(key, remaining);
      else pendingLinks.delete(key);
    }
  }
  function uniqueLink(input: ConsultationInput, excludeId?: string) {
    const duplicate =
      input.appointmentId &&
      Array.from(records.values()).find(
        (record) =>
          record.id !== excludeId &&
          record.appointmentId === input.appointmentId,
      );
    if (duplicate) throw new LinkedConsultationError(duplicate.id);
  }
  function treatments(
    input: ConsultationInput,
    id: string,
    timestamp: string,
    previous: readonly TreatmentEntry[] = [],
  ) {
    const ids = input.treatments.flatMap((entry) =>
      entry.id ? [entry.id] : [],
    );
    if (
      new Set(ids).size !== ids.length ||
      ids.some((key) => !previous.some((entry) => entry.id === key))
    )
      throw new ClinicalRecordError("Une référence de soin est invalide.");
    if (previous.some((entry) => !ids.includes(entry.id)))
      throw new ClinicalRecordError(
        "Les soins déjà enregistrés doivent être conservés dans ce prototype.",
      );
    let sequence = Math.max(
      0,
      ...previous.map((entry) => Number(entry.id.split("-care-")[1]) || 0),
    );
    return input.treatments.map((entry) => {
      const old = previous.find((item) => item.id === entry.id);
      if (
        old &&
        old.treatmentDate === entry.treatmentDate &&
        old.description === entry.description &&
        old.toothReference === entry.toothReference &&
        old.notes === entry.notes
      )
        return old;
      return {
        ...entry,
        id: old?.id ?? `${id}-care-${++sequence}`,
        consultationId: id,
        createdAt: old?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
    });
  }
  return {
    canReassignAppointment(appointmentId) {
      return (
        !pendingLinks.has(appointmentId) &&
        !Array.from(records.values()).some(
          (record) => record.appointmentId === appointmentId,
        )
      );
    },
    linkedConsultationId(appointmentId) {
      return Array.from(records.values()).find(
        (record) => record.appointmentId === appointmentId,
      )?.id;
    },
    async list() {
      return structuredClone(Array.from(records.values()));
    },
    async getById(id) {
      const record = records.get(id);
      return record ? structuredClone(record) : undefined;
    },
    async create(input) {
      const parsed = consultationSchema.parse(input);
      return validatedWrite(parsed, () => {
        // Duplicate detection and insertion are synchronous after reference validation.
        uniqueLink(parsed);
        const sequence =
          Math.max(
            0,
            ...Array.from(records.keys(), (id) =>
              Number(/^consultation-demo-(\d+)$/.exec(id)?.[1] ?? 0),
            ),
          ) + 1;
        const id = `consultation-demo-${String(sequence).padStart(3, "0")}`;
        const timestamp = clock().toISOString();
        const record: Consultation = {
          ...parsed,
          id,
          status: "BROUILLON",
          treatments: treatments(parsed, id, timestamp),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        records.set(id, record);
        return structuredClone(record);
      });
    },
    async update(id, input) {
      editable(id);
      const parsed = consultationSchema.parse(input);
      return validatedWrite(parsed, () => {
        const previous = editable(id);
        if (parsed.patientId !== previous.patientId)
          throw new ClinicalRecordError(
            "Le patient d’une consultation enregistrée est conservé.",
            "patientId",
          );
        uniqueLink(parsed, id);
        const timestamp = clock().toISOString();
        const record: Consultation = {
          ...previous,
          ...parsed,
          treatments: treatments(parsed, id, timestamp, previous.treatments),
          updatedAt: timestamp,
        };
        records.set(id, record);
        return structuredClone(record);
      });
    },
    async complete(id) {
      const current = editable(id);
      const parsed = consultationSchema.parse(current);
      return validatedWrite(parsed, () => {
        const previous = editable(id);
        uniqueLink(previous, id);
        const record: Consultation = {
          ...previous,
          status: "TERMINEE",
          updatedAt: clock().toISOString(),
        };
        records.set(id, record);
        return structuredClone(record);
      });
    },
  };
}
