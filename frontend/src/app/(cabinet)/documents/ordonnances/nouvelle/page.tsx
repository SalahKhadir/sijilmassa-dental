import type { Metadata } from "next";
import { PersistentPrescriptionFormPage } from "@/components/prescriptions/persistent/forms";
export const metadata: Metadata = { title: "Nouvelle ordonnance" };
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
    <PersistentPrescriptionFormPage
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
