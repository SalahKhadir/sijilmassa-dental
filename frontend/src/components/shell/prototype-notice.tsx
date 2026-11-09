"use client";
import Link from "next/link";
import { PermissionGate } from "@/components/auth/session-boundary";
import { usePathname } from "next/navigation";
export function PrototypeNotice() { const path = usePathname(); return path.startsWith("/patients") || path.startsWith("/parametres") ? null : <p className="mb-5 rounded-lg border bg-secondary-tint p-4 text-sm">Démonstration : données fictives en mémoire. Aucun lien avec les patients enregistrés. <PermissionGate permission="clinical"><Link className="underline" href="/demo/patients">Annuaire synthétique</Link></PermissionGate></p>; }
