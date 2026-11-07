export type PatientStatus = "active" | "inactive";
export type YesNoAnswer = "unanswered" | "yes" | "no";
export type ReportStatus = "unanswered" | "reported";
export type PatientSex = "unanswered" | "F" | "M";

export const medicalHistoryOptions = [
  "Cardiaque",
  "Ostéoporose",
  "Chirurgie",
  "Maladie du sang",
  "Diabète",
  "Sinusite",
  "Autres",
  "Appareil gastrique",
] as const;
export const allergyOptions = [
  "Aspirine",
  "Antibiotique",
  "Anesthésie",
  "Aliment",
  "Autres",
] as const;

export interface PatientIdentity {
  firstName: string;
  lastName: string;
  sex: PatientSex;
  dateOfBirth: string;
  address: string;
  gsm: string;
  landline: string;
  profession: string;
  cin: string;
  medicalCoverage: string;
}
export interface PatientMedicalHistory {
  reportStatus: ReportStatus;
  conditions: (typeof medicalHistoryOptions)[number][];
  otherDetails: string;
}
export interface PatientAllergies {
  reportStatus: ReportStatus;
  categories: (typeof allergyOptions)[number][];
  clarification: string;
}
export interface PatientHealthQuestionnaire {
  underMedicalTreatment: YesNoAnswer;
  pregnant: YesNoAnswer;
  additionalInformation: string;
  reasonForConsultation: string;
}
/** Fictional read-only examples. Source amounts are exact integer centimes. */
export interface PatientTreatmentEntry {
  id: string;
  date: string;
  treatment: string;
  priceCentimes: number;
  receivedCentimes: number;
}
export interface CreatePatientInput {
  identity: PatientIdentity;
  medicalHistory: PatientMedicalHistory;
  allergies: PatientAllergies;
  healthQuestionnaire: PatientHealthQuestionnaire;
  status: PatientStatus;
}
export interface Patient extends CreatePatientInput {
  id: string;
  reference: string;
  createdAt: string;
  updatedAt: string;
  treatments: PatientTreatmentEntry[];
  /** Synthetic indicator only. No appointment module is connected. */
  demoNextAppointmentDate?: string;
}
export interface UpdatePatientInput {
  identity?: Partial<PatientIdentity>;
  medicalHistory?: PatientMedicalHistory;
  allergies?: PatientAllergies;
  healthQuestionnaire?: PatientHealthQuestionnaire;
  status?: PatientStatus;
}
export interface PatientRepository {
  list(): Promise<Patient[]>;
  getById(id: string): Promise<Patient | undefined>;
  create(input: CreatePatientInput): Promise<Patient>;
  update(id: string, input: UpdatePatientInput): Promise<Patient>;
}
