export const consultationStatuses = {
  BROUILLON: "Brouillon",
  TERMINEE: "Terminée",
} as const;
export type ConsultationStatus = keyof typeof consultationStatuses;
export interface TreatmentInput {
  id?: string;
  treatmentDate: string;
  description: string;
  toothReference: string;
  notes: string;
}
export interface TreatmentEntry extends TreatmentInput {
  id: string;
  consultationId: string;
  createdAt: string;
  updatedAt: string;
}
export interface ConsultationInput {
  patientId: string;
  appointmentId: string;
  consultationDate: string;
  chiefComplaint: string;
  clinicalObservations: string;
  assessment: string;
  treatmentPlan: string;
  notes: string;
  treatments: TreatmentInput[];
}
export interface Consultation extends Omit<ConsultationInput, "treatments"> {
  id: string;
  status: ConsultationStatus;
  treatments: TreatmentEntry[];
  createdAt: string;
  updatedAt: string;
}
export interface ConsultationRepository {
  list(): Promise<Consultation[]>;
  linkedConsultationId(appointmentId: string): string | undefined;
  canReassignAppointment(appointmentId: string): boolean;
  getById(id: string): Promise<Consultation | undefined>;
  create(input: ConsultationInput): Promise<Consultation>;
  update(id: string, input: ConsultationInput): Promise<Consultation>;
  complete(id: string): Promise<Consultation>;
}
