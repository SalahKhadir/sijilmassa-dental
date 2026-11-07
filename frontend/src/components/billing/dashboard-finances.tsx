import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { financialSummary } from "@/lib/billing/calculations";
import { formatMinor } from "@/lib/billing/money";
export function DashboardFinances({
  summary,
}: {
  summary: ReturnType<typeof financialSummary> | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Suivi financier</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="space-y-4 text-sm">
          {[
            ["Montant facturé", summary ? formatMinor(summary.invoiced) : "…"],
            [
              "Reste à encaisser",
              summary ? formatMinor(summary.outstanding) : "…",
            ],
            ["Factures impayées", summary ? String(summary.unpaid) : "…"],
            [
              "Partiellement payées",
              summary ? String(summary.partiallyPaid) : "…",
            ],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs leading-5 text-muted-foreground">
          Ensemble des factures émises et règlements du prototype. Brouillons et
          annulations exclus.
        </p>
        <Link
          className="inline-flex min-h-10 items-center text-sm font-semibold text-primary hover:underline"
          href="/facturation"
        >
          Ouvrir la facturation
        </Link>
      </CardContent>
    </Card>
  );
}
