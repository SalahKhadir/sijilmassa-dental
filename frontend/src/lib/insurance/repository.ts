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

  async function validateLinks(input: ReturnType<typeof insuranceDraftSchema.parse>) {
    if (patients && !await patients.getById(input.patientId))
      throw new InsuranceError("Le patient de ce brouillon est introuvable.", "patientId");
    if (input.policyId) {
      const policy = policiesMap.get(input.policyId);
      if (!policy || policy.patientId !== input.patientId || policy.provider !== input.provider)
        throw new InsuranceError("Choisissez une couverture du même patient et du même organisme.", "policyId");
    }
    if (consultations) {
      if (input.selectedConsultationId) {
        const consultation = await consultations.getById(input.selectedConsultationId);
        if (!consultation || consultation.patientId !== input.patientId)
          throw new InsuranceError("La consultation doit appartenir au bénéficiaire.", "acts");
      }
      const sources = new Set([...input.selectedTreatmentIds,
        ...input.acts.flatMap(act => act.sourceTreatmentId ? [act.sourceTreatmentId] : [])]);
      if (sources.size) {
        const own = (await consultations.list()).filter(c => c.patientId === input.patientId);
        const patient = patients ? await patients.getById(input.patientId) : undefined;
        const available = new Set([...own.flatMap(c => c.treatments.map(t => t.id)),
          ...(patient?.treatments.map(t => t.id) ?? [])]);
        if ([...sources].some(id => !available.has(id)))
          throw new InsuranceError("Un soin lié est introuvable dans le dossier de ce patient. Vérifiez les actes importés.", "acts");
      }
    }
  }

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
      if (parsed.patientId !== existing.patientId)
        throw new InsuranceError("Une couverture ne peut pas changer de patient.", "patientId");
      if (patients && !await patients.getById(existing.patientId))
        throw new InsuranceError("Le patient de cette couverture est introuvable.", "patientId");
      if (parsed.provider !== existing.provider && [...draftsMap.values()].some(d => d.policyId === id))
        throw new InsuranceError("Cette couverture est liée à un brouillon. Créez une autre couverture pour changer d’organisme.", "provider");

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
      if ([...draftsMap.values()].some(d => d.policyId === id))
        throw new InsuranceError("Cette couverture est liée à un brouillon. Archivez-la ou changez le lien avant de la supprimer.", "policyId");
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

      await validateLinks(parsed);
      if (input.id && draftsMap.has(input.id))
        throw new InsuranceError("Un brouillon porte déjà cet identifiant.");

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

      if (merged.patientId !== existing.patientId)
        throw new InsuranceError("Un brouillon ne peut pas changer de patient.", "patientId");

      // A stored FAR approval cannot silently survive changes to acts or symbols.
      if (existing.provider === "FAR" && merged.farDetails &&
        input.farDetails?.markingApproved !== true &&
        (existing.policyId !== merged.policyId || existing.provider !== merged.provider ||
          JSON.stringify(existing.acts) !== JSON.stringify(merged.acts) ||
          JSON.stringify(existing.farDetails?.toothMarks) !== JSON.stringify(merged.farDetails.toothMarks))) {
        merged.farDetails = { ...merged.farDetails, markingApproved: false };
      }
      // An explicit replacement list is a renewed neutral selection; otherwise act edits clear it.
      if (JSON.stringify(existing.acts) !== JSON.stringify(merged.acts) || existing.provider !== merged.provider || existing.policyId !== merged.policyId) {
        if (merged.cnssDetails && !input.cnssDetails?.confirmedTeeth)
          merged.cnssDetails = { ...merged.cnssDetails, confirmedTeeth: [] };
        if (merged.cnopsDetails && !input.cnopsDetails?.confirmedTeeth)
          merged.cnopsDetails = { ...merged.cnopsDetails, confirmedTeeth: [] };
      }
      const parsed = insuranceDraftSchema.parse(merged);
      await validateLinks({ ...parsed, patientId: existing.patientId });

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
