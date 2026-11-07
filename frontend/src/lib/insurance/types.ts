/**
 * Sijilmassa Dental — Dental Insurance Domain Types (Phase 9.1)
 * Covers CNSS, CNOPS, and FAR dental insurance documents.
 */

export const insuranceProviders = ["CNSS", "CNOPS", "FAR"] as const;
export type InsuranceProvider = (typeof insuranceProviders)[number];

export const beneficiaryRelationships = [
  "LUI_MEME",
  "CONJOINT",
  "ENFANT",
  "AUTRE",
] as const;
export type BeneficiaryRelationship =
  (typeof beneficiaryRelationships)[number];

export const relationshipLabels: Record<BeneficiaryRelationship, string> = {
  LUI_MEME: "Lui-même / Adhérent",
  CONJOINT: "Conjoint(e)",
  ENFANT: "Enfant à charge",
  AUTRE: "Autre ayant droit",
};

export const documentPurposes = ["ENTENTE_PREALABLE", "EXECUTION"] as const;
export type DocumentPurpose = (typeof documentPurposes)[number];

export const documentPurposeLabels: Record<DocumentPurpose, string> = {
  ENTENTE_PREALABLE: "Entente préalable (demande d'accord préalable)",
  EXECUTION: "Exécution des soins (remboursement)",
};

/** CNSS Care Types (Printed on CNSS feuille de soins dentaires, Page 1) */
export const cnssCareTypes = [
  "SOINS_600",
  "PROTHESE_626",
  "ODF_650",
  "AUTRES_675",
] as const;
export type CNSSCareType = (typeof cnssCareTypes)[number];

export const cnssCareTypeLabels: Record<CNSSCareType, string> = {
  SOINS_600: "Soins dentaires (600)",
  PROTHESE_626: "Prothèse dentaire (626)",
  ODF_650: "Orthodontie faciale (650)",
  AUTRES_675: "Autres (675)",
};

/** CNOPS Care Types (Printed on CNOPS feuille de soins dentaires, Page 1) */
export const cnopsCareTypes = [
  "SOINS_1023746",
  "PROTHESE_1370746",
  "ODF_1023776",
  "AUTRES_1370776",
] as const;
export type CNOPSCareType = (typeof cnopsCareTypes)[number];

export const cnopsCareTypeLabels: Record<CNOPSCareType, string> = {
  SOINS_1023746: "Soins (1023746)",
  PROTHESE_1370746: "Prothèse (1370746)",
  ODF_1023776: "Orthodontie et O.D.F (1023776)",
  AUTRES_1370776: "Autres (1370776)",
};

/** FAR Care Types and Contexts (Printed on FAR feuille de maladie/soins dentaires) */
export const farDentalPurposes = ["DEVIS", "RECUS"] as const;
export type FARDentalPurpose = (typeof farDentalPurposes)[number];

export const farDentalPurposeLabels: Record<FARDentalPurpose, string> = {
  DEVIS: "Devis dentaire préalable",
  RECUS: "Reçus des soins exécutés",
};

export const farCareTypes = ["SOINS", "PROTHESE"] as const;
export type FARCareType = (typeof farCareTypes)[number];

export const farCareTypeLabels: Record<FARCareType, string> = {
  SOINS: "Soins dentaires",
  PROTHESE: "Prothèse dentaire",
};

export const farCareContexts = ["MALADIE", "MATERNITE", "ACCIDENT"] as const;
export type FARCareContext = (typeof farCareContexts)[number];

export const farCareContextLabels: Record<FARCareContext, string> = {
  MALADIE: "Maladie",
  MATERNITE: "Maternité",
  ACCIDENT: "Accident",
};

/** Insured person profile (may differ from the patient beneficiary) */
export interface InsuredPersonInfo {
  isPatient: boolean;
  firstName: string;
  lastName: string;
  cin: string;
  address: string;
  phone: string;
  relationship: BeneficiaryRelationship;
}

/** Patient insurance policy */
export interface PatientInsurancePolicy {
  id: string;
  patientId: string;
  provider: InsuranceProvider;
  /** Registration number (Immatriculation for CNSS, CNOPS, FAR) */
  registrationNumber?: string;
  /** Affiliation number (N° Affiliation specifically required for CNOPS) */
  affiliationNumber?: string;
  /** Military account number (N° de Compte specifically required for FAR) */
  militaryAccountNumber?: string;
  /** Military rank (Grade specifically required for FAR) */
  militaryRank?: string;
  /** Military unit (Unité specifically required for FAR) */
  militaryUnit?: string;
  /** Identity and details of the insured person */
  insuredPerson: InsuredPersonInfo;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreatePolicyInput = Omit<
  PatientInsurancePolicy,
  "id" | "createdAt" | "updatedAt"
>;

export type UpdatePolicyInput = Partial<CreatePolicyInput>;

/** A single dental act in an insurance claim document */
export interface DentalInsuranceAct {
  id: string;
  treatmentDate: string;
  toothReference?: string;
  description: string;
  actCode?: string;
  ngapKeyLetter?: string;
  ngapCoefficient?: number;
  amountMinor?: number;
  sourceTreatmentId?: string;
}

export type DentalInsuranceActInput = Omit<DentalInsuranceAct, "id"> & {
  id?: string;
};

/** Provider-specific insurance details */
export interface CNSSDetails {
  /** Explicit dentist-confirmed FDI selections; never inferred from acts. */
  confirmedTeeth?: string[];
  careTypes: CNSSCareType[];
  priorAuthorizationNumber?: string;
  accidentDate?: string;
}

export interface CNOPSDetails {
  /** Explicit CNOPS chart selection, independent of CNSS confirmations. */
  confirmedTeeth?: string[];
  /** INPE verified by the practitioner; never copied from the clinic INP. */
  practitionerInpe?: string;
  careTypes: CNOPSCareType[];
  priorAuthorizationNumber?: string;
  accidentDate?: string;
  accidentCauses?: string;
  diagnosisCodeCIM10?: string;
}

export interface FARToothMark {
  tooth: string;
  /** Pending selections can be saved; the PDF requires an explicit symbol. */
  symbol?: "CERCLE" | "CROIX";
}
export interface FARDetails {
  dentalPurpose?: FARDentalPurpose;
  careType?: FARCareType;
  context?: FARCareContext;
  priorAuthorizationNumber?: string;
  practitionerInpe?: string;
  prospectusCount?: number;
  toothMarks?: FARToothMark[];
  markingApproved?: boolean;
}

export interface InsuranceManualFields {
  totalFeesMinor?: number;
  attachmentCount?: number;
  declarationPlace?: string;
  declarationDate?: string;
}

export type InsuranceDraftStatus = "BROUILLON" | "VALIDE";

/** Stored insurance document draft */
export interface InsuranceDocumentDraft {
  id: string;
  patientId: string;
  provider: InsuranceProvider;
  policyId?: string;
  status: InsuranceDraftStatus;
  documentPurpose: DocumentPurpose;
  selectedConsultationId?: string;
  selectedTreatmentIds: string[];
  acts: DentalInsuranceAct[];
  cnssDetails?: CNSSDetails;
  cnopsDetails?: CNOPSDetails;
  farDetails?: FARDetails;
  manualFields: InsuranceManualFields;
  createdAt: string;
  updatedAt: string;
}

export type CreateInsuranceDraftInput = Omit<
  InsuranceDocumentDraft,
  "id" | "createdAt" | "updatedAt"
> & {
  id?: string;
};

export type UpdateInsuranceDraftInput = Partial<
  Omit<InsuranceDocumentDraft, "id" | "patientId" | "createdAt" | "updatedAt">
>;

/** Repository contract */
export interface InsuranceRepository {
  listPolicies(): Promise<PatientInsurancePolicy[]>;
  getPolicyById(id: string): Promise<PatientInsurancePolicy | undefined>;
  getPoliciesByPatientId(
    patientId: string,
  ): Promise<PatientInsurancePolicy[]>;
  createPolicy(input: CreatePolicyInput): Promise<PatientInsurancePolicy>;
  updatePolicy(
    id: string,
    input: UpdatePolicyInput,
  ): Promise<PatientInsurancePolicy>;
  deletePolicy(id: string): Promise<boolean>;

  listDrafts(): Promise<InsuranceDocumentDraft[]>;
  getDraftById(id: string): Promise<InsuranceDocumentDraft | undefined>;
  getDraftsByPatientId(
    patientId: string,
  ): Promise<InsuranceDocumentDraft[]>;
  createDraft(
    input: CreateInsuranceDraftInput,
  ): Promise<InsuranceDocumentDraft>;
  updateDraft(
    id: string,
    input: UpdateInsuranceDraftInput,
  ): Promise<InsuranceDocumentDraft>;
  deleteDraft(id: string): Promise<boolean>;
}
