import type { Patient } from "../patients/types.ts";
import type { Appointment, AppointmentPatient } from "./types.ts";
import { parseLocalTime } from "./local-time.ts";
import { blocksScheduling } from "./conflicts.ts";
export function appointmentPatient(patient: Patient): AppointmentPatient {
  return {
    id: patient.id,
    reference: patient.reference,
    name: `${patient.identity.firstName} ${patient.identity.lastName}`,
    identity: {
      firstName: patient.identity.firstName,
      lastName: patient.identity.lastName,
      gsm: patient.identity.gsm,
      landline: patient.identity.landline,
    },
  };
}
export function sortAppointments(
  appointments: readonly Appointment[],
): Appointment[] {
  return [...appointments].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.id.localeCompare(b.id),
  );
}
export function upcomingAppointments(
  appointments: readonly Appointment[],
  today: string,
  time: string,
): Appointment[] {
  const now = parseLocalTime(time) ?? 0;
  return sortAppointments(
    appointments.filter(
      (appointment) =>
        (appointment.status === "EN_ATTENTE" ||
          appointment.status === "CONFIRME") &&
        (appointment.date > today ||
          (appointment.date === today &&
            (parseLocalTime(appointment.startTime) ?? 0) +
              appointment.durationMinutes >
              now)),
    ),
  );
}
export function appointmentDashboardStats(
  appointments: readonly Appointment[],
  today: string,
  time: string,
) {
  return {
    todayCount: appointments.filter(
      (appointment) =>
        appointment.date === today && blocksScheduling(appointment.status),
    ).length,
    pendingCount: appointments.filter(
      (appointment) => appointment.status === "EN_ATTENTE",
    ).length,
    upcoming: upcomingAppointments(appointments, today, time),
  };
}
export interface PositionedAppointment {
  appointment: Appointment;
  column: number;
  columns: number;
}
/** Assign lanes to ALL statuses so historical overlaps are never painted over. */
export function positionAppointments(
  appointments: readonly Appointment[],
): PositionedAppointment[] {
  const ordered = sortAppointments(appointments);
  const output: PositionedAppointment[] = [];
  let group: PositionedAppointment[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  let groupDate = "";
  function flush() {
    group.forEach((entry) => {
      entry.columns = laneEnds.length;
      output.push(entry);
    });
    group = [];
    laneEnds = [];
  }
  for (const appointment of ordered) {
    const start = parseLocalTime(appointment.startTime) ?? 0;
    if (appointment.date !== groupDate || start >= groupEnd) {
      flush();
      groupEnd = -1;
      groupDate = appointment.date;
    }
    let column = laneEnds.findIndex((end) => end <= start);
    if (column === -1) column = laneEnds.length;
    laneEnds[column] = start + appointment.durationMinutes;
    groupEnd = Math.max(groupEnd, laneEnds[column]);
    group.push({ appointment, column, columns: 1 });
  }
  flush();
  return output;
}
