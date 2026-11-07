import { localWeekday, parseLocalTime } from "./local-time.ts";
export interface WorkingPeriod {
  start: string;
  end: string;
}
export interface DevelopmentSchedule {
  label: string;
  minimumDuration: number;
  maximumDuration: number;
  defaultDuration: number;
  gridStart: string;
  gridEnd: string;
  weeklyHours: Readonly<Record<number, readonly WorkingPeriod[]>>;
}
/** Sample values only. Real clinic hours and slot limits must be confirmed. */
export const developmentSchedule: DevelopmentSchedule = {
  label: "Horaires de développement à confirmer avec le cabinet",
  minimumDuration: 30,
  maximumDuration: 180,
  defaultDuration: 30,
  gridStart: "09:00",
  gridEnd: "18:00",
  weeklyHours: {
    1: [
      { start: "09:00", end: "12:30" },
      { start: "14:00", end: "18:00" },
    ],
    2: [
      { start: "09:00", end: "12:30" },
      { start: "14:00", end: "18:00" },
    ],
    3: [
      { start: "09:00", end: "12:30" },
      { start: "14:00", end: "18:00" },
    ],
    4: [
      { start: "09:00", end: "12:30" },
      { start: "14:00", end: "18:00" },
    ],
    5: [
      { start: "09:00", end: "12:30" },
      { start: "14:00", end: "18:00" },
    ],
    6: [{ start: "09:00", end: "13:00" }],
    0: [],
  },
};
export function withinWorkingHours(
  date: string,
  startTime: string,
  duration: number,
  schedule: DevelopmentSchedule = developmentSchedule,
): boolean {
  const start = parseLocalTime(startTime);
  if (
    start === null ||
    !Number.isInteger(duration) ||
    duration <= 0 ||
    start + duration > 1440
  )
    return false;
  return (schedule.weeklyHours[localWeekday(date)] ?? []).some((period) => {
    const from = parseLocalTime(period.start);
    const to = parseLocalTime(period.end);
    return (
      from !== null && to !== null && start >= from && start + duration <= to
    );
  });
}

export function describeDevelopmentSchedule(
  schedule: DevelopmentSchedule = developmentSchedule,
): string {
  const days = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];
  const groups: { first: string; last: string; hours: string }[] = [];
  for (let index = 0; index < 7; index += 1) {
    const periods = schedule.weeklyHours[(index + 1) % 7] ?? [];
    const hours = periods.length
      ? periods.map((period) => `${period.start}–${period.end}`).join(" et ")
      : "fermé";
    const previous = groups.at(-1);
    if (previous?.hours === hours) previous.last = days[index];
    else groups.push({ first: days[index], last: days[index], hours });
  }
  return groups
    .map(
      (group) =>
        `${group.first === group.last ? group.first : `${group.first}–${group.last.toLowerCase()}`} ${group.hours}`,
    )
    .join(" · ");
}
