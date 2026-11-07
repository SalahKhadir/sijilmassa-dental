import Link from "next/link";
import { CalendarDays, Clock3 } from "lucide-react";
import {
  appointmentTypes,
  type Appointment,
  type AppointmentPatient,
} from "@/lib/appointments/types";
import { endTime, formatLocalDate } from "@/lib/appointments/local-time";
import { sortAppointments } from "@/lib/appointments/selectors";
import { AppointmentStatus } from "./appointment-status";
export function AppointmentAgenda({
  appointments,
  patients,
  showDate = false,
}: {
  appointments: readonly Appointment[];
  patients: readonly AppointmentPatient[];
  showDate?: boolean;
}) {
  if (!appointments.length)
    return (
      <p className="px-5 py-10 text-center text-sm text-muted-foreground">
        Aucun rendez-vous pour cette période.
      </p>
    );
  return (
    <ul className="divide-y" aria-label="Liste des rendez-vous">
      {sortAppointments(appointments).map((appointment) => {
        const patient = patients.find(
          (record) => record.id === appointment.patientId,
        );
        return (
          <li key={appointment.id}>
            <Link
              href={`/rendez-vous/${appointment.id}`}
              className="block space-y-3 rounded-sm px-5 py-5 hover:bg-muted"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold break-words">
                    {patient?.name ?? "Patient introuvable"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {patient?.reference ?? "Référence indisponible"} ·{" "}
                    {appointmentTypes[appointment.type]}
                  </p>
                </div>
                <AppointmentStatus status={appointment.status} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                {showDate && (
                  <p className="flex items-center gap-1.5">
                    <CalendarDays aria-hidden="true" className="size-3.5" />
                    {formatLocalDate(appointment.date, "short")}
                  </p>
                )}
                <p className="flex items-center gap-1.5">
                  <Clock3 aria-hidden="true" className="size-3.5" />
                  {appointment.startTime}–
                  {endTime(appointment.startTime, appointment.durationMinutes)}{" "}
                  · {appointment.durationMinutes} min
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
