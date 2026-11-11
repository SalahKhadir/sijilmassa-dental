import type { Metadata } from "next";
import { PersistentPrescriptionFormPage } from "@/components/prescriptions/persistent/forms";
export const metadata: Metadata = { title: "Modifier l’ordonnance" };
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ patientId?: string | string[] }> }) {
  const [route, query] = await Promise.all([params, searchParams]);
  return <PersistentPrescriptionFormPage id={route.id} patientId={typeof query.patientId === "string" ? query.patientId : ""} />;
}
