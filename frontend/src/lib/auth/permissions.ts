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
  if (/^\/facturation(?:\/(?:nouvelle|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?:\/modifier)?))?\/?$/i.test(pathname)) return true;
  if (/^\/patients(?:\/(?:nouveau|[0-9a-fA-F-]{36}(?:\/(?:modifier|finances|factures))?))?\/?$/.test(pathname)) return true;
  return pathname === "/rendez-vous" || pathname.startsWith("/rendez-vous/");
}
