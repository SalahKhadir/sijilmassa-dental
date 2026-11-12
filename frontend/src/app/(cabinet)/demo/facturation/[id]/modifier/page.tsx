import type { Metadata } from "next";
import { InvoiceFormPage } from "@/components/billing/invoice-form-page";
export const metadata: Metadata = { title: "Modifier la facture" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <InvoiceFormPage id={(await params).id} />;
}
