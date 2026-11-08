import type { Role } from "./types";

export type Permission = "administrative" | "clinical";
export const roleLabels: Record<Role, string> = { DENTIST: "Dentiste", RECEPTIONIST: "Accueil" };
export function hasPermission(role: Role, permission: Permission): boolean {
  return permission === "administrative" || role === "DENTIST";
}
export function dashboardFor(role: Role): string {
  return role === "DENTIST" ? "/" : "/rendez-vous";
}
export function canAccessPath(role: Role, pathname: string): boolean {
  if (role === "DENTIST") return true;
  // Mixed patient, billing and document screens contain clinical content today.
  // Keep them closed until administrative projections are explicitly approved.
  return pathname === "/rendez-vous" || pathname.startsWith("/rendez-vous/");
}
