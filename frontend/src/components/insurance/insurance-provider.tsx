"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { insurancePolicyFixtures, insuranceDraftFixtures } from "@/data/insurance";
import { createInMemoryInsuranceRepository } from "@/lib/insurance/repository";
import type {
  CreateInsuranceDraftInput,
  CreatePolicyInput,
  InsuranceDocumentDraft,
  InsuranceRepository,
  PatientInsurancePolicy,
  UpdateInsuranceDraftInput,
  UpdatePolicyInput,
} from "@/lib/insurance/types";
import { usePatients } from "@/components/patients/patient-provider";
import { useConsultations } from "@/components/consultations/consultation-provider";

interface InsuranceContextValue {
  repository: InsuranceRepository;
  revision: number;
  feedback: { id: string; message: string } | null;
  clearFeedback(): void;
  createPolicy(input: CreatePolicyInput): Promise<PatientInsurancePolicy>;
  updatePolicy(
    id: string,
    input: UpdatePolicyInput,
  ): Promise<PatientInsurancePolicy>;
  deletePolicy(id: string): Promise<boolean>;
  createDraft(
    input: CreateInsuranceDraftInput,
  ): Promise<InsuranceDocumentDraft>;
  updateDraft(
    id: string,
    input: UpdateInsuranceDraftInput,
  ): Promise<InsuranceDocumentDraft>;
  deleteDraft(id: string): Promise<boolean>;
}

const Context = createContext<InsuranceContextValue | null>(null);

export function InsuranceProvider({ children }: { children: ReactNode }) {
  const { repository: patients } = usePatients();
  const { repository: consultations } = useConsultations();

  const [repository] = useState(() =>
    createInMemoryInsuranceRepository(
      insurancePolicyFixtures,
      insuranceDraftFixtures,
      patients,
      consultations,
    ),
  );

  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] =
    useState<InsuranceContextValue["feedback"]>(null);

  const clearFeedback = useCallback(() => setFeedback(null), []);

  const triggerChange = useCallback((id: string, message: string) => {
    setRevision((v) => v + 1);
    setFeedback({ id, message });
  }, []);

  const createPolicy = useCallback(
    async (input: CreatePolicyInput) => {
      const res = await repository.createPolicy(input);
      triggerChange(
        res.id,
        `Couverture ${res.provider} enregistrée pour le patient.`,
      );
      return res;
    },
    [repository, triggerChange],
  );

  const updatePolicy = useCallback(
    async (id: string, input: UpdatePolicyInput) => {
      const res = await repository.updatePolicy(id, input);
      triggerChange(res.id, `Police d'assurance mise à jour.`);
      return res;
    },
    [repository, triggerChange],
  );

  const deletePolicy = useCallback(
    async (id: string) => {
      const ok = await repository.deletePolicy(id);
      if (ok) {
        triggerChange(id, `Police d'assurance supprimée.`);
      }
      return ok;
    },
    [repository, triggerChange],
  );

  const createDraft = useCallback(
    async (input: CreateInsuranceDraftInput) => {
      const res = await repository.createDraft(input);
      triggerChange(
        res.id,
        `Feuille de soins dentaires (${res.provider}) enregistrée en brouillon.`,
      );
      return res;
    },
    [repository, triggerChange],
  );

  const updateDraft = useCallback(
    async (id: string, input: UpdateInsuranceDraftInput) => {
      const res = await repository.updateDraft(id, input);
      triggerChange(res.id, `Feuille de soins dentaires mise à jour.`);
      return res;
    },
    [repository, triggerChange],
  );

  const deleteDraft = useCallback(
    async (id: string) => {
      const ok = await repository.deleteDraft(id);
      if (ok) {
        triggerChange(id, `Feuille de soins supprimée.`);
      }
      return ok;
    },
    [repository, triggerChange],
  );

  const value = useMemo(
    () => ({
      repository,
      revision,
      feedback,
      clearFeedback,
      createPolicy,
      updatePolicy,
      deletePolicy,
      createDraft,
      updateDraft,
      deleteDraft,
    }),
    [
      repository,
      revision,
      feedback,
      clearFeedback,
      createPolicy,
      updatePolicy,
      deletePolicy,
      createDraft,
      updateDraft,
      deleteDraft,
    ],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useInsurance() {
  const value = useContext(Context);
  if (!value) {
    throw new Error("useInsurance doit être utilisé au sein d’un InsuranceProvider.");
  }
  return value;
}
