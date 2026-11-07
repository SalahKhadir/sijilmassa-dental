"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatPatientDate } from "@/lib/patients/dates";
import { formatMinor } from "@/lib/billing/money";
import { invoiceStatus, settlement } from "@/lib/billing/calculations";
import { useFinancialData } from "./use-billing-data";
import { BillingErrorState, BillingLoading } from "./billing-states";
import { InvoiceStatus } from "./invoice-status";
import { PaymentHistory } from "./payment-history";
export function PatientFinancialHistory({
  patientId,
  consultationId,
}: {
  patientId: string;
  consultationId?: string;
}) {
  const { state, retry } = useFinancialData();
  if (state.status === "loading") return <BillingLoading />;
  if (state.status === "error") return <BillingErrorState retry={retry} />;
  const { payments } = state.data;
  const invoices = state.data.invoices
    .filter(
      (invoice) =>
        invoice.patientId === patientId &&
        (!consultationId || invoice.consultationId === consultationId),
    )
    .sort(
      (a, b) =>
        b.issueDate.localeCompare(a.issueDate) || b.id.localeCompare(a.id),
    );
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b">
        <CardTitle>
          {consultationId
            ? "Factures de la consultation"
            : "Historique financier"}
        </CardTitle>
        <Button asChild variant="secondary">
          <Link
            href={`/facturation/nouvelle?patientId=${patientId}${consultationId ? `&consultationId=${consultationId}` : ""}`}
          >
            {consultationId ? "Créer une facture" : "Nouvelle facture"}
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <p className="text-xs leading-5 text-muted-foreground">
          Prix, reçu et reste sont regroupés par facture. Les règlements ne sont
          pas répartis entre les prestations.
        </p>
        {!invoices.length ? (
          <p className="text-sm text-muted-foreground">
            Aucune facture enregistrée pour ce dossier.
          </p>
        ) : (
          <ul className="divide-y">
            {invoices.map((invoice) => {
              const balance = settlement(invoice, payments);
              const entries = payments.filter(
                (payment) => payment.invoiceId === invoice.id,
              );
              return (
                <li
                  key={invoice.id}
                  className="space-y-4 py-5 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link
                      className="text-sm font-semibold text-primary hover:underline"
                      href={`/facturation/${invoice.id}`}
                    >
                      {invoice.invoiceNumber ||
                        `Brouillon ${invoice.id.slice(-3)}`}
                    </Link>
                    <InvoiceStatus status={invoiceStatus(invoice, entries)} />
                  </div>
                  <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-5">
                    {[
                      ["Date", formatPatientDate(invoice.issueDate)],
                      [
                        "Traitements / prestations",
                        invoice.lines
                          .map((line) => line.description)
                          .join(" · ") || "Aucune ligne",
                      ],
                      [
                        invoice.lifecycle === "BROUILLON"
                          ? "Prix prévisionnel"
                          : "Prix",
                        formatMinor(balance.total),
                      ],
                      ["Reçu", formatMinor(balance.paid)],
                      [
                        "Reste",
                        invoice.lifecycle === "BROUILLON"
                          ? "À établir après émission"
                          : formatMinor(balance.receivable),
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="mt-1 leading-6 break-words whitespace-pre-wrap">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {invoice.lifecycle === "ANNULEE" && (
                    <p className="text-xs text-muted-foreground">
                      Montant initial annulé, exclu des sommes à encaisser.
                    </p>
                  )}
                  <details>
                    <summary className="cursor-pointer rounded-sm py-2 text-sm font-semibold text-primary">
                      Règlements · {entries.length}
                    </summary>
                    <div className="mt-2 rounded-lg border p-4">
                      <PaymentHistory payments={entries} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
