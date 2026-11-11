"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { PageHeading } from "@/components/page-heading";
import { PatientPicker } from "@/components/appointments/persistent/patient-picker";
import { useAppointmentApi } from "@/components/appointments/persistent/shared";
import { usePatientApi, useUnsavedChanges } from "@/components/patients/persistent/shared";
import type { AdministrativePatient } from "@/lib/patients/api/client";
import type { PersistentAppointment } from "@/lib/appointments/api/client";
import { calendarWindow, clinicParts, instantLabel } from "@/lib/appointments/api/time";
import { clinicDate } from "@/lib/patients/dates";
import { clinicalDraftValues, type ClinicalDraftFormValues } from "@/lib/consultations/api/forms";
import { ClinicalApiError } from "@/lib/consultations/api/client";
import type { PersistentConsultation, PersistentTreatment } from "@/lib/consultations/api/schemas";
import { ClinicalConfirmation } from "../clinical-confirmation";
import { ClinicalMutationFeedback } from "./mutation-feedback";
import { ClinicalBoundary, ClinicalFailure, ClinicalLoading, useClinicalLoad } from "./shared";
import { useClinicalApi, useClinicalDraftForm, useClinicalTreatmentForm } from "./use-clinical-forms";

const labels = [
  ["chiefComplaint", "Motif de consultation (obligatoire)"], ["clinicalObservations", "Observations cliniques (facultatif)"],
  ["assessment", "Évaluation clinique (facultatif)"], ["treatmentPlan", "Plan de traitement (facultatif)"], ["notes", "Notes complémentaires (facultatif)"],
] as const;
export function clinicalHref(record: Pick<PersistentConsultation, "id" | "patientId">, suffix = "", notice?: string) {
  return `/consultations/${record.id}${suffix}?${new URLSearchParams({ patientId: record.patientId, ...(notice ? { notice } : {}) })}`;
}
function AppointmentSelect({ patientId, currentId, form, disabled }: { patientId: string; currentId?: string; form: UseFormReturn<ClinicalDraftFormValues>; disabled: boolean }) {
  const api = useAppointmentApi();
  const [date, setDate] = useState(clinicDate);
  const load = useCallback(async () => {
    const list = await api.list({ ...calendarWindow(date, "week"), patientId });
    if (currentId && !list.some(a => a.id === currentId)) {
      const selected = await api.get(currentId);
      if (selected.patientId !== patientId) throw new ClinicalApiError(400);
      list.push(selected);
    }
    return list;
  }, [api, currentId, date, patientId]);
  const state = useClinicalLoad(`${patientId}:${date}:${currentId}`, load);
  return <section className="space-y-3"><label htmlFor="clinical-appointment-week" className="block space-y-2 text-sm font-semibold">Semaine des rendez-vous<Input id="clinical-appointment-week" type="date" value={date} disabled={disabled} onChange={e => { if (e.target.value) setDate(e.target.value); }} /></label>
    <div className="space-y-2"><label htmlFor="clinical-appointment" className="block text-sm font-semibold">Rendez-vous lié (facultatif)</label><Select id="clinical-appointment" {...form.register("appointmentId")} value={currentId ?? ""} disabled={disabled || !state.data}>
      <option value="">Sans rendez-vous</option>{state.data?.map(a => <option key={a.id} value={a.id}>{clinicParts(a.startAt).date} · {instantLabel(a.startAt)} · {a.status}</option>)}
    </Select></div>
    {state.error ? <ClinicalFailure error={state.error} retry={state.reload} /> : !state.data ? <p role="status">Chargement des rendez-vous de la semaine…</p> : null}
    {form.formState.errors.appointmentId && <p role="alert">{form.formState.errors.appointmentId.message}</p>}
    <p className="text-xs text-muted-foreground">Seuls les rendez-vous de ce patient sont proposés. Le lien est facultatif et unique ; le serveur vérifie sa disponibilité.</p>
  </section>;
}
export function PersistentClinicalFormPage({ id, patientId = "", appointmentId = "" }: { id?: string; patientId?: string; appointmentId?: string }) {
  return <ClinicalBoundary><ClinicalFormLoader key={`${id}:${patientId}:${appointmentId}`} id={id} patientId={patientId} appointmentId={appointmentId} /></ClinicalBoundary>;
}
function ClinicalFormLoader({ id, patientId, appointmentId }: { id?: string; patientId: string; appointmentId: string }) {
  const { api } = useClinicalApi(), patients = usePatientApi(), appointments = useAppointmentApi();
  const [selected, setSelected] = useState(patientId);
  const select = useCallback((patient: { id: string }) => setSelected(patient.id), []);
  const load = useCallback(async () => {
    let appointment: PersistentAppointment | undefined;
    if (appointmentId) appointment = await appointments.get(appointmentId);
    const owner = selected || appointment?.patientId;
    if (!owner) { if (id) throw new ClinicalApiError(400); return null; }
    const [patient, record] = await Promise.all([patients.get(owner), id ? api.get(owner, id) : Promise.resolve(undefined)]);
    if (appointment && appointment.patientId !== patient.id) throw new ClinicalApiError(400);
    return { patient, record, appointment };
  }, [api, patients, appointments, appointmentId, selected, id]);
  const state = useClinicalLoad(`${id}:${selected}:${appointmentId}`, load);
  if (state.error) return <ClinicalFailure error={state.error} retry={state.reload} />;
  if (state.data === undefined) return <ClinicalLoading />;
  if (!state.data) return <><PageHeading title="Nouvelle consultation" description="Choisissez un patient enregistré." /><PatientPicker disabled={false} onSelect={select} /></>;
  return <DraftEditor key={`${state.data.patient.id}:${state.data.record?.id ?? "new"}`} {...state.data} />;
}
function DraftEditor({ patient: initialPatient, record: initialRecord, appointment }: { patient: AdministrativePatient; record?: PersistentConsultation; appointment?: PersistentAppointment }) {
  const router = useRouter(), patients = usePatientApi(); const { api } = useClinicalApi();
  const [patient, setPatient] = useState(initialPatient), [record, setRecord] = useState(initialRecord);
  const [confirming, setConfirming] = useState(false), [reloadError, setReloadError] = useState<unknown>(), [reloading, setReloading] = useState(false);
  const editor = useClinicalDraftForm({ initial: record,
    defaultValues: clinicalDraftValues(patient.id, initialRecord?.content ?? { appointmentId: appointment?.id ?? null,
      consultationDate: appointment ? clinicParts(appointment.startAt).date : clinicDate(), chiefComplaint: "", clinicalObservations: "", assessment: "", treatmentPlan: "", notes: "" }),
    onSaved: saved => router.push(clinicalHref(saved, "", initialRecord ? "draft" : "created")),
  });
  const selectedAppointment = useWatch({ control: editor.form.control, name: "appointmentId" });
  useUnsavedChanges(editor.form.formState.isDirty && !editor.state.completed);
  async function reload() {
    if (!record || reloading) return;
    setReloading(true); setReloadError(undefined);
    try {
      const [latest, owner] = await Promise.all([api.get(patient.id, record.id), patients.get(patient.id)]);
      if (editor.acceptReload(latest, true)) { setRecord(latest); setPatient(owner); setConfirming(false); }
    } catch (error) { setReloadError(error); } finally { setReloading(false); }
  }
  const disabled = editor.disabled || patient.status === "inactive" || reloading;
  return <>
    <PageHeading eyebrow={patient.reference} title={initialRecord ? "Modifier le brouillon" : "Nouvelle consultation"} description={`${patient.identity.firstName} ${patient.identity.lastName}`} />
    <Link className="text-primary underline" href={`/patients/${patient.id}/clinique`}>Historique clinique du patient</Link>
    {patient.status === "inactive" && <p role="alert">Patient archivé. Aucune écriture clinique n’est autorisée.</p>}
    {record?.status === "TERMINEE" && <p role="status">Cette consultation finalisée est en lecture seule.</p>}
    <form noValidate onSubmit={event => { if (patient.status === "inactive") event.preventDefault(); else void editor.submit(event); }} aria-busy={editor.state.pending} className="space-y-5">
      <input type="hidden" {...editor.form.register("patientId")} />
      <fieldset disabled={disabled} className="space-y-5 rounded-xl border bg-surface p-5"><legend className="px-2 font-semibold">Compte rendu clinique</legend>
        <label htmlFor="clinical-date" className="block space-y-2 text-sm font-semibold">Date de consultation<Input id="clinical-date" type="date" {...editor.form.register("consultationDate")} aria-invalid={Boolean(editor.form.formState.errors.consultationDate)} aria-describedby="clinical-date-error" /></label>
        {editor.form.formState.errors.consultationDate && <p id="clinical-date-error" role="alert">{editor.form.formState.errors.consultationDate.message}</p>}
        <AppointmentSelect patientId={patient.id} currentId={selectedAppointment || undefined} form={editor.form} disabled={disabled} />
        {labels.map(([name, label]) => <div key={name} className="space-y-2"><label htmlFor={`clinical-${name}`} className="text-sm font-semibold">{label}</label>
          <Textarea id={`clinical-${name}`} {...editor.form.register(name)} rows={name === "chiefComplaint" ? 2 : 4} aria-invalid={Boolean(editor.form.formState.errors[name])} aria-describedby={`clinical-${name}-error`} />
          {editor.form.formState.errors[name] && <p id={`clinical-${name}-error`} role="alert">{editor.form.formState.errors[name]?.message}</p>}
        </div>)}
        <Button type="submit" disabled={disabled}>{editor.state.pending ? "Enregistrement…" : initialRecord ? "Enregistrer le brouillon" : "Créer le brouillon"}</Button>
      </fieldset>
    </form>
    <ClinicalMutationFeedback state={editor.state} allowed={editor.allowed} />
    {record ? <Button variant="outline" disabled={editor.state.pending} onClick={() => setConfirming(true)}>Recharger le brouillon</Button> : editor.state.blocked ? <p>Vérifiez l’historique du patient avant toute nouvelle création. Aucun enregistrement supplémentaire ne sera envoyé automatiquement.</p> : null}
    <ClinicalConfirmation open={confirming} onOpenChange={setConfirming} title="Recharger le brouillon ?" description="Les modifications non enregistrées seront remplacées par le contenu actuel du serveur." confirmLabel="Recharger et remplacer mes saisies" busy={reloading} error={reloadError ? "Le dossier ne peut pas être rechargé." : undefined} onConfirm={() => void reload()} />
  </>;
}
export function TreatmentEditor({ consultation, treatment, patient, onSaved, onCancel }: { consultation: PersistentConsultation; treatment?: PersistentTreatment; patient: AdministrativePatient; onSaved(record: PersistentConsultation): void; onCancel(): void }) {
  const { api } = useClinicalApi(), patients = usePatientApi();
  const [record, setRecord] = useState(consultation), [owner, setOwner] = useState(patient), [confirming, setConfirming] = useState(false), [reloadError, setReloadError] = useState<unknown>(), [reloading, setReloading] = useState(false);
  const editor = useClinicalTreatmentForm({ consultation: record, treatment, onSaved });
  useUnsavedChanges(editor.form.formState.isDirty && !editor.state.completed);
  async function reload() {
    if (reloading) return;
    setReloading(true); setReloadError(undefined);
    try {
      const [latest, patient] = await Promise.all([api.get(record.patientId, record.id), patients.get(record.patientId)]);
      if (editor.acceptReload(latest, true)) { setRecord(latest); setOwner(patient); setConfirming(false); }
    } catch (error) { setReloadError(error); } finally { setReloading(false); }
  }
  const disabled = editor.disabled || owner.status === "inactive" || reloading;
  return <Card className="space-y-4 p-5"><h2 className="font-semibold">{treatment ? "Modifier le soin" : "Ajouter un soin"}</h2>
    {owner.status === "inactive" && <p role="alert">Patient archivé. Les soins ne peuvent plus être modifiés.</p>}
    <form noValidate onSubmit={e => { if (owner.status === "inactive") e.preventDefault(); else void editor.submit(e); }} aria-busy={editor.state.pending}>
      <fieldset className="space-y-4" disabled={disabled}>
        <label className="block space-y-2 text-sm font-semibold" htmlFor="treatment-date">Date du soin<Input id="treatment-date" type="date" {...editor.form.register("treatmentDate")} aria-describedby="treatmentDate-error" aria-invalid={Boolean(editor.form.formState.errors.treatmentDate)} /></label>
        {([ ["description", "Description (obligatoire)"], ["toothReference", "Référence dentaire (facultatif)"], ["notes", "Notes du soin (facultatif)"] ] as const).map(([name, label]) => <div key={name} className="space-y-2"><label htmlFor={`treatment-${name}`} className="text-sm font-semibold">{label}</label>
          <Textarea id={`treatment-${name}`} {...editor.form.register(name)} aria-invalid={Boolean(editor.form.formState.errors[name])} aria-describedby={`${name}-error`} />
        </div>)}
        {Object.entries(editor.form.formState.errors).map(([name, error]) => <p key={name} id={`${name}-error`} role="alert">{error?.message}</p>)}
        <Button type="submit" disabled={disabled}>{treatment ? "Enregistrer le soin" : "Ajouter le soin"}</Button>
      </fieldset>
    </form>
    <ClinicalMutationFeedback state={editor.state} allowed={editor.allowed} />
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={editor.state.pending} onClick={() => { if (!editor.form.formState.isDirty || window.confirm("Abandonner les saisies non enregistrées ?")) onCancel(); }}>Fermer le formulaire de soin</Button>
      <Button variant="outline" disabled={editor.state.pending} onClick={() => setConfirming(true)}>Recharger le dossier pour ce soin</Button></div>
    <ClinicalConfirmation open={confirming} onOpenChange={setConfirming} title="Recharger ce soin ?" description="Le soin existant sera relu depuis le serveur. Les saisies d’un nouveau soin seront conservées pour examen avant une nouvelle soumission." confirmLabel="Recharger le dossier clinique" busy={reloading} error={reloadError ? "Le rechargement est indisponible." : undefined} onConfirm={() => void reload()} />
  </Card>;
}
