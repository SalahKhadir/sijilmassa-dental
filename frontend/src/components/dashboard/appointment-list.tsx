import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import type { Appointment, AppointmentPatient } from "@/lib/appointments/types";
import { formatLocalDate } from "@/lib/appointments/local-time";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { AppointmentStatus } from "@/components/appointments/appointment-status";
export function AppointmentList({
  appointments,
  patients,
}: {
  appointments: readonly Appointment[];
  patients: readonly AppointmentPatient[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b">
        <div>
          <CardTitle>Prochains rendez-vous</CardTitle>
          <p className="mt-1.5 text-xs text-muted-foreground">
            À venir ou en cours · Agenda partagé
          </p>
        </div>
        <Button asChild variant="ghost" className="px-2">
          <Link href="/demo/rendez-vous">
            Voir l’agenda <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      </CardHeader>
      {!appointments.length ? (
        <EmptyState
          title="Aucun rendez-vous à venir"
          description="Les prochains rendez-vous de l’agenda partagé apparaîtront ici."
        />
      ) : (
        <CardContent className="pt-2">
          <ul className="divide-y">
            {appointments.map((appointment) => {
              const patient = patients.find(
                (record) => record.id === appointment.patientId,
              );
              return (
                <li
                  key={appointment.id}
                  className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2 py-5 sm:flex"
                >
                  <div className="row-span-2 w-16 shrink-0 self-start">
                    <p className="text-sm font-bold tabular-nums">
                      {appointment.startTime}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock3 className="size-3" aria-hidden="true" />
                      {appointment.durationMinutes} min
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/demo/rendez-vous/${appointment.id}`}
                      className="rounded-sm text-sm font-semibold text-primary hover:underline"
                    >
                      {patient?.name ?? "Patient introuvable"}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {patient?.reference ?? "Référence indisponible"} ·{" "}
                      {formatLocalDate(appointment.date, "short")}
                    </p>
                  </div>
                  <AppointmentStatus
                    status={appointment.status}
                    className="col-start-2 justify-self-start"
                  />
                </li>
              );
            })}
          </ul>
          <p className="border-t pt-4 text-xs text-muted-foreground">
            {appointments.length} rendez-vous affiché(s) · Données fictives de
            l’agenda
          </p>
        </CardContent>
      )}
    </Card>
  );
}
