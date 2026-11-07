import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Saisissez votre identifiant."),
  password: z
    .string()
    .min(1, "Saisissez votre mot de passe.")
    .refine(
      (value) => value.trim().length > 0,
      "Saisissez votre mot de passe.",
    ),
});
export type LoginCredentials = z.infer<typeof loginSchema>;
