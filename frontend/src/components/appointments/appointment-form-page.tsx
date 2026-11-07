"use client";
import { PageHeading } from "@/components/page-heading";
import { clinicDate } from "@/lib/patients/dates";
import { isCalendarDate } from "@/lib/appointments/local-time";
import { useAppointmentData } from "./use-appointment-data";
import {
  AppointmentNotice,
  AppointmentLoading,
  AppointmentError,
  AppointmentNotFound,
} from "./appointment-states";
import { AppointmentForm } from "./appointment-form";
export function AppointmentFormPage({
  id,
  patientId,
  date,
}: {
  id?: string;
  patientId?: string;
  date?: string;
}) {
  const { state, retry } = useAppointmentData();
  if (state.status === "loading") return <AppointmentLoading />;
  if (state.status === "error") return <AppointmentError retry={retry} />;
  const appointment = id
    ? state.data.appointments.find((record) => record.id === id)
    : undefined;
  if (id && !appointment) return <AppointmentNotFound />;
  const initialDate = date && isCalendarDate(date) ? date : clinicDate();
  return (
    <>
      <PageHeading
        eyebrow="Agenda partagé du cabinet"
        title={id ? "Modifier le rendez-vous" : "Nouveau rendez-vous"}
        description="Planifiez un créneau fictif pour un patient existant."
      />
      <AppointmentNotice schedule />
      <AppointmentForm
        key={appointment ? `${appointment.id}-${appointment.updatedAt}` : "new"}
        appointment={appointment}
        patients={state.data.patients}
        initialDate={initialDate}
        patientId={patientId}
      />
    </>
  );
}
