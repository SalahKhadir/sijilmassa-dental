import { z } from "zod";
import { addLocalDays, isCalendarDate, parseLocalTime, weekDates } from "../local-time";
import type { PersistentAppointment } from "./client";
import { appointmentTypeValues, type Appointment, type AppointmentPatient } from "../types";
import type { AdministrativePatient } from "../../patients/api/client";

export const CLINIC_ZONE = "Africa/Casablanca";
const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
export function clinicParts(instant: string) {
  const value = new Date(instant);
  if (!Number.isFinite(value.getTime())) throw new RangeError("Instant invalide");
  const parts = Object.fromEntries(formatter.formatToParts(value).map(part => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`, time = `${parts.hour}:${parts.minute}`;
  const offsetMs = Date.parse(`${date}T${time}:${parts.second}Z`) - Math.floor(value.getTime() / 1000) * 1000;
  return { date, time, offsetMinutes: offsetMs / 60000 };
}
/** Enumerate the actual offsets around this wall-clock date; round-trip rejects gaps, retaining both repeated-hour choices. */
export function wallClockCandidates(date: string, time: string): string[] {
  if (!isCalendarDate(date) || parseLocalTime(time) === null) return [];
  const anchor = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) offsets.add(clinicParts(new Date(anchor + hours * 3600000).toISOString()).offsetMinutes);
  return [...new Set([...offsets].map(offset => new Date(anchor - offset * 60000).toISOString()).filter(value => {
    const parts = clinicParts(value); return parts.date === date && parts.time === time;
  }))].sort();
}
export function offsetLabel(instant: string) {
  const offset = clinicParts(instant).offsetMinutes;
  return `UTC${offset >= 0 ? "+" : "−"}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}`;
}
export function instantLabel(instant: string) {
  const parts = clinicParts(instant); return `${parts.time} (${offsetLabel(instant)})`;
}
export function calendarDates(date: string, view: "day" | "week") { return view === "week" ? weekDates(date) : [date]; }
export function calendarWindow(date: string, view: "day" | "week") {
  const dates = calendarDates(date, view);
  const from = wallClockCandidates(dates[0], "00:00")[0];
  const to = wallClockCandidates(addLocalDays(dates.at(-1)!, 1), "00:00")[0];
  if (!from || !to) throw new RangeError("Les bornes de cette période ne peuvent pas être résolues.");
  return { from, to };
}
export function isTransitionPeriod(date: string, view: "day" | "week") {
  return calendarDates(date, view).some(day => {
    const window = calendarWindow(day, "day"); return Date.parse(window.to) - Date.parse(window.from) !== 86400000;
  });
}
export type CalendarEvent = Pick<Appointment, "id" | "patientId" | "date" | "startTime" | "durationMinutes" | "type" | "status">;
export function calendarEvent(value: PersistentAppointment): CalendarEvent {
  const local = clinicParts(value.startAt);
  return { id: value.id, patientId: value.patientId, date: local.date, startTime: local.time,
    durationMinutes: (Date.parse(value.endAt) - Date.parse(value.startAt)) / 60000, type: value.type, status: value.status };
}
export function patientSummary(value: AdministrativePatient): AppointmentPatient {
  return { id: value.id, reference: value.reference, name: `${value.identity.firstName} ${value.identity.lastName}`,
    identity: { firstName: value.identity.firstName, lastName: value.identity.lastName, gsm: value.identity.gsm, landline: value.identity.landline } };
}
export const appointmentFormSchema = z.object({
  patientId: z.uuid({ error: "Sélectionnez un patient enregistré." }),
  date: z.string().refine(isCalendarDate, "Saisissez une date valide."),
  time: z.string().refine(value => parseLocalTime(value) !== null, "Saisissez une heure au format HH:mm."),
  duration: z.number().int().min(30, "La durée minimale est de 30 minutes.").max(180, "La durée maximale est de 180 minutes."),
  type: z.enum(appointmentTypeValues), occurrence: z.string(),
}).superRefine((value, context) => {
  if (!isCalendarDate(value.date) || parseLocalTime(value.time) === null) return;
  const candidates = wallClockCandidates(value.date, value.time);
  const start = candidates.length === 1 ? candidates[0] : candidates.includes(value.occurrence) ? value.occurrence : undefined;
  if (!start) context.addIssue({ code: "custom", path: ["occurrence"], message: candidates.length ? "Cette heure se répète : choisissez explicitement le décalage." : "Cette heure n’existe pas dans le fuseau du cabinet. Choisissez une autre heure." });
  if (start && Number.isInteger(value.duration)) {
    const end = new Date(Date.parse(start) + value.duration * 60000).toISOString(); const localEnd = clinicParts(end);
    if (!(localEnd.date === value.date || (localEnd.date === addLocalDays(value.date, 1) && localEnd.time === "00:00"))) context.addIssue({ code: "custom", path: ["duration"], message: "Le rendez-vous doit se terminer au plus tard à minuit local." });
  }
});
export type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;
export function appointmentInput(value: AppointmentFormValues) {
  const valid = appointmentFormSchema.parse(value);
  const candidates = wallClockCandidates(valid.date, valid.time);
  const startAt = candidates.length === 1 ? candidates[0] : valid.occurrence;
  return { patientId: valid.patientId, startAt, endAt: new Date(Date.parse(startAt) + valid.duration * 60000).toISOString(), type: valid.type };
}
