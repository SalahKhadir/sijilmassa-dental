"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useFinancialLoad } from "@/components/financial/load";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { ClinicalCursor } from "@/lib/consultations/api/schemas";
import { documentType, isExecuted, purposesFor, variant, type DocumentType, type Draft, type Purpose } from "@/lib/insurance/api/schemas";
import { InsuranceApiError } from "@/lib/insurance/api/client";
import { formatPatientDate } from "@/lib/patients/dates";
import { InsuranceEditor } from "./editor";
import { familyLabels, historyHref, detailHref, InsuranceBoundary, InsuranceFailure, purposeLabels, type WorkspaceApi } from "./shared";

export function NewInsuranceDocument({ patientId, preset }: { patientId: string; preset?: string }) {
  return <InsuranceBoundary>{(api, owner) => <Create key={`${owner}:${patientId}:${preset}`} api={api} patientId={patientId} preset={preset} />}</InsuranceBoundary>;
}

type Selection = { type: DocumentType; purpose: Purpose; consultationId?: string };

function Create({ api, patientId, preset }: { api: WorkspaceApi; patientId: string; preset?: string }) {
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<Selection>();
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>();
  const [uncertain, setUncertain] = useState(false);
  const saving = useRef(false);
  const load = useCallback(() => {
    void revision;
    return api.patient(patientId);
  }, [api, patientId, revision]);
  const patient = useFinancialLoad(load);
  const loadSource = useCallback(() => {
    void revision;
    return selection?.consultationId ? api.consultation(patientId, selection.consultationId, isExecuted(selection.purpose)) : Promise.resolve(undefined);
  }, [api, patientId, selection, revision]);
  const source = useFinancialLoad(loadSource, Boolean(selection));

  async function save(draft: Draft) {
    if (!selection || saving.current || uncertain) return;
    saving.current = true;
    setBusy(true);
    setSaveError(undefined);
    try {
      const detail = await api.insurance.create({
        patientId, documentType: selection.type, purpose: selection.purpose, consultationId: selection.consultationId,
        templateVersion: 1, draft,
      });
      setSelection(undefined);
      router.replace(detailHref(patientId, detail.documentId));
    } catch (error) {
      setSaveError(error);
      if (!(error instanceof InsuranceApiError) || error.status >= 500 || error.status === 408) setUncertain(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const reload = () => setRevision(value => value + 1);
  const archived = patient?.data?.status === "inactive";
  return <>
    <Link className="text-primary underline" href={historyHref(patientId)}>Documents d’assurance</Link>
    <PageHeading title="Nouveau document d’assurance"
      description={patient?.data ? `${patient.data.identity.firstName} ${patient.data.identity.lastName}` : "Sélection du formulaire d’assurance."} />
    {!patient && <p role="status">Chargement du patient…</p>}
    {patient?.error ? <InsuranceFailure error={patient.error} retry={reload} /> : null}
    {archived && <p role="status">Restaurez le patient depuis sa fiche avant de créer un document.</p>}
    {patient?.data && !archived && (!selection
      ? <ChooseDocument api={api} patientId={patientId} preset={preset} onChoose={setSelection} />
      : <>
        <h2 className="text-lg font-semibold">{familyLabels[selection.type]} · {purposeLabels[selection.purpose]}</h2>
        {source?.data && <p>Consultation du {formatPatientDate(source.data.date)}</p>}
        {!source && <p role="status">Chargement du formulaire…</p>}
        {source?.error ? <InsuranceFailure error={source.error} retry={reload} /> : null}
        {source?.data && isExecuted(selection.purpose) && !source.data.finalized &&
          <p role="status">Ce brouillon pourra être finalisé après la clôture de la consultation.</p>}
        {source && !source.error && <InsuranceEditor type={selection.type} purpose={selection.purpose} source={source.data}
          initial={{ fields: { [variant[selection.type]]: {} }, acts: [] }} busy={busy} blocked={uncertain}
          onSave={draft => void save(draft)} onCancel={() => { setSelection(undefined); setSaveError(undefined); setUncertain(false); }} />}
        {source?.error ? <Button variant="outline" onClick={() => setSelection(undefined)}>Changer de consultation</Button> : null}
      </>)}
    {saveError ? <InsuranceFailure error={saveError} /> : null}
    {uncertain && <p role="alert">Création non confirmée. Vérifiez l’historique du patient avant de créer un autre document.</p>}
  </>;
}

function ChooseDocument({ api, patientId, preset, onChoose }: {
  api: WorkspaceApi; patientId: string; preset?: string; onChoose(selection: Selection): void;
}) {
  const [type, setType] = useState<DocumentType>();
  const [purpose, setPurpose] = useState<Purpose>();
  const [selected, setSelected] = useState(preset ?? "");
  const [cursors, setCursors] = useState<ClinicalCursor[]>([]);
  const [revision, setRevision] = useState(0);
  const executed = Boolean(purpose && isExecuted(purpose));
  const cursor = cursors.at(-1);
  const load = useCallback(async () => {
    void revision;
    const [page, presetSource] = await Promise.all([
      api.consultationHistory(patientId, cursor),
      preset ? api.consultation(patientId, preset, false) : undefined,
    ]);
    return { page, presetSource };
  }, [api, patientId, preset, cursor, revision]);
  const result = useFinancialLoad(load, Boolean(purpose));
  const eligible = result?.data?.page.items ?? [];
  const pinned = result?.data?.presetSource;
  const showPinned = pinned && !eligible.some(item => item.id === pinned.id);
  const consultationId = eligible.some(item => item.id === selected) || (showPinned && pinned.id === selected) ? selected : "";
  const ready = Boolean(type && purpose && result?.data && (!executed || consultationId));

  return <form className="max-w-2xl space-y-4 rounded-xl border bg-surface p-5" onSubmit={event => {
    event.preventDefault();
    if (ready && type && purpose) onChoose({ type, purpose, consultationId: consultationId || undefined });
  }}>
    <label className="block space-y-1"><span className="text-sm font-medium">Organisme</span>
      <Select value={type ?? ""} onChange={event => {
        const value = documentType.safeParse(event.target.value);
        setType(value.data); setPurpose(undefined); setSelected(preset ?? ""); setCursors([]);
      }}>
        <option value="">Choisir un organisme</option>
        {documentType.options.map(value => <option key={value} value={value}>{familyLabels[value]}</option>)}
      </Select>
    </label>
    {type && <label className="block space-y-1"><span className="text-sm font-medium">Objet du document</span>
      <Select value={purpose ?? ""} onChange={event => {
        setPurpose(purposesFor(type).find(value => value === event.target.value));
        setSelected(preset ?? ""); setCursors([]);
      }}>
        <option value="">Choisir un objet</option>
        {purposesFor(type).map(value => <option key={value} value={value}>{purposeLabels[value]}</option>)}
      </Select>
    </label>}
    {purpose && (!result ? <p role="status">Chargement des consultations…</p>
      : result.error ? <InsuranceFailure error={result.error} retry={() => setRevision(value => value + 1)} />
      : result.data && <>
        <label className="block space-y-1"><span className="text-sm font-medium">Consultation {executed ? "(requise)" : "(facultatif)"}</span>
          <Select value={consultationId} onChange={event => setSelected(event.target.value)}>
            <option value="">{executed ? "Choisir une consultation" : "Sans consultation liée"}</option>
            {showPinned && <option value={pinned.id}>{formatPatientDate(pinned.date)} · Consultation d’origine</option>}
            {eligible.map(item => <option key={item.id} value={item.id}>{formatPatientDate(item.consultationDate)} · {item.status === "TERMINEE" ? "Terminée" : "Brouillon"}</option>)}
          </Select>
        </label>
        {!eligible.length && !showPinned && <p className="text-sm">Aucune consultation admissible sur cette page.</p>}
        {executed && <p className="text-sm">Le lien est fixé à la création. La consultation doit être terminée pour finaliser le document.</p>}
        {(cursor || result.data.page.nextCursor) && <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!cursor} onClick={() => setCursors(values => values.slice(0, -1))}>Consultations précédentes</Button>
          <Button type="button" variant="outline" disabled={!result.data.page.nextCursor} onClick={() => {
            const next = result.data?.page.nextCursor;
            if (next) setCursors(values => [...values, next]);
          }}>Consultations suivantes</Button>
        </div>}
      </>)}
    <Button disabled={!ready} type="submit">Ouvrir le formulaire</Button>
  </form>;
}
