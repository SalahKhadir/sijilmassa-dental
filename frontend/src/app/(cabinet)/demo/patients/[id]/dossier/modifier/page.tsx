import type { Metadata } from "next";
import { EditPatientPage } from "@/components/patients/patient-form-page";
export const metadata: Metadata = {
  title: "Modifier le dossier de santé · Prototype",
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <EditPatientPage id={(await params).id} clinical />;
}
