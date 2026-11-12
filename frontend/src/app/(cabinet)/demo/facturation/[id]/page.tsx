import type { Metadata } from "next";
import { InvoiceDetails } from "@/components/billing/invoice-details";
export const metadata: Metadata = { title: "Détails de la facture" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <InvoiceDetails id={(await params).id} />;
}
