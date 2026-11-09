import type { Metadata } from "next";
import { PatientDirectory } from "@/components/patients/patient-directory";
export const metadata: Metadata = { title: "Patients" };
export default function PatientsPage() {
  return <PatientDirectory />;
}
