import type { Metadata } from "next";
import { ConsultationDetails } from "@/components/consultations/consultation-details";
export const metadata: Metadata = { title: "Détails de la consultation" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ConsultationDetails id={(await params).id} />;
}
