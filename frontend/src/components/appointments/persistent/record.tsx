"use client";
import { statusChoices } from "@/lib/appointments/api/permissions";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/components/auth/auth-provider";
import { usePatientApi } from "@/components/patients/persistent/shared";
import type { PersistentAppointment } from "@/lib/appointments/api/client";
import { clinicParts, instantLabel, patientSummary } from "@/lib/appointments/api/time";
import type { AppointmentPatient, AppointmentStatus as Status } from "@/lib/appointments/types";
import { appointmentStatuses, appointmentTypes } from "@/lib/appointments/types";
import { AppointmentStatus } from "../appointment-status";
import { PersistentAppointmentForm } from "./form";
import { AppointmentFailure, appointmentChanged, isConflict, useAppointmentApi } from "./shared";
import { useUnsavedChanges } from "@/components/patients/persistent/shared";

export function NewPersistentAppointment() {
  const query = useSearchParams();
  return <><PageHeading eyebrow="Agenda partagé du cabinet" title="Nouveau rendez-vous" description="Réservez un créneau pour un patient enregistré." />
    <PersistentAppointmentForm patientId={query.get("patientId") ?? undefined} date={query.get("date") ?? undefined} view={query.get("view") === "week" ? "week" : "day"} /></>;
}
export function PersistentAppointmentRecord({ id, edit = false }: { id: string; edit?: boolean }) {
  const api = useAppointmentApi(), patients = usePatientApi(); const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; appointment?: PersistentAppointment; patient?: AppointmentPatient; error?: unknown }>();
  const key = `${id}:${user?.id}:${revision}`;
  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      const appointment = await api.get(id); const patient = patientSummary(await patients.get(appointment.patientId));
      if (active) setState({ key, appointment, patient });
    }).catch(error => { if (active) setState({ key, error }); });
    return () => { active = false; };
  }, [api, patients, id, key]);
  function reload() { setState(undefined); setRevision(value => value + 1); }
  if (state?.key !== key) return <p role="status">Chargement du rendez-vous…</p>;
  if (!state.appointment) return <AppointmentFailure error={state.error} retry={reload} />;
  const appointment = state.appointment, date = clinicParts(appointment.startAt).date;
  return <>
    <Link href={`/rendez-vous?date=${date}`} className="text-primary underline">Retour à l’agenda</Link>
    <PageHeading eyebrow="Rendez-vous enregistré" title={edit ? "Modifier le rendez-vous" : "Détails du rendez-vous"} description={`${state.patient?.name} · ${state.patient?.reference}`} />
    <AppointmentStatus status={appointment.status} />
    {edit ? <PersistentAppointmentForm key={key} appointment={appointment} reload={reload} /> : <>
      <Card className="space-y-5 p-5"><h2 className="font-semibold">Planification</h2><p>{date} · {instantLabel(appointment.startAt)} – {instantLabel(appointment.endAt)}</p><p>{appointmentTypes[appointment.type]} · {(Date.parse(appointment.endAt) - Date.parse(appointment.startAt)) / 60000} minutes</p>
        <Link href={`/patients/${appointment.patientId}`} className="text-primary underline">Voir la fiche patient</Link></Card>
      <div className="flex flex-wrap gap-3">{appointment.status !== "TERMINE" && <Button asChild><Link href={`/rendez-vous/${id}/modifier`}>Modifier le rendez-vous</Link></Button>}<Button variant="outline" onClick={reload}>Actualiser le rendez-vous</Button></div>
      {appointment.status === "TERMINE" ? <p role="status">Ce rendez-vous terminé est immuable.</p> : <StatusForm key={`${key}-${appointment.version}`} appointment={appointment} refresh={reload} />}
      {user?.role === "DENTIST" && <Button asChild variant="secondary"><Link href={`/consultations/nouveau?patientId=${appointment.patientId}&appointmentId=${appointment.id}`}>Créer une consultation</Link></Button>}
      <p className="text-sm text-muted-foreground">La clôture clinique ne change pas le statut du rendez-vous. Facturation et prescriptions restent en démonstration, sans lien avec ce dossier réel.</p>
    </>}
  </>;
}
function StatusForm({ appointment, refresh }: { appointment: PersistentAppointment; refresh(): void }) {
  const { user } = useAuth(); const api = useAppointmentApi(); const busy = useRef(false);
  const [status, setStatus] = useState<Status>(appointment.status), [error, setError] = useState<unknown>(), [saving, setSaving] = useState(false);
  useUnsavedChanges(status !== appointment.status);
  async function submit() {
    if (busy.current || status === appointment.status || isConflict(error)) return;
    if (status === "TERMINE" && !window.confirm("Confirmer la fin de ce rendez-vous ? Il ne pourra plus être modifié.")) return;
    busy.current = true; setSaving(true); setError(undefined);
    try { await api.status(appointment.id, appointment.version, status); appointmentChanged(); refresh(); }
    catch (error) { setError(error); } finally { busy.current = false; setSaving(false); }
  }
  return <Card className="space-y-4 p-5"><h2 className="font-semibold">Changer le statut</h2><form onSubmit={event => { event.preventDefault(); void submit(); }} className="flex flex-wrap items-end gap-3">
    <div className="space-y-2"><label htmlFor="persistent-appointment-status" className="text-sm font-semibold">Statut du rendez-vous</label><Select id="persistent-appointment-status" value={status} disabled={saving} onChange={event => setStatus(event.target.value as Status)}>
      {statusChoices(user?.role ?? "RECEPTIONIST", appointment.status).map(value => <option key={value} value={value}>{appointmentStatuses[value].label}</option>)}</Select></div>
    <Button type="submit" disabled={saving || status === appointment.status || isConflict(error)}>{saving ? "Enregistrement…" : "Appliquer le statut"}</Button>
  </form>{error ? <AppointmentFailure error={error} retry={() => { if (status === appointment.status || window.confirm("Recharger et abandonner le changement de statut non enregistré ?")) refresh(); }} /> : null}</Card>;
}
