"use client";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { clinicDate } from "@/lib/patients/dates";
import { addLocalDays, formatLocalDate, isCalendarDate } from "@/lib/appointments/local-time";
import { calendarDates, calendarEvent, calendarWindow, isTransitionPeriod } from "@/lib/appointments/api/time";
import { appointmentStatusValues } from "@/lib/appointments/types";
import { AppointmentStatus } from "../appointment-status";
import { CalendarGrid } from "../calendar-grid";
import { AppointmentFailure, useRealCalendar } from "./shared";
import { RealAgenda } from "./agenda";

export function PersistentCalendar() {
  const query = useSearchParams(); const router = useRouter();
  const supplied = query.get("date");
  const date = supplied && isCalendarDate(supplied) ? supplied : clinicDate();
  const view = query.get("view") === "week" ? "week" : "day";
  const [selectedDay, setSelectedDay] = useState(date);
  const dates = calendarDates(date, view), window = calendarWindow(date, view);
  const { data, error, refresh } = useRealCalendar(window);
  function navigate(nextDate: string, nextView = view) { router.replace(`/rendez-vous?${new URLSearchParams({ date: nextDate, view: nextView })}`); }
  const mobileDate = dates.includes(selectedDay) ? selectedDay : date;
  const transition = isTransitionPeriod(date, view);
  return <>
    <PageHeading eyebrow="Un dentiste · Un agenda partagé" title="Rendez-vous" description="Planifiez les rendez-vous enregistrés du cabinet.">
      <Button asChild><Link href={`/rendez-vous/nouveau?${new URLSearchParams({ date, view })}`}><CalendarPlus aria-hidden="true" />Nouveau rendez-vous</Link></Button>
    </PageHeading>
    {query.get("saved") === "1" && <p role="status" className="rounded-lg border bg-secondary-tint p-4">Rendez-vous enregistré.</p>}
    <p className="text-sm text-muted-foreground">Agenda enregistré · Heure du cabinet : Africa/Casablanca. Actualisation au focus et toutes les 30 secondes.</p>
    <Card className="space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div role="group" aria-label="Vue de l’agenda" className="flex gap-1">
      <Button aria-pressed={view === "day"} variant={view === "day" ? "default" : "ghost"} onClick={() => navigate(date, "day")}>Jour</Button>
      <Button aria-pressed={view === "week"} variant={view === "week" ? "default" : "ghost"} onClick={() => navigate(date, "week")}>Semaine</Button></div>
      <div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={() => navigate(clinicDate())}>Aujourd’hui</Button>
        <Button variant="outline" aria-label={view === "week" ? "Semaine précédente" : "Jour précédent"} onClick={() => navigate(addLocalDays(date, view === "week" ? -7 : -1))}><ChevronLeft aria-hidden="true" /></Button>
        <Button variant="outline" aria-label={view === "week" ? "Semaine suivante" : "Jour suivant"} onClick={() => navigate(addLocalDays(date, view === "week" ? 7 : 1))}><ChevronRight aria-hidden="true" /></Button>
        <label className="sr-only" htmlFor="calendar-date">Date affichée</label><Input id="calendar-date" type="date" className="w-auto" value={date} onChange={event => { if (isCalendarDate(event.target.value)) navigate(event.target.value); }} />
        <Button variant="outline" onClick={refresh}>Actualiser</Button></div></div>
      <h2 aria-live="polite" className="font-semibold first-letter:uppercase">{view === "week" ? `Du ${formatLocalDate(dates[0])} au ${formatLocalDate(dates[6])}` : formatLocalDate(date)}</h2>
      <div className="flex flex-wrap gap-2" aria-label="Légende des statuts">{appointmentStatusValues.map(status => <AppointmentStatus key={status} status={status} />)}</div>
    </Card>
    {error ? <AppointmentFailure error={error} retry={refresh} /> : !data ? <p role="status">Chargement des rendez-vous…</p> : <Card className="overflow-hidden">
      <div className="border-b px-5 py-4"><h2 className="font-semibold">Agenda du cabinet</h2><p role="status" className="text-xs text-muted-foreground">{data.appointments.length} rendez-vous sur cette période · Historique conservé</p></div>
      {!data.appointments.length ? <p className="px-5 py-8 text-sm text-muted-foreground">Aucun rendez-vous pour cette période.</p> : null}
      {transition ? <><p className="px-5 py-4 text-sm">Changement d’heure : la liste chronologique indique les décalages et conserve les durées réelles.</p><RealAgenda data={data} /></> : <>
        <div className="hidden xl:block"><CalendarGrid persistent dates={dates} selectedDate={date} appointments={data.appointments.map(calendarEvent)} patients={data.patients} />
          <details className="border-t"><summary className="cursor-pointer p-5 text-sm font-semibold">Voir la liste complète des rendez-vous</summary><RealAgenda data={data} /></details></div>
        <div className="xl:hidden">{view === "week" && <div role="group" aria-label="Jours de la semaine" className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">{dates.map(day => <Button key={day} variant={day === mobileDate ? "secondary" : "outline"} onClick={() => setSelectedDay(day)}>{formatLocalDate(day, "short")}</Button>)}</div>}
          <h3 className="px-5 pt-5 text-sm font-semibold first-letter:uppercase">{formatLocalDate(mobileDate)}</h3><RealAgenda data={data} date={mobileDate} /></div>
      </>}
    </Card>}
  </>;
}
