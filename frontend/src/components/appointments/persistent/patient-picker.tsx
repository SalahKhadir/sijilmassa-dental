"use client";
import { useEffect, useRef, useState } from "react";
import { createPatientApi, type AdministrativePatient, type DirectoryPage } from "@/lib/patients/api/client";
import { requireLogin } from "@/lib/api/session-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppointmentFailure } from "./shared";

export type PatientSelection = Pick<AdministrativePatient, "id" | "reference" | "status"> & { identity: Pick<AdministrativePatient["identity"], "firstName" | "lastName"> };
function selection(value: AdministrativePatient): PatientSelection { return { id: value.id, reference: value.reference, status: value.status, identity: { firstName: value.identity.firstName, lastName: value.identity.lastName } }; }
export function PatientPicker({ initialId, disabled, onSelect, includeArchived = false }: { initialId?: string; disabled: boolean; onSelect(patient: PatientSelection): void; includeArchived?: boolean }) {
  const sequence = useRef(0);
  const [api] = useState(() => createPatientApi(fetch, requireLogin));
  const [query, setQuery] = useState(""); const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ key: string; data?: DirectoryPage; error?: unknown }>();
  const [selected, setSelected] = useState<PatientSelection>(); const [selectionError, setSelectionError] = useState<unknown>();
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const key = `${query}:${page}:${revision}`;
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => { api.list({ q: query, status: includeArchived ? "all" : "active", sort: "name", page, pageSize: 10 }).then(data => { if (active) setResult({ key, data }); }, error => { if (active) setResult({ key, error }); }); }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [api, query, page, key, includeArchived]);
  useEffect(() => {
    if (!initialId) return;
    let active = true; const ticket = ++sequence.current;
    Promise.resolve().then(() => api.get(initialId)).then(patient => { if (active && ticket === sequence.current) { const value = selection(patient); setSelected(value); onSelect(value); } }, error => { if (active && ticket === sequence.current) setSelectionError(error); });
    return () => { active = false; };
  }, [api, initialId, onSelect]);
  async function choose(id: string) {
    const ticket = ++sequence.current;
    setLoading(true); setSelectionError(undefined);
    try { const patient = selection(await api.get(id)); if (ticket === sequence.current) { setSelected(patient); onSelect(patient); } }
    catch (error) { if (ticket === sequence.current) setSelectionError(error); } finally { if (ticket === sequence.current) setLoading(false); }
  }
  const current = result?.key === key ? result : undefined;
  return <section className="space-y-4 rounded-xl border p-4" aria-label="Patient enregistré">
    <h2 className="font-semibold">Patient enregistré</h2>
    {selected && <p role="status">Patient sélectionné : {selected.identity.firstName} {selected.identity.lastName} · {selected.reference}{selected.status === "inactive" ? " · Patient archivé" : ""}</p>}
    {selectionError ? <AppointmentFailure error={selectionError} /> : null}
    <label className="block space-y-2 text-sm font-semibold">Rechercher un patient<Input type="search" maxLength={160} autoComplete="off" value={query} disabled={disabled || loading} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Nom, référence ou téléphone" /></label>
    {!current ? <p role="status">Recherche des patients…</p> : current.error ? <AppointmentFailure error={current.error} retry={() => setRevision(value => value + 1)} /> : current.data && <>
      {!current.data.items.length && <p>{includeArchived ? "Aucun patient ne correspond à cette recherche." : "Aucun patient actif ne correspond à cette recherche."}</p>}
      <ul aria-label="Résultats des patients" className="space-y-2">{current.data.items.map(patient => <li key={patient.id}><Button type="button" variant={selected?.id === patient.id ? "secondary" : "outline"} className="h-auto w-full justify-start whitespace-normal text-left" disabled={disabled || loading} onClick={() => void choose(patient.id)}>
        {patient.identity.firstName} {patient.identity.lastName} · {patient.reference} {patient.identity.gsm ? `· ${patient.identity.gsm}` : ""}</Button></li>)}</ul>
      <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" disabled={disabled || page <= 1} onClick={() => setPage(value => value - 1)}>Patients précédents</Button><span className="text-xs">Page {page} sur {current.data.pageCount}</span>
        <Button type="button" variant="outline" disabled={disabled || page >= current.data.pageCount} onClick={() => setPage(value => value + 1)}>Patients suivants</Button></div>
    </>}
  </section>;
}
