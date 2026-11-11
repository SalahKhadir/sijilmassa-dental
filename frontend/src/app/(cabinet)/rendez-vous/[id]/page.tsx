import { PersistentAppointmentRecord } from "@/components/appointments/persistent/record";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <PersistentAppointmentRecord id={(await params).id} />; }
