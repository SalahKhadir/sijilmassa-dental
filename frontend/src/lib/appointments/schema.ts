import { z } from "zod";
import { appointmentTypes } from "./types.ts";
import { endTime, isCalendarDate, parseLocalTime } from "./local-time.ts";
import {
  developmentSchedule,
  withinWorkingHours,
  type DevelopmentSchedule,
} from "./schedule.ts";
export function appointmentSchema(
  schedule: DevelopmentSchedule = developmentSchedule,
) {
  return z
    .object({
      patientId: z.string().trim().min(1, "Sélectionnez un patient existant."),
      date: z.string().refine(isCalendarDate, "Saisissez une date valide."),
      startTime: z
        .string()
        .refine(
          (value) => parseLocalTime(value) !== null,
          "Saisissez une heure valide au format HH:mm.",
        ),
      durationMinutes: z
        .number({ error: "Saisissez une durée en minutes." })
        .int("La durée doit être un nombre entier de minutes.")
        .min(
          schedule.minimumDuration,
          `La durée minimale du prototype est de ${schedule.minimumDuration} minutes.`,
        )
        .max(
          schedule.maximumDuration,
          `La durée maximale du prototype est de ${schedule.maximumDuration} minutes.`,
        ),
      type: z.enum(
        Object.keys(appointmentTypes) as [
          keyof typeof appointmentTypes,
          ...Array<keyof typeof appointmentTypes>,
        ],
        { error: "Sélectionnez une catégorie de rendez-vous." },
      ),
      reason: z
        .string()
        .trim()
        .max(300, "Limitez le motif administratif à 300 caractères."),
      notes: z
        .string()
        .trim()
        .max(1000, "Limitez les notes administratives à 1 000 caractères."),
    })
    .superRefine((value, context) => {
      if (
        !isCalendarDate(value.date) ||
        parseLocalTime(value.startTime) === null ||
        !Number.isInteger(value.durationMinutes) ||
        value.durationMinutes < schedule.minimumDuration ||
        value.durationMinutes > schedule.maximumDuration
      )
        return;
      if (!endTime(value.startTime, value.durationMinutes))
        context.addIssue({
          code: "custom",
          path: ["durationMinutes"],
          message: "Le rendez-vous doit se terminer le même jour.",
        });
      else if (
        !withinWorkingHours(
          value.date,
          value.startTime,
          value.durationMinutes,
          schedule,
        )
      )
        context.addIssue({
          code: "custom",
          path: ["startTime"],
          message:
            "Choisissez un créneau dans les horaires de développement affichés, sans traverser la pause.",
        });
    });
}
