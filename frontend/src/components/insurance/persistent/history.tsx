"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useFinancialLoad } from "@/components/financial/load";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { InsuranceCursor } from "@/lib/insurance/api/schemas";
import { formatPatientTimestamp } from "@/lib/patients/dates";
import { consultationHref, detailHref, familyLabels, InsuranceBoundary, InsuranceFailure, newHref, type WorkspaceApi } from "./shared";

export function PatientInsuranceHistory({ patientId }: { patientId: string }) {
  return <InsuranceBoundary>{(api, owner) => <History key={`${owner}:${patientId}`} api={api} patientId={patientId} />}</InsuranceBoundary>;
}

function History({ api, patientId }: { api: WorkspaceApi; patientId: string }) {
  const [cursors, setCursors] = useState<InsuranceCursor[]>([]);
  const [revision, setRevision] = useState(0);
  const cursor = cursors.at(-1);
  const load = useCallback(() => {
    void revision;
    return Promise.all([api.patient(patientId), api.insurance.history(patientId, cursor)]);
  }, [api, patientId, cursor, revision]);
  const result = useFinancialLoad(load);
  return <>
    <Link className="text-primary underline" href={`/patients/${patientId}`}>Retour à la fiche du patient</Link>
    {!result ? <p role="status">Chargement des documents d’assurance…</p>
      : result.error ? <InsuranceFailure error={result.error} retry={() => setRevision(value => value + 1)} />
      : result.data && (() => {
        const [patient, page] = result.data;
        const archived = patient.status === "inactive";
        return <>
          <PageHeading eyebrow={patient.reference} title="Documents d’assurance" description={`${patient.identity.firstName} ${patient.identity.lastName}`}>
            {!archived && <Button asChild><Link prefetch={false} href={newHref(patientId)}>Nouveau document</Link></Button>}
          </PageHeading>
          {archived && <p role="status">Patient archivé. Ses documents restent consultables.</p>}
          {!page.items.length && <p>Aucun document d’assurance pour ce patient.</p>}
          <ul className="space-y-3">{page.items.map(row => {
            const draft = row.lifecycle === "BROUILLON";
            const href = detailHref(patientId, row.documentId);
            return <li key={row.documentId}><Card className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="space-y-1">
                <h2 className="font-semibold">{familyLabels[row.documentType]}</h2>
                <p className="text-sm">{draft ? "Brouillon" : "Finalisé"}</p>
                <p className="text-sm text-muted-foreground">Créé le {formatPatientTimestamp(row.createdAt)}
                  {row.finalizedAt && ` · Finalisé le ${formatPatientTimestamp(row.finalizedAt)}`}</p>
                {row.consultationId && <Link prefetch={false} className="text-sm text-primary underline" href={consultationHref(patientId, row.consultationId)}>Voir la consultation liée</Link>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline"><Link prefetch={false} href={href}>Consulter</Link></Button>
                {draft && !archived && <Button asChild><Link prefetch={false} href={`${href}&action=modifier`}>Modifier le brouillon</Link></Button>}
                {draft && !archived && <Button asChild variant="outline"><Link prefetch={false} href={`${href}&action=finaliser`}>Finaliser</Link></Button>}
              </div>
            </Card></li>;
          })}</ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!cursor} onClick={() => setCursors(values => values.slice(0, -1))}>Page précédente</Button>
            <Button variant="outline" disabled={!page.nextCursor} onClick={() => { if (page.nextCursor) setCursors([...cursors, page.nextCursor]); }}>Page suivante</Button>
          </div>
        </>;
      })()}
  </>;
}
