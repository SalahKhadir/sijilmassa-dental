import Link from "next/link";
import type { ReactNode } from "react";
export default function Layout({ children }: { children: ReactNode }) { return <><p className="rounded-lg border bg-secondary-tint p-4 text-sm">Démonstration synthétique : ces patients ne proviennent pas de la base du cabinet. <Link className="underline" href="/patients">Patients enregistrés</Link></p>{children}</>; }
