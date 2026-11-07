import type { Invoice, InvoiceStatus, Payment } from "./types.ts";
import type { PrescriptionPatient } from "../prescriptions/types.ts";
import { normalizeSearch, searchPatients } from "../patients/directory.ts";
import { invoiceStatus, invoiceTotal } from "./calculations.ts";
export interface BillingQuery {
  search: string;
  status: "all" | InvoiceStatus;
  from: string;
  to: string;
  sort: "newest" | "oldest" | "highest" | "lowest";
  patientId?: string;
}
export function filterInvoices(
  invoices: readonly Invoice[],
  payments: readonly Payment[],
  patients: readonly PrescriptionPatient[],
  query: BillingQuery,
) {
  const ids = new Set(
    searchPatients(patients, query.search).map((patient) => patient.id),
  );
  const text = normalizeSearch(query.search);
  return invoices
    .filter(
      (invoice) =>
        (!query.patientId || query.patientId === invoice.patientId) &&
        (!text ||
          ids.has(invoice.patientId) ||
          normalizeSearch(invoice.invoiceNumber).includes(text) ||
          normalizeSearch(invoice.issuedPatient?.name ?? "").includes(text)) &&
        (query.status === "all" ||
          query.status === invoiceStatus(invoice, payments)) &&
        (!query.from || invoice.issueDate >= query.from) &&
        (!query.to || invoice.issueDate <= query.to),
    )
    .sort((a, b) => {
      const order =
        query.sort === "highest" || query.sort === "lowest"
          ? invoiceTotal(a) - invoiceTotal(b)
          : a.issueDate.localeCompare(b.issueDate);
      return (
        order *
          (query.sort === "highest" || query.sort === "newest" ? -1 : 1) ||
        a.id.localeCompare(b.id)
      );
    });
}
