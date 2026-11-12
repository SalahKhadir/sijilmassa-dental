import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PatientInvoiceHistory } from "@/components/billing/persistent/directory";
import { financialId } from "@/lib/financial/schemas";

export const metadata: Metadata = { title: "Factures du patient" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!financialId.safeParse(id).success) notFound();
  return <PatientInvoiceHistory patientId={id} />;
}
