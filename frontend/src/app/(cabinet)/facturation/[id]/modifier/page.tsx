import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvoiceEditorPage } from "@/components/billing/persistent/editor";
import { financialId } from "@/lib/financial/schemas";

export const metadata: Metadata = { title: "Modifier le brouillon" };

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ patientId?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const patientId = financialId.safeParse(query.patientId);
  if (!patientId.success || !financialId.safeParse(id).success) notFound();
  return <InvoiceEditorPage invoiceId={id} patientId={patientId.data} />;
}
