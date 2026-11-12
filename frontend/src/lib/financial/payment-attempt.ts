import { FinancialApiError } from "./client";
import type { PaymentMethod, RecordPayment } from "./schemas";

export type PaymentAttempt = {
  patientId: string;
  chargeId: string;
  body: Readonly<RecordPayment>;
  phase: "pending" | "uncertain";
};

export function paymentIntent(version: number, amountMinor: number, method: PaymentMethod): Readonly<RecordPayment> {
  return Object.freeze({
    expectedChargeVersion: version, amountMinor, method,
    operationId: crypto.randomUUID(), paidAt: new Date().toISOString(),
  });
}

/** A single unresolved payment per authenticated cabinet view, held in memory. */
export function createPaymentAttempts() {
  let attempt: PaymentAttempt | undefined;
  const listeners = new Set<() => void>();
  function publish(next?: PaymentAttempt) {
    attempt = next;
    listeners.forEach(listener => listener());
  }
  return {
    snapshot: () => attempt,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    begin(patientId: string, chargeId: string, newBody?: Readonly<RecordPayment>) {
      if (attempt) {
        if (newBody || attempt.phase !== "uncertain" || attempt.patientId !== patientId || attempt.chargeId !== chargeId) return;
        const replay: PaymentAttempt = { ...attempt, phase: "pending" };
        publish(replay);
        return replay;
      }
      if (!newBody) return;
      const next: PaymentAttempt = { patientId, chargeId, body: newBody, phase: "pending" };
      publish(next);
      return next;
    },
    finish(current: PaymentAttempt, error?: FinancialApiError, replay = false) {
      if (attempt !== current) return;
      if (error && (error.status >= 500 || error.status === 408 || (error.status === 409 && !error.code)
          || (replay && error.status !== 401 && error.code !== "VERSION_CONFLICT" && error.code !== "OVERPAYMENT"))) {
        publish({ ...current, phase: "uncertain" });
      } else {
        publish();
      }
    },
  };
}
