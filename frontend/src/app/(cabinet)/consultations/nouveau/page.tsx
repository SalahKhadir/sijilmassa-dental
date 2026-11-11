import { PersistentClinicalFormPage } from "@/components/consultations/persistent/forms";
export default async function Page({ searchParams }: { searchParams: Promise<{ patientId?: string; appointmentId?: string }> }) {
  const q = await searchParams; return <PersistentClinicalFormPage patientId={typeof q.patientId === "string" ? q.patientId : undefined} appointmentId={typeof q.appointmentId === "string" ? q.appointmentId : undefined} />;
}
