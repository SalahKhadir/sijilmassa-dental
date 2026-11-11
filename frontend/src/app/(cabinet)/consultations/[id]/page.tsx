import { PersistentClinicalRecord } from "@/components/consultations/persistent/record";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ patientId?: string }> }) {
  const [p,q] = await Promise.all([params,searchParams]); return <PersistentClinicalRecord id={p.id} patientId={typeof q.patientId === "string" ? q.patientId : ""} />;
}
