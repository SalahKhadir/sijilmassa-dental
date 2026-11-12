"use client";

import { useCallback, useState } from "react";
import { useSessionBillingApi } from "@/components/financial/session";
import { useFinancialLoad } from "@/components/financial/load";
import { usePatientApi } from "@/components/patients/persistent/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createInvoiceApi, invoiceMessage } from "@/lib/invoices/client";
import { formatMad } from "@/lib/financial/money";
import { formatPatientDate } from "@/lib/patients/dates";
import type { DraftCharge, InvoiceBalance, InvoiceDetail } from "@/lib/invoices/schemas";
import type { AdministrativePatient } from "@/lib/patients/api/client";

export const useInvoiceApi = () => useSessionBillingApi(createInvoiceApi);

export function useInvoicePatient(patientId: string) {
  const patients = usePatientApi();
  const [revision, setRevision] = useState(0);
  const load = useCallback(() => {
    void revision;
    return patients.get(patientId);
  }, [patients, patientId, revision]);
  return { state: useFinancialLoad(load), retry: () => setRevision(value => value + 1) };
}

export function patientName(patient: Pick<AdministrativePatient, "identity">) {
  return `${patient.identity.firstName} ${patient.identity.lastName}`;
}

export function InvoiceFailure({ error, retry }: { error: unknown; retry?: () => void }) {
  return <div className="space-y-2">
    <p role="alert">{invoiceMessage(error)}</p>
    {retry && <Button type="button" variant="outline" onClick={retry}>Réessayer la lecture</Button>}
  </div>;
}

export const settlementLabel: Record<NonNullable<InvoiceDetail["currentFinancialState"]["settlement"]>, string> = {
  DUE: "À régler", PARTIAL: "Partiellement réglée", SETTLED: "Soldée",
};

export function InvoiceAmounts({ balance, issued = false }: { balance: InvoiceBalance; issued?: boolean }) {
  const fields = [
    ["Total", balance.totalMinor],
    [issued ? "Reçu à l’émission" : "Reçu à ce jour", balance.receivedMinor],
    [issued ? "Reste à l’émission" : "Reste à ce jour", balance.remainingMinor],
  ];
  return <dl className="grid gap-3 sm:grid-cols-3">
    {fields.map(([label, value]) => <div className="min-w-0 rounded-lg border p-3" key={label}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-semibold tabular-nums">{formatMad(value)}</dd>
    </div>)}
  </dl>;
}

export function InvoiceLines({ lines }: { lines: readonly (DraftCharge & { receivedAtIssueMinor?: number })[] }) {
  if (!lines.length) return <p>Aucun soin sélectionné.</p>;
  const issued = lines[0].receivedAtIssueMinor !== undefined;
  return <Card className="overflow-x-auto">
    <table className="w-full text-left text-sm">
      <caption className="sr-only">Soins de la facture</caption>
      <thead className="bg-muted/50"><tr>
        <th scope="col" className="p-3">Date</th><th scope="col" className="p-3">Traitement</th>
        <th scope="col" className="p-3 text-right">Prix</th>
        {issued && <th scope="col" className="p-3 text-right">Reçu à l’émission</th>}
      </tr></thead>
      <tbody>{lines.map(line => <tr className="border-t" key={line.chargeId}>
        <td className="whitespace-nowrap p-3">{formatPatientDate(line.treatmentDate)}</td>
        <td className="p-3">{line.treatmentLabel}</td>
        <td className="p-3 text-right tabular-nums">{formatMad(line.priceMinor)}</td>
        {issued && <td className="p-3 text-right tabular-nums">{line.receivedAtIssueMinor === undefined ? "—" : formatMad(line.receivedAtIssueMinor)}</td>}
      </tr>)}</tbody>
    </table>
  </Card>;
}
