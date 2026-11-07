import type { Payment } from "@/lib/billing/types";
import { paymentMethods } from "@/lib/billing/types";
import { formatMinor } from "@/lib/billing/money";
import { formatPatientDate } from "@/lib/patients/dates";
export function PaymentHistory({ payments }: { payments: readonly Payment[] }) {
  if (!payments.length)
    return (
      <p className="py-3 text-sm text-muted-foreground">
        Aucun règlement enregistré.
      </p>
    );
  return (
    <ol className="divide-y">
      {[...payments]
        .sort(
          (a, b) =>
            a.paymentDate.localeCompare(b.paymentDate) ||
            a.id.localeCompare(b.id),
        )
        .map((payment) => (
          <li key={payment.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap justify-between gap-3 text-sm">
              <p>
                {formatPatientDate(payment.paymentDate)} ·{" "}
                {paymentMethods[payment.method]}
              </p>
              <p className="font-semibold tabular-nums">
                {formatMinor(payment.amountMinor)}
              </p>
            </div>
            {payment.reference && (
              <p className="text-xs break-words text-muted-foreground">
                Référence · {payment.reference}
              </p>
            )}
            {payment.notes && (
              <p className="text-sm leading-6 break-words whitespace-pre-wrap">
                {payment.notes}
              </p>
            )}
          </li>
        ))}
    </ol>
  );
}
