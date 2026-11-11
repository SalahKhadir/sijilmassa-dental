import { PersistentClinicalDirectory } from "@/components/consultations/persistent/history";
export default async function Page({ searchParams }: { searchParams: Promise<{ patientId?: string }> }) {
  const query = await searchParams; return <PersistentClinicalDirectory patientId={typeof query.patientId === "string" ? query.patientId : undefined} />;
}
