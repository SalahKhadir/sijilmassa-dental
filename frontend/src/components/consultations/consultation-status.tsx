import { CheckCircle2, FilePenLine } from "lucide-react";
import {
  consultationStatuses,
  type ConsultationStatus as Status,
} from "@/lib/consultations/types";
export function ConsultationStatus({ status }: { status: Status }) {
  const Icon = status === "BROUILLON" ? FilePenLine : CheckCircle2;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${status === "BROUILLON" ? "bg-primary-tint text-primary" : "bg-secondary-tint text-foreground"}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {consultationStatuses[status]}
    </span>
  );
}
