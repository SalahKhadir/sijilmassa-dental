"use client";
import { usePathname } from "next/navigation";
export function DataScopeLabel({ compact = false }: { compact?: boolean }) {
  const path = usePathname();
  const persistent = path === "/" || path.startsWith("/facturation") || path.startsWith("/patients") || path.startsWith("/rendez-vous") || path.startsWith("/consultations") || path.startsWith("/documents");
  if (compact) return persistent ? "Données enregistrées au cabinet" : "Prototype frontend · Phase 7";
  return persistent ? "Sijilmassa Dental · Données enregistrées au cabinet" : "Sijilmassa Dental · Données fictives · Modifications temporaires en mémoire";
}
