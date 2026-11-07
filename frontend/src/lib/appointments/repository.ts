import { z } from "zod";
import type { PatientRepository } from "../patients/types.ts";
import type {
  Appointment,
  AppointmentInput,
  AppointmentRepository,
  AppointmentStatus,
  UpdateAppointmentInput,
} from "./types.ts";
import { appointmentStatusValues } from "./types.ts";
import { appointmentSchema } from "./schema.ts";
import { developmentSchedule, type DevelopmentSchedule } from "./schedule.ts";
import { findAppointmentConflict, blocksScheduling } from "./conflicts.ts";
import { endTime } from "./local-time.ts";
export class AppointmentNotFoundError extends Error {
  constructor() {
    super("Ce rendez-vous est introuvable.");
    this.name = "AppointmentNotFoundError";
  }
}
export class AppointmentPatientError extends Error {
  constructor() {
    super("Ce patient est introuvable. Sélectionnez un patient existant.");
    this.name = "AppointmentPatientError";
  }
}
export class AppointmentLinkedPatientError extends AppointmentPatientError {
  constructor() {
    super();
    this.message =
      "Ce rendez-vous est lié à une consultation. Son patient doit être conservé.";
    this.name = "AppointmentLinkedPatientError";
  }
}
export class AppointmentConflictError extends Error {
  constructor(conflict: Appointment) {
    super(
      `Ce créneau chevauche un rendez-vous de ${conflict.startTime} à ${endTime(conflict.startTime, conflict.durationMinutes)}. Choisissez un autre horaire.`,
    );
    this.name = "AppointmentConflictError";
  }
}
export function createInMemoryAppointmentRepository(
  seed: readonly Appointment[],
  patients: PatientRepository,
  clock: () => Date = () => new Date(),
  schedule: DevelopmentSchedule = developmentSchedule,
  allowPatientChange: (
    appointmentId: string,
    patientId: string,
  ) => boolean = () => true,
): AppointmentRepository {
  const records = new Map(
    seed.map((appointment) => [appointment.id, structuredClone(appointment)]),
  );
  function validateSlot(
    candidate: AppointmentInput & { status: AppointmentStatus },
    excludeId?: string,
  ) {
    const conflict = findAppointmentConflict(
      candidate,
      Array.from(records.values()),
      excludeId,
    );
    if (conflict) throw new AppointmentConflictError(conflict);
  }
  function existing(id: string) {
    const appointment = records.get(id);
    if (!appointment) throw new AppointmentNotFoundError();
    return appointment;
  }
  return {
    async list() {
      return structuredClone(Array.from(records.values()));
    },
    async getById(id) {
      const appointment = records.get(id);
      return appointment ? structuredClone(appointment) : undefined;
    },
    async create(input: AppointmentInput) {
      const details = appointmentSchema(schedule).parse(input);
      if (!(await patients.getById(details.patientId)))
        throw new AppointmentPatientError();
      // Re-read and check after the only await. Check + write is one synchronous operation.
      validateSlot({ ...details, status: "EN_ATTENTE" });
      const sequence =
        Math.max(
          0,
          ...Array.from(records.keys(), (id) =>
            Number(/^appointment-demo-(\d+)$/.exec(id)?.[1] ?? 0),
          ),
        ) + 1;
      const timestamp = clock().toISOString();
      const appointment: Appointment = {
        ...details,
        id: `appointment-demo-${String(sequence).padStart(3, "0")}`,
        status: "EN_ATTENTE",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      records.set(appointment.id, appointment);
      return structuredClone(appointment);
    },
    async update(id: string, input: UpdateAppointmentInput) {
      const previous = existing(id);
      const patientId = input.patientId ?? previous.patientId;
      if (!(await patients.getById(patientId)))
        throw new AppointmentPatientError();
      const current = existing(id);
      const details = appointmentSchema(schedule).parse({
        ...current,
        ...input,
      });
      validateSlot({ ...details, status: current.status }, id);
      if (
        details.patientId !== current.patientId &&
        !allowPatientChange(id, details.patientId)
      )
        throw new AppointmentLinkedPatientError();
      const appointment = {
        ...current,
        ...details,
        updatedAt: clock().toISOString(),
      };
      records.set(id, appointment);
      return structuredClone(appointment);
    },
    async updateStatus(id: string, next: AppointmentStatus) {
      const status = z.enum(appointmentStatusValues).parse(next);
      const current = existing(id);
      if (status === current.status) return structuredClone(current);
      if (blocksScheduling(status)) {
        const details = appointmentSchema(schedule).parse(current);
        validateSlot({ ...details, status }, id);
      }
      const appointment = {
        ...current,
        status,
        updatedAt: clock().toISOString(),
      };
      records.set(id, appointment);
      return structuredClone(appointment);
    },
  };
}
