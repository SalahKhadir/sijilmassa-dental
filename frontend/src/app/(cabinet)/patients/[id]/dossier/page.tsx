import type { Metadata } from "next";
import { PatientProfile } from "@/components/patients/patient-profile";
export const metadata: Metadata = {
  title: "Dossier de santé · Prototype dentiste",
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PatientProfile id={(await params).id} clinical />;
}
