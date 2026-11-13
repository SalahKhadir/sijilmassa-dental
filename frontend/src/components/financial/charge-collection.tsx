"use client";

import { useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { ClinicalConfirmation } from "@/components/consultations/clinical-confirmation";
import { formatPatientDate, formatPatientTimestamp } from "@/lib/patients/dates";
import { FinancialApiError, type FinancialApi } from "@/lib/financial/client";
import { formatMad, parseMad, validPaymentAmount } from "@/lib/financial/money";
import { paymentIntent } from "@/lib/financial/payment-attempt";
import { paymentMethod, type Charge, type PaymentCursor, type PaymentMethod } from "@/lib/financial/schemas";
import { useFinancialLoad } from "./load";
import { usePaymentAttempts } from "./session";

const methods: Record<PaymentMethod, string> = {
  ESPECES: "Espèces", CARTE: "Carte", VIREMENT: "Virement", CHEQUE: "Chèque", AUTRE: "Autre",
};
export const financialMessage = (error: unknown) => error instanceof FinancialApiError ? error.message
  : "Le service financier est indisponible. Réessayez après avoir vérifié la connexion.";

export function ChargeCollection({ api, patientId, chargeId, archived, revision, onChanged }: {
  api: FinancialApi; patientId: string; chargeId: string; archived: boolean; revision: number; onChanged(): void;
}) {
  const { store, attempt } = usePaymentAttempts();
  const [feedback, setFeedback] = useState<{ success?: string; error?: string }>();
  const load = useCallback(() => {
    void revision;
    return api.get(patientId, chargeId);
  }, [api, patientId, chargeId, revision]);
  const state = useFinancialLoad(load);
  const ownAttempt = attempt?.patientId === patientId && attempt.chargeId === chargeId ? attempt : undefined;
  const refresh = onChanged;

  async function submit(body?: ReturnType<typeof paymentIntent>) {
    if (archived) return;
    const current = store.begin(patientId, chargeId, body);
    if (!current) return;
    setFeedback(undefined);
    try {
      const result = await api.pay(patientId, chargeId, current.body);
      refresh();
      store.finish(current);
      setFeedback({ success: `Encaissement confirmé · ${formatMad(result.payment.amountMinor)}. Reste à payer : ${formatMad(result.charge.remainingMinor)}.` });
    } catch (cause) {
      const error = cause instanceof FinancialApiError ? cause : new FinancialApiError(503);
      if (error.status === 409) refresh();
      store.finish(current, error, body === undefined);
      setFeedback({ error: error.message });
    }
  }

  return <Card className="space-y-4 p-5" role="region" aria-label="Détail du soin sélectionné">
    <h2 className="font-semibold">Détail du soin sélectionné</h2>
    {feedback?.success && <p role="status" className="rounded-md bg-secondary-tint p-3">{feedback.success}</p>}
    {feedback?.error && <p role="alert">{feedback.error}</p>}
    {ownAttempt && <div className="space-y-2 rounded-md border p-3">
      {ownAttempt.phase === "pending" ? <p role="status">Vérification de l’encaissement…</p> : <>
        <p role="alert">Encaissement de {formatMad(ownAttempt.body.amountMinor)} non confirmé. Renvoyez la demande d’origine pour vérifier son résultat.</p>
        <Button type="button" variant="outline" disabled={archived} onClick={() => void submit()}>Renvoyer le même encaissement</Button>
      </>}
    </div>}
    {!state ? <p role="status">Chargement du soin…</p> : state.data ? <>
      <p className="break-words">{formatPatientDate(state.data.date)} · {state.data.treatmentLabel}</p>
      <p>Reste à payer <strong>{formatMad(state.data.remainingMinor)}</strong></p>
      {state.data.remainingMinor === 0 && <p>Ce soin est soldé.</p>}
      {!archived && !attempt && state.data.remainingMinor > 0 &&
        <PaymentForm charge={state.data} submit={submit} />}
      <PaymentHistory key={revision} api={api} patientId={patientId} chargeId={chargeId} />
    </> : <div className="space-y-2"><p role="alert">{financialMessage(state.error)}</p>
      <Button variant="outline" onClick={refresh}>Actualiser le soin</Button></div>}
  </Card>;
}
function PaymentForm({ charge, submit }: { charge: Charge; submit(body: ReturnType<typeof paymentIntent>): Promise<void> }) {
  const id = useId();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("ESPECES");
  const [confirmation, setConfirmation] = useState<number>();
  const [error, setError] = useState("");
  return <>
    <form aria-describedby={`${id}-history-help`} className="flex flex-wrap items-end gap-3" onSubmit={event => {
      event.preventDefault();
      const value = parseMad(amount);
      if (!validPaymentAmount(value, charge.remainingMinor)) {
        setError(value !== undefined && value > charge.remainingMinor ? "Le montant dépasse le reste à payer."
          : "Saisissez un montant positif en DH avec au plus deux décimales.");
        return;
      }
      setError("");
      setConfirmation(value);
    }}>
      <p id={`${id}-history-help`} className="basis-full text-sm text-muted-foreground">
        Après un rechargement ou si le résultat d’un encaissement est incertain, vérifiez l’historique du soin avant de saisir un autre encaissement.
      </p>
      <div className="w-full min-w-0 space-y-2 sm:w-auto"><label className="text-sm font-semibold" htmlFor={`${id}-amount`}>Montant reçu (DH)</label>
        <Input id={`${id}-amount`} inputMode="decimal" maxLength={17} value={amount} aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined} onChange={event => { setAmount(event.target.value); setError(""); }} /></div>
      <div className="w-full min-w-0 space-y-2 sm:w-auto"><label className="text-sm font-semibold" htmlFor={`${id}-method`}>Mode de paiement</label>
        <Select id={`${id}-method`} value={method} onChange={event => setMethod(paymentMethod.parse(event.target.value))}>
          {paymentMethod.options.map(key => <option key={key} value={key}>{methods[key]}</option>)}
        </Select></div>
      <Button type="submit" className="min-h-12">Préparer l’encaissement</Button>
    </form>
    {error && <p role="alert" id={`${id}-error`} className="text-sm text-danger">{error}</p>}
    <ClinicalConfirmation open={confirmation !== undefined} title="Confirmer l’encaissement ?"
      description={confirmation === undefined ? "" : `${formatMad(confirmation)} · ${methods[method]} · ${charge.treatmentLabel}`}
      confirmLabel="Confirmer l’encaissement" onOpenChange={open => { if (!open) setConfirmation(undefined); }}
      onConfirm={() => {
        if (!validPaymentAmount(confirmation, charge.remainingMinor)) return;
        setConfirmation(undefined);
        void submit(paymentIntent(charge.version, confirmation, method));
      }} />
  </>;
}
function PaymentHistory({ api, patientId, chargeId }: { api: FinancialApi; patientId: string; chargeId: string }) {
  const [cursor, setCursor] = useState<PaymentCursor>();
  const [revision, setRevision] = useState(0);
  const load = useCallback(() => {
    void revision;
    return api.history(patientId, chargeId, cursor);
  }, [api, patientId, chargeId, cursor, revision]);
  const state = useFinancialLoad(load);
  return <section className="space-y-3 border-t pt-4" aria-label="Historique des encaissements">
    <h3 className="font-medium">Historique des encaissements</h3>
    {!state ? <p role="status">Chargement de l’historique…</p> : state.data ? <>
      {state.data.items.length ? <ul className="divide-y">{state.data.items.map(payment =>
        <li className="flex flex-wrap justify-between gap-2 py-2" key={payment.id}>
          <span>{formatPatientTimestamp(payment.paidAt)} · {methods[payment.method]}</span>
          <strong>{formatMad(payment.amountMinor)}</strong>
        </li>)}</ul> : <p>Aucun encaissement sur cette page.</p>}
      {(cursor || state.data.nextCursor) && <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!cursor} onClick={() => setCursor(undefined)}>Première page des encaissements</Button>
        <Button variant="outline" disabled={!state.data.nextCursor} onClick={() => setCursor(state.data?.nextCursor ?? undefined)}>Encaissements suivants</Button>
      </div>}
    </> : <><p role="alert">{financialMessage(state.error)}</p>
      <Button variant="outline" onClick={() => setRevision(value => value + 1)}>Réessayer l’historique</Button></>}
  </section>;
}
