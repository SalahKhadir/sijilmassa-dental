import { PrescriptionApiError } from "./client";
import { prescriptionVersionSchema, type PersistentPrescription } from "./schemas";

export type PrescriptionMutationState = { pending: boolean; blocked: boolean; completed: boolean; version?: number; error?: PrescriptionApiError };
/** Per-form memory only. Never stores a clinical response, payload, or globally shared cache. */
export function createPrescriptionMutation(version: number | undefined, allowed: boolean) {
  if (version !== undefined && !prescriptionVersionSchema.safeParse(version).success) throw new PrescriptionApiError(400);
  let state: PrescriptionMutationState = { pending: false, blocked: false, completed: false, version };
  const listeners = new Set<() => void>();
  const publish = (next: PrescriptionMutationState) => { state = next; listeners.forEach(listener => listener()); };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setAllowed(value: boolean) { allowed = value; },
    async submit(operation: (expectedVersion: number | undefined) => Promise<PersistentPrescription>) {
      if (!allowed) { publish({ ...state, error: new PrescriptionApiError(403) }); return; }
      if (state.pending || state.blocked || state.completed) return;
      publish({ ...state, pending: true, error: undefined });
      try {
        const result = await operation(state.version);
        if (!allowed) throw new PrescriptionApiError(403);
        publish({ ...state, pending: false, completed: true });
        return result;
      } catch (error) {
        const safe = error instanceof PrescriptionApiError ? error : new PrescriptionApiError(503);
        publish({ ...state, pending: false, error: safe, blocked: [401, 403, 409].includes(safe.status) || safe.status >= 500 });
      }
    },
    /** Only an explicit confirmed reload may replace the original expected version. */
    acceptReload(nextVersion: number | undefined, confirmed: boolean) {
      if (!confirmed || state.pending) return false;
      if (nextVersion !== undefined && !prescriptionVersionSchema.safeParse(nextVersion).success) throw new PrescriptionApiError(400);
      publish({ pending: false, blocked: false, completed: false, version: nextVersion }); return true;
    },
  };
}
