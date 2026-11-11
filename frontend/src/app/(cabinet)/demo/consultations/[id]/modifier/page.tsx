import type { Metadata } from "next";
import { ConsultationFormPage } from "@/components/consultations/consultation-form-page";
export const metadata: Metadata = { title: "Modifier le brouillon" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ConsultationFormPage id={(await params).id} />;
}
