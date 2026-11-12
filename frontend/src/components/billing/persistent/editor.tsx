"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useFinancialLoad } from "@/components/financial/load";
import { PageHeading } from "@/components/page-heading";
import { PatientFailure } from "@/components/patients/persistent/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMad } from "@/lib/financial/money";
import { InvoiceApiError, invoiceMessage, unknownInvoiceOutcome, type InvoiceApi } from "@/lib/invoices/client";
import { invoiceHistoryPath, invoicePath } from "@/lib/invoices/paths";
import { sumPrices, type DraftCharge, type DraftInvoice, type EligibleCursor, type InvoiceDetail } from "@/lib/invoices/schemas";
import type { AdministrativePatient } from "@/lib/patients/api/client";
import { formatPatientDate } from "@/lib/patients/dates";
import { InvoiceConfirmation } from "./confirmation";
import { InvoiceFailure, InvoiceLines, patientName, useInvoiceApi, useInvoicePatient } from "./shared";

export function InvoiceEditorPage({ patientId, invoiceId }: { patientId: string; invoiceId?: string }) {
  const scope = useInvoiceApi();
  if (!scope.role) return <p role="status">Vérification de la session…</p>;
  return <EditorLoader key={`${scope.owner}:${patientId}:${invoiceId ?? ""}`} api={scope.api} patientId={patientId} invoiceId={invoiceId} />;
}

function EditorLoader({ api, patientId, invoiceId }: { api: InvoiceApi; patientId: string; invoiceId?: string }) {
  const patient = useInvoicePatient(patientId);
  const [revision, setRevision] = useState(0);
  const load = useCallback(() => {
    void revision;
    return invoiceId ? api.get(patientId, invoiceId) : Promise.resolve(undefined);
  }, [api, invoiceId, patientId, revision]);
  const invoice = useFinancialLoad(load, Boolean(invoiceId));
  const record = patient.state?.data;
  return <>
    <nav aria-label="Navigation des factures" className="flex flex-wrap gap-4">
      <Link className="text-primary underline" href={invoiceHistoryPath(patientId)}>Factures du patient</Link>
      {invoiceId ? <Link className="text-primary underline" href={invoicePath(patientId, invoiceId)}>Retour à la facture</Link>
        : <Link className="text-primary underline" href="/facturation/nouvelle">Choisir un autre patient</Link>}
    </nav>
    <PageHeading title={invoiceId ? "Modifier le brouillon" : "Nouvelle facture"} description={record ? patientName(record) : ""} />
    {!patient.state ? <p role="status">Chargement du patient…</p> : !record
      ? <PatientFailure error={patient.state.error} retry={patient.retry} />
      : record.status !== "active" ? <p role="status">Patient archivé. Les factures restent consultables.</p>
      : invoiceId && !invoice ? <p role="status">Chargement du brouillon…</p>
      : invoice?.error ? <InvoiceFailure error={invoice.error} retry={() => setRevision(value => value + 1)} />
      : invoice?.data?.lifecycle === "EMISE" ? <p role="status">Cette facture a déjà été émise.</p>
      : <Editor api={api} patient={record} initial={invoice?.data} />}
  </>;
}

function Editor({ api, patient, initial }: { api: InvoiceApi; patient: AdministrativePatient; initial?: DraftInvoice }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetail | undefined>(initial);
  const [selected, setSelected] = useState<DraftCharge[]>(() => initial?.draft.lines ?? []);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [eligibleRevision, setEligibleRevision] = useState(0);
  const pending = useRef(false);
  const canSubmit = !busy && !blocked && !refreshNeeded && invoice?.lifecycle !== "EMISE"
    && (initial !== undefined || selected.length > 0);

  async function refreshDraft() {
    if (!initial) return;
    setRefreshNeeded(true);
    try {
      const fresh = await api.get(patient.id, initial.invoiceId);
      setInvoice(fresh);
      setEligibleRevision(value => value + 1);
      setRefreshNeeded(false);
    } catch (error) {
      setMessage(`Impossible de vérifier le brouillon. ${invoiceMessage(error)}`);
    }
  }

  async function retryRead() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("Vérification du brouillon. Votre sélection est conservée.");
    try { await refreshDraft(); }
    finally { setBusy(false); pending.current = false; }
  }

  async function save() {
    if (!canSubmit || pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    const ids = selected.map(line => line.chargeId);
    try {
      const saved = invoice
        ? await api.edit(patient.id, invoice.invoiceId, invoice.version, ids)
        : await api.create(patient.id, ids);
      setConfirming(false);
      setBlocked(true);
      router.replace(invoicePath(patient.id, saved.invoiceId));
      return;
    } catch (error) {
      setConfirming(false);
      const code = error instanceof InvoiceApiError ? error.code : undefined;
      setMessage(invoiceMessage(error));
      if (code === "ARCHIVED_PATIENT") {
        setBlocked(true);
      } else if (!initial && unknownInvoiceOutcome(error)) {
        setBlocked(true);
        setMessage("La création n’a pas pu être confirmée. Consultez l’historique du patient pour vérifier si le brouillon a été enregistré.");
      } else if (initial && (unknownInvoiceOutcome(error) || (error instanceof InvoiceApiError && error.status === 409))) {
        setConflict(true);
        setMessage(`${invoiceMessage(error)} Votre sélection est conservée. Comparez-la à la version enregistrée avant de confirmer à nouveau.`);
        await refreshDraft();
      } else if (code === "CHARGE_RESERVED") {
        setEligibleRevision(value => value + 1);
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const disabled = busy || blocked || refreshNeeded || invoice?.lifecycle === "EMISE";
  return <>
    {message && <p role="alert" className="rounded-lg border p-3">{message}</p>}
    {refreshNeeded && <div><Button variant="outline" disabled={busy} onClick={() => void retryRead()}>Relire le brouillon</Button></div>}
    {invoice?.lifecycle === "EMISE" && <p role="status">Cette facture a été émise. Consultez son détail.</p>}
    {conflict && !refreshNeeded && invoice?.draft && <section className="space-y-2" aria-label="Sélection enregistrée">
      <h2 className="font-semibold">Sélection enregistrée · version {invoice.version}</h2>
      <InvoiceLines lines={invoice.draft.lines} />
    </section>}
    {invoice?.lifecycle !== "EMISE" && <>
      <section className="space-y-3" aria-labelledby="selected-title">
        <h2 className="font-semibold" id="selected-title">Soins sélectionnés ({selected.length})</h2>
        {!selected.length && <p>Aucun soin sélectionné.</p>}
        {selected.length > 0 && <ul className="divide-y rounded-lg border">
          {selected.map(line => <li className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm" key={line.chargeId}>
            <span>{formatPatientDate(line.treatmentDate)} · {line.treatmentLabel} · {formatMad(line.priceMinor)}</span>
            <Button type="button" variant="outline" disabled={disabled} aria-label={`Retirer ${line.treatmentLabel}`}
              onClick={() => setSelected(lines => lines.filter(item => item.chargeId !== line.chargeId))}>Retirer</Button>
          </li>)}
        </ul>}
        <p className="font-semibold">Total de la sélection · {formatMad(sumPrices(selected))}</p>
      </section>
      {!blocked && <EligibleCharges key={eligibleRevision} api={api} patientId={patient.id} selected={selected}
        disabled={disabled} onToggle={line => setSelected(lines => lines.some(item => item.chargeId === line.chargeId)
          ? lines.filter(item => item.chargeId !== line.chargeId) : lines.length < 250 ? [...lines, line] : lines)} />}
      <div><Button disabled={!canSubmit} onClick={() => setConfirming(true)}>
        {initial ? "Vérifier les modifications" : "Vérifier le brouillon"}
      </Button></div>
    </>}
    {confirming && <InvoiceConfirmation title={initial ? "Enregistrer la sélection ?" : "Créer le brouillon ?"}
      description={`${patientName(patient)} · Total de la sélection ${formatMad(sumPrices(selected))}${conflict && invoice ? ` · Version ${invoice.version}` : ""}`}
      label={initial ? "Confirmer les modifications" : "Confirmer la création"} busy={busy}
      close={() => setConfirming(false)} confirm={() => void save()}>
      <InvoiceLines lines={selected} />
    </InvoiceConfirmation>}
  </>;
}

function EligibleCharges({ api, patientId, selected, disabled, onToggle }: {
  api: InvoiceApi; patientId: string; selected: DraftCharge[]; disabled: boolean; onToggle(line: DraftCharge): void;
}) {
  const [cursor, setCursor] = useState<EligibleCursor>();
  const [revision, setRevision] = useState(0);
  const load = useCallback(() => {
    void revision;
    return api.eligible(patientId, cursor);
  }, [api, patientId, cursor, revision]);
  const result = useFinancialLoad(load);
  const selectedIds = new Set(selected.map(item => item.chargeId));
  return <section className="space-y-3" aria-labelledby="eligible-title">
    <h2 className="font-semibold" id="eligible-title">Soins disponibles</h2>
    {!result ? <p role="status">Chargement des soins disponibles…</p> : result.data ? <>
      {result.data.items.length ? <Card className="p-4">
        <fieldset disabled={disabled} className="divide-y">
          <legend className="sr-only">Ajouter des soins à la facture</legend>
          {result.data.items.map(line => <label className="flex flex-wrap items-center gap-3 py-3 text-sm" key={line.chargeId}>
            <input type="checkbox" className="size-4 accent-primary" checked={selectedIds.has(line.chargeId)}
              disabled={selected.length >= 250 && !selectedIds.has(line.chargeId)} onChange={() => onToggle(line)} />
            <span>{line.treatmentLabel} · {formatPatientDate(line.treatmentDate)} · {formatMad(line.priceMinor)}</span>
          </label>)}
        </fieldset>
      </Card> : <p>{cursor ? "Aucun autre soin disponible." : "Aucun soin tarifé disponible pour ce patient."}</p>}
      {(cursor || result.data.nextCursor) && <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={disabled || !cursor} onClick={() => setCursor(undefined)}>Première page des soins</Button>
        <Button variant="outline" disabled={disabled || !result.data.nextCursor} onClick={() => setCursor(result.data?.nextCursor ?? undefined)}>Soins suivants</Button>
      </div>}
    </> : <InvoiceFailure error={result.error} retry={() => setRevision(value => value + 1)} />}
  </section>;
}
