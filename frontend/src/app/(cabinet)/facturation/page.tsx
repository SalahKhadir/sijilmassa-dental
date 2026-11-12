import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InvoicePatientEntry } from "@/components/billing/persistent/directory";
import { financialId } from "@/lib/financial/schemas";
import { invoiceHistoryPath } from "@/lib/invoices/paths";

export const metadata: Metadata = { title: "Facturation" };

export default async function Page({ searchParams }: { searchParams: Promise<{ patientId?: string | string[] }> }) {
  const patientId = financialId.safeParse((await searchParams).patientId);
  if (patientId.success) redirect(invoiceHistoryPath(patientId.data));
  return <InvoicePatientEntry />;
}
