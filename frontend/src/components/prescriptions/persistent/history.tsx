"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { usePatientApi } from "@/components/patients/persistent/shared";
import { formatPatientDate } from "@/lib/patients/dates";
import type { PrescriptionCursor, PrescriptionHistoryQuery } from "@/lib/prescriptions/api/schemas";
import { usePrescriptionApi } from "./use-prescription-forms";
import { PrescriptionBoundary, PrescriptionFailure, PrescriptionLoading, PrescriptionNavigation, StoredPrescriptionStatus, prescriptionHref, usePrescriptionLoad } from "./shared";

export function PersistentPrescriptionDirectory({ patientId, consultationId }: { patientId?: string; consultationId?: string }) {
  return <PrescriptionBoundary>{patientId ? <PersistentPrescriptionHistory key={`${patientId}:${consultationId}`} patientId={patientId} consultationId={consultationId} /> : <PatientDirectory />}</PrescriptionBoundary>;
}
function PatientDirectory() {
  const patients = usePatientApi();
  const [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const load = useCallback(() => patients.list({ q: query, page, pageSize: 20, status: "all", sort: "name" }), [patients, query, page]);
  const state = usePrescriptionLoad(`${query}:${page}`, load);
  return <>
    <PageHeading eyebrow="Espace dentiste" title="Documents" description="Choisissez un patient enregistré pour consulter ses ordonnances.">
      <Button asChild><Link href="/documents/ordonnances/nouvelle">Nouvelle ordonnance</Link></Button>
      <Button asChild variant="outline"><Link href="/documents/ordonnance-vierge">Imprimer une ordonnance vierge</Link></Button>
    </PageHeading>
    <p className="text-sm text-muted-foreground">Historique par patient, par pages de 50 ordonnances. Aucun total global d’ordonnances n’est calculé.</p>
    <label className="block space-y-2 font-semibold">Rechercher un patient<Input type="search" maxLength={160} autoComplete="off" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label>
    {state.error ? <PrescriptionFailure error={state.error} retry={state.reload} /> : !state.data ? <PrescriptionLoading /> : <>
      {!state.data.items.length && <p>Aucun patient ne correspond à cette recherche.</p>}
      <ul className="space-y-3" aria-label="Patients enregistrés pour les ordonnances">{state.data.items.map(p => <li key={p.id}><Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <span>{p.identity.firstName} {p.identity.lastName} · {p.reference}{p.status === "inactive" ? " · Patient archivé" : ""}</span>
        <Button asChild variant="outline"><Link href={`/documents?patientId=${p.id}`}>Ouvrir les ordonnances</Link></Button>
      </Card></li>)}</ul>
      <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Patients précédents</Button>
        <span>Page {page} sur {state.data.pageCount}</span><Button variant="outline" disabled={page >= state.data.pageCount} onClick={() => setPage(p => p + 1)}>Patients suivants</Button></div>
    </>}
    <section className="space-y-3 rounded-xl border p-5"><h2 className="font-semibold">Démonstrations et feuilles de soins</h2>
      <p>Les ordonnances et feuilles de soins synthétiques restent séparées des dossiers enregistrés.</p>
      <Link className="text-primary underline" href="/demo/documents">Ouvrir les documents de démonstration</Link>
    </section>
  </>;
}
export function PersistentPrescriptionHistory({ patientId, consultationId }: { patientId: string; consultationId?: string }) {
  const { api } = usePrescriptionApi(), patients = usePatientApi();
  const [cursor, setCursor] = useState<PrescriptionCursor>();
  const [status, setStatus] = useState<"all" | "BROUILLON" | "FINALISEE">("all");
  const [archive, setArchive] = useState<NonNullable<PrescriptionHistoryQuery["archive"]>>("active");
  const load = useCallback(async () => {
    const [patient, history] = await Promise.all([patients.get(patientId), api.history({ patientId, consultationId, archive, ...(status === "all" ? {} : { status }), before: cursor })]);
    return { patient, history };
  }, [patients, api, patientId, consultationId, archive, status, cursor]);
  const state = usePrescriptionLoad(`${patientId}:${consultationId}:${status}:${archive}:${cursor?.date}:${cursor?.id}`, load);
  return <section className="space-y-5" aria-label="Ordonnances enregistrées">
    <PageHeading title="Ordonnances du patient" description={state.data ? `${state.data.patient.identity.firstName} ${state.data.patient.identity.lastName} · ${state.data.patient.reference}` : "Historique enregistré dans la base du cabinet."}>
      {state.data?.patient.status === "active" && <Button asChild><Link href={`/documents/ordonnances/nouvelle?${new URLSearchParams({ patientId, ...(consultationId ? { consultationId } : {}) })}`}>Nouvelle ordonnance</Link></Button>}
    </PageHeading>
    <PrescriptionNavigation patientId={patientId} consultationId={consultationId} />
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><label htmlFor="history-prescription-status" className="text-sm font-semibold">Statut</label><Select id="history-prescription-status" value={status} onChange={e => { setStatus(e.target.value as typeof status); setCursor(undefined); }}>
      <option value="all">Tous les statuts</option><option value="BROUILLON">Brouillons</option><option value="FINALISEE">Finalisées</option></Select></div>
      <div className="space-y-2"><label htmlFor="history-prescription-archive" className="text-sm font-semibold">Classement</label><Select id="history-prescription-archive" value={archive} onChange={e => { setArchive(e.target.value as typeof archive); setCursor(undefined); }}>
        <option value="active">Non archivées</option><option value="archived">Brouillons archivés</option><option value="all">Historique complet</option></Select></div></div>
    {state.error ? <PrescriptionFailure error={state.error} retry={state.reload} /> : !state.data ? <PrescriptionLoading /> : <>
      {state.data.patient.status === "inactive" && <p role="status">Patient archivé. L’historique et les PDF finalisés restent accessibles ; aucune modification n’est autorisée.</p>}
      <p className="text-sm text-muted-foreground">De la plus récente à la plus ancienne · 50 ordonnances maximum par page.</p>
      {!state.data.history.items.length ? <p>Aucune ordonnance sur cette page.</p> : <ul className="space-y-3">{state.data.history.items.map(record => <li key={record.id}><Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <span>Ordonnance du {formatPatientDate(record.issuedDate)}</span><StoredPrescriptionStatus {...record} />
        <Button asChild variant="outline"><Link href={prescriptionHref({ id: record.id, patientId })}>Ouvrir l’ordonnance<span className="sr-only"> · {record.id}</span></Link></Button>
      </Card></li>)}</ul>}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={!cursor} onClick={() => setCursor(undefined)}>Première page</Button>
        <Button variant="outline" disabled={!state.data.history.nextCursor} onClick={() => { if (state.data?.history.nextCursor) setCursor(state.data.history.nextCursor); }}>Ordonnances plus anciennes</Button>
        <Button variant="outline" onClick={state.reload}>Actualiser les ordonnances</Button></div>
    </>}
  </section>;
}
