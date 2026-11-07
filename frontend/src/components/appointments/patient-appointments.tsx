"use client";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { clinicDate } from "@/lib/patients/dates";
import { clinicTime } from "@/lib/appointments/local-time";
import { upcomingAppointments } from "@/lib/appointments/selectors";
import { useAppointmentData } from "./use-appointment-data";
import { AppointmentError, AppointmentLoading } from "./appointment-states";
import { AppointmentAgenda } from "./appointment-agenda";
export function PatientAppointments({ patientId }: { patientId: string }) {
  const { state, retry } = useAppointmentData();
  if (state.status === "loading") return <AppointmentLoading />;
  if (state.status === "error") return <AppointmentError retry={retry} />;
  const all = state.data.appointments.filter(
    (appointment) => appointment.patientId === patientId,
  );
  const upcoming = upcomingAppointments(all, clinicDate(), clinicTime());
  const upcomingIds = new Set(upcoming.map((appointment) => appointment.id));
  const past = all.filter((appointment) => !upcomingIds.has(appointment.id));
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b">
        <div>
          <CardTitle>Rendez-vous du patient</CardTitle>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Agenda fictif partagé du cabinet
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/rendez-vous/nouveau?patientId=${patientId}`}>
            <CalendarPlus aria-hidden="true" />
            Prendre rendez-vous
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="px-0 pb-0 sm:px-0 sm:pb-0">
        <section aria-label="Rendez-vous à venir ou en cours">
          <h3 className="px-5 pt-5 text-sm font-semibold">
            À venir ou en cours
          </h3>
          <AppointmentAgenda
            appointments={upcoming}
            patients={state.data.patients}
            showDate
          />
        </section>
        <section
          aria-label="Rendez-vous passés et historique"
          className="border-t"
        >
          <h3 className="px-5 pt-5 text-sm font-semibold">
            Passés et historique
          </h3>
          <AppointmentAgenda
            appointments={past}
            patients={state.data.patients}
            showDate
          />
        </section>
      </CardContent>
    </Card>
  );
}
