"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { PatientPicker, type PatientSelection } from "@/components/appointments/persistent/patient-picker";
import { useFinancialLoad } from "@/components/financial/load";
import { PageHeading } from "@/components/page-heading";
import { PatientFailure } from "@/components/patients/persistent/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMad } from "@/lib/financial/money";
import { invoiceHistoryPath, invoicePath, newInvoicePath } from "@/lib/invoices/paths";
import type { InvoiceApi } from "@/lib/invoices/client";
import type { HistoryCursor } from "@/lib/invoices/schemas";
import { formatPatientDate } from "@/lib/patients/dates";
import { InvoiceFailure, patientName, settlementLabel, useInvoiceApi, useInvoicePatient } from "./shared";

export function InvoicePatientEntry({ create = false }: { create?: boolean }) {
  const router = useRouter();
  const select = useCallback((patient: PatientSelection) => {
    router.push(create ? newInvoicePath(patient.id) : invoiceHistoryPath(patient.id));
  }, [create, router]);
  return <>
    <PageHeading title={create ? "Nouvelle facture" : "Facturation"}
      description={create ? "Sélectionnez le patient à facturer." : "Recherchez un patient pour consulter ses factures."}
      >{!create && <Button asChild><Link href={newInvoicePath()}>Nouvelle facture</Link></Button>}</PageHeading>
    <PatientPicker disabled={false} onSelect={select} includeArchived={!create} />
  </>;
}

export function PatientInvoiceHistory({ patientId }: { patientId: string }) {
  const scope = useInvoiceApi();
  if (!scope.role) return <p role="status">Vérification de la session…</p>;
  return <History key={`${scope.owner}:${patientId}`} patientId={patientId} api={scope.api} />;
}

function History({ patientId, api }: { patientId: string; api: InvoiceApi }) {
  const patient = useInvoicePatient(patientId);
  const [cursor, setCursor] = useState<HistoryCursor>();
  const [revision, setRevision] = useState(0);
  const load = useCallback(() => {
    void revision;
    return api.history(patientId, cursor);
  }, [api, patientId, cursor, revision]);
  const history = useFinancialLoad(load);
  const current = patient.state?.data;
  const retry = () => setRevision(value => value + 1);
  return <>
    <nav aria-label="Navigation des factures" className="flex flex-wrap gap-4">
      <Link href="/facturation" className="text-primary underline">Facturation</Link>
      <Link href={`/patients/${encodeURIComponent(patientId)}`} className="text-primary underline">Fiche du patient</Link>
      <Link href={`/patients/${encodeURIComponent(patientId)}/finances`} className="text-primary underline">Soldes et encaissements des soins</Link>
    </nav>
    <PageHeading title="Factures du patient" description={current ? `${patientName(current)} · ${current.reference}` : ""}
      >{current?.status === "active" && <Button asChild><Link href={newInvoicePath(patientId)}>Nouvelle facture</Link></Button>}</PageHeading>
    {current?.status === "inactive" && <p role="status">Patient archivé. Les factures restent consultables.</p>}
    {patient.state?.error ? <PatientFailure error={patient.state.error} retry={patient.retry} /> : null}
    {!history ? <p role="status">Chargement des factures…</p> : history.data ? <>
      <div><Button variant="outline" onClick={() => { setCursor(undefined); retry(); }}>Actualiser l’historique</Button></div>
      {history.data.items.length ? <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Historique des factures du patient</caption>
          <thead className="bg-muted/50"><tr>
            {["Facture", "Création", "Émission", "État", "Règlement", "Total", "Reçu", "Reste"].map((label, index) =>
              <th className={`p-3 ${index > 4 ? "text-right" : ""}`} scope="col" key={label}>{label}</th>)}
          </tr></thead>
          <tbody>{history.data.items.map(row => {
            const { balance, settlement } = row.currentFinancialState;
            return <tr key={row.invoiceId} className="border-t">
              <td className="p-3"><Link href={invoicePath(patientId, row.invoiceId)} className="whitespace-nowrap font-medium text-primary underline"
                aria-label={row.invoiceNumber ? `Ouvrir la facture ${row.invoiceNumber}` : `Ouvrir le brouillon du ${formatPatientDate(row.createdAt)}`}>
                {row.invoiceNumber ?? "Brouillon"}</Link></td>
              <td className="whitespace-nowrap p-3">{formatPatientDate(row.createdAt)}</td>
              <td className="whitespace-nowrap p-3">{row.issueDate ? formatPatientDate(row.issueDate) : "—"}</td>
              <td className="p-3">{row.lifecycle === "EMISE" ? "Émise" : "Brouillon"}</td>
              <td className="p-3">{settlement ? settlementLabel[settlement] : "—"}</td>
              {[balance.totalMinor, balance.receivedMinor, balance.remainingMinor].map((value, index) =>
                <td className="p-3 text-right tabular-nums" key={index}>{formatMad(value)}</td>)}
            </tr>;
          })}</tbody>
        </table>
      </Card> : <p>{cursor ? "Aucune autre facture sur cette page." : "Aucune facture pour ce patient."}</p>}
      {(cursor || history.data.nextCursor) && <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!cursor} onClick={() => setCursor(undefined)}>Première page des factures</Button>
        <Button variant="outline" disabled={!history.data.nextCursor} onClick={() => setCursor(history.data?.nextCursor ?? undefined)}>Factures suivantes</Button>
      </div>}
    </> : <InvoiceFailure error={history.error} retry={retry} />}
  </>;
}
