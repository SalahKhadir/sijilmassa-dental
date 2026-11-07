"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useConsultations } from "./consultation-provider";
/** Administrative appointment details receive only the linked identifier, never clinical content. */
export function AppointmentConsultationLink({
  appointmentId,
  patientId,
}: {
  appointmentId: string;
  patientId: string;
}) {
  const { repository } = useConsultations();
  const linkedId = repository.linkedConsultationId(appointmentId);
  return (
    <div className="rounded-lg border p-4">
      <p className="mb-3 text-xs font-semibold text-muted-foreground">
        Espace dentiste · Consultation clinique
      </p>
      <Button asChild variant="secondary">
        <Link
          href={
            linkedId
              ? `/consultations/${linkedId}`
              : `/consultations/nouveau?patientId=${patientId}&appointmentId=${appointmentId}`
          }
        >
          {linkedId ? "Ouvrir la consultation liée" : "Créer une consultation"}
        </Link>
      </Button>
    </div>
  );
}
