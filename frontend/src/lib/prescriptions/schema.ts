import { z } from "zod";
import { isCalendarDate } from "../patients/dates.ts";
const text = (max: number, message: string) =>
  z.string().trim().max(max, message);
export const medicationSchema = z.object({
  id: z.string().min(1).optional(),
  medicationName: text(200, "Limitez le nom à 200 caractères."),
  dosage: text(300, "Limitez la posologie à 300 caractères."),
  frequency: text(200, "Limitez la fréquence à 200 caractères."),
  duration: text(200, "Limitez la durée à 200 caractères."),
  instructions: text(1500, "Limitez les instructions à 1 500 caractères."),
});
export const prescriptionSchema = z.object({
  patientId: z.string().min(1, "Sélectionnez un patient."),
  consultationId: z.string(),
  issuedDate: z.string().refine(isCalendarDate, "Saisissez une date valide."),
  medications: z
    .array(medicationSchema)
    .max(20, "Une ordonnance peut contenir au plus 20 lignes."),
  generalInstructions: text(
    2000,
    "Limitez les instructions générales à 2 000 caractères.",
  ),
});
export const finalizedPrescriptionSchema = prescriptionSchema.superRefine(
  (input, context) => {
    if (!input.medications.length)
      context.addIssue({
        code: "custom",
        path: ["medications"],
        message: "Ajoutez au moins un médicament avant de finaliser.",
      });
    input.medications.forEach((medication, index) => {
      for (const [key, message] of [
        ["medicationName", "Renseignez le nom du médicament."],
        ["dosage", "Renseignez la posologie."],
        ["frequency", "Renseignez la fréquence."],
        ["duration", "Renseignez la durée."],
      ] as const) {
        if (!medication[key])
          context.addIssue({
            code: "custom",
            path: ["medications", index, key],
            message,
          });
      }
    });
  },
);
export const emptyMedication = () => ({
  medicationName: "",
  dosage: "",
  frequency: "",
  duration: "",
  instructions: "",
});
export const emptyPrescription = (issuedDate: string) => ({
  patientId: "",
  consultationId: "",
  issuedDate,
  medications: [],
  generalInstructions: "",
});
