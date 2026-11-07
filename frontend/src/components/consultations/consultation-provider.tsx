"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { consultationFixtures } from "@/data/consultations";
import { createInMemoryConsultationRepository } from "@/lib/consultations/repository";
import type {
  Consultation,
  ConsultationInput,
  ConsultationRepository,
} from "@/lib/consultations/types";
import { usePatients } from "@/components/patients/patient-provider";
import { useAppointments } from "@/components/appointments/appointment-provider";
interface ClinicalContext {
  repository: ConsultationRepository;
  revision: number;
  feedback: { id: string; message: string } | null;
  clearFeedback(): void;
  create(input: ConsultationInput): Promise<Consultation>;
  update(id: string, input: ConsultationInput): Promise<Consultation>;
  complete(id: string): Promise<Consultation>;
}
const Context = createContext<ClinicalContext | null>(null);
export function ConsultationProvider({ children }: { children: ReactNode }) {
  const { repository: patients } = usePatients();
  const { repository: appointments, registerPatientChangeGuard } =
    useAppointments();
  const [repository] = useState(() =>
    createInMemoryConsultationRepository(
      consultationFixtures,
      patients,
      appointments,
    ),
  );
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] = useState<ClinicalContext["feedback"]>(null);
  const clearFeedback = useCallback(() => setFeedback(null), []);
  useEffect(() => {
    registerPatientChangeGuard(repository.canReassignAppointment);
    return () => registerPatientChangeGuard(null);
  }, [repository, registerPatientChangeGuard]);
  const changed = useCallback((record: Consultation, action: string) => {
    setRevision((value) => value + 1);
    setFeedback({
      id: record.id,
      message: `Consultation fictive ${action} en mémoire. Un rechargement réinitialise les changements.`,
    });
    return record;
  }, []);
  const create = useCallback(
    async (input: ConsultationInput) =>
      changed(await repository.create(input), "créée en brouillon"),
    [repository, changed],
  );
  const update = useCallback(
    async (id: string, input: ConsultationInput) =>
      changed(await repository.update(id, input), "modifiée"),
    [repository, changed],
  );
  const complete = useCallback(
    async (id: string) =>
      changed(
        await repository.complete(id),
        "terminée et placée en lecture seule",
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
      update,
      complete,
    }),
    [repository, revision, feedback, clearFeedback, create, update, complete],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useConsultations() {
  const value = useContext(Context);
  if (!value) throw new Error("ConsultationProvider is required.");
  return value;
}
