import { CheckCircle2, FilePenLine } from "lucide-react";
import {
  prescriptionStatuses,
  type PrescriptionStatus as Status,
} from "@/lib/prescriptions/types";
export function PrescriptionStatus({ status }: { status: Status }) {
  const Icon = status === "BROUILLON" ? FilePenLine : CheckCircle2;
  return (
    <span
      className={`inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-semibold ${status === "BROUILLON" ? "bg-primary-tint text-primary" : "bg-secondary-tint text-foreground"}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {prescriptionStatuses[status]}
    </span>
  );
}
