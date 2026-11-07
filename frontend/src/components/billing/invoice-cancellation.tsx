"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ClinicalConfirmation } from "@/components/consultations/clinical-confirmation";
import { BillingError } from "@/lib/billing/money";
import { cancellationSchema } from "@/lib/billing/schema";
import { useBilling } from "./billing-provider";
export function InvoiceCancellation({
  id,
  number,
}: {
  id: string;
  number: string;
}) {
  const { cancel } = useBilling();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);
  async function confirm() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await cancel(id, reason);
      setOpen(false);
    } catch (error) {
      setError(
        error instanceof BillingError
          ? error.message
          : "Impossible d’annuler la facture. Réessayez.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Annulation sans règlement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label
          htmlFor="invoice-cancel-reason"
          className="block text-sm font-semibold"
        >
          Motif d’annulation (obligatoire)
        </label>
        <Textarea
          ref={field}
          id="invoice-cancel-reason"
          maxLength={500}
          value={reason}
          disabled={busy}
          onChange={(event) => setReason(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error && !open ? "invoice-cancel-error" : undefined}
        />
        {error && !open && (
          <p
            role="alert"
            id="invoice-cancel-error"
            className="text-sm text-danger"
          >
            {error}
          </p>
        )}
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            const result = cancellationSchema.safeParse(reason);
            if (!result.success) {
              setError(result.error.issues[0].message);
              field.current?.focus();
              return;
            }
            setError("");
            setOpen(true);
          }}
        >
          Annuler la facture
        </Button>
        <ClinicalConfirmation
          open={open}
          title="Annuler cette facture ?"
          description={`La facture ${number} restera dans l’historique avec son motif d’annulation. Elle sera exclue du reste à encaisser.`}
          confirmLabel="Confirmer l’annulation"
          busy={busy}
          error={error}
          onOpenChange={setOpen}
          onConfirm={() => {
            void confirm();
          }}
        />
      </CardContent>
    </Card>
  );
}
