import { isCalendarDate } from "../patients/dates.ts";
export { isCalendarDate };

/** Calendar arithmetic uses a UTC Gregorian surrogate only. No appointment
 * wall-clock value is converted into a UTC instant or stored as a Date.
 */
function calendarDate(value: string): Date {
  if (!isCalendarDate(value))
    throw new RangeError("Invalid local calendar date.");
  return new Date(`${value}T12:00:00Z`);
}
export function localWeekday(value: string): number {
  return calendarDate(value).getUTCDay();
}
export function addLocalDays(value: string, days: number): string {
  const date = calendarDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  const next = date.toISOString().slice(0, 10);
  return isCalendarDate(next) ? next : value;
}
export function mondayOfWeek(value: string): string {
  return addLocalDays(value, -((localWeekday(value) + 6) % 7));
}
export function weekDates(value: string): string[] {
  const monday = mondayOfWeek(value);
  return Array.from({ length: 7 }, (_, index) => addLocalDays(monday, index));
}
export function parseLocalTime(value: string): number | null {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
export function formatMinutes(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 1440)
    throw new RangeError("Invalid minute value.");
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
export function endTime(startTime: string, duration: number): string | null {
  const start = parseLocalTime(startTime);
  return start === null ||
    !Number.isInteger(duration) ||
    duration <= 0 ||
    start + duration > 1440
    ? null
    : formatMinutes(start + duration);
}
export function formatLocalDate(
  value: string,
  style: "full" | "short" = "full",
): string {
  return new Intl.DateTimeFormat(
    "fr-MA",
    style === "full"
      ? { dateStyle: "full", timeZone: "UTC" }
      : { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" },
  ).format(calendarDate(value));
}
export function clinicTime(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("fr-MA", {
    timeZone: "Africa/Casablanca",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}
