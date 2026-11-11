import type { Metadata } from "next";
import { PrescriptionFormPage } from "@/components/prescriptions/prescription-form-page";
export const metadata: Metadata = { title: "Modifier l’ordonnance" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PrescriptionFormPage id={(await params).id} />;
}
