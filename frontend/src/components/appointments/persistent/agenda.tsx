"use client";
import Link from "next/link";
import type { CalendarData } from "./shared";
import { clinicParts, instantLabel } from "@/lib/appointments/api/time";
import { appointmentTypes } from "@/lib/appointments/types";
import { formatLocalDate } from "@/lib/appointments/local-time";
import { AppointmentStatus } from "../appointment-status";

export function RealAgenda({ data, date, limit }: { data: CalendarData; date?: string; limit?: number }) {
  const entries = data.appointments.filter(value => !date || clinicParts(value.startAt).date === date).slice(0, limit);
  if (!entries.length) return <p className="px-5 py-8 text-sm text-muted-foreground">Aucun rendez-vous pour cette période.</p>;
  return <ul className="divide-y" aria-label="Liste des rendez-vous">{entries.map(value => {
    const patient = data.patients.find(patient => patient.id === value.patientId);
    return <li key={value.id}><Link href={`/rendez-vous/${value.id}`} className="block space-y-3 rounded-sm px-5 py-5 hover:bg-muted">
      <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold break-words">{patient?.name}</p>
        <p className="text-xs text-muted-foreground">{patient?.reference} · {appointmentTypes[value.type]}</p></div><AppointmentStatus status={value.status} /></div>
      <p className="text-xs text-muted-foreground">{formatLocalDate(clinicParts(value.startAt).date, "short")} · {instantLabel(value.startAt)} – {instantLabel(value.endAt)} · {(Date.parse(value.endAt) - Date.parse(value.startAt)) / 60000} min</p>
    </Link></li>;
  })}</ul>;
}
