"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clinicDate } from "@/lib/patients/dates";
import { isCalendarDate } from "@/lib/appointments/local-time";
import { calendarWindow } from "@/lib/appointments/api/time";
import { AppointmentFailure, useRealCalendar } from "./shared";
import { RealAgenda } from "./agenda";

export function PersistentPatientAppointments({ patientId, inactive }: { patientId: string; inactive: boolean }) {
  const [date, setDate] = useState(clinicDate);
  const { data, error, refresh } = useRealCalendar({ ...calendarWindow(date, "week"), patientId });
  return <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><h2 className="font-semibold">Rendez-vous enregistrés</h2>
    {!inactive && <Button asChild><Link href={`/rendez-vous/nouveau?${new URLSearchParams({ patientId, date })}`}>Prendre rendez-vous</Link></Button>}
    <label className="text-sm">Semaine contenant le<Input type="date" value={date} onChange={event => { if (isCalendarDate(event.target.value)) setDate(event.target.value); }} /></label></div>
    {error ? <AppointmentFailure error={error} retry={refresh} /> : !data ? <p role="status" className="p-5">Chargement des rendez-vous…</p> : <RealAgenda data={data} />}
    <p className="border-t p-5 text-xs text-muted-foreground">Seuls les rendez-vous de la semaine choisie sont affichés. Cette liste concerne uniquement le patient de cette fiche.</p>
  </Card>;
}
