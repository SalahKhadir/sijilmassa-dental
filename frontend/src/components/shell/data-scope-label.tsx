"use client";
import { usePathname } from "next/navigation";
export function DataScopeLabel({ compact = false }: { compact?: boolean }) {
  const path = usePathname();
  const persistent = path === "/" || path.startsWith("/patients") || path.startsWith("/rendez-vous") || path.startsWith("/consultations") || (path.startsWith("/documents") && !path.startsWith("/documents/assurances"));
  if (compact) return persistent ? "Patients, clinique et ordonnances enregistrés" : "Prototype frontend · Phase 7";
  return persistent ? "Sijilmassa Dental · Patients, rendez-vous, consultations et ordonnances enregistrés · Autres modules en démonstration" : "Sijilmassa Dental · Données fictives · Modifications temporaires en mémoire";
}
