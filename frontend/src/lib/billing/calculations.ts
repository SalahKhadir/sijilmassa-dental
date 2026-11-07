import type { Invoice, InvoiceStatus, Payment } from "./types.ts";
import { BillingError, lineTotal, sumMinor } from "./money.ts";
export function invoiceTotal(invoice: Pick<Invoice, "lines">) {
  return sumMinor(
    invoice.lines.map((line) => lineTotal(line.quantity, line.unitPriceMinor)),
  );
}
export function amountPaid(invoiceId: string, payments: readonly Payment[]) {
  return sumMinor(
    payments
      .filter((payment) => payment.invoiceId === invoiceId)
      .map((payment) => payment.amountMinor),
  );
}
export function settlement(invoice: Invoice, payments: readonly Payment[]) {
  const total = invoiceTotal(invoice);
  const paid = amountPaid(invoice.id, payments);
  if (paid > total)
    throw new BillingError("Les règlements dépassent le total de la facture.");
  return {
    total,
    paid,
    remaining: total - paid,
    receivable: invoice.lifecycle === "EMISE" ? total - paid : 0,
  };
}
export function invoiceStatus(
  invoice: Invoice,
  payments: readonly Payment[],
): InvoiceStatus {
  if (invoice.lifecycle !== "EMISE") return invoice.lifecycle;
  const { paid, remaining } = settlement(invoice, payments);
  return remaining === 0 ? "PAYEE" : paid > 0 ? "PARTIELLEMENT_PAYEE" : "EMISE";
}
export function validatePaymentAmount(
  invoice: Invoice,
  payments: readonly Payment[],
  amount: number,
) {
  if (invoice.lifecycle !== "EMISE")
    throw new BillingError(
      "Un règlement nécessite une facture émise et non annulée.",
    );
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new BillingError(
      "Le règlement doit être strictement positif en centimes entiers.",
      "amountMinor",
    );
  if (amount > settlement(invoice, payments).remaining)
    throw new BillingError(
      "Le règlement dépasse le reste à encaisser.",
      "amountMinor",
    );
}
export function financialSummary(
  invoices: readonly Invoice[],
  payments: readonly Payment[],
) {
  const issued = invoices.filter((invoice) => invoice.lifecycle === "EMISE");
  const balances = issued.map((invoice) => settlement(invoice, payments));
  return {
    invoiced: sumMinor(balances.map((item) => item.total)),
    collected: sumMinor(balances.map((item) => item.paid)),
    outstanding: sumMinor(balances.map((item) => item.remaining)),
    partiallyPaid: balances.filter(
      (item) => item.paid > 0 && item.remaining > 0,
    ).length,
    unpaid: balances.filter((item) => item.paid === 0 && item.remaining > 0)
      .length,
  };
}
