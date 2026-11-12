import Link from "next/link";
import type { Invoice, Payment } from "@/lib/billing/types";
import type { PrescriptionPatient } from "@/lib/prescriptions/types";
import { formatPatientDate } from "@/lib/patients/dates";
import { invoiceStatus, settlement } from "@/lib/billing/calculations";
import { formatMinor } from "@/lib/billing/money";
import { InvoiceStatus } from "./invoice-status";
export function InvoiceList({
  invoices,
  payments,
  patients,
}: {
  invoices: readonly Invoice[];
  payments: readonly Payment[];
  patients: readonly PrescriptionPatient[];
}) {
  if (!invoices.length)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Aucune facture à afficher. Créez une facture ou ajustez les filtres.
      </p>
    );
  return (
    <>
      <div className="hidden overflow-x-auto xl:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Liste des factures, montants et règlements
          </caption>
          <thead className="border-b bg-muted">
            <tr>
              {[
                "Facture",
                "Patient",
                "Date",
                "Total",
                "Reçu",
                "Reste à encaisser",
                "Statut",
              ].map((label) => (
                <th key={label} scope="col" className="px-3 py-4 font-semibold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {invoices.map((invoice) => {
              const balance = settlement(invoice, payments);
              const patient = patients.find(
                (person) => person.id === invoice.patientId,
              );
              return (
                <tr key={invoice.id}>
                  <td className="px-3 py-4">
                    <Link
                      href={`/demo/facturation/${invoice.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {invoice.invoiceNumber ||
                        `Brouillon ${invoice.id.slice(-3)}`}
                    </Link>
                  </td>
                  <td className="max-w-56 px-3 py-4 break-words">
                    {invoice.issuedPatient?.name ??
                      patient?.name ??
                      "Patient introuvable"}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap">
                    {formatPatientDate(invoice.issueDate)}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap tabular-nums">
                    {formatMinor(balance.total)}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap tabular-nums">
                    {formatMinor(balance.paid)}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap tabular-nums">
                    {invoice.lifecycle === "BROUILLON"
                      ? "—"
                      : formatMinor(balance.receivable)}
                  </td>
                  <td className="px-3 py-4">
                    <InvoiceStatus status={invoiceStatus(invoice, payments)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="space-y-4 xl:hidden">
        {invoices.map((invoice) => {
          const balance = settlement(invoice, payments);
          const patient = patients.find(
            (person) => person.id === invoice.patientId,
          );
          return (
            <li key={invoice.id} className="space-y-4 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  href={`/demo/facturation/${invoice.id}`}
                  className="font-semibold text-primary hover:underline"
                >
                  {invoice.invoiceNumber || `Brouillon ${invoice.id.slice(-3)}`}
                </Link>
                <InvoiceStatus status={invoiceStatus(invoice, payments)} />
              </div>
              <p className="text-sm break-words">
                {invoice.issuedPatient?.name ??
                  patient?.name ??
                  "Patient introuvable"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatPatientDate(invoice.issueDate)}
              </p>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                {[
                  ["Total", formatMinor(balance.total)],
                  ["Reçu", formatMinor(balance.paid)],
                  [
                    "Reste à encaisser",
                    invoice.lifecycle === "BROUILLON"
                      ? "—"
                      : formatMinor(balance.receivable),
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </>
  );
}
