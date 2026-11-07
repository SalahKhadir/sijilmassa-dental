import {
  CheckCircle2,
  Clock3,
  FileCheck2,
  FilePenLine,
  XCircle,
} from "lucide-react";
import {
  invoiceStatuses,
  type InvoiceStatus as Status,
} from "@/lib/billing/types";
const icons = {
  BROUILLON: FilePenLine,
  EMISE: FileCheck2,
  PARTIELLEMENT_PAYEE: Clock3,
  PAYEE: CheckCircle2,
  ANNULEE: XCircle,
};
export function InvoiceStatus({ status }: { status: Status }) {
  const Icon = icons[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${status === "ANNULEE" ? "border border-border text-muted-foreground" : status === "BROUILLON" || status === "PARTIELLEMENT_PAYEE" ? "bg-primary-tint text-primary" : "bg-secondary-tint text-foreground"}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {invoiceStatuses[status]}
    </span>
  );
}
