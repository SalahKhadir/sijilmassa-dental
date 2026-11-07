import type { PatientIdentity } from "../patients/types.ts";

export const appointmentTypes = {
  CONSULTATION: "Consultation",
  CONTROLE: "Contrôle",
  DETARTRAGE: "Détartrage",
  SOIN_DENTAIRE: "Soin dentaire",
  EXTRACTION: "Extraction",
  AUTRE: "Autre",
} as const;
export type AppointmentType = keyof typeof appointmentTypes;

export const appointmentStatuses = {
  EN_ATTENTE: {
    label: "En attente",
    className: "border-warning bg-surface text-foreground",
  },
  CONFIRME: {
    label: "Confirmé",
    className: "border-info/40 bg-secondary-tint text-foreground",
  },
  TERMINE: {
    label: "Terminé",
    className: "border-success/40 bg-surface text-foreground",
  },
  ANNULE: {
    label: "Annulé",
    className: "border-border bg-muted text-muted-foreground",
  },
  ABSENT: {
    label: "Absent",
    className: "border-danger/40 bg-muted text-foreground",
  },
} as const;
export type AppointmentStatus = keyof typeof appointmentStatuses;
export const appointmentStatusValues = Object.keys(
  appointmentStatuses,
) as AppointmentStatus[];
export const appointmentTypeValues = Object.keys(
  appointmentTypes,
) as AppointmentType[];
/** Prototype permits explicit administrative corrections between all statuses.
 * Every transition back to a blocking status must revalidate the slot.
 */
export function allowedStatusTransitions(
  status: AppointmentStatus,
): AppointmentStatus[] {
  return appointmentStatusValues.filter((candidate) => candidate !== status);
}
export interface AppointmentInput {
  patientId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  type: AppointmentType;
  reason: string;
  notes: string;
}
export interface Appointment extends AppointmentInput {
  id: string;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
}
export type UpdateAppointmentInput = Partial<AppointmentInput>;
export interface AppointmentRepository {
  list(): Promise<Appointment[]>;
  getById(id: string): Promise<Appointment | undefined>;
  create(input: AppointmentInput): Promise<Appointment>;
  update(id: string, input: UpdateAppointmentInput): Promise<Appointment>;
  updateStatus(id: string, status: AppointmentStatus): Promise<Appointment>;
}
export interface AppointmentPatient {
  id: string;
  reference: string;
  name: string;
  identity: Pick<
    PatientIdentity,
    "firstName" | "lastName" | "gsm" | "landline"
  >;
}
