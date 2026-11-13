"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useFinancialLoad } from "@/components/financial/load";
import { PageHeading } from "@/components/page-heading";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InsuranceApiError } from "@/lib/insurance/api/client";
import { isExecuted, type Draft, type InsuranceDetail } from "@/lib/insurance/api/schemas";
import type { AdministrativePatient } from "@/lib/patients/api/client";
import { formatPatientTimestamp } from "@/lib/patients/dates";
import { DocumentValues, finalizationWarnings } from "./document-values";
import { InsuranceEditor } from "./editor";
import { InsurancePdfActions } from "./pdf-actions";
import { consultationHref, familyLabels, historyHref, InsuranceBoundary, InsuranceFailure, purposeLabels,
  type ConsultationSource, type WorkspaceApi } from "./shared";

type Action = "modifier" | "finaliser";
type Context = { detail: InsuranceDetail; patient?: AdministrativePatient; source?: ConsultationSource };
type Review = { detail: InsuranceDetail; patient: AdministrativePatient; source?: ConsultationSource };

async function draftContext(api: WorkspaceApi, detail: InsuranceDetail): Promise<Context> {
  if (detail.lifecycle === "FINALISE") return { detail };
  const [patient, source] = await Promise.all([
    api.patient(detail.patientId),
    detail.consultationId && isExecuted(detail.purpose)
      ? api.consultation(detail.patientId, detail.consultationId, true) : undefined,
  ]);
  return { detail, patient, source };
}

export function InsuranceDocumentPage({ patientId, documentId, action }: { patientId: string; documentId: string; action?: Action }) {
  return <InsuranceBoundary>{(api, owner) => <LoadDocument key={`${owner}:${patientId}:${documentId}:${action}`}
    api={api} patientId={patientId} documentId={documentId} action={action} />}</InsuranceBoundary>;
}

function LoadDocument({ api, patientId, documentId, action }: {
  api: WorkspaceApi; patientId: string; documentId: string; action?: Action;
}) {
  const [revision, setRevision] = useState(0);
  const load = useCallback(async () => {
    void revision;
    return draftContext(api, await api.insurance.get(patientId, documentId));
  }, [api, patientId, documentId, revision]);
  const result = useFinancialLoad(load);
  return <>
    <Link href={historyHref(patientId)} className="text-primary underline">Documents d’assurance</Link>
    {!result ? <p role="status">Chargement du document…</p>
      : result.error ? <InsuranceFailure error={result.error} retry={() => setRevision(value => value + 1)} />
      : result.data && <Document api={api} initial={result.data} action={action} />}
  </>;
}

function Document({ api, initial, action }: { api: WorkspaceApi; initial: Context; action?: Action }) {
  const [context, setContext] = useState(initial);
  const [editing, setEditing] = useState(action === "modifier");
  const [review, setReview] = useState<Review>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<unknown>();
  const [recovery, setRecovery] = useState<"edit" | "finalize">();
  const [conflict, setConflict] = useState<Context>();
  const operation = useRef(false);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const { detail, patient, source } = context;
  const finalized = detail.lifecycle === "FINALISE";
  const editable = !finalized && patient?.status === "active";
  const draft = detail.draft;
  const read = () => api.insurance.get(detail.patientId, detail.documentId);

  async function run(work: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true); setError(undefined);
    try { await work(); } catch (failure) { setError(failure); }
    finally { operation.current = false; setBusy(false); }
  }

  async function reread(kind: "edit" | "finalize") {
    setRecovery(kind);
    const latest = await draftContext(api, await read());
    setRecovery(undefined);
    if (kind === "edit") {
      setConflict(latest);
      setNotice("Le document a été relu. Vos modifications sont conservées à l’écran.");
    } else {
      setContext(latest);
      setNotice(latest.detail.lifecycle === "FINALISE" ? "La lecture a confirmé la finalisation."
        : "Le document est toujours en brouillon. Vérifiez les données et confirmez à nouveau pour le finaliser.");
    }
  }

  function save(value: Draft) {
    if (recovery || conflict) return;
    return run(async () => {
      setNotice("");
      try {
        const saved = await api.insurance.edit(detail, value);
        setContext({ ...context, detail: saved });
        setEditing(false);
        setNotice("Brouillon enregistré.");
      } catch (failure) {
        if (failure instanceof InsuranceApiError && (failure.status === 409 || failure.status >= 500 || failure.status === 408)) {
          setNotice(failure.message);
          await reread("edit");
        } else throw failure;
      }
    });
  }

  function prepare() {
    return run(async () => {
      setNotice("");
      const latest = await draftContext(api, await read());
      setContext(latest);
      if (latest.detail.lifecycle === "FINALISE") {
        setNotice("Le document est déjà finalisé.");
        return;
      }
      if (latest.patient?.status !== "active") return;
      if (latest.patient.version !== latest.detail.beneficiary.version
        || (latest.detail.consultationId && isExecuted(latest.detail.purpose) && latest.source?.version !== latest.detail.consultation?.version)) {
        throw new InsuranceApiError(409, "VERSION_CONFLICT");
      }
      setReview({ ...latest, patient: latest.patient });
    });
  }

  function finalize() {
    if (!review || finalizationWarnings(review.detail, review.patient, review.source).length) return;
    return run(async () => {
      setReview(undefined);
      setNotice("");
      try {
        const saved = await api.insurance.finalize(review.detail);
        setContext({ detail: saved });
        setNotice("Document finalisé.");
        try {
          const refreshed = await read();
          if (refreshed.lifecycle === "FINALISE") setContext({ detail: refreshed });
        } catch { /* The validated success response already contains the frozen record. */ }
      } catch (failure) {
        if (failure instanceof InsuranceApiError && failure.status < 500 && failure.status !== 408 && failure.status !== 409) throw failure;
        setNotice(failure instanceof InsuranceApiError ? failure.message : "");
        await reread("finalize");
      }
    });
  }

  function acceptLatest(keepEdits: boolean) {
    if (!conflict) return;
    setContext(conflict);
    setConflict(undefined);
    setEditing(keepEdits);
    setNotice(keepEdits ? "Vos saisies sont conservées. Vérifiez-les avant de remplacer le brouillon enregistré." : "Version enregistrée affichée.");
  }

  const warnings = review ? finalizationWarnings(review.detail, review.patient, review.source) : [];
  return <>
    <PageHeading title={finalized ? "Document d’assurance finalisé" : "Brouillon d’assurance"}
      description={`${familyLabels[detail.documentType]} · ${purposeLabels[detail.purpose]}`} />
    <p className="text-sm text-muted-foreground">Créé le {formatPatientTimestamp(detail.createdAt)}
      {detail.finalizedAt && ` · Finalisé le ${formatPatientTimestamp(detail.finalizedAt)}`} · Version {detail.version}</p>
    {detail.consultationId && <Link prefetch={false} href={consultationHref(detail.patientId, detail.consultationId)} className="text-primary underline">Ouvrir la consultation liée</Link>}
    {patient?.status === "inactive" && <p role="status">Patient archivé. Ce document est en lecture seule.</p>}
    {notice && <p role="status" className="rounded-md border bg-secondary-tint p-3">{notice}</p>}
    {error ? <InsuranceFailure error={error} /> : null}
    {recovery && <div className="space-y-2 rounded-md border p-4">
      <p role="alert">{recovery === "finalize" ? "Le résultat de la finalisation reste indéterminé. Relisez le document pour vérifier son état." :
        "L’enregistrement reste à vérifier. Relisez le document avant toute nouvelle modification."}</p>
      <Button variant="outline" disabled={busy} onClick={() => void run(() => reread(recovery))}>Relire le document</Button>
    </div>}
    {conflict && <section className="space-y-3 rounded-xl border bg-surface p-4">
      <h2 className="font-semibold">Version enregistrée · {conflict.detail.version}</h2>
      <details><summary className="cursor-pointer text-primary underline">Voir les valeurs enregistrées</summary>
        <DocumentValues {...conflict} />
      </details>
      <div className="flex flex-wrap gap-2">
        {conflict.detail.lifecycle === "BROUILLON" && conflict.patient?.status === "active" &&
          <Button variant="outline" onClick={() => acceptLatest(true)}>Garder mes saisies sur cette version</Button>}
        <Button variant="outline" onClick={() => acceptLatest(false)}>Abandonner mes saisies et afficher la version enregistrée</Button>
      </div>
    </section>}
    {editing && editable && draft
      ? <InsuranceEditor initial={draft} type={detail.documentType} purpose={detail.purpose} source={source}
          busy={busy} blocked={Boolean(conflict || recovery)} onSave={value => void save(value)}
          onCancel={conflict || recovery ? undefined : () => { setEditing(false); setError(undefined); }} />
      : <Card className="p-5"><DocumentValues {...context} /></Card>}
    {finalized && <InsurancePdfActions key={detail.documentId} detail={detail} api={api.insurance} />}
    {editable && !editing && !recovery && <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={() => { setEditing(true); setError(undefined); }}>Modifier le brouillon</Button>
      <Button ref={reviewButton} disabled={busy} onClick={() => void prepare()}>{busy ? "Vérification…" : action === "finaliser" ? "Vérifier avant de finaliser" : "Finaliser"}</Button>
    </div>}
    <Dialog.Root open={Boolean(review)} onOpenChange={open => { if (!open && !busy) setReview(undefined); }}>
      {review && <DialogPanel onCloseAutoFocus={event => {
          if (!reviewButton.current?.disabled) {
            event.preventDefault();
            reviewButton.current?.focus();
          }
        }} className="max-w-3xl" footer={<>
          <Dialog.Close asChild><Button variant="outline">Annuler</Button></Dialog.Close>
          <Button disabled={busy || warnings.length > 0} aria-busy={busy} onClick={finalize}>Confirmer la finalisation</Button>
        </>}>
          <Dialog.Title className="text-xl font-semibold">Finaliser le document</Dialog.Title>
          <Dialog.Description className="text-sm leading-6 text-muted-foreground">La finalisation fige les données du document. L’envoi à l’organisme, le remboursement, la signature et le cachet restent des démarches distinctes.</Dialog.Description>
          {warnings.length > 0 && <div role="alert" className="space-y-2 rounded-lg border border-l-4 border-l-warning bg-muted p-3 text-sm">
            <p className="font-semibold">Éléments à compléter avant la finalisation</p>
            <ul className="list-disc space-y-1 pl-5">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
          </div>}
          <DocumentValues {...review} />
      </DialogPanel>}
    </Dialog.Root>
  </>;
}
