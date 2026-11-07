"use client";
import { UsersRound, UserPlus, CalendarDays } from "lucide-react";
import { useAppointmentData } from "@/components/appointments/use-appointment-data";
import { upcomingAppointments } from "@/lib/appointments/selectors";
import { clinicTime } from "@/lib/appointments/local-time";
import { patientIndicators } from "@/lib/patients/directory";
import type { Patient } from "@/lib/patients/types";
import { Card } from "@/components/ui/card";

export function PatientIndicators({
  patients,
  today,
}: {
  patients: readonly Patient[];
  today: string;
}) {
  const { state } = useAppointmentData();
  const ids =
    state.status === "ready"
      ? new Set(
          upcomingAppointments(
            state.data.appointments,
            today,
            clinicTime(),
          ).map((appointment) => appointment.patientId),
        )
      : undefined;
  const values = patientIndicators(patients, today, ids);
  const indicators = [
    { label: "Total patients", value: values.total, icon: UsersRound },
    {
      label: "Nouveaux patients ce mois",
      value: values.newThisMonth,
      icon: UserPlus,
    },
    {
      label: "Avec un rendez-vous à venir",
      value:
        state.status === "ready"
          ? values.withUpcomingAppointments
          : state.status === "loading"
            ? "…"
            : "Indisponible",
      icon: CalendarDays,
    },
  ];
  return (
    <section
      aria-label="Indicateurs des patients"
      className="grid gap-4 md:grid-cols-3"
    >
      {indicators.map(({ label, value, icon: Icon }) => (
        <Card key={label} className="flex items-center gap-4 p-5">
          <span className="rounded-lg bg-primary-tint p-2.5 text-primary">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            <h2 className="mt-1 text-xs font-medium leading-5 text-muted-foreground">
              {label}
            </h2>
          </div>
        </Card>
      ))}
    </section>
  );
}
