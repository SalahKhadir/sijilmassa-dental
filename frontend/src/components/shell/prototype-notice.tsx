"use client";
import Link from "next/link";
import { PermissionGate } from "@/components/auth/session-boundary";
import { usePathname } from "next/navigation";
export function PrototypeNotice() {
  const path = usePathname();
  if (path !== "/demo" && !path.startsWith("/demo/")) return null;
  return (
    <p className="rounded-lg border bg-secondary-tint p-4 text-sm">
      Démonstration : données fictives en mémoire. Aucun lien avec les patients enregistrés.{" "}
      <PermissionGate permission="clinical">
        <Link className="underline" href="/demo/patients">Annuaire synthétique</Link>
        <Link className="ml-3 underline" href="/demo/rendez-vous">Agenda synthétique</Link>
        <Link className="ml-3 underline" href="/demo">Tableau de bord synthétique</Link>
      </PermissionGate>
    </p>
  );
}
