"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPatientDate, formatPatientTimestamp } from "@/lib/patients/dates";
import type { PersistentPrescription } from "@/lib/prescriptions/api/schemas";
import { usePrescriptionApi, usePrescriptionAction } from "./use-prescription-forms";
import { PrescriptionActionConfirmation, PrescriptionMutationFeedback } from "./mutation-feedback";
import { PrescriptionBoundary, PrescriptionFailure, PrescriptionLoading, PrescriptionNavigation, StoredPrescriptionStatus, prescriptionHref, usePrescriptionLoad } from "./shared";
import { StoredPrescriptionPdf } from "./pdf-panel";
const notices: Record<string, string> = { created: "Ordonnance créée en brouillon.", draft: "Brouillon enregistré." };
export function PersistentPrescriptionRecord({ id, patientId }: { id: string; patientId: string }) {
  return <PrescriptionBoundary><Record key={`${patientId}:${id}`} id={id} patientId={patientId} /></PrescriptionBoundary>;
}
function Record({ id, patientId }: { id: string; patientId: string }) {
  const { api } = usePrescriptionApi(); const query = useSearchParams();
  const [actionOpen, setActionOpen] = useState(false);
  const [notice, setNotice] = useState(notices[query.get("notice") ?? ""] ?? "");
  const load = useCallback(() => api.get(patientId, id), [api, id, patientId]);
  const state = usePrescriptionLoad(`${patientId}:${id}`, load);
  if (state.error) return <PrescriptionFailure error={state.error} retry={state.reload} />;
  if (!state.data) return <PrescriptionLoading />;
  const record = state.data, editable = record.status === "BROUILLON" && !record.archivedAt && record.patient.status === "active";
  function saved(message: string) { setActionOpen(false); setNotice(message); state.reload(); }
  return <>
    <PageHeading eyebrow={record.patient.reference} title={`Ordonnance du ${formatPatientDate(record.content.issuedDate)}`} description={record.patient.displayName}>
      <StoredPrescriptionStatus {...record} />{editable && !actionOpen && <Button asChild><Link href={prescriptionHref(record, "/modifier")}>Modifier le brouillon</Link></Button>}
    </PageHeading>
    {notice && <p role="status" className="rounded-lg border bg-secondary-tint p-4">{notice}</p>}
    <PrescriptionNavigation patientId={patientId} consultationId={record.content.consultationId} />
    {record.patient.status === "inactive" && <p role="status">Patient archivé. Ce document reste consultable ; aucune modification n’est autorisée.</p>}
    {record.archivedAt && <p role="status">Brouillon archivé le {formatPatientTimestamp(record.archivedAt)} · Lecture seule définitive.</p>}
    {record.status === "FINALISEE" && <p role="status">Ordonnance finalisée · Contenu et PDF en lecture seule.</p>}
    <Card className="space-y-5 p-5"><h2 className="text-lg font-semibold">Contenu de l’ordonnance</h2>
      {!record.content.medications.length ? <p>Aucun médicament renseigné.</p> : <ol className="space-y-5">{record.content.medications.map((line, index) => <li key={line.id} className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold break-words">{index + 1}. {line.medicationName || "Nom non renseigné"}</h3>
        <dl className="grid gap-4 sm:grid-cols-2">{([ ["Posologie", line.dosage], ["Fréquence", line.frequency], ["Durée", line.duration], ["Instructions complémentaires", line.instructions] ]).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="break-words whitespace-pre-wrap">{value || "Non renseigné"}</dd></div>)}</dl>
      </li>)}</ol>}
      <h3 className="font-semibold">Instructions générales</h3><p className="break-words whitespace-pre-wrap">{record.content.generalInstructions || "Non renseignées"}</p>
      <p className="text-xs text-muted-foreground">Création : {formatPatientTimestamp(record.createdAt)} · Modification : {formatPatientTimestamp(record.updatedAt)} · Version {record.version}</p>
      {record.finalizedAt && <p>Finalisée le {formatPatientTimestamp(record.finalizedAt)}</p>}
      {record.document && <div className="space-y-2 rounded-lg border p-4"><h3 className="font-semibold">Identité conservée dans le document</h3><p>{record.document.patientIdentity.displayName} · {record.document.patientIdentity.reference}</p><p>Praticien : {record.document.practitionerDisplayName}</p><p className="text-xs text-muted-foreground">L’identité administrative actuelle peut différer. Le PDF enregistré reste inchangé.</p></div>}
    </Card>
    {editable && <div className="flex flex-wrap items-start gap-4"><PrescriptionAction key={`finalize:${record.version}`} prescription={record} locked={actionOpen} onOpenChange={setActionOpen} kind="finalize" onSaved={() => saved("Ordonnance finalisée.")} />
      <PrescriptionAction key={`archive:${record.version}`} prescription={record} locked={actionOpen} onOpenChange={setActionOpen} kind="archive" onSaved={() => saved("Brouillon archivé.")} /></div>}
    <Button variant="outline" disabled={actionOpen} onClick={state.reload}>Actualiser l’ordonnance</Button>
    {record.status === "FINALISEE" ? <StoredPrescriptionPdf key={`${record.id}:${record.version}`} prescription={record} /> : <p className="text-sm text-muted-foreground">Le PDF sera disponible après finalisation. Aucun aperçu de brouillon n’est proposé.</p>}
  </>;
}
function PrescriptionAction({ prescription, kind, onSaved, locked, onOpenChange }: { prescription: PersistentPrescription; kind: "archive" | "finalize"; onSaved(): void; locked: boolean; onOpenChange(open: boolean): void }) {
  const [open, setOpen] = useState(false);
  const action = usePrescriptionAction({ prescription, kind, onSaved });
  return <div className="space-y-3"><Button variant={kind === "archive" ? "outline" : "default"} disabled={action.disabled || locked} onClick={() => { setOpen(true); onOpenChange(true); }}>{kind === "archive" ? "Archiver le brouillon" : "Finaliser l’ordonnance"}</Button>
    <PrescriptionMutationFeedback state={action.state} allowed={action.allowed} />
    <PrescriptionActionConfirmation allowed={action.allowed} open={open} onOpenChange={value => { setOpen(value); onOpenChange(value); }} {...action.confirmation} busy={action.state.pending} confirmDisabled={action.disabled} error={action.state.error?.message} onConfirm={() => void action.submit(true)} />
  </div>;
}
