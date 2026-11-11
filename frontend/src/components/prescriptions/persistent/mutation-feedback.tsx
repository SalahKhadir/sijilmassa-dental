"use client";
import { ClinicalConfirmation } from "@/components/consultations/clinical-confirmation";
import type { PrescriptionMutationState } from "@/lib/prescriptions/api/mutation";
export function PrescriptionMutationFeedback({ state, allowed }: { state: PrescriptionMutationState; allowed: boolean }) {
  if (!allowed) return null;
  return <div aria-busy={state.pending} aria-live="polite" aria-atomic="true">
    {state.pending && <p role="status">Enregistrement en cours…</p>}
    {state.completed && <p role="status">Ordonnance enregistrée.</p>}
    {state.error && <p role="alert">{state.error.message}</p>}
    {state.blocked && <p>Relisez les données du serveur avant toute nouvelle tentative. Le rechargement doit être confirmé pour remplacer vos saisies.</p>}
  </div>;
}
export function PrescriptionActionConfirmation({ allowed, ...props }: React.ComponentProps<typeof ClinicalConfirmation> & { allowed: boolean }) {
  if (!allowed) return null;
  return <ClinicalConfirmation {...props} />;
}
