"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { appointmentFixtures } from "@/data/appointments";
import { createInMemoryAppointmentRepository } from "@/lib/appointments/repository";
import type {
  Appointment,
  AppointmentInput,
  AppointmentRepository,
  AppointmentStatus,
  UpdateAppointmentInput,
} from "@/lib/appointments/types";
import { usePatients } from "@/components/patients/patient-provider";
interface AppointmentContextValue {
  repository: AppointmentRepository;
  revision: number;
  registerPatientChangeGuard(guard: ((id: string) => boolean) | null): void;
  feedback: { id: string; message: string } | null;
  clearFeedback(): void;
  createAppointment(input: AppointmentInput): Promise<Appointment>;
  updateAppointment(
    id: string,
    input: UpdateAppointmentInput,
  ): Promise<Appointment>;
  changeStatus(id: string, status: AppointmentStatus): Promise<Appointment>;
}
const AppointmentContext = createContext<AppointmentContextValue | null>(null);
export function AppointmentProvider({ children }: { children: ReactNode }) {
  const { repository: patients } = usePatients();
  const [patientChangeGuard] = useState(() => {
    let guard: ((id: string) => boolean) | null = null;
    return {
      register(next: ((id: string) => boolean) | null) {
        guard = next;
      },
      allows(id: string) {
        return guard?.(id) ?? true;
      },
    };
  });
  const registerPatientChangeGuard = patientChangeGuard.register;
  const [repository] = useState(() =>
    createInMemoryAppointmentRepository(
      appointmentFixtures,
      patients,
      undefined,
      undefined,
      patientChangeGuard.allows,
    ),
  );
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] =
    useState<AppointmentContextValue["feedback"]>(null);
  const clearFeedback = useCallback(() => setFeedback(null), []);
  const changed = useCallback((appointment: Appointment, action: string) => {
    setRevision((value) => value + 1);
    setFeedback({
      id: appointment.id,
      message: `Rendez-vous fictif ${action} en mémoire. Un rechargement réinitialise les changements.`,
    });
    return appointment;
  }, []);
  const createAppointment = useCallback(
    async (input: AppointmentInput) =>
      changed(await repository.create(input), "créé"),
    [repository, changed],
  );
  const updateAppointment = useCallback(
    async (id: string, input: UpdateAppointmentInput) =>
      changed(await repository.update(id, input), "modifié"),
    [repository, changed],
  );
  const changeStatus = useCallback(
    async (id: string, status: AppointmentStatus) =>
      changed(await repository.updateStatus(id, status), "mis à jour"),
    [repository, changed],
  );
  const value = useMemo(
    () => ({
      repository,
      registerPatientChangeGuard,
      revision,
      feedback,
      clearFeedback,
      createAppointment,
      updateAppointment,
      changeStatus,
    }),
    [
      repository,
      registerPatientChangeGuard,
      revision,
      feedback,
      clearFeedback,
      createAppointment,
      updateAppointment,
      changeStatus,
    ],
  );
  return (
    <AppointmentContext.Provider value={value}>
      {children}
    </AppointmentContext.Provider>
  );
}
export function useAppointments() {
  const context = useContext(AppointmentContext);
  if (!context) throw new Error("AppointmentProvider is required.");
  return context;
}
