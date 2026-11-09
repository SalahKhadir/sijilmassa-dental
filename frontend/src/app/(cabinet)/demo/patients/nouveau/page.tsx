import type { Metadata } from "next";
import { NewPatientPage } from "@/components/patients/patient-form-page";
export const metadata: Metadata = { title: "Nouveau patient" };
export default function Page() {
  return <NewPatientPage />;
}
