import type { Metadata } from "next";
import { ConsultationFormPage } from "@/components/consultations/consultation-form-page";
export const metadata: Metadata = { title: "Nouvelle consultation" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    patientId?: string | string[];
    appointmentId?: string | string[];
  }>;
}) {
  const query = await searchParams;
  return (
    <ConsultationFormPage
      patientId={
        typeof query.patientId === "string" ? query.patientId : undefined
      }
      appointmentId={
        typeof query.appointmentId === "string"
          ? query.appointmentId
          : undefined
      }
    />
  );
}
