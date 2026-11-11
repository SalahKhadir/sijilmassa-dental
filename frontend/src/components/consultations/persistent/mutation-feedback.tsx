"use client";
import type { ClinicalMutationState } from "@/lib/consultations/api/mutation";

/** Consumers hide their form fields when allowed=false, not just its submit button. */
export function ClinicalMutationFeedback({ state, allowed }: { state: ClinicalMutationState; allowed: boolean }) {
  if (!allowed) return null;
  return <section aria-busy={state.pending} className="space-y-2">
    {state.pending && <p role="status" aria-live="polite">Enregistrement en cours…</p>}
    {state.error && <p role="alert">{state.error.message}</p>}
    {state.blocked && <p>Vos saisies sont conservées. Vérifiez le dossier, puis confirmez explicitement son rechargement avant de soumettre à nouveau.</p>}
    {state.completed && <p role="status" aria-live="polite">Enregistrement confirmé.</p>}
  </section>;
}
