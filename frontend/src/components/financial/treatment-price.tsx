"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClinicalConfirmation } from "@/components/consultations/clinical-confirmation";
import type { PersistentConsultation, PersistentTreatment } from "@/lib/consultations/api/schemas";
import { FinancialApiError, type FinancialApi } from "@/lib/financial/client";
import type { TreatmentPricing } from "@/lib/financial/schemas";
import { formatMad, parseMad } from "@/lib/financial/money";

export function TreatmentPrice({ api, record, treatment, editable, pricing, onRefresh }: {
  api: FinancialApi;
  record: PersistentConsultation;
  treatment: PersistentTreatment;
  editable: boolean;
  pricing: TreatmentPricing;
  onRefresh(error?: FinancialApiError): void;
}) {
  const [amount, setAmount] = useState("");
  const [confirmation, setConfirmation] = useState<number>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const inputId = `prix-${treatment.id}`;
  const writable = editable && pricing.state === "UNPRICED";

  async function save() {
    if (!writable || inFlight.current || confirmation === undefined) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      await api.create({
        patientId: record.patientId, consultationId: record.id, treatmentId: treatment.id,
        expectedConsultationVersion: record.version, priceMinor: confirmation,
      });
      onRefresh();
    } catch (cause) {
      onRefresh(cause instanceof FinancialApiError ? cause : new FinancialApiError(503));
    } finally {
      inFlight.current = false;
      setPending(false);
      setConfirmation(undefined);
    }
  }

  if (pricing.state === "PRICED") return <p role="status">Prix enregistré · {formatMad(pricing.priceMinor)} · Lecture seule</p>;
  return <div className="space-y-2 border-t pt-3">
    <p className="text-sm text-muted-foreground">Soin sans prix enregistré.</p>
    {writable && <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
      event.preventDefault();
      const price = parseMad(amount);
      if (price === undefined) setError("Saisissez un prix en DH avec au plus deux décimales.");
      else { setError(""); setConfirmation(price); }
    }}>
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor={inputId}>Prix du soin (DH)</label>
        <Input id={inputId} inputMode="decimal" maxLength={17} value={amount} disabled={pending}
          aria-invalid={Boolean(error)} onChange={event => setAmount(event.target.value)} />
      </div>
      <Button variant="outline" type="submit" disabled={pending}>Attribuer le prix</Button>
    </form>}
    {error && <p role="alert">{error}</p>}
    <ClinicalConfirmation open={confirmation !== undefined} busy={pending} confirmDisabled={!writable}
      title="Attribuer ce prix définitif ?"
      description={confirmation === undefined ? "" : `${treatment.content.description} · ${formatMad(confirmation)}. Le prix sera enregistré pour ce soin.`}
      confirmLabel="Confirmer le prix" onOpenChange={open => { if (!open) setConfirmation(undefined); }} onConfirm={() => void save()} />
  </div>;
}
