import { Clock3, Check, CheckCheck, X, UserX } from "lucide-react";
import {
  appointmentStatuses,
  type AppointmentStatus as Status,
} from "@/lib/appointments/types";
import { cn } from "@/lib/utils";
const icons = {
  EN_ATTENTE: Clock3,
  CONFIRME: Check,
  TERMINE: CheckCheck,
  ANNULE: X,
  ABSENT: UserX,
};
export function AppointmentStatus({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  const metadata = appointmentStatuses[status];
  const Icon = icons[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
        metadata.className,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3 shrink-0" />
      {metadata.label}
    </span>
  );
}
