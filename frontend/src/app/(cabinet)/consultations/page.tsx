import type { Metadata } from "next";
import { ConsultationDirectory } from "@/components/consultations/consultation-directory";
export const metadata: Metadata = { title: "Consultations" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string | string[] }>;
}) {
  const query = await searchParams;
  return (
    <ConsultationDirectory
      patientId={
        typeof query.patientId === "string" ? query.patientId : undefined
      }
    />
  );
}
