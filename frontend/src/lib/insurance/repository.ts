import type { PatientRepository } from "../patients/types.ts";
import type { ConsultationRepository } from "../consultations/types.ts";
import type {
  CreateInsuranceDraftInput,
  CreatePolicyInput,
  InsuranceDocumentDraft,
  InsuranceRepository,
  PatientInsurancePolicy,
  UpdateInsuranceDraftInput,
  UpdatePolicyInput,
} from "./types.ts";
import { insuranceDraftSchema, policySchema } from "./schema.ts";

export class InsuranceError extends Error {
  constructor(
    message: string,
    public readonly field?: "patientId" | "policyId" | "provider" | "acts",
  ) {
    super(message);
    this.name = "InsuranceError";
  }
}

let counter = 1;

function generateId(prefix: string): string {
  const time = Date.now().toString(36);
  const seq = (counter++).toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${time}-${seq}-${rand}`;
}

export function createInMemoryInsuranceRepository(
  seedPolicies: readonly PatientInsurancePolicy[] = [],
  seedDrafts: readonly InsuranceDocumentDraft[] = [],
  patients?: PatientRepository,
  consultations?: ConsultationRepository,
  clock: () => Date = () => new Date(),
): InsuranceRepository {
  const policiesMap = new Map<string, PatientInsurancePolicy>(
    seedPolicies.map((p) => [p.id, structuredClone(p)]),
  );

  const draftsMap = new Map<string, InsuranceDocumentDraft>(
    seedDrafts.map((d) => [d.id, structuredClone(d)]),
  );

  return {
    async listPolicies(): Promise<PatientInsurancePolicy[]> {
      return Array.from(policiesMap.values()).map((p) => structuredClone(p));
    },

    async getPolicyById(id: string): Promise<PatientInsurancePolicy | undefined> {
      const p = policiesMap.get(id);
      return p ? structuredClone(p) : undefined;
    },

    async getPoliciesByPatientId(
      patientId: string,
    ): Promise<PatientInsurancePolicy[]> {
      return Array.from(policiesMap.values())
        .filter((p) => p.patientId === patientId)
        .map((p) => structuredClone(p));
    },

    async createPolicy(
      input: CreatePolicyInput,
    ): Promise<PatientInsurancePolicy> {
      const parsed = policySchema.parse(input);

      if (patients) {
        const patient = await patients.getById(parsed.patientId);
        if (!patient) {
          throw new InsuranceError(
            `Le patient spécifié (${parsed.patientId}) est introuvable.`,
            "patientId",
          );
        }
      }

      const now = clock().toISOString();
      const id = generateId("pol");

      const policy: PatientInsurancePolicy = {
        id,
        patientId: parsed.patientId,
        provider: parsed.provider,
        registrationNumber: parsed.registrationNumber || "",
        affiliationNumber: parsed.affiliationNumber || "",
        militaryAccountNumber: parsed.militaryAccountNumber || "",
        militaryRank: parsed.militaryRank || "",
        militaryUnit: parsed.militaryUnit || "",
        insuredPerson: parsed.insuredPerson,
        active: parsed.active ?? true,
        createdAt: now,
        updatedAt: now,
      };

      policiesMap.set(id, structuredClone(policy));
      return structuredClone(policy);
    },

    async updatePolicy(
      id: string,
      input: UpdatePolicyInput,
    ): Promise<PatientInsurancePolicy> {
      const existing = policiesMap.get(id);
      if (!existing) {
        throw new InsuranceError(
          `La police d'assurance avec l'identifiant ${id} n'existe pas.`,
          "policyId",
        );
      }

      const merged = {
        ...existing,
        ...input,
        insuredPerson: {
          ...existing.insuredPerson,
          ...(input.insuredPerson ?? {}),
        },
      };

      const parsed = policySchema.parse(merged);

      const now = clock().toISOString();
      const updated: PatientInsurancePolicy = {
        ...existing,
        provider: parsed.provider,
        registrationNumber: parsed.registrationNumber ?? existing.registrationNumber,
        affiliationNumber: parsed.affiliationNumber ?? existing.affiliationNumber,
        militaryAccountNumber:
          parsed.militaryAccountNumber ?? existing.militaryAccountNumber,
        militaryRank: parsed.militaryRank ?? existing.militaryRank,
        militaryUnit: parsed.militaryUnit ?? existing.militaryUnit,
        insuredPerson: parsed.insuredPerson,
        active: parsed.active,
        updatedAt: now,
      };

      policiesMap.set(id, structuredClone(updated));
      return structuredClone(updated);
    },

    async deletePolicy(id: string): Promise<boolean> {
      return policiesMap.delete(id);
    },

    async listDrafts(): Promise<InsuranceDocumentDraft[]> {
      return Array.from(draftsMap.values())
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((d) => structuredClone(d));
    },

    async getDraftById(
      id: string,
    ): Promise<InsuranceDocumentDraft | undefined> {
      const d = draftsMap.get(id);
      return d ? structuredClone(d) : undefined;
    },

    async getDraftsByPatientId(
      patientId: string,
    ): Promise<InsuranceDocumentDraft[]> {
      return Array.from(draftsMap.values())
        .filter((d) => d.patientId === patientId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((d) => structuredClone(d));
    },

    async createDraft(
      input: CreateInsuranceDraftInput,
    ): Promise<InsuranceDocumentDraft> {
      const parsed = insuranceDraftSchema.parse(input);

      if (patients) {
        const patient = await patients.getById(parsed.patientId);
        if (!patient) {
          throw new InsuranceError(
            `Le patient spécifié (${parsed.patientId}) est introuvable.`,
            "patientId",
          );
        }
      }

      if (consultations && parsed.selectedConsultationId) {
        const consultation = await consultations.getById(
          parsed.selectedConsultationId,
        );
        if (!consultation) {
          throw new InsuranceError(
            `La consultation spécifiée (${parsed.selectedConsultationId}) est introuvable.`,
          );
        }
      }

      const now = clock().toISOString();
      const id = input.id ?? generateId("draft-ins");

      // Assign id to acts if not present
      const acts = parsed.acts.map((act, index) => ({
        id: act.id ?? `${id}-act-${index + 1}`,
        treatmentDate: act.treatmentDate,
        toothReference: act.toothReference || undefined,
        description: act.description,
        actCode: act.actCode || undefined,
        ngapKeyLetter: act.ngapKeyLetter || undefined,
        ngapCoefficient: act.ngapCoefficient,
        amountMinor: act.amountMinor,
        sourceTreatmentId: act.sourceTreatmentId,
      }));

      const draft: InsuranceDocumentDraft = {
        id,
        patientId: parsed.patientId,
        provider: parsed.provider,
        policyId: parsed.policyId,
        status: parsed.status,
        documentPurpose: parsed.documentPurpose,
        selectedConsultationId: parsed.selectedConsultationId,
        selectedTreatmentIds: parsed.selectedTreatmentIds,
        acts,
        cnssDetails: parsed.cnssDetails,
        cnopsDetails: parsed.cnopsDetails,
        farDetails: parsed.farDetails,
        manualFields: parsed.manualFields,
        createdAt: now,
        updatedAt: now,
      };

      draftsMap.set(id, structuredClone(draft));
      return structuredClone(draft);
    },

    async updateDraft(
      id: string,
      input: UpdateInsuranceDraftInput,
    ): Promise<InsuranceDocumentDraft> {
      const existing = draftsMap.get(id);
      if (!existing) {
        throw new InsuranceError(
          `Le brouillon d'assurance avec l'identifiant ${id} n'existe pas.`,
        );
      }

      const merged = {
        ...existing,
        ...input,
        manualFields: {
          ...existing.manualFields,
          ...(input.manualFields ?? {}),
        },
      };

      const parsed = insuranceDraftSchema.parse(merged);

      const now = clock().toISOString();

      const acts = parsed.acts.map((act, index) => ({
        id: act.id ?? `${id}-act-${index + 1}`,
        treatmentDate: act.treatmentDate,
        toothReference: act.toothReference || undefined,
        description: act.description,
        actCode: act.actCode || undefined,
        ngapKeyLetter: act.ngapKeyLetter || undefined,
        ngapCoefficient: act.ngapCoefficient,
        amountMinor: act.amountMinor,
        sourceTreatmentId: act.sourceTreatmentId,
      }));

      const updated: InsuranceDocumentDraft = {
        ...existing,
        provider: parsed.provider,
        policyId: parsed.policyId,
        status: parsed.status,
        documentPurpose: parsed.documentPurpose,
        selectedConsultationId: parsed.selectedConsultationId,
        selectedTreatmentIds: parsed.selectedTreatmentIds,
        acts,
        cnssDetails: parsed.cnssDetails,
        cnopsDetails: parsed.cnopsDetails,
        farDetails: parsed.farDetails,
        manualFields: parsed.manualFields,
        updatedAt: now,
      };

      draftsMap.set(id, structuredClone(updated));
      return structuredClone(updated);
    },

    async deleteDraft(id: string): Promise<boolean> {
      return draftsMap.delete(id);
    },
  };
}
