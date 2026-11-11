"use client";
import { PersistentPatientAppointments } from "@/components/appointments/persistent/patient-section";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AdministrativePatient, MedicalRecord } from "@/lib/patients/api/client";
import { PatientIdentitySummary } from "../patient-identity-summary";
import { PatientClinicalSections } from "../patient-clinical-sections";
import { PatientStatus } from "../patient-status";
import { PatientFailure, PersistentNotice, usePatientApi } from "./shared";
import { PersistentPatientForm } from "./form";

export function NewPersistentPatient() {
  const { user } = useAuth();
  return <><PageHeading title="Nouveau patient" description="Créez un dossier dans la base du cabinet." /><PersistentNotice />
    <PersistentPatientForm key={user?.id} mode={user?.role === "DENTIST" ? "complete" : "administrative"} /></>;
}
/** Reception never mounts the medical loader or receives a mixed Patient object. */
export function PersistentPatientRecord({ id, clinical = false, edit = false }: { id: string; clinical?: boolean; edit?: boolean }) {
  const { user } = useAuth();
  if (clinical && user?.role !== "DENTIST") return <p role="alert">Accès réservé au dentiste.</p>;
  return <AdministrativeRecord key={`${user?.id}-${id}-${clinical}-${edit}`} id={id} clinical={clinical} edit={edit} />;
}
function AdministrativeRecord({ id, clinical, edit }: { id: string; clinical: boolean; edit: boolean }) {
  const api = usePatientApi(); const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ patient?: AdministrativePatient; error?: unknown }>();
  const [actionError, setActionError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => api.get(id)).then(patient => { if (active) setState({ patient }); }, error => { if (active) setState({ error }); });
    return () => { active = false; };
  }, [api, id, revision]);
  function reload() { setState(undefined); setActionError(undefined); setRevision(value => value + 1); }
  if (!state) return <p role="status">Chargement du patient…</p>;
  if (!state.patient) return <PatientFailure error={state.error} retry={reload} />;
  const patient = state.patient;
  async function lifecycle() {
    if (busy || !window.confirm(patient.status === "active" ? "Archiver ce patient ? Le dossier médical sera conservé." : "Restaurer ce patient ?")) return;
    setBusy(true); setActionError(undefined);
    try { const saved = await api.archive(patient, patient.status === "active" ? "inactive" : "active"); setState({ patient: saved }); setNotice("Statut du patient enregistré."); }
    catch (error) { setActionError(error); } finally { setBusy(false); }
  }
  return <>
    <Link href="/patients" className="text-primary underline">Retour à l’annuaire</Link>
    <PageHeading eyebrow={patient.reference} title={edit ? clinical ? "Modifier le dossier de santé" : "Modifier le patient" : `${patient.identity.firstName} ${patient.identity.lastName}`} description={clinical ? "Questionnaire et antécédents rapportés." : "Informations personnelles et administratives."} />
    <PersistentNotice /><PatientStatus status={patient.status} />
    {patient.status === "inactive" && <p role="status" className="rounded-lg border bg-surface p-4">Patient inactif. Le dossier médical reste consultable ; sa modification exige une restauration.</p>}
    <nav aria-label="Sections du dossier" className="flex flex-wrap gap-4 border-b pb-3"><Link className="text-primary underline" href={`/patients/${id}`}>Informations personnelles</Link>
      {user?.role === "DENTIST" && <><Link className="text-primary underline" href={`/patients/${id}/dossier`}>Questionnaire et antécédents</Link><Link className="text-primary underline" href={`/patients/${id}/clinique`}>Historique clinique</Link></>}</nav>
    {clinical ? <MedicalSection key={revision} patient={patient} edit={edit} reloadPatient={reload} /> : edit ?
      <PersistentPatientForm key={revision} patient={patient} mode="administrative" reload={reload} /> : <>
        <Card><CardContent className="pt-6"><PatientIdentitySummary identity={{ ...patient.identity, dateOfBirth: patient.identity.dateOfBirth ?? "" }} /></CardContent></Card>
        <div className="flex gap-3"><Button asChild><Link href={`/patients/${id}/modifier`}>Modifier le patient</Link></Button>
          <Button variant="outline" disabled={busy || Boolean(actionError)} onClick={() => void lifecycle()}>{busy ? "Enregistrement…" : patient.status === "active" ? "Archiver le patient" : "Restaurer le patient"}</Button></div>
        <PersistentPatientAppointments patientId={patient.id} inactive={patient.status === "inactive"} />
        {actionError ? <PatientFailure error={actionError} retry={reload} /> : null}{notice && <p role="status">{notice}</p>}
      </>}
  </>;
}
function MedicalSection({ patient, edit, reloadPatient }: { patient: AdministrativePatient; edit: boolean; reloadPatient(): void }) {
  const api = usePatientApi();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ medical?: MedicalRecord; error?: unknown }>();
  useEffect(() => {
    let active = true;
    api.medical(patient.id).then(medical => { if (active) setState({ medical }); }, error => { if (active) setState({ error }); });
    return () => { active = false; };
  }, [api, patient.id, revision]);
  function reload() { setState(undefined); setRevision(value => value + 1); }
  if (!state) return <p role="status">Chargement du dossier de santé…</p>;
  if (!state.medical) return <PatientFailure error={state.error} retry={reload} />;
  if (edit && patient.status === "inactive") return <p>Restaurez le patient depuis sa fiche administrative avant de modifier le dossier de santé.</p>;
  return edit ? <PersistentPatientForm key={revision} patient={patient} medical={state.medical} mode="medical" reload={reloadPatient} /> : <>
    <PatientClinicalSections patient={state.medical.record} />
    <Button asChild disabled={patient.status === "inactive"}><Link href={`/patients/${patient.id}/dossier/modifier`}>Modifier le dossier de santé</Link></Button>
  </>;
}
