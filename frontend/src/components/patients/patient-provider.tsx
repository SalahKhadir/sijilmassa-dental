"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { patientFixtures } from "@/data/patients";
import { createInMemoryPatientRepository } from "@/lib/patients/repository";
import { clinicDate } from "@/lib/patients/dates";
import type {
  CreatePatientInput,
  Patient,
  PatientRepository,
  UpdatePatientInput,
} from "@/lib/patients/types";

interface PatientContextValue {
  repository: PatientRepository;
  revision: number;
  today: string;
  feedback: { patientId: string; message: string } | null;
  clearFeedback(): void;
  createPatient(input: CreatePatientInput): Promise<Patient>;
  updatePatient(id: string, input: UpdatePatientInput): Promise<Patient>;
}
const PatientContext = createContext<PatientContextValue | null>(null);

export function PatientProvider({ children }: { children: ReactNode }) {
  const [repository] = useState(() =>
    createInMemoryPatientRepository(patientFixtures),
  );
  const [today] = useState(() => clinicDate());
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] =
    useState<PatientContextValue["feedback"]>(null);
  const clearFeedback = useCallback(() => setFeedback(null), []);
  const createPatient = useCallback(
    async (input: CreatePatientInput) => {
      const patient = await repository.create(input);
      setRevision((value) => value + 1);
      setFeedback({
        patientId: patient.id,
        message:
          "Dossier fictif créé en mémoire. Un rechargement de la page réinitialise les modifications.",
      });
      return patient;
    },
    [repository],
  );
  const updatePatient = useCallback(
    async (id: string, input: UpdatePatientInput) => {
      const patient = await repository.update(id, input);
      setRevision((value) => value + 1);
      setFeedback({
        patientId: patient.id,
        message:
          "Dossier fictif modifié en mémoire. Un rechargement de la page réinitialise les modifications.",
      });
      return patient;
    },
    [repository],
  );
  const value = useMemo(
    () => ({
      repository,
      revision,
      today,
      feedback,
      clearFeedback,
      createPatient,
      updatePatient,
    }),
    [
      repository,
      revision,
      today,
      feedback,
      clearFeedback,
      createPatient,
      updatePatient,
    ],
  );
  return (
    <PatientContext.Provider value={value}>{children}</PatientContext.Provider>
  );
}
export function usePatients() {
  const context = useContext(PatientContext);
  if (!context) throw new Error("PatientProvider is required.");
  return context;
}
