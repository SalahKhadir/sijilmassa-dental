"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useFinancialLoad } from "@/components/financial/load";
import { PageHeading } from "@/components/page-heading";
import { PatientFailure } from "@/components/patients/persistent/shared";
import { Button } from "@/components/ui/button";
import { InvoiceApiError, invoiceMessage, unknownInvoiceOutcome, type InvoiceApi } from "@/lib/invoices/client";
import { invoiceHistoryPath, invoicePath } from "@/lib/invoices/paths";
import type { DraftInvoice, InvoiceDetail } from "@/lib/invoices/schemas";
import { formatPatientDate } from "@/lib/patients/dates";
import { InvoiceConfirmation } from "./confirmation";
import { InvoicePdfActions } from "./pdf-actions";
import { InvoiceAmounts, InvoiceFailure, InvoiceLines, settlementLabel, useInvoiceApi, useInvoicePatient } from "./shared";

export function InvoiceDetailPage({ patientId, invoiceId }: { patientId: string; invoiceId: string }) {
  const scope = useInvoiceApi();
  if (!scope.role) return <p role="status">Vérification de la session…</p>;
  return <DetailLoader key={`${scope.owner}:${patientId}:${invoiceId}`} api={scope.api} patientId={patientId} invoiceId={invoiceId} />;
}

function DetailLoader({ api, patientId, invoiceId }: { api: InvoiceApi; patientId: string; invoiceId: string }) {
  const patient = useInvoicePatient(patientId);
  const [revision, setRevision] = useState(0);
  const load = useCallback(() => {
    void revision;
    return api.get(patientId, invoiceId);
  }, [api, patientId, invoiceId, revision]);
  const result = useFinancialLoad(load);
  return <>
    <nav aria-label="Navigation des factures" className="flex flex-wrap gap-4">
      <Link href={invoiceHistoryPath(patientId)} className="text-primary underline">Factures du patient</Link>
      <Link href={`/patients/${encodeURIComponent(patientId)}/finances`} className="text-primary underline">Soldes et encaissements des soins</Link>
    </nav>
    {patient.state?.data?.status === "inactive" && <p role="status">Patient archivé. Les factures restent consultables.</p>}
    {patient.state?.error ? <PatientFailure error={patient.state.error} retry={patient.retry} /> : null}
    {!result ? <p role="status">Chargement de la facture…</p> : result.data
      ? <Detail api={api} initial={result.data} active={patient.state?.data?.status === "active"} />
      : <InvoiceFailure error={result.error} retry={() => setRevision(value => value + 1)} />}
  </>;
}

type Notice = { text: string; alert?: boolean };
function Detail({ api, initial, active }: { api: InvoiceApi; initial: InvoiceDetail; active: boolean }) {
  const [invoice, setInvoice] = useState(initial);
  const [confirmation, setConfirmation] = useState<DraftInvoice>();
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const pending = useRef(false);
  const { invoiceId, patientId } = initial;
  const canEdit = active && !blocked && !recovery && invoice.lifecycle === "BROUILLON";

  async function read(purpose: "refresh" | "confirm" | "recover") {
    try {
      const fresh = await api.get(patientId, invoiceId);
      setInvoice(fresh);
      setRecovery(false);
      if (purpose === "recover") {
        setNotice({ text: fresh.lifecycle === "EMISE" ? `Émission vérifiée. Facture ${fresh.issuanceSnapshot.invoiceNumber}.`
          : `Le document est en brouillon, version ${fresh.version}. Vérifiez la sélection et confirmez de nouveau pour émettre.` });
      } else if (purpose === "confirm") {
        if (fresh.lifecycle === "EMISE") {
          setNotice({ text: "Cette facture a déjà été émise." });
        } else if (fresh.version !== invoice.version || !fresh.draft.lines.length) {
          setNotice({ text: "Le brouillon a changé. Vérifiez la sélection avant de préparer l’émission.", alert: true });
        } else {
          setConfirmation(fresh);
        }
      } else {
        setNotice({ text: "Facture actualisée." });
      }
    } catch (error) {
      setNotice({ text: purpose === "recover"
        ? "L’issue de l’émission reste inconnue. Relisez la facture pour vérifier son état."
        : invoiceMessage(error), alert: true });
    }
  }

  async function readAction(purpose: "refresh" | "confirm" | "recover") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice(undefined);
    try { await read(purpose); }
    finally { setBusy(false); pending.current = false; }
  }

  async function issue() {
    if (!confirmation || !canEdit || pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice(undefined);
    try {
      const issued = await api.issue(patientId, invoiceId, confirmation.version);
      setInvoice(issued);
      setNotice({ text: `Facture ${issued.issuanceSnapshot.invoiceNumber} émise.` });
      setConfirmation(undefined);
    } catch (error) {
      setConfirmation(undefined);
      if (unknownInvoiceOutcome(error) || (error instanceof InvoiceApiError && error.status === 409 && error.code !== "ARCHIVED_PATIENT")) {
        setRecovery(true);
        setNotice({ text: "Vérification de l’état de la facture…" });
        await read("recover");
      } else {
        if (error instanceof InvoiceApiError && error.code === "ARCHIVED_PATIENT") setBlocked(true);
        setNotice({ text: invoiceMessage(error), alert: true });
      }
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }

  const snapshot = invoice.issuanceSnapshot;
  const identity = snapshot?.billingIdentity ?? invoice.draft?.billingIdentity;
  const state = invoice.currentFinancialState;
  return <>
    <PageHeading title={snapshot ? `Facture ${snapshot.invoiceNumber}` : "Brouillon de facture"}
      description={identity ? `${identity.firstName} ${identity.lastName} · ${identity.reference}` : ""}>
      <div className="flex flex-wrap gap-2">
        {!recovery && <Button variant="outline" disabled={busy} onClick={() => void readAction("refresh")}>Actualiser la facture</Button>}
        {canEdit && !busy && <Button asChild variant="outline"><Link href={invoicePath(patientId, invoiceId, true)}>Modifier le brouillon</Link></Button>}
        {canEdit && invoice.draft.lines.length > 0 &&
          <Button disabled={busy} onClick={() => void readAction("confirm")}>Préparer l’émission</Button>}
      </div>
    </PageHeading>
    {notice && <p role={notice.alert ? "alert" : "status"}>{notice.text}</p>}
    {recovery && <div><Button variant="outline" disabled={busy} onClick={() => void readAction("recover")}>Relire la facture</Button></div>}
    {snapshot && <InvoicePdfActions key={snapshot.invoiceNumber} patientId={patientId} invoiceId={invoiceId} number={snapshot.invoiceNumber} />}
    {snapshot ? <section aria-labelledby="original-invoice" className="space-y-3">
      <h2 className="text-lg font-semibold" id="original-invoice">Facture originale</h2>
      <p>Émise le {formatPatientDate(snapshot.issueDate)} · {snapshot.billingIdentity.firstName} {snapshot.billingIdentity.lastName} · {snapshot.billingIdentity.reference}</p>
      <InvoiceLines lines={snapshot.lines} />
      <InvoiceAmounts balance={snapshot.balanceAtIssue} issued />
    </section> : <section aria-labelledby="draft-invoice" className="space-y-3">
      <h2 className="text-lg font-semibold" id="draft-invoice">Soins du brouillon</h2>
      <InvoiceLines lines={invoice.draft?.lines ?? []} />
    </section>}
    <section aria-labelledby="current-balance" className="space-y-3">
      <h2 className="text-lg font-semibold" id="current-balance">Situation financière actuelle</h2>
      {state.settlement && <p className="font-medium">{settlementLabel[state.settlement]}</p>}
      <InvoiceAmounts balance={state.balance} />
    </section>
    {confirmation && <InvoiceConfirmation title="Émettre la facture ?"
      description="L’émission attribue un numéro définitif et fige l’identité, les soins et les montants de la facture."
      label="Confirmer l’émission" busy={busy} close={() => setConfirmation(undefined)} confirm={() => void issue()}>
      <p className="font-medium">{confirmation.draft.billingIdentity.firstName} {confirmation.draft.billingIdentity.lastName}</p>
      <InvoiceLines lines={confirmation.draft.lines} />
      <InvoiceAmounts balance={confirmation.currentFinancialState.balance} />
    </InvoiceConfirmation>}
  </>;
}
