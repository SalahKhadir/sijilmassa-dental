import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvoicePatientEntry } from "@/components/billing/persistent/directory";
import { InvoiceEditorPage } from "@/components/billing/persistent/editor";
import { financialId } from "@/lib/financial/schemas";

export const metadata: Metadata = { title: "Nouvelle facture" };

export default async function Page({ searchParams }: { searchParams: Promise<{ patientId?: string | string[] }> }) {
  const { patientId } = await searchParams;
  if (patientId === undefined) return <InvoicePatientEntry create />;
  if (!financialId.safeParse(patientId).success || typeof patientId !== "string") notFound();
  return <InvoiceEditorPage patientId={patientId} />;
}
