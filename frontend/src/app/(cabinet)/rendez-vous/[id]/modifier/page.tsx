import type { Metadata } from "next";
import { AppointmentFormPage } from "@/components/appointments/appointment-form-page";
export const metadata: Metadata = { title: "Modifier le rendez-vous" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <AppointmentFormPage id={(await params).id} />;
}
