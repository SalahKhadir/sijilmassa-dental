import { Check, Minus } from "lucide-react";
import type { PatientStatus as Status } from "@/lib/patients/types";
export function PatientStatus({ status }: { status: Status }) {
  const active = status === "active";
  const Icon = active ? Check : Minus;
  return (
    <span
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-md bg-secondary-tint px-2.5 py-1 text-xs font-medium text-foreground"
          : "inline-flex items-center gap-1.5 rounded-md border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
      }
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {active ? "Actif" : "Inactif"}
    </span>
  );
}
