import type { Metadata } from "next";
import { PrescriptionDetails } from "@/components/prescriptions/prescription-details";
export const metadata: Metadata = { title: "Détails de l’ordonnance" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PrescriptionDetails id={(await params).id} />;
}
