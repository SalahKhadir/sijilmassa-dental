import { PersistentClinicalDirectory } from "@/components/consultations/persistent/history";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <PersistentClinicalDirectory patientId={(await params).id} />; }
