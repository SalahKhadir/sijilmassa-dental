import type { Metadata } from "next";
import { PersistentPrescriptionDirectory } from "@/components/prescriptions/persistent/history";
export const metadata: Metadata = { title: "Documents" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string | string[]; consultationId?: string | string[] }>;
}) {
  const query = await searchParams;
  return (
    <PersistentPrescriptionDirectory consultationId={typeof query.consultationId === "string" ? query.consultationId : undefined}
      patientId={
        typeof query.patientId === "string" ? query.patientId : undefined
      }
    />
  );
}
