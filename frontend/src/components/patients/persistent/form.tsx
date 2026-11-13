"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { emptyPatientInput } from "@/lib/patients/schema";
import { administrativeInput, medicalInput, persistentFormSchema, PatientApiError, type AdministrativePatient, type MedicalRecord } from "@/lib/patients/api/client";
import { clinicDate } from "@/lib/patients/dates";
import type { CreatePatientInput } from "@/lib/patients/types";
import { PatientIdentityFields, MedicalHistoryFields, AllergiesAndHealthFields } from "../patient-form-fields";
import { PatientIdentitySummary } from "../patient-identity-summary";
import { PatientClinicalSections } from "../patient-clinical-sections";
import { PatientFailure, usePatientApi, useUnsavedChanges } from "./shared";

const subscribe = () => () => {};

export function PersistentPatientForm({ patient, medical, mode, reload }: {
  patient?: AdministrativePatient; medical?: MedicalRecord; mode: "administrative" | "complete" | "medical"; reload?: () => void;
}) {
  const api = usePatientApi(); const router = useRouter();
  const busy = useRef(false);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [error, setError] = useState<unknown>();
  const [saved, setSaved] = useState(false);
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (step > 0) heading.current?.focus(); }, [step]);
  const initial = emptyPatientInput();
  if (patient) { initial.identity = { ...patient.identity, dateOfBirth: patient.identity.dateOfBirth ?? "" }; initial.status = patient.status; }
  if (medical) { initial.medicalHistory = medical.record.medicalHistory; initial.allergies = medical.record.allergies; initial.healthQuestionnaire = medical.record.healthQuestionnaire; }
  const form = useForm<CreatePatientInput>({ resolver: zodResolver(persistentFormSchema()), defaultValues: initial });
  const { formState: { isSubmitting, isDirty }, handleSubmit, getValues, reset } = form;
  useUnsavedChanges(isDirty && !saved);
  const medicalOnly = mode === "medical";
  const adminOnly = mode === "administrative";
  const steps = adminOnly ? ["Informations personnelles", "Vérification et confirmation"]
    : medicalOnly ? ["Antécédents médicaux", "Allergies et questionnaire de santé", "Vérification et confirmation"]
    : ["Informations personnelles", "Antécédents médicaux", "Allergies et questionnaire de santé", "Vérification et confirmation"];
  const review = step === steps.length - 1;
  const conflict = error instanceof PatientApiError && error.status === 409;
  const blocked = !hydrated || isSubmitting || (medicalOnly && patient?.status === "inactive");
  async function next() {
    const section = steps[step];
    const valid = await form.trigger(section === "Informations personnelles" ? ["identity", "status"] : section === "Antécédents médicaux" ? "medicalHistory" : ["allergies", "healthQuestionnaire"], { shouldFocus: true });
    if (valid) setStep(value => value + 1);
  }
  async function save(values: CreatePatientInput) {
    if (!review) { await next(); return; }
    if (busy.current || conflict || blocked) return;
    busy.current = true; setError(undefined);
    try {
      let id = patient?.id;
      if (medicalOnly && patient && medical) await api.updateMedical(patient.id, medical.version, medicalInput(values));
      else if (patient) await api.update(patient.id, patient.version, administrativeInput(values));
      else if (mode === "complete") id = (await api.createComplete(administrativeInput(values), medicalInput(values))).patient.id;
      else id = (await api.create(administrativeInput(values))).id;
      reset(values); setSaved(true);
      if (!patient) router.push(`/patients/${id}`);
    } catch (failure) { setError(failure); } finally { busy.current = false; }
  }
  return <FormProvider {...form}><form noValidate className="space-y-6" aria-busy={isSubmitting} onSubmit={event => {
    if (!review) { event.preventDefault(); void next(); } else void handleSubmit(save, () => setStep(0))(event);
  }}>
    <ol aria-label="Étapes du dossier patient" className="grid grid-cols-2 gap-2 xl:grid-cols-4">{steps.map((label, index) => <li
      key={label}
      aria-current={step === index ? "step" : undefined}
      className="rounded-lg border bg-surface p-2.5 text-sm leading-5 aria-[current=step]:border-primary aria-[current=step]:bg-primary-tint aria-[current=step]:font-semibold aria-[current=step]:text-primary sm:p-3"
    >{index + 1}. {label}</li>)}</ol>
    <Card><CardHeader className="border-b"><h2 ref={heading} tabIndex={-1} className="font-semibold outline-none">{steps[step]}</h2><p className="text-sm text-muted-foreground">Seuls le nom et le prénom sont obligatoires. Une question sans réponse reste non renseignée.</p></CardHeader><CardContent className="pt-6">
      {!review && steps[step] === "Informations personnelles" && <PatientIdentityFields persistent disabled={blocked || saved} today={clinicDate()} />}
      {!review && steps[step] === "Antécédents médicaux" && <MedicalHistoryFields disabled={blocked || saved} />}
      {!review && steps[step] === "Allergies et questionnaire de santé" && <AllergiesAndHealthFields disabled={blocked || saved} />}
      {review && <div className="space-y-6">{!medicalOnly && <><PatientIdentitySummary identity={getValues().identity} /><p>Statut : {getValues().status === "active" ? "Actif" : "Inactif"}</p></>}
        {!adminOnly && <PatientClinicalSections patient={getValues()} demo={false} />}<p>La confirmation enregistre les données dans la base du cabinet.</p></div>}
    </CardContent></Card>
    {error ? <PatientFailure error={error} retry={reload ? () => { if (!isDirty || window.confirm("Recharger les données et abandonner les modifications non enregistrées ?")) reload(); } : undefined} /> : null}
    {saved && <p role="status">Modifications enregistrées. <Link className="text-primary underline" href={`/patients/${patient?.id}${medicalOnly ? "/dossier" : ""}`}>Revenir au dossier</Link></p>}
    <div className="flex flex-wrap justify-between gap-3"><Button asChild variant="ghost"><Link href={patient ? `/patients/${patient.id}` : "/patients"}>Annuler</Link></Button><div className="flex gap-2">
      {step > 0 && <Button type="button" variant="outline" disabled={blocked || saved} onClick={() => setStep(value => value - 1)}>Précédent</Button>}
      <Button type="submit" disabled={blocked || conflict || saved}>{isSubmitting ? "Enregistrement…" : review ? patient ? "Enregistrer" : "Créer le patient" : "Continuer"}</Button>
    </div></div>
  </form></FormProvider>;
}
