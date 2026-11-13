"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import { ListLoading } from "@/components/ui/read-feedback";
import type { DirectoryPage, PatientQuery } from "@/lib/patients/api/client";
import { PatientStatus } from "../patient-status";
import { PatientFailure, PersistentNotice, usePatientApi } from "./shared";

const initial: PatientQuery = { q: "", status: "active", sort: "name", page: 1, pageSize: 20 };
export function PersistentPatientDirectory() {
  const api = usePatientApi();
  const [query, setQuery] = useState(initial);
  const [result, setResult] = useState<{ query: PatientQuery; data?: DirectoryPage; error?: unknown }>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      api.list(query).then(data => { if (active) setResult({ query, data }); }, error => { if (active) setResult({ query, error }); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [api, query, revision]);
  const current = result?.query === query ? result : undefined;
  function change(patch: Partial<PatientQuery>) { setQuery(value => ({ ...value, ...patch, page: 1 })); }
  return <>
    <PageHeading eyebrow="Administration du cabinet" title="Patients" description="Gérez les dossiers administratifs de vos patients.">
      <Button asChild><Link href="/patients/nouveau">Nouveau patient</Link></Button>
    </PageHeading>
    <PersistentNotice />
    <section aria-label="Recherche et filtres" className="grid items-end gap-4 rounded-xl border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <label className="space-y-2 text-sm font-semibold sm:col-span-2 lg:col-span-1">Rechercher un patient<Input type="search" maxLength={160} value={query.q}
        placeholder="Nom, prénom, référence, téléphone…" onChange={event => change({ q: event.target.value })} /></label>
      <label className="space-y-2 text-sm font-semibold">Statut administratif<Select value={query.status} onChange={event => change({ status: event.target.value as PatientQuery["status"] })}>
        <option value="active">Actifs</option><option value="inactive">Inactifs</option><option value="all">Tous les statuts</option>
      </Select></label>
      <label className="space-y-2 text-sm font-semibold">Trier les patients<Select value={query.sort} onChange={event => change({ sort: event.target.value as PatientQuery["sort"] })}>
        <option value="name">Nom · A à Z</option><option value="newest">Plus récents d’abord</option><option value="oldest">Plus anciens d’abord</option>
      </Select></label>
    </section>
    {!current ? <ListLoading>Chargement des patients…</ListLoading> : current.error ? <PatientFailure error={current.error} retry={() => { setResult(undefined); setRevision(value => value + 1); }} /> : current.data && <>
      <p role="status" className="text-sm text-muted-foreground">{current.data.total} patient(s) · Page {current.data.page} sur {current.data.pageCount}</p>
      {!current.data.items.length ? <p className="rounded-xl border bg-surface px-5 py-8 text-sm text-muted-foreground">{query.q ? "Aucun patient ne correspond à cette recherche." : "Aucun patient pour ce statut."}</p> :
        <ScrollableTable label="Annuaire des patients" className="min-w-[34rem]">
          <thead><tr>{["Patient", "Référence", "Téléphone", "Statut"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{current.data.items.map(patient => <tr key={patient.id} className="hover:bg-muted">
            <th scope="row" className="w-1/2 min-w-40 font-semibold [overflow-wrap:anywhere]">
              <Link className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary" href={`/patients/${patient.id}`}>{patient.identity.lastName} {patient.identity.firstName}</Link>
            </th>
            <td className="whitespace-nowrap tabular-nums">{patient.reference}</td>
            <td className="tabular-nums">{patient.identity.gsm || patient.identity.landline || "Non renseigné"}</td>
            <td><PatientStatus status={patient.status} /></td>
          </tr>)}</tbody>
        </ScrollableTable>}
      <nav aria-label="Pagination des patients" className="flex gap-3"><Button variant="outline" disabled={query.page <= 1} onClick={() => setQuery(value => ({ ...value, page: value.page - 1 }))}>Précédent</Button>
        <Button variant="outline" disabled={query.page >= current.data.pageCount || query.page >= 100000} onClick={() => setQuery(value => ({ ...value, page: value.page + 1 }))}>Suivant</Button></nav>
    </>}
  </>;
}
