import type { Metadata } from "next";
import { PersistentPrescriptionRecord } from "@/components/prescriptions/persistent/record";
export const metadata: Metadata = { title: "Ordonnance" };
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ patientId?: string | string[] }> }) {
  const [route, query] = await Promise.all([params, searchParams]);
  return <PersistentPrescriptionRecord id={route.id} patientId={typeof query.patientId === "string" ? query.patientId : ""} />;
}
