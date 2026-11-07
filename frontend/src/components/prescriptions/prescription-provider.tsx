"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { prescriptionFixtures } from "@/data/prescriptions";
import { createInMemoryPrescriptionRepository } from "@/lib/prescriptions/repository";
import type {
  Prescription,
  PrescriptionInput,
  PrescriptionRepository,
} from "@/lib/prescriptions/types";
import { usePatients } from "@/components/patients/patient-provider";
import { useConsultations } from "@/components/consultations/consultation-provider";
interface PrescriptionContextValue {
  repository: PrescriptionRepository;
  revision: number;
  feedback: { id: string; message: string } | null;
  clearFeedback(): void;
  create(input: PrescriptionInput): Promise<Prescription>;
  updateDraft(id: string, input: PrescriptionInput): Promise<Prescription>;
  finalize(id: string): Promise<Prescription>;
}
const Context = createContext<PrescriptionContextValue | null>(null);
export function PrescriptionProvider({ children }: { children: ReactNode }) {
  const { repository: patients } = usePatients();
  const { repository: consultations } = useConsultations();
  const [repository] = useState(() =>
    createInMemoryPrescriptionRepository(
      prescriptionFixtures,
      patients,
      consultations,
      async (record, patient) => {
        const { prescriptionPdfService } = await import(
          "@/lib/prescriptions/pdf/service"
        );
        await prescriptionPdfService.render(record, patient);
      },
    ),
  );
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] =
    useState<PrescriptionContextValue["feedback"]>(null);
  const clearFeedback = useCallback(() => setFeedback(null), []);
  const changed = useCallback((record: Prescription, action: string) => {
    setRevision((value) => value + 1);
    setFeedback({
      id: record.id,
      message: `Ordonnance ${action}. Les changements restent dans cet onglet jusqu’au rechargement.`,
    });
    return record;
  }, []);
  const create = useCallback(
    async (input: PrescriptionInput) =>
      changed(await repository.create(input), "enregistrée en brouillon"),
    [repository, changed],
  );
  const updateDraft = useCallback(
    async (id: string, input: PrescriptionInput) =>
      changed(await repository.updateDraft(id, input), "modifiée"),
    [repository, changed],
  );
  const finalize = useCallback(
    async (id: string) =>
      changed(
        await repository.finalize(id),
        "finalisée et placée en lecture seule",
      ),
    [repository, changed],
  );
  const value = useMemo(
    () => ({
      repository,
      revision,
      feedback,
      clearFeedback,
      create,
      updateDraft,
      finalize,
    }),
    [
      repository,
      revision,
      feedback,
      clearFeedback,
      create,
      updateDraft,
      finalize,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePrescriptions() {
  const value = useContext(Context);
  if (!value) throw new Error("PrescriptionProvider is required.");
  return value;
}
