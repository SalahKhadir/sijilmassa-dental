"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useClinicalApi } from "./use-clinical-forms";
import { ClinicalBoundary, ClinicalFailure, ClinicalLoading, useClinicalLoad } from "./shared";
import { usePatientApi } from "@/components/patients/persistent/shared";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { formatPatientDate } from "@/lib/patients/dates";
import type { ClinicalCursor } from "@/lib/consultations/api/schemas";
import { ConsultationStatus } from "../consultation-status";

export function PersistentClinicalDirectory({ patientId }: { patientId?: string }) {
  return <ClinicalBoundary>{patientId ? <ClinicalPatientHistory key={patientId} patientId={patientId} /> : <PatientDirectory />}</ClinicalBoundary>;
}
function PatientDirectory() {
  const patients = usePatientApi();
  const [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const load = useCallback(() => patients.list({ q: query, page, pageSize: 20, status: "all", sort: "name" }), [patients, query, page]);
  const state = useClinicalLoad(`${query}:${page}`, load);
  return <>
    <PageHeading eyebrow="Espace clinique du dentiste" title="Consultations" description="Choisissez un patient enregistré pour consulter son historique clinique." />
    <p className="text-sm text-muted-foreground">Historique par patient, par pages de 50 consultations. Aucun total clinique global n’est calculé.</p>
    <label className="block space-y-2 font-semibold">Rechercher un patient<Input type="search" maxLength={160} autoComplete="off" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
    {state.error ? <ClinicalFailure error={state.error} retry={state.reload} /> : !state.data ? <ClinicalLoading /> : <>
      {!state.data.items.length && <p>Aucun patient ne correspond à cette recherche.</p>}
      <ul className="space-y-3" aria-label="Patients cliniques">{state.data.items.map(patient => <li key={patient.id}><Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <span>{patient.identity.firstName} {patient.identity.lastName} · {patient.reference}{patient.status === "inactive" ? " · Patient archivé" : ""}</span>
        <Button asChild variant="outline"><Link href={`/patients/${patient.id}/clinique`}>Ouvrir l’historique clinique</Link></Button>
      </Card></li>)}</ul>
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Patients précédents</Button>
        <span>Page {page} sur {state.data.pageCount}</span><Button variant="outline" disabled={page >= state.data.pageCount} onClick={() => setPage(value => value + 1)}>Patients suivants</Button></div>
    </>}
  </>;
}
export function ClinicalPatientHistory({ patientId }: { patientId: string }) {
  const { api } = useClinicalApi(), patients = usePatientApi();
  const [cursor, setCursor] = useState<ClinicalCursor>();
  const load = useCallback(async () => {
    const [patient, history] = await Promise.all([patients.get(patientId), api.history(patientId, cursor)]);
    return { patient, history };
  }, [patients, api, patientId, cursor]);
  const state = useClinicalLoad(`${patientId}:${cursor?.date}:${cursor?.id}`, load);
  if (state.error) return <ClinicalFailure error={state.error} retry={state.reload} />;
  if (!state.data) return <ClinicalLoading />;
  const { patient, history } = state.data;
  return <>
    <PageHeading eyebrow={patient.reference} title="Historique clinique" description={`${patient.identity.firstName} ${patient.identity.lastName}`}>
      {patient.status === "active" && <Button asChild><Link href={`/consultations/nouveau?patientId=${patientId}`}>Nouvelle consultation</Link></Button>}
    </PageHeading>
    {patient.status === "inactive" && <p role="status">Patient archivé. L’historique reste lisible ; aucune modification clinique n’est autorisée.</p>}
    <nav className="flex flex-wrap gap-4" aria-label="Navigation clinique"><Link className="text-primary underline" href={`/patients/${patientId}`}>Fiche patient</Link><Link className="text-primary underline" href={`/patients/${patientId}/dossier`}>Questionnaire et antécédents</Link><Link className="text-primary underline" href="/consultations">Annuaire clinique</Link></nav>
    <p className="text-sm text-muted-foreground">Consultations de ce patient, de la plus récente à la plus ancienne · 50 éléments maximum par page.</p>
    {!history.items.length ? <p>Aucune consultation sur cette page.</p> : <ul className="space-y-3" aria-label="Consultations enregistrées">{history.items.map(c => <li key={c.id}><Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <span>Consultation du {formatPatientDate(c.consultationDate)}</span><ConsultationStatus status={c.status} />
      <Button asChild variant="outline"><Link href={`/consultations/${c.id}?patientId=${patientId}`}>Ouvrir la consultation</Link></Button>
    </Card></li>)}</ul>}
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={!cursor} onClick={() => setCursor(undefined)}>Première page</Button>
      <Button variant="outline" disabled={!history.nextCursor} onClick={() => { if (history.nextCursor) setCursor(history.nextCursor); }}>Consultations plus anciennes</Button>
      <Button variant="outline" onClick={state.reload}>Actualiser l’historique</Button></div>
  </>;
}
