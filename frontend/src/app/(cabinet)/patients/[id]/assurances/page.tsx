import { notFound } from "next/navigation";
import { PatientInsuranceHistory } from "@/components/insurance/persistent/history";
import { insuranceId } from "@/lib/insurance/api/schemas";

export const metadata = { title: "Documents d’assurance" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!insuranceId.safeParse(id).success) notFound();
  return <PatientInsuranceHistory patientId={id.toLowerCase()} />;
}
