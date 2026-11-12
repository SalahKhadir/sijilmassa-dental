import type { Metadata } from "next";
import { InvoiceFormPage } from "@/components/billing/invoice-form-page";
export const metadata: Metadata = { title: "Nouvelle facture" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    patientId?: string | string[];
    consultationId?: string | string[];
  }>;
}) {
  const query = await searchParams;
  return (
    <InvoiceFormPage
      patientId={
        typeof query.patientId === "string" ? query.patientId : undefined
      }
      consultationId={
        typeof query.consultationId === "string"
          ? query.consultationId
          : undefined
      }
    />
  );
}
