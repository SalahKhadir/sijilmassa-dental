import { Wallet, ReceiptText, CircleDollarSign } from "lucide-react";
import type { financialSummary } from "@/lib/billing/calculations";
import { formatMinor } from "@/lib/billing/money";
import { StatCard } from "@/components/dashboard/stat-card";
export function FinancialSummary({
  summary,
}: {
  summary: ReturnType<typeof financialSummary>;
}) {
  return (
    <section
      aria-label="Indicateurs financiers"
      className="grid gap-4 md:grid-cols-3"
    >
      <StatCard
        title="Montant facturé"
        value={formatMinor(summary.invoiced)}
        detail="Factures émises, annulations exclues"
        icon={ReceiptText}
      />
      <StatCard
        title="Montant encaissé"
        value={formatMinor(summary.collected)}
        detail="Règlements enregistrés"
        icon={Wallet}
      />
      <StatCard
        title="Reste à encaisser"
        value={formatMinor(summary.outstanding)}
        detail={`${summary.unpaid} sans règlement · ${summary.partiallyPaid} partiellement ${summary.partiallyPaid > 1 ? "payées" : "payée"}`}
        icon={CircleDollarSign}
        primary
      />
    </section>
  );
}
