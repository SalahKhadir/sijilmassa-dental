import { PersistentClinicalFormPage } from "@/components/consultations/persistent/forms";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ patientId?: string }> }) {
  const [p,q] = await Promise.all([params,searchParams]); return <PersistentClinicalFormPage id={p.id} patientId={typeof q.patientId === "string" ? q.patientId : ""} />;
}
