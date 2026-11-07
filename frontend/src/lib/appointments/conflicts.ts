import type { Appointment, AppointmentStatus } from "./types.ts";
import { parseLocalTime } from "./local-time.ts";
export function blocksScheduling(status: AppointmentStatus): boolean {
  return (
    status === "EN_ATTENTE" || status === "CONFIRME" || status === "TERMINE"
  );
}
export function intervalsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endA && startB < endB && startA < endB && startB < endA;
}
export function findAppointmentConflict(
  candidate: Pick<
    Appointment,
    "date" | "startTime" | "durationMinutes" | "status"
  >,
  appointments: readonly Appointment[],
  excludeId?: string,
): Appointment | undefined {
  if (!blocksScheduling(candidate.status)) return undefined;
  const start = parseLocalTime(candidate.startTime);
  if (start === null) return undefined;
  return [...appointments]
    .sort(
      (a, b) =>
        a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id),
    )
    .find((appointment) => {
      if (
        appointment.id === excludeId ||
        appointment.date !== candidate.date ||
        !blocksScheduling(appointment.status)
      )
        return false;
      const other = parseLocalTime(appointment.startTime);
      return (
        other !== null &&
        intervalsOverlap(
          start,
          start + candidate.durationMinutes,
          other,
          other + appointment.durationMinutes,
        )
      );
    });
}
