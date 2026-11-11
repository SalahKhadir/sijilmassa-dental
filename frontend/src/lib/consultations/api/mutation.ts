import { ClinicalApiError } from "./client";
import { clinicalVersionSchema, type PersistentConsultation } from "./schemas";

export type ClinicalMutationState = { pending: boolean; blocked: boolean; completed: boolean; version?: number; error?: ClinicalApiError };
/** Per-form memory only. Never stores a clinical response, payload, or globally shared cache. */
export function createClinicalMutation(version: number | undefined, allowed: boolean) {
  if (version !== undefined && !clinicalVersionSchema.safeParse(version).success) throw new ClinicalApiError(400);
  let state: ClinicalMutationState = { pending: false, blocked: false, completed: false, version };
  const listeners = new Set<() => void>();
  const publish = (next: ClinicalMutationState) => { state = next; listeners.forEach(listener => listener()); };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setAllowed(value: boolean) { allowed = value; },
    async submit(operation: (expectedVersion: number | undefined) => Promise<PersistentConsultation>) {
      if (!allowed) { publish({ ...state, error: new ClinicalApiError(403) }); return; }
      if (state.pending || state.blocked || state.completed) return;
      publish({ ...state, pending: true, error: undefined });
      try {
        const result = await operation(state.version);
        if (!allowed) throw new ClinicalApiError(403);
        publish({ ...state, pending: false, completed: true });
        return result;
      } catch (error) {
        const safe = error instanceof ClinicalApiError ? error : new ClinicalApiError(503);
        publish({ ...state, pending: false, error: safe, blocked: [401, 403, 409].includes(safe.status) || safe.status >= 500 });
      }
    },
    /** Only an explicit confirmed reload may replace the original expected version. */
    acceptReload(nextVersion: number | undefined, confirmed: boolean) {
      if (!confirmed || state.pending) return false;
      if (nextVersion !== undefined && !clinicalVersionSchema.safeParse(nextVersion).success) throw new ClinicalApiError(400);
      publish({ pending: false, blocked: false, completed: false, version: nextVersion }); return true;
    },
  };
}
