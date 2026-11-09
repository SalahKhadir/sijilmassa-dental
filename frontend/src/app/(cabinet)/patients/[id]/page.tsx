import { PersistentPatientRecord } from "@/components/patients/persistent/record";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
 return <PersistentPatientRecord id={(await params).id} />;
}
