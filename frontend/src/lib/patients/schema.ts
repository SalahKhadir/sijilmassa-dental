import { z } from "zod";
import { clinicDate, isCalendarDate } from "./dates.ts";
import {
  allergyOptions,
  medicalHistoryOptions,
  type CreatePatientInput,
} from "./types.ts";

const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Saisissez ${label}.`)
    .max(80, "Limitez ce champ à 80 caractères.")
    .transform((value) => value.replace(/\s+/g, " "));
const text = (length: number) =>
  z.string().trim().max(length, `Limitez ce champ à ${length} caractères.`);
const reportStatus = z.enum(["unanswered", "reported"], {
  error: "Choisissez Non renseigné ou Renseigné.",
});
const yesNoAnswer = z.enum(["unanswered", "yes", "no"], {
  error: "Choisissez Oui, Non ou Non renseigné.",
});
const phone = text(40).refine((value) => {
  if (!value) return true;
  const digits = value.replace(/\D/g, "");
  return (
    /^[+\d\s().xX#-]+$/.test(value) && digits.length >= 6 && digits.length <= 20
  );
}, "Saisissez un numéro de 6 à 20 chiffres avec les séparateurs usuels. X est accepté pour les exemples fictifs.");

export function patientSchema(today: string = clinicDate()) {
  return z.object({
    identity: z.object({
      firstName: name("le prénom"),
      lastName: name("le nom"),
      sex: z.enum(["unanswered", "F", "M"], {
        error: "Choisissez F, M ou Non renseigné.",
      }),
      dateOfBirth: text(10)
        .refine(
          (value) => !value || isCalendarDate(value),
          "Saisissez une date de naissance valide.",
        )
        .refine(
          (value) => !value || value <= today,
          "La date de naissance ne peut pas être dans le futur.",
        ),
      address: text(300),
      gsm: phone,
      landline: phone,
      profession: text(120),
      cin: text(30),
      medicalCoverage: text(120),
    }),
    medicalHistory: z
      .object({
        reportStatus,
        conditions: z
          .array(
            z.enum(medicalHistoryOptions, {
              error: "Choisissez une catégorie d’antécédent valide.",
            }),
          )
          .max(medicalHistoryOptions.length),
        otherDetails: text(1000),
      })
      .superRefine((value, ctx) => {
        if (new Set(value.conditions).size !== value.conditions.length)
          ctx.addIssue({
            code: "custom",
            path: ["conditions"],
            message: "Sélectionnez chaque catégorie une seule fois.",
          });
        if (
          value.reportStatus === "unanswered" &&
          (value.conditions.length || value.otherDetails)
        )
          ctx.addIssue({
            code: "custom",
            path: ["reportStatus"],
            message: "Confirmez que les antécédents ont été renseignés.",
          });
        if (value.otherDetails && !value.conditions.includes("Autres"))
          ctx.addIssue({
            code: "custom",
            path: ["otherDetails"],
            message: "Cochez Autres pour ajouter une précision.",
          });
      }),
    allergies: z
      .object({
        reportStatus,
        categories: z
          .array(
            z.enum(allergyOptions, {
              error: "Choisissez une catégorie d’allergie valide.",
            }),
          )
          .max(allergyOptions.length),
        clarification: text(1000),
      })
      .superRefine((value, ctx) => {
        if (new Set(value.categories).size !== value.categories.length)
          ctx.addIssue({
            code: "custom",
            path: ["categories"],
            message: "Sélectionnez chaque catégorie une seule fois.",
          });
        if (
          value.reportStatus === "unanswered" &&
          (value.categories.length || value.clarification)
        )
          ctx.addIssue({
            code: "custom",
            path: ["reportStatus"],
            message: "Confirmez que les allergies ont été renseignées.",
          });
      }),
    healthQuestionnaire: z.object({
      underMedicalTreatment: yesNoAnswer,
      pregnant: yesNoAnswer,
      additionalInformation: text(2000),
      reasonForConsultation: text(2000),
    }),
    status: z.enum(["active", "inactive"], {
      error: "Sélectionnez un statut administratif valide.",
    }),
  });
}
export function emptyPatientInput(): CreatePatientInput {
  return {
    identity: {
      firstName: "",
      lastName: "",
      sex: "unanswered",
      dateOfBirth: "",
      address: "",
      gsm: "",
      landline: "",
      profession: "",
      cin: "",
      medicalCoverage: "",
    },
    medicalHistory: {
      reportStatus: "unanswered",
      conditions: [],
      otherDetails: "",
    },
    allergies: {
      reportStatus: "unanswered",
      categories: [],
      clarification: "",
    },
    healthQuestionnaire: {
      underMedicalTreatment: "unanswered",
      pregnant: "unanswered",
      additionalInformation: "",
      reasonForConsultation: "",
    },
    status: "active",
  };
}
