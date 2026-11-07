export const prescriptionStatuses = {
  BROUILLON: "Brouillon",
  FINALISEE: "Finalisée",
} as const;
export type PrescriptionStatus = keyof typeof prescriptionStatuses;
export interface MedicationInput {
  id?: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}
export interface PrescriptionMedication extends MedicationInput {
  id: string;
}
export interface PrescriptionInput {
  patientId: string;
  consultationId: string;
  issuedDate: string;
  medications: MedicationInput[];
  generalInstructions: string;
}
export interface Prescription extends Omit<PrescriptionInput, "medications"> {
  id: string;
  status: PrescriptionStatus;
  medications: PrescriptionMedication[];
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
}
export interface PrescriptionPatient {
  id: string;
  reference: string;
  name: string;
  identity: {
    firstName: string;
    lastName: string;
    gsm: string;
    landline: string;
  };
}
export interface PrescriptionConsultation {
  id: string;
  patientId: string;
  consultationDate: string;
}
export interface PrescriptionRepository {
  list(): Promise<Prescription[]>;
  getById(id: string): Promise<Prescription | undefined>;
  create(input: PrescriptionInput): Promise<Prescription>;
  updateDraft(id: string, input: PrescriptionInput): Promise<Prescription>;
  finalize(id: string): Promise<Prescription>;
}
