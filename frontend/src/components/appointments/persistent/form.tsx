"use client";
import Link from "next/link";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { clinicDate } from "@/lib/patients/dates";
import { createPatientApi, type AdministrativePatient } from "@/lib/patients/api/client";
import { requireLogin } from "@/lib/api/session-request";
import { appointmentTypes, type AppointmentType } from "@/lib/appointments/types";
import type { PersistentAppointment } from "@/lib/appointments/api/client";
import { AppointmentApiError } from "@/lib/appointments/api/client";
import { appointmentFormSchema, appointmentInput, clinicParts, instantLabel, wallClockCandidates, type AppointmentFormValues } from "@/lib/appointments/api/time";
import { useUnsavedChanges } from "@/components/patients/persistent/shared";
import { AppointmentFailure, appointmentChanged, isConflict, useAppointmentApi } from "./shared";
import { PatientPicker } from "./patient-picker";

const subscribe = () => () => {};

export function PersistentAppointmentForm({ appointment, patientId, date, view = "day", reload }: { appointment?: PersistentAppointment; patientId?: string; date?: string; view?: "day" | "week"; reload?: () => void }) {
  const api = useAppointmentApi(); const router = useRouter();
  const [patients] = useState(() => createPatientApi(fetch, requireLogin));
  const [patientStatus, setPatientStatus] = useState<string>();
  const [error, setError] = useState<unknown>(); const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const start = appointment ? clinicParts(appointment.startAt) : undefined;
  const form = useForm<AppointmentFormValues>({ resolver: zodResolver(appointmentFormSchema), defaultValues: {
    patientId: appointment?.patientId ?? (patientId && z.uuid().safeParse(patientId).success ? patientId : ""), date: start?.date ?? date ?? clinicDate(),
    time: start?.time ?? "09:00", duration: appointment ? (Date.parse(appointment.endAt) - Date.parse(appointment.startAt)) / 60000 : 30,
    type: appointment?.type ?? "CONSULTATION", occurrence: appointment ? new Date(appointment.startAt).toISOString() : "",
  } });
  const { register, handleSubmit, setValue, control, formState: { errors, isSubmitting, isDirty } } = form;
  const selectedDate = useWatch({control, name: "date"}), selectedTime = useWatch({control, name: "time"});
  const candidates = wallClockCandidates(selectedDate, selectedTime);
  const onSelect = useCallback((patient: Pick<AdministrativePatient, "id" | "status">) => { setValue("patientId", patient.id, { shouldValidate: true, shouldDirty: true }); setPatientStatus(patient.status); }, [setValue]);
  useUnsavedChanges(isDirty && !saved);
  const conflict = isConflict(error), immutable = appointment?.status === "TERMINE";
  const disabled = !hydrated || isSubmitting || saved || immutable;
  async function submit(values: AppointmentFormValues) {
    if (busy.current || immutable || conflict) return;
    busy.current = true; setError(undefined);
    try {
      const patient = await patients.get(values.patientId);
      if (patient.status !== "active") throw new AppointmentApiError(409);
      const input = appointmentInput(values);
      if (appointment) await api.update(appointment.id, appointment.version, input); else await api.create(input);
      setSaved(true); appointmentChanged();
      router.push(`/rendez-vous?${new URLSearchParams({ date: values.date, view, saved: "1" })}`);
    } catch (error) { setError(error); } finally { busy.current = false; }
  }
  const cancel = `/rendez-vous?${new URLSearchParams({ date: start?.date ?? date ?? clinicDate(), view })}`;
  return <form noValidate className="space-y-6" onSubmit={event => void handleSubmit(submit)(event)} aria-busy={isSubmitting}>
    <PatientPicker initialId={appointment?.patientId ?? patientId} disabled={Boolean(disabled)} onSelect={onSelect} />
    {errors.patientId && <p role="alert" className="text-sm text-danger">{errors.patientId.message}</p>}
    <Card className="grid gap-6 p-5 sm:grid-cols-2">
      <div className="space-y-2"><label htmlFor="appointment-date" className="text-sm font-semibold">Date du rendez-vous</label><Input id="appointment-date" type="date" disabled={Boolean(disabled)} {...register("date", { onChange: () => setValue("occurrence", "") })} aria-invalid={Boolean(errors.date)} aria-describedby={errors.date ? "appointment-date-error" : undefined} />{errors.date && <p id="appointment-date-error" role="alert">{errors.date.message}</p>}</div>
      <div className="space-y-2"><label htmlFor="appointment-time" className="text-sm font-semibold">Heure du cabinet</label><Input id="appointment-time" type="time" disabled={Boolean(disabled)} {...register("time", { onChange: () => setValue("occurrence", "") })} aria-invalid={Boolean(errors.time)} aria-describedby={errors.time ? "appointment-time-error" : undefined} />{errors.time && <p id="appointment-time-error" role="alert">{errors.time.message}</p>}</div>
      <div className="space-y-2"><label htmlFor="appointment-duration" className="text-sm font-semibold">Durée (minutes)</label><Input id="appointment-duration" type="number" min={30} max={180} disabled={Boolean(disabled)} {...register("duration", { valueAsNumber: true })} aria-invalid={Boolean(errors.duration)} aria-describedby={errors.duration ? "appointment-duration-error" : undefined} />{errors.duration && <p id="appointment-duration-error" role="alert">{errors.duration.message}</p>}</div>
      <div className="space-y-2"><label htmlFor="appointment-type" className="text-sm font-semibold">Catégorie</label><Select id="appointment-type" disabled={Boolean(disabled)} {...register("type")}>{Object.entries(appointmentTypes).map(([value, label]) => <option key={value} value={value as AppointmentType}>{label}</option>)}</Select></div>
      {candidates.length > 1 && <div className="space-y-2"><label htmlFor="appointment-occurrence" className="text-sm font-semibold">Décalage de cette heure répétée</label><Select id="appointment-occurrence" disabled={Boolean(disabled)} {...register("occurrence")} aria-describedby="appointment-occurrence-error"><option value="">Choisir le décalage</option>{candidates.map(value => <option key={value} value={value}>{instantLabel(value)}</option>)}</Select></div>}
      {errors.occurrence && <p id="appointment-occurrence-error" role="alert" className="text-sm text-danger">{errors.occurrence.message}</p>}
      {!candidates.length && selectedDate && selectedTime && <p role="alert" className="text-sm text-danger">Cette date ou heure ne peut pas être résolue dans Africa/Casablanca.</p>}
      <p className="text-xs text-muted-foreground sm:col-span-2">Heures Africa/Casablanca, durée réelle de 30 à 180 minutes. Aucun horaire d’ouverture n’est imposé. Le serveur vérifie le créneau à l’enregistrement.</p>
    </Card>
    {immutable && <p role="status">Ce rendez-vous terminé est immuable.</p>}
    {patientStatus === "inactive" && <p role="alert">Le patient est inactif. Restaurez sa fiche avant de réserver ou déplacer ce rendez-vous.</p>}
    {error ? <AppointmentFailure error={error} retry={reload ? () => { if (!isDirty || window.confirm("Recharger et abandonner les modifications non enregistrées ?")) reload(); } : undefined} /> : null}
    {conflict && <Button type="button" variant="outline" onClick={() => setError(undefined)}>Conserver mes saisies et choisir un autre horaire</Button>}
    <div className="flex flex-wrap justify-between gap-3"><Button asChild variant="ghost"><Link href={cancel}>Annuler</Link></Button><Button type="submit" disabled={Boolean(disabled || conflict || patientStatus === "inactive")}>{isSubmitting ? "Enregistrement…" : appointment ? "Enregistrer le rendez-vous" : "Créer le rendez-vous"}</Button></div>
  </form>;
}
