"use client";
import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { clinicDate } from "@/lib/patients/dates";
import {
  addLocalDays,
  formatLocalDate,
  isCalendarDate,
  weekDates,
} from "@/lib/appointments/local-time";
import { appointmentStatusValues } from "@/lib/appointments/types";
import { useAppointmentData } from "./use-appointment-data";
import {
  AppointmentError,
  AppointmentLoading,
  AppointmentNotice,
} from "./appointment-states";
import { AppointmentStatus } from "./appointment-status";
import { CalendarGrid } from "./calendar-grid";
import { AppointmentAgenda } from "./appointment-agenda";

export function CalendarPage({ initialDate }: { initialDate?: string }) {
  const [date, setDate] = useState(() => initialDate ?? clinicDate());
  const [view, setView] = useState<"day" | "week">("day");
  const { state, retry } = useAppointmentData();
  const dates = view === "week" ? weekDates(date) : [date];
  const heading =
    view === "week"
      ? `Du ${formatLocalDate(dates[0])} au ${formatLocalDate(dates[6])}`
      : formatLocalDate(date);
  const appointments =
    state.status === "ready"
      ? state.data.appointments.filter((appointment) =>
          dates.includes(appointment.date),
        )
      : [];
  return (
    <>
      <PageHeading
        eyebrow="Un dentiste · Un agenda partagé"
        title="Rendez-vous"
        description="Organisez les consultations du cabinet."
      >
        <Button asChild>
          <Link href={`/demo/rendez-vous/nouveau?date=${date}`}>
            <CalendarPlus aria-hidden="true" />
            Nouveau rendez-vous
          </Link>
        </Button>
      </PageHeading>
      <AppointmentNotice schedule />
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div role="group" aria-label="Vue de l’agenda" className="flex gap-1">
            <Button
              variant={view === "day" ? "default" : "ghost"}
              aria-pressed={view === "day"}
              onClick={() => setView("day")}
            >
              Jour
            </Button>
            <Button
              variant={view === "week" ? "default" : "ghost"}
              aria-pressed={view === "week"}
              onClick={() => setView("week")}
            >
              Semaine
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setDate(clinicDate())}>
              Aujourd’hui
            </Button>
            <Button
              variant="outline"
              aria-label={
                view === "week" ? "Semaine précédente" : "Jour précédent"
              }
              onClick={() =>
                setDate(addLocalDays(date, view === "week" ? -7 : -1))
              }
              className="px-3"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              aria-label={view === "week" ? "Semaine suivante" : "Jour suivant"}
              onClick={() =>
                setDate(addLocalDays(date, view === "week" ? 7 : 1))
              }
              className="px-3"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
            <div>
              <label htmlFor="calendar-date" className="sr-only">
                Date affichée
              </label>
              <Input
                id="calendar-date"
                type="date"
                value={date}
                className="w-auto"
                onChange={(event) => {
                  if (isCalendarDate(event.target.value))
                    setDate(event.target.value);
                }}
              />
            </div>
          </div>
        </div>
        <h2
          className="text-base font-semibold first-letter:uppercase"
          aria-live="polite"
        >
          {heading}
        </h2>
        <div className="flex flex-wrap gap-2" aria-label="Légende des statuts">
          {appointmentStatusValues.map((status) => (
            <AppointmentStatus key={status} status={status} />
          ))}
        </div>
      </Card>
      {state.status === "loading" ? (
        <AppointmentLoading />
      ) : state.status === "error" ? (
        <AppointmentError retry={retry} />
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Agenda du cabinet</h2>
            <p className="mt-1 hidden text-xs leading-5 text-muted-foreground xl:block">
              Grille défilante · Faites défiler les heures et les jours. La
              liste complète est disponible sous la grille.
            </p>
            <p role="status" className="mt-1 text-xs text-muted-foreground">
              {appointments.length} rendez-vous sur cette période · Historique
              conservé
            </p>
          </div>
          {!appointments.length && (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              Aucun rendez-vous pour{" "}
              {view === "week" ? "cette semaine" : "cette journée"}. Utilisez «
              Nouveau rendez-vous » pour proposer un créneau fictif.
            </p>
          )}
          <div className="hidden xl:block">
            <CalendarGrid
              dates={dates}
              selectedDate={date}
              appointments={appointments}
              patients={state.data.patients}
            />
            <details className="border-t">
              <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">
                Voir la liste complète des rendez-vous
              </summary>
              <AppointmentAgenda
                appointments={appointments}
                patients={state.data.patients}
                showDate
              />
            </details>
          </div>
          <div className="xl:hidden">
            {view === "week" && (
              <div className="border-b p-4">
                <p className="mb-3 text-xs text-muted-foreground">
                  Agenda quotidien pour une lecture confortable. Choisissez un
                  jour de la semaine.
                </p>
                <div
                  role="group"
                  aria-label="Jours de la semaine"
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                >
                  {dates.map((day) => (
                    <Button
                      key={day}
                      variant={day === date ? "secondary" : "outline"}
                      aria-pressed={day === date}
                      onClick={() => setDate(day)}
                    >
                      {formatLocalDate(day, "short")}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <h3 className="px-5 pt-5 text-sm font-semibold first-letter:uppercase">
              {formatLocalDate(date)}
            </h3>
            <AppointmentAgenda
              appointments={appointments.filter(
                (appointment) => appointment.date === date,
              )}
              patients={state.data.patients}
            />
          </div>
        </Card>
      )}
    </>
  );
}
