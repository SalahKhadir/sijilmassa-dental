import { z } from "zod";
import { isCalendarDate } from "../patients/dates.ts";
const date = z.string().refine(isCalendarDate, "Saisissez une date valide.");
export const treatmentSchema = z.object({
  id: z.string().optional(),
  treatmentDate: date,
  description: z
    .string()
    .trim()
    .min(1, "Décrivez le soin réalisé.")
    .max(1000, "Limitez la description à 1 000 caractères."),
  toothReference: z
    .string()
    .trim()
    .max(50, "Limitez la référence dentaire à 50 caractères.")
    .regex(
      /^[\p{L}\p{N}\s.,/()\-]*$/u,
      "Utilisez des lettres, chiffres ou séparateurs simples.",
    ),
  notes: z
    .string()
    .trim()
    .max(2000, "Limitez les notes du soin à 2 000 caractères."),
});
export const consultationSchema = z.object({
  patientId: z.string().min(1, "Sélectionnez un patient."),
  appointmentId: z.string(),
  consultationDate: date,
  chiefComplaint: z
    .string()
    .trim()
    .min(1, "Indiquez le motif de consultation.")
    .max(500, "Limitez le motif à 500 caractères."),
  clinicalObservations: z
    .string()
    .trim()
    .max(5000, "Limitez les observations à 5 000 caractères."),
  assessment: z
    .string()
    .trim()
    .max(5000, "Limitez l’évaluation à 5 000 caractères."),
  treatmentPlan: z
    .string()
    .trim()
    .max(5000, "Limitez le plan de traitement à 5 000 caractères."),
  notes: z.string().trim().max(5000, "Limitez les notes à 5 000 caractères."),
  treatments: z
    .array(treatmentSchema)
    .max(50, "Limitez la consultation à 50 soins."),
});
export const emptyConsultation = (date: string) => ({
  patientId: "",
  appointmentId: "",
  consultationDate: date,
  chiefComplaint: "",
  clinicalObservations: "",
  assessment: "",
  treatmentPlan: "",
  notes: "",
  treatments: [],
});
