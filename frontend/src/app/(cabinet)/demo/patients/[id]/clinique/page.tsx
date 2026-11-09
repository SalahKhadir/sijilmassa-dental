import type { Metadata } from "next";
import { PatientClinicalOverview } from "@/components/consultations/patient-clinical-overview";
export const metadata: Metadata = { title: "Vue clinique du patient" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PatientClinicalOverview id={(await params).id} />;
}
