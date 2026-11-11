import type { ReactNode } from "react";
export default function Layout({children}: {children: ReactNode}) { return <><p className="rounded-lg border bg-secondary-tint p-4 text-sm">Agenda synthétique : ces rendez-vous ne proviennent pas de PostgreSQL.</p>{children}</>; }
