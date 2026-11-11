import type { Metadata } from "next";
import { AppointmentFormPage } from "@/components/appointments/appointment-form-page";
export const metadata: Metadata = { title: "Nouveau rendez-vous" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; date?: string }>;
}) {
  const query = await searchParams;
  return (
    <AppointmentFormPage
      patientId={
        typeof query.patientId === "string" ? query.patientId : undefined
      }
      date={typeof query.date === "string" ? query.date : undefined}
    />
  );
}
