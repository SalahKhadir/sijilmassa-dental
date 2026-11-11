"use client";
import Link from "next/link";
import { PermissionGate } from "@/components/auth/session-boundary";
import { AppointmentConsultationLink } from "@/components/consultations/appointment-consultation-link";
import { useEffect, useState } from "react";
import { z } from "zod";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  appointmentStatuses,
  appointmentStatusValues,
  appointmentTypes,
  allowedStatusTransitions,
  type Appointment,
  type AppointmentStatus as Status,
} from "@/lib/appointments/types";
import { endTime, formatLocalDate } from "@/lib/appointments/local-time";
import { AppointmentConflictError } from "@/lib/appointments/repository";
import { useAppointments } from "./appointment-provider";
import { useAppointmentData } from "./use-appointment-data";
import { AppointmentStatus } from "./appointment-status";
import {
  AppointmentError,
  AppointmentLoading,
  AppointmentNotice,
  AppointmentNotFound,
} from "./appointment-states";
function StatusForm({ appointment }: { appointment: Appointment }) {
  const { changeStatus } = useAppointments();
  const [status, setStatus] = useState<Status>(appointment.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const allowed = allowedStatusTransitions(appointment.status);
  return (
    <form
      className="space-y-3"
      aria-busy={busy}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || status === appointment.status) return;
        setBusy(true);
        setError("");
        try {
          await changeStatus(appointment.id, status);
        } catch (error) {
          setError(
            error instanceof AppointmentConflictError
              ? error.message
              : error instanceof z.ZodError
                ? (error.issues[0]?.message ?? "Vérifiez le créneau.")
                : "Impossible de changer le statut. Réessayez.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label
        htmlFor="appointment-status"
        className="block text-sm font-semibold"
      >
        Nouveau statut
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Select
          id="appointment-status"
          value={status}
          disabled={busy}
          onChange={(event) => setStatus(event.target.value as Status)}
        >
          {appointmentStatusValues
            .filter(
              (value) =>
                value === appointment.status || allowed.includes(value),
            )
            .map((value) => (
              <option key={value} value={value}>
                {appointmentStatuses[value].label}
              </option>
            ))}
        </Select>
        <Button
          type="submit"
          disabled={busy || status === appointment.status}
          className="shrink-0"
        >
          {busy ? "Mise à jour…" : "Appliquer le statut"}
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Le prototype permet les corrections de statut. Les rendez-vous annulés
        et absents restent dans l’historique. Réactiver un rendez-vous vérifie à
        nouveau les horaires et les conflits.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
export function AppointmentDetails({ id }: { id: string }) {
  const { state, retry } = useAppointmentData();
  const { feedback, clearFeedback } = useAppointments();
  useEffect(() => () => clearFeedback(), [clearFeedback, id]);
  if (state.status === "loading") return <AppointmentLoading />;
  if (state.status === "error") return <AppointmentError retry={retry} />;
  const appointment = state.data.appointments.find(
    (record) => record.id === id,
  );
  if (!appointment) return <AppointmentNotFound />;
  const patient = state.data.patients.find(
    (record) => record.id === appointment.patientId,
  );
  return (
    <>
      <PageHeading
        eyebrow="Agenda partagé du cabinet"
        title="Détails du rendez-vous"
        description={
          patient
            ? `${patient.name} · ${patient.reference}`
            : "Patient introuvable"
        }
      >
        <Button asChild>
          <Link href={`/demo/rendez-vous/${id}/modifier`}>
            Modifier le rendez-vous
          </Link>
        </Button>
      </PageHeading>
      <AppointmentNotice />
      {feedback?.id === id && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg border border-secondary/30 bg-secondary-tint p-4 text-sm leading-6"
        >
          {feedback.message}
        </p>
      )}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b">
          <CardTitle>Créneau du rendez-vous</CardTitle>
          <AppointmentStatus status={appointment.status} />
        </CardHeader>
        <CardContent className="pt-6">
          <dl className="grid gap-6 text-sm sm:grid-cols-2">
            {[
              ["Patient", patient?.name ?? "Patient introuvable"],
              ["Référence patient", patient?.reference ?? "Indisponible"],
              ["Date", formatLocalDate(appointment.date)],
              [
                "Horaire local",
                `${appointment.startTime}–${endTime(appointment.startTime, appointment.durationMinutes)}`,
              ],
              ["Durée", `${appointment.durationMinutes} minutes`],
              ["Catégorie", appointmentTypes[appointment.type]],
              ["Motif administratif", appointment.reason || "Non renseigné"],
              ["Notes administratives", appointment.notes || "Non renseignées"],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-2 leading-6 font-medium break-words whitespace-pre-wrap">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Changer le statut</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusForm
            key={`${appointment.id}-${appointment.status}`}
            appointment={appointment}
          />
        </CardContent>
      </Card>
      {patient && (
        <PermissionGate permission="clinical">
        <AppointmentConsultationLink
          appointmentId={id}
          patientId={patient.id}
        />
        </PermissionGate>
      )}
      <div className="flex flex-wrap gap-3">
        <PermissionGate permission="clinical">
        {patient && (
          <Button asChild variant="outline">
            <Link href={`/demo/patients/${patient.id}`}>Voir la fiche patient</Link>
          </Button>
        )}
        </PermissionGate>
        <Button asChild variant="ghost">
          <Link href={`/demo/rendez-vous?date=${appointment.date}`}>
            Fermer les détails
          </Link>
        </Button>
      </div>
    </>
  );
}
