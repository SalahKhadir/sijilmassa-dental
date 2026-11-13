"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePatientApi } from "@/components/patients/persistent/shared";
import { formatPatientDate, formatPatientTimestamp } from "@/lib/patients/dates";
import { offsetLabel } from "@/lib/appointments/api/time";
import type { ClinicalCursor, PersistentConsultation, PersistentTreatment } from "@/lib/consultations/api/schemas";
import { ClinicalBoundary, ClinicalFailure, ClinicalLoading, useClinicalLoad } from "./shared";
import { useClinicalApi, useClinicalAction } from "./use-clinical-forms";
import { ClinicalMutationFeedback } from "./mutation-feedback";
import { ClinicalConfirmation } from "../clinical-confirmation";
import { ConsultationStatus } from "../consultation-status";
import { TreatmentPrice } from "@/components/financial/treatment-price";
import { useFinancialApi } from "@/components/financial/session";
import { useFinancialLoad } from "@/components/financial/load";
import { FinancialApiError } from "@/lib/financial/client";
import { historyHref, newHref } from "@/components/insurance/persistent/shared";
import { TreatmentEditor, clinicalHref } from "./forms";

const notices: Record<string, string> = { created: "Consultation créée.", draft: "Brouillon enregistré." };
export function PersistentClinicalRecord({ id, patientId }: { id: string; patientId: string }) {
  return <ClinicalBoundary><Record key={`${patientId}:${id}`} id={id} patientId={patientId} /></ClinicalBoundary>;
}
function Record({ id, patientId }: { id: string; patientId: string }) {
  const { api } = useClinicalApi(), patients = usePatientApi();
  const query = useSearchParams();
  const [panel, setPanel] = useState<{ treatment?: PersistentTreatment }>();
  const { api: financialApi, role } = useFinancialApi();
  const [pricingRevision, setPricingRevision] = useState(0);
  const [pricingNotice, setPricingNotice] = useState("");
  const [notice, setNotice] = useState(notices[query.get("notice") ?? ""] ?? "");
  const load = useCallback(async () => {
    const [record, patient] = await Promise.all([api.get(patientId, id), patients.get(patientId)]);
    return { record, patient };
  }, [api, patients, id, patientId]);
  const state = useClinicalLoad(`${patientId}:${id}`, load);
  const pricingRecord = state.data?.record;
  const loadPricing = useCallback(() => {
    void pricingRevision;
    return pricingRecord ? financialApi.consultationPricing(pricingRecord) : Promise.resolve(undefined);
  }, [financialApi, pricingRecord, pricingRevision]);
  const pricing = useFinancialLoad(loadPricing, role === "DENTIST" && Boolean(pricingRecord?.treatments.length));
  if (state.error) return <ClinicalFailure error={state.error} retry={state.reload} />;
  if (!state.data) return <ClinicalLoading />;
  const { record, patient } = state.data;
  const editable = record.status === "BROUILLON" && patient.status === "active";
  function refreshPricing(error?: FinancialApiError) {
    setPricingNotice(error ? (error.status >= 500 || error.status === 408
      ? "Attribution du prix non confirmée. Vérifiez le prix relu avant de réessayer." : error.message) : "");
    if (error?.status === 409 && error.code !== "DUPLICATE_CHARGE") state.reload();
    else setPricingRevision(value => value + 1);
  }
  function saved(record: PersistentConsultation, message: string) { void record; setPanel(undefined); setNotice(message); state.reload(); }
  return <>
    <PageHeading eyebrow={patient.reference} title={`Consultation du ${formatPatientDate(record.content.consultationDate)}`} description={`${patient.identity.firstName} ${patient.identity.lastName}`}>
      <ConsultationStatus status={record.status} />
      {editable && !panel && <Button asChild><Link href={clinicalHref(record, "/modifier")}>Modifier le brouillon</Link></Button>}
    </PageHeading>
    {notice && <p role="status" aria-live="polite" className="rounded-lg border bg-secondary-tint p-4">{notice}</p>}
    {patient.status === "inactive" && <p role="status">Patient archivé. Ce dossier reste consultable ; aucune modification n’est autorisée.</p>}
    {record.status === "TERMINEE" && <p role="status">Consultation finalisée · Compte rendu et soins en lecture seule.</p>}
    <nav className="flex flex-wrap gap-4" aria-label="Navigation du compte rendu"><Link className="text-primary underline" href={`/patients/${patientId}/clinique`}>Historique clinique du patient</Link>
      <Link className="text-primary underline" href={`/patients/${patientId}/dossier`}>Questionnaire et antécédents</Link>
      <Link className="text-primary underline" href={`/patients/${patientId}/finances`}>Finances du patient</Link>
      {record.content.appointmentId && <Link className="text-primary underline" href={`/rendez-vous/${record.content.appointmentId}`}>Voir le rendez-vous lié</Link>}
      <Link className="text-primary underline" href={`/documents?patientId=${patientId}&consultationId=${id}`}>Ordonnances de cette consultation</Link>
      <Link prefetch={false} className="text-primary underline" href={historyHref(patientId)}>Documents d’assurance</Link>
      {patient.status === "active" && <Link prefetch={false} className="text-primary underline" href={newHref(patientId, id)}>Créer un document d’assurance</Link>}
      {patient.status === "active" && <Link className="text-primary underline" href={`/documents/ordonnances/nouvelle?patientId=${patientId}&consultationId=${id}`}>Créer une ordonnance</Link>}
    </nav>
    <Card className="space-y-5 p-5"><h2 className="font-semibold">Compte rendu clinique</h2>
      <dl className="space-y-5">{([ ["chiefComplaint", "Motif de consultation"], ["clinicalObservations", "Observations cliniques"], ["assessment", "Évaluation clinique"], ["treatmentPlan", "Plan de traitement"], ["notes", "Notes complémentaires"] ] as const).map(([field, label]) => <div key={field} className="min-w-0"><dt className="text-sm font-semibold">{label}</dt><dd className="mt-2 break-words whitespace-pre-wrap">{record.content[field] || "Non renseigné"}</dd></div>)}</dl>
      <p className="text-xs text-muted-foreground">Création le <time dateTime={record.createdAt}>{formatPatientTimestamp(record.createdAt)} ({offsetLabel(record.createdAt)})</time> · Modification le <time dateTime={record.updatedAt}>{formatPatientTimestamp(record.updatedAt)} ({offsetLabel(record.updatedAt)})</time> · Version {record.version}</p>
    </Card>
    <section className="space-y-4" aria-label="Soins actifs"><h2 className="text-lg font-semibold">Soins enregistrés</h2>
      {!record.treatments.length && <p>Aucun soin actif enregistré.</p>}
      {pricingNotice && <p role="alert">{pricingNotice}</p>}
      {record.treatments.length > 0 && (pricing?.error ? <div className="space-y-2">
        <p role="alert">{pricing.error instanceof FinancialApiError && pricing.error.code === "VERSION_CONFLICT"
          ? "La consultation a changé pendant la lecture des prix. Actualisez le dossier pour vérifier la tarification."
          : "La tarification des soins ne peut pas être vérifiée."}</p>
        <Button variant="outline" onClick={() => { setPricingNotice(""); state.reload(); }}>Actualiser le dossier et les prix</Button>
      </div> : !pricing?.data ? <p role="status">Vérification de la tarification…</p> : null)}
      {record.treatments.map(treatment => {
        const price = pricing?.data?.get(treatment.id.toLowerCase());
        return <Card key={treatment.id} className="space-y-3 p-5"><h3 className="font-semibold">Soin du {formatPatientDate(treatment.content.treatmentDate)}</h3>
        <p className="break-words whitespace-pre-wrap">{treatment.content.description}</p><p>Référence dentaire : {treatment.content.toothReference || "Non renseignée"}</p>
        {treatment.content.notes && <p className="break-words whitespace-pre-wrap">{treatment.content.notes}</p>}
        {price && <TreatmentPrice api={financialApi} record={record} treatment={treatment} editable={editable && !panel}
          pricing={price} onRefresh={refreshPricing} />}
        {editable && !panel && <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => setPanel({ treatment })}>Modifier ce soin</Button>
          {price?.state !== "PRICED" && <ClinicalAction key={`${record.version}:${treatment.id}`} consultation={record} kind="remove" treatmentId={treatment.id} onSaved={record => saved(record, "Soin retiré.")} />}</div>}
        </Card>;
      })}
      {editable && !panel && <Button disabled={record.treatments.length >= 50} onClick={() => setPanel({})}>Ajouter un soin</Button>}
    </section>
    {panel && editable && <TreatmentEditor key={`${id}:${panel.treatment?.id ?? "new"}`} consultation={record} treatment={panel.treatment} patient={patient}
      onCancel={() => setPanel(undefined)} onSaved={result => saved(result, panel.treatment ? "Soin modifié." : "Soin ajouté.")} />}
    {editable && !panel && <ClinicalAction key={`finalize:${record.version}`} consultation={record} kind="finalize" onSaved={record => saved(record, "Consultation finalisée.")} />}
    {!panel && <Button variant="outline" onClick={state.reload}>Actualiser le dossier clinique</Button>}
    <RemovedHistory key={`${id}:${record.version}`} consultation={record} />
  </>;
}
function ClinicalAction({ consultation, kind, treatmentId, onSaved }: { consultation: PersistentConsultation; kind: "remove" | "finalize"; treatmentId?: string; onSaved(record: PersistentConsultation): void }) {
  const [open, setOpen] = useState(false);
  const action = useClinicalAction({ consultation, kind, treatmentId, onSaved });
  return <div className="space-y-3"><Button variant={kind === "remove" ? "outline" : "default"} disabled={action.disabled} onClick={() => setOpen(true)}>{kind === "remove" ? "Retirer ce soin" : "Terminer la consultation"}</Button>
    <ClinicalMutationFeedback state={action.state} allowed={action.allowed} />
    <ClinicalConfirmation open={open} onOpenChange={setOpen} {...action.confirmation} destructive={kind === "remove"} busy={action.state.pending} confirmDisabled={action.disabled} error={action.state.error?.message}
      onConfirm={() => void action.submit(true)} />
  </div>;
}
function RemovedHistory({ consultation }: { consultation: PersistentConsultation }) {
  const { api } = useClinicalApi();
  const [open, setOpen] = useState(false), [cursor, setCursor] = useState<ClinicalCursor>();
  const load = useCallback(() => open ? api.removedTreatments(consultation.patientId, consultation.id, cursor) : Promise.resolve(null), [api, consultation.patientId, consultation.id, cursor, open]);
  const state = useClinicalLoad(`${consultation.id}:${open}:${cursor?.date}:${cursor?.id}`, load);
  return <section className="space-y-3 rounded-xl border p-5"><h2 className="font-semibold">Historique des soins retirés</h2>
    <Button variant="outline" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "Masquer les soins retirés" : "Afficher les soins retirés"}</Button>
    {open && (state.error ? <ClinicalFailure error={state.error} retry={state.reload} /> : !state.data ? <ClinicalLoading /> : <>
      {!state.data.items.length && <p>Aucun soin retiré sur cette page.</p>}
      <ul className="space-y-3">{state.data.items.map(item => <li key={item.treatment.id} className="rounded-lg border p-4"><p>{formatPatientDate(item.treatment.content.treatmentDate)} · Retrait le {formatPatientTimestamp(item.removedAt)}</p>
        <p className="break-words whitespace-pre-wrap">{item.treatment.content.description}</p><p>Référence dentaire : {item.treatment.content.toothReference || "Non renseignée"}</p>
        {item.treatment.content.notes && <p className="break-words whitespace-pre-wrap">{item.treatment.content.notes}</p>}</li>)}</ul>
      <p className="text-xs">50 retraits maximum par page. Les soins retirés sont conservés, sans restauration ni modification.</p>
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={!cursor} onClick={() => setCursor(undefined)}>Première page des retraits</Button><Button variant="outline" disabled={!state.data.nextCursor} onClick={() => { if (state.data?.nextCursor) setCursor(state.data.nextCursor); }}>Retraits suivants</Button></div>
    </>)}
  </section>;
}
