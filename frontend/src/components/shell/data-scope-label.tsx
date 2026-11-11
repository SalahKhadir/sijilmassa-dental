"use client";
import { usePathname } from "next/navigation";
export function DataScopeLabel({ compact = false }: { compact?: boolean }) {
  const path = usePathname();
  const persistent = path === "/" || path.startsWith("/patients") || path.startsWith("/rendez-vous") || path.startsWith("/consultations");
  if (compact) return persistent ? "Patients, agenda et clinique enregistrés" : "Prototype frontend · Phase 7";
  return persistent ? "Sijilmassa Dental · Patients, rendez-vous et consultations enregistrés · Autres modules en démonstration" : "Sijilmassa Dental · Données fictives · Modifications temporaires en mémoire";
}
