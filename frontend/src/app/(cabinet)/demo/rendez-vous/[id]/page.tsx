import type { Metadata } from "next";
import { AppointmentDetails } from "@/components/appointments/appointment-details";
export const metadata: Metadata = { title: "Détails du rendez-vous" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <AppointmentDetails id={(await params).id} />;
}
