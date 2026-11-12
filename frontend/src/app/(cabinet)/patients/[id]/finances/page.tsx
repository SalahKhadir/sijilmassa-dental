import { PatientFinances } from "@/components/financial/patient-finances";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <PatientFinances patientId={(await params).id} />;
}
