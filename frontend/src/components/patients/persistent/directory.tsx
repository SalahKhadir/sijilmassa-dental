"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
    <section aria-label="Recherche et filtres" className="grid items-end gap-4 rounded-xl border bg-surface p-5 md:grid-cols-3">
      <label className="space-y-2 text-sm font-semibold">Rechercher un patient<Input type="search" maxLength={160} value={query.q}
        placeholder="Nom, prénom, référence, téléphone…" onChange={event => change({ q: event.target.value })} /></label>
      <label className="space-y-2 text-sm font-semibold">Statut administratif<Select value={query.status} onChange={event => change({ status: event.target.value as PatientQuery["status"] })}>
        <option value="active">Actifs</option><option value="inactive">Inactifs</option><option value="all">Tous les statuts</option>
      </Select></label>
      <label className="space-y-2 text-sm font-semibold">Trier les patients<Select value={query.sort} onChange={event => change({ sort: event.target.value as PatientQuery["sort"] })}>
        <option value="name">Nom · A à Z</option><option value="newest">Plus récents d’abord</option><option value="oldest">Plus anciens d’abord</option>
      </Select></label>
    </section>
    {!current ? <p role="status">Chargement des patients…</p> : current.error ? <PatientFailure error={current.error} retry={() => { setResult(undefined); setRevision(value => value + 1); }} /> : current.data && <>
      <p role="status">{current.data.total} patient(s) · Page {current.data.page} sur {current.data.pageCount}</p>
      {!current.data.items.length ? <p className="rounded-xl border bg-surface p-6">{query.q ? "Aucun patient ne correspond à cette recherche." : "Aucun patient pour ce statut."}</p> :
        <div className="overflow-x-auto rounded-xl border bg-surface"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-4">Patient</th><th>Référence</th><th>Téléphone</th><th>Statut</th></tr></thead>
          <tbody>{current.data.items.map(patient => <tr key={patient.id} className="border-b"><td className="p-4"><Link className="font-semibold text-primary underline" href={`/patients/${patient.id}`}>{patient.identity.lastName} {patient.identity.firstName}</Link></td>
            <td>{patient.reference}</td><td>{patient.identity.gsm || patient.identity.landline || "Non renseigné"}</td><td><PatientStatus status={patient.status} /></td></tr>)}</tbody></table></div>}
      <nav aria-label="Pagination des patients" className="flex gap-3"><Button variant="outline" disabled={query.page <= 1} onClick={() => setQuery(value => ({ ...value, page: value.page - 1 }))}>Précédent</Button>
        <Button variant="outline" disabled={query.page >= current.data.pageCount || query.page >= 100000} onClick={() => setQuery(value => ({ ...value, page: value.page + 1 }))}>Suivant</Button></nav>
    </>}
  </>;
}
