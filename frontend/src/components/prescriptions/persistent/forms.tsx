"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { PatientPicker } from "@/components/appointments/persistent/patient-picker";
import { usePatientApi, useUnsavedChanges } from "@/components/patients/persistent/shared";
import { useClinicalApi } from "@/components/consultations/persistent/use-clinical-forms";
import { ClinicalConfirmation } from "@/components/consultations/clinical-confirmation";
import type { AdministrativePatient } from "@/lib/patients/api/client";
import type { ClinicalCursor } from "@/lib/consultations/api/schemas";
import { clinicDate, formatPatientDate } from "@/lib/patients/dates";
import { PrescriptionApiError } from "@/lib/prescriptions/api/client";
import type { PersistentPrescription } from "@/lib/prescriptions/api/schemas";
import { prescriptionDraftValues, type PrescriptionDraftFormValues } from "@/lib/prescriptions/api/forms";
import { usePrescriptionApi, usePrescriptionDraftForm } from "./use-prescription-forms";
import { PrescriptionMutationFeedback } from "./mutation-feedback";
import { PrescriptionBoundary, PrescriptionFailure, PrescriptionLoading, PrescriptionNavigation, StoredPrescriptionStatus, prescriptionHref, usePrescriptionLoad } from "./shared";

export function PersistentPrescriptionFormPage({ id, patientId = "", consultationId = "" }: { id?: string; patientId?: string; consultationId?: string }) {
  return <PrescriptionBoundary><FormLoader key={`${id}:${patientId}:${consultationId}`} id={id} patientId={patientId} consultationId={consultationId} /></PrescriptionBoundary>;
}
function FormLoader({ id, patientId, consultationId }: { id?: string; patientId: string; consultationId: string }) {
  const { api } = usePrescriptionApi(), patients = usePatientApi(); const clinical = useClinicalApi();
  const [selected, setSelected] = useState(patientId);
  const select = useCallback((patient: { id: string }) => setSelected(patient.id), []);
  const load = useCallback(async () => {
    if (!selected) { if (id) throw new PrescriptionApiError(400); return null; }
    const [patient, record] = await Promise.all([patients.get(selected), id ? api.get(selected, id) : Promise.resolve(undefined),
      consultationId ? clinical.api.get(selected, consultationId) : Promise.resolve(undefined)]);
    return { patient, record };
  }, [patients, api, clinical.api, selected, id, consultationId]);
  const state = usePrescriptionLoad(`${selected}:${id}:${consultationId}`, load);
  if (state.error) return <PrescriptionFailure error={state.error} retry={state.reload} />;
  if (state.data === undefined) return <PrescriptionLoading />;
  if (!state.data) return <><PageHeading title="Nouvelle ordonnance" description="Choisissez un patient enregistré." /><PatientPicker disabled={false} onSelect={select} /></>;
  return <DraftEditor key={`${selected}:${id ?? "new"}`} {...state.data} consultationId={consultationId} />;
}
function ConsultationSelect({ patientId, currentId, form, disabled }: { patientId: string; currentId: string; form: UseFormReturn<PrescriptionDraftFormValues>; disabled: boolean }) {
  const { api } = useClinicalApi();
  const [cursor, setCursor] = useState<ClinicalCursor>();
  const load = useCallback(async () => {
    const [history, selected] = await Promise.all([api.history(patientId, cursor), currentId ? api.get(patientId, currentId) : Promise.resolve(undefined)]);
    const options = history.items.map(c => ({ id: c.id, date: c.consultationDate }));
    if (selected && !options.some(c => c.id === selected.id)) options.unshift({ id: selected.id, date: selected.content.consultationDate });
    return { options, next: history.nextCursor };
  }, [api, patientId, cursor, currentId]);
  const state = usePrescriptionLoad(`${patientId}:${currentId}:${cursor?.id}:${cursor?.date}`, load);
  return <section className="space-y-3"><label htmlFor="prescription-consultation" className="block text-sm font-semibold">Consultation liée (facultatif)</label>
    <Select id="prescription-consultation" {...form.register("consultationId")} value={currentId} disabled={disabled || !state.data}>
      <option value="">Sans consultation</option>{state.data?.options.map(c => <option key={c.id} value={c.id}>Consultation du {formatPatientDate(c.date)}</option>)}
    </Select>
    {state.error ? <PrescriptionFailure error={state.error} retry={state.reload} /> : !state.data ? <p role="status">Chargement des consultations…</p> : null}
    <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={disabled || !cursor} onClick={() => setCursor(undefined)}>Consultations récentes</Button>
      <Button type="button" variant="outline" disabled={disabled || !state.data?.next} onClick={() => { if (state.data?.next) setCursor(state.data.next); }}>Consultations plus anciennes</Button></div>
    <p className="text-xs text-muted-foreground">Seules les consultations de ce patient sont proposées. Aucun contenu clinique ne remplit les médicaments.</p>
    {form.formState.errors.consultationId && <p role="alert">{form.formState.errors.consultationId.message}</p>}
  </section>;
}
function DraftEditor({ patient: initialPatient, record: initialRecord, consultationId }: { patient: AdministrativePatient; record?: PersistentPrescription; consultationId: string }) {
  const router = useRouter(), patients = usePatientApi(); const { api } = usePrescriptionApi();
  const [patient, setPatient] = useState(initialPatient), [record, setRecord] = useState(initialRecord);
  const [confirming, setConfirming] = useState(false), [reloading, setReloading] = useState(false), [reloadError, setReloadError] = useState<unknown>();
  const editor = usePrescriptionDraftForm({ initial: record,
    defaultValues: prescriptionDraftValues(patient.id, initialRecord?.content ?? { consultationId: consultationId || null, issuedDate: clinicDate(), medications: [], generalInstructions: "" }),
    onSaved: saved => router.push(prescriptionHref(saved, "", initialRecord ? "draft" : "created")),
  });
  const selectedConsultation = useWatch({ control: editor.form.control, name: "consultationId" });
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
    <PageHeading eyebrow={patient.reference} title={initialRecord ? "Modifier l’ordonnance" : "Nouvelle ordonnance"} description={`${patient.identity.firstName} ${patient.identity.lastName}`} />
    <PrescriptionNavigation patientId={patient.id} consultationId={record?.content.consultationId ?? consultationId} />
    {record && <StoredPrescriptionStatus {...record} />}
    {patient.status === "inactive" && <p role="alert">Patient archivé. Aucune modification d’ordonnance n’est autorisée.</p>}
    {(record?.archivedAt || record?.status === "FINALISEE") && <p role="status">Cette ordonnance est en lecture seule.</p>}
    <form noValidate onSubmit={e => { if (patient.status === "inactive") e.preventDefault(); else void editor.submit(e); }} aria-busy={editor.state.pending} className="space-y-5">
      <input type="hidden" {...editor.form.register("patientId")} />
      <fieldset disabled={disabled} className="space-y-5 rounded-xl border bg-surface p-5"><legend className="px-2 font-semibold">Brouillon d’ordonnance</legend>
        <label htmlFor="prescription-date" className="block space-y-2 text-sm font-semibold">Date de l’ordonnance (obligatoire)<Input id="prescription-date" type="date" {...editor.form.register("issuedDate")} aria-invalid={Boolean(editor.form.formState.errors.issuedDate)} aria-describedby="prescription-date-error" /></label>
        {editor.form.formState.errors.issuedDate && <p role="alert" id="prescription-date-error">{editor.form.formState.errors.issuedDate.message}</p>}
        <ConsultationSelect patientId={patient.id} currentId={selectedConsultation} form={editor.form} disabled={disabled} />
        <MedicationEditor editor={editor} disabled={disabled} />
        <label htmlFor="prescription-instructions" className="block space-y-2 text-sm font-semibold">Instructions générales (facultatif)<Textarea id="prescription-instructions" rows={4} maxLength={2000} {...editor.form.register("generalInstructions")} aria-invalid={Boolean(editor.form.formState.errors.generalInstructions)} aria-describedby="prescription-instructions-error" /></label>
        {editor.form.formState.errors.generalInstructions && <p role="alert" id="prescription-instructions-error">{editor.form.formState.errors.generalInstructions.message}</p>}
        <p className="text-sm text-muted-foreground">L’enregistrement conserve un brouillon, même incomplet. La finalisation est une action distincte après relecture.</p>
        <Button type="submit" disabled={disabled}>{editor.state.pending ? "Enregistrement…" : initialRecord ? "Enregistrer le brouillon" : "Créer le brouillon"}</Button>
      </fieldset>
    </form>
    <PrescriptionMutationFeedback state={editor.state} allowed={editor.allowed} />
    {record ? <Button variant="outline" disabled={editor.state.pending || reloading} onClick={() => setConfirming(true)}>Recharger le brouillon</Button> : editor.state.blocked ? <p>Vérifiez l’historique du patient avant toute nouvelle création. Aucun nouvel enregistrement ne sera envoyé automatiquement.</p> : null}
    <ClinicalConfirmation open={confirming} onOpenChange={setConfirming} title="Recharger le brouillon ?" description="Les modifications non enregistrées seront remplacées par le contenu actuel du serveur." confirmLabel="Recharger et remplacer mes saisies" busy={reloading} error={reloadError ? "L’ordonnance ne peut pas être rechargée." : undefined} onConfirm={() => void reload()} />
    {record && <Link className="text-primary underline" href={prescriptionHref(record)}>Retour à l’ordonnance</Link>}
  </>;
}
const medicationFields = [ ["medicationName", "Nom du médicament", 200], ["dosage", "Posologie", 300], ["frequency", "Fréquence", 200], ["duration", "Durée", 200], ["instructions", "Instructions complémentaires", 1500] ] as const;
function MedicationEditor({ editor, disabled }: { editor: ReturnType<typeof usePrescriptionDraftForm>; disabled: boolean }) {
  const [removing, setRemoving] = useState<number>();
  const { form, medications } = editor;
  return <section className="space-y-5" aria-label="Médicaments"><h2 className="font-semibold">Médicaments</h2>
    {!medications.fields.length && <p>Aucun médicament ajouté. Ce brouillon peut rester incomplet.</p>}
    {medications.fields.map((field, index) => <Card key={field.formKey} className="p-4"><fieldset disabled={disabled} className="space-y-4"><legend className="px-2 font-semibold">Médicament {index + 1}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{medicationFields.map(([name, label, max]) => {
        const path = `medications.${index}.${name}` as const, error = form.formState.errors.medications?.[index]?.[name], id = `med-${field.formKey}-${name}`;
        const props = { id, maxLength: max, ...form.register(path), "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined };
        return <div className="min-w-0 space-y-2" key={name}><label htmlFor={id} className="text-sm font-semibold">{label}</label>{name === "instructions" ? <Textarea rows={3} {...props} /> : <Input {...props} />}
          {error && <p id={`${id}-error`} role="alert">{error.message}</p>}</div>;
      })}</div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={disabled || index === 0} onClick={() => medications.move(index, index - 1)} aria-label={`Monter le médicament ${index + 1}`}>Monter</Button>
        <Button type="button" variant="outline" disabled={disabled || index === medications.fields.length - 1} onClick={() => medications.move(index, index + 1)} aria-label={`Descendre le médicament ${index + 1}`}>Descendre</Button>
        <Button type="button" variant="ghost" disabled={disabled} onClick={() => setRemoving(index)} aria-label={`Retirer le médicament ${index + 1}`}>Retirer</Button></div>
    </fieldset></Card>)}
    {form.formState.errors.medications?.root?.message && <p role="alert">{form.formState.errors.medications.root.message}</p>}
    <Button type="button" variant="secondary" disabled={disabled || medications.fields.length >= 20} onClick={() => medications.append()}>Ajouter un médicament</Button>
    <ClinicalConfirmation open={removing !== undefined} onOpenChange={open => { if (!open) setRemoving(undefined); }} title="Retirer cette ligne ?" description="Cette ligne sera retirée du brouillon lors de son prochain enregistrement." confirmLabel="Retirer la ligne" confirmDisabled={disabled} onConfirm={() => { if (removing !== undefined) medications.remove(removing, true); setRemoving(undefined); }} />
  </section>;
}
