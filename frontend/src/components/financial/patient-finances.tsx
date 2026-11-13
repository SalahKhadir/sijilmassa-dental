"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { usePatientApi } from "@/components/patients/persistent/shared";
import { Button } from "@/components/ui/button";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import { ListLoading, ReadError } from "@/components/ui/read-feedback";
import { formatPatientDate } from "@/lib/patients/dates";
import { formatMad } from "@/lib/financial/money";
import type { Charge, ChargeCursor, Summary, Verso } from "@/lib/financial/schemas";
import { ChargeCollection, financialMessage } from "./charge-collection";
import { useFinancialLoad } from "./load";
import { useFinancialApi, usePaymentAttempts } from "./session";

export function PatientFinances({ patientId }: { patientId: string }) {
  const scope = useFinancialApi();
  if (!scope.role) return <p role="status">Vérification de la session…</p>;
  return <Finances key={`${scope.owner}:${patientId}`} patientId={patientId} api={scope.api} />;
}

function Finances({ patientId, api }: { patientId: string; api: ReturnType<typeof useFinancialApi>["api"] }) {
  const patients = usePatientApi();
  const { attempt } = usePaymentAttempts();
  const [selected, setSelected] = useState<string>();
  const [view, setView] = useState<"summary" | "verso">("summary");
  const [cursor, setCursor] = useState<ChargeCursor>();
  const [revision, setRevision] = useState(0);
  const loadPatient = useCallback(() => {
    void revision;
    return patients.get(patientId);
  }, [patients, patientId, revision]);
  const loadLedger = useCallback(() => {
    void revision;
    return view === "summary" ? api.summary(patientId, cursor) : api.verso(patientId, cursor);
  }, [api, patientId, view, cursor, revision]);
  const patient = useFinancialLoad(loadPatient);
  const ledger = useFinancialLoad<Summary | Verso>(loadLedger);
  const current = attempt?.patientId === patientId ? attempt.chargeId : selected;
  function switchView(next: typeof view) {
    setCursor(undefined);
    setView(next);
  }
  const refresh = useCallback(() => { setRevision(value => value + 1); }, []);

  return <>
    <nav aria-label="Navigation financière" className="flex flex-wrap gap-4">
      <Link href={`/patients/${patientId}`} className="text-primary underline">Retour à la fiche du patient</Link>
      <Link href={`/patients/${patientId}/factures`} className="text-primary underline">Factures du patient</Link>
    </nav>
    <PageHeading title="Finances du patient"
      description={patient?.data ? `${patient.data.identity.firstName} ${patient.data.identity.lastName}` : "Soldes et encaissements des soins."} />
    <div className="flex flex-wrap gap-2" aria-label="Vues financières">
      <Button variant={view === "summary" ? "default" : "outline"} aria-pressed={view === "summary"} onClick={() => switchView("summary")}>Soldes des soins</Button>
      <Button variant={view === "verso" ? "default" : "outline"} aria-pressed={view === "verso"} onClick={() => switchView("verso")}>Verso du dossier</Button>
      <Button variant="outline" onClick={refresh}>Actualiser les finances</Button>
    </div>
    {attempt && attempt.patientId !== patientId && <p role="alert">
      Un encaissement est en cours de vérification. <Link className="text-primary underline" href={`/patients/${attempt.patientId}/finances`}>Revenir au soin concerné</Link>
    </p>}
    {patient?.data?.status === "inactive" && <p role="status">Patient archivé. Les finances restent consultables.</p>}
    {patient?.error ? <p role="alert">Impossible de vérifier le statut du patient.</p> : null}
    {!ledger ? <ListLoading>Chargement des finances…</ListLoading> : ledger.data ? <>
      <Totals totals={ledger.data.totals} />
      <LedgerTable page={ledger.data} selection={view === "summary" ? {
        current, select: setSelected, locked: Boolean(attempt),
      } : undefined} />
      {(cursor || ledger.data.nextCursor) && <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!cursor} onClick={() => setCursor(undefined)}>Première page des soins</Button>
        <Button variant="outline" disabled={!ledger.data.nextCursor} onClick={() => setCursor(ledger.data?.nextCursor ?? undefined)}>Soins suivants</Button>
      </div>}
    </> : <ReadError>{financialMessage(ledger.error)}</ReadError>}
    {current && (view === "summary" || attempt?.patientId === patientId) && <ChargeCollection key={current} api={api}
      patientId={patientId} chargeId={current} revision={revision} archived={patient?.data?.status !== "active"} onChanged={() => { setSelected(current); refresh(); }} />}
  </>;
}

function Totals({ totals }: { totals: Summary["totals"] }) {
  const fields = [
    ["Total des soins tarifés", totals.chargesMinor],
    ["Total reçu", totals.receivedMinor],
    ["Total restant", totals.outstandingMinor],
  ];
  return <dl className="grid gap-3 sm:grid-cols-3" aria-label="Totaux du patient">
    {fields.map(([label, value]) => <div className="min-w-0 rounded-xl border bg-surface p-4" key={label}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-lg font-semibold tabular-nums">{formatMad(value)}</dd>
    </div>)}
  </dl>;
}

function LedgerTable({ page, selection }: { page: Summary | Verso; selection?: {
  current?: string; locked: boolean; select(id: string): void;
} }) {
  if (!page.items.length) return <p>{page.totals.chargesMinor === "0" ? "Aucun soin tarifé sur cette page." : "Aucun autre soin sur cette page."}</p>;
  const headings = ["Date", "Traitement", "Prix", "Reçu", "Reste"];
  return <ScrollableTable label={selection ? "Tableau des soldes" : "Tableau du dossier"} className="min-w-[30rem]">
      <caption className="sr-only">{selection ? "Soldes des soins tarifés" : "Verso du dossier patient"}</caption>
      <thead><tr>
        {headings.map((heading, index) => <th scope="col" key={heading} className={`px-3 py-2 ${index > 1 ? "text-right" : ""}`}>{heading}</th>)}
        {selection && <th scope="col" className="px-3 py-2">Détail</th>}
      </tr></thead>
      <tbody>{page.items.map((row, index) => {
        const charge = "chargeId" in row ? row as Charge : undefined;
        return <tr className="border-t" key={charge?.chargeId ?? index}>
          <td className="whitespace-nowrap px-3 py-3"><time dateTime={row.date}>{formatPatientDate(row.date)}</time></td>
          <th scope="row" className="min-w-28 break-words px-3 py-3 font-medium">{row.treatmentLabel}</th>
          {[row.priceMinor, row.receivedMinor, row.remainingMinor].map((value, column) =>
            <td key={column} className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatMad(value)}</td>)}
          {selection && charge && <td className="px-3 py-3">
            <Button variant="outline" aria-pressed={selection.current === charge.chargeId}
              aria-label={`Ouvrir le soin ${row.treatmentLabel} du ${formatPatientDate(row.date)}`}
              disabled={selection.locked} onClick={() => selection.select(charge.chargeId)}>Ouvrir</Button>
          </td>}
        </tr>;
      })}</tbody>
  </ScrollableTable>;
}
