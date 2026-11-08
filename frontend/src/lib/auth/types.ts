import { z } from "zod";

export const identitySchema = z.object({
  id: z.uuid(),
  username: z.string().min(1).max(64),
  role: z.enum(["DENTIST", "RECEPTIONIST"]),
}).strict();
export type Identity = z.infer<typeof identitySchema>;
export type Role = Identity["role"];
export type AuthFailure = { status: "error"; code: number; message: string };
export type SessionResult = { status: "authenticated"; user: Identity } | { status: "unauthenticated" } | AuthFailure;

export function authFailure(code: number): AuthFailure {
  const messages: Record<number, string> = {
    400: "Vérifiez les champs du formulaire.",
    401: "Connexion refusée. Vérifiez vos identifiants.",
    403: "La vérification de sécurité a expiré. Réessayez explicitement.",
    429: "Trop de tentatives. Patientez une minute avant de réessayer.",
  };
  return { status: "error", code, message: messages[code] ?? "Le service de connexion est indisponible. Réessayez dans un instant." };
}
