"use client";
import { usePathname } from "next/navigation";
export function DataScopeLabel({ compact = false }: { compact?: boolean }) {
  const path = usePathname();
  const demo = path === "/demo" || path.startsWith("/demo/");
  if (compact) return demo ? "Données de démonstration" : "Données enregistrées au cabinet";
  return demo ? "Sijilmassa Dental · Données fictives · Modifications temporaires en mémoire" : "Sijilmassa Dental · Données enregistrées au cabinet";
}
