import type { Invoice } from "./types";
import { BillingError } from "./money";

const invoiceNumber = /^(\d{4})-(\d+)$/;

/** Mock allocator matching the established Sijilmassa Invoice YYYY-NNN format. */
export function nextInvoiceNumber(
  issueDate: string,
  invoices: readonly Pick<Invoice, "invoiceNumber">[],
): string {
  const year = issueDate.slice(0, 4);
  const used = invoices.flatMap(({ invoiceNumber: value }) => {
    const match = invoiceNumber.exec(value);
    return match?.[1] === year ? [Number(match[2])] : [];
  });
  const sequence = Math.max(0, ...used) + 1;
  if (!Number.isSafeInteger(sequence))
    throw new BillingError("La séquence de numérotation est épuisée.");
  return `${year}-${String(sequence).padStart(3, "0")}`;
}
