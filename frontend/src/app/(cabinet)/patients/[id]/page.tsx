import type { Metadata } from "next";
import { PatientProfile } from "@/components/patients/patient-profile";
export const metadata: Metadata = { title: "Fiche patient" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PatientProfile id={(await params).id} />;
}
