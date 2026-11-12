import { z } from "zod";
import { isCalendarDate } from "../patients/dates";

export const financialId = z.string().regex(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i);
const minor = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const date = z.string().refine(value => !value.startsWith("0000") && isCalendarDate(value));
const instant = z.iso.datetime().regex(/^[0-9]{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/)
  .refine(value => !value.startsWith("0000"));
export const paymentMethod = z.enum(["ESPECES", "CARTE", "VIREMENT", "CHEQUE", "AUTRE"]);
const currency = z.literal("MAD");
const row = { date, treatmentLabel: z.string().min(1).max(1000), priceMinor: minor, receivedMinor: minor, remainingMinor: minor };
type Balance = { priceMinor: number; receivedMinor: number; remainingMinor: number };
const balanced = (value: Balance) => value.priceMinor - value.receivedMinor === value.remainingMinor;
export const charge = z.strictObject({ ...row, chargeId: financialId, currency, version: minor,
  settlement: z.enum(["DUE", "PARTIAL", "SETTLED"]) }).refine(value => balanced(value) &&
  value.settlement === (value.remainingMinor === 0 ? "SETTLED" : value.receivedMinor === 0 ? "DUE" : "PARTIAL"));
const payment = z.strictObject({ id: financialId, amountMinor: minor.positive(), paidAt: instant, method: paymentMethod, recordedAt: instant });
const integerText = z.string().regex(/^(?:0|[1-9]\d{0,39})$/);
const totals = z.strictObject({ currency, chargesMinor: integerText, receivedMinor: integerText, outstandingMinor: integerText })
  .refine(value => {
    // Zod refinements can run after a regex failure.
    if (![value.chargesMinor, value.receivedMinor, value.outstandingMinor].every(v => integerText.safeParse(v).success)) return false;
    return BigInt(value.chargesMinor) - BigInt(value.receivedMinor) === BigInt(value.outstandingMinor);
  });
export const chargeCursor = z.strictObject({ date, chargeId: financialId });
export const paymentCursor = z.strictObject({ paidAt: instant, paymentId: financialId });
export const summary = z.strictObject({ items: z.array(charge).max(50), nextCursor: chargeCursor.nullable(), totals });
export const verso = z.strictObject({ items: z.array(z.strictObject(row).refine(balanced)).max(50), nextCursor: chargeCursor.nullable(), totals });
export const payments = z.strictObject({ items: z.array(payment).max(50), nextCursor: paymentCursor.nullable() });
export const receipt = z.strictObject({ payment, charge });
const treatmentPricing = z.discriminatedUnion("state", [
  z.strictObject({ treatmentId: financialId, state: z.literal("PRICED"), chargeId: financialId, priceMinor: minor }),
  z.strictObject({ treatmentId: financialId, state: z.literal("UNPRICED"), chargeId: z.null(), priceMinor: z.null() }),
]);
export const consultationPricing = z.strictObject({
  patientId: financialId, consultationId: financialId, consultationVersion: minor, items: z.array(treatmentPricing).max(50),
}).refine(value => {
  const treatments = new Set(value.items.map(item => item.treatmentId.toLowerCase()));
  const charges = value.items.flatMap(item => item.state === "PRICED" ? [item.chargeId.toLowerCase()] : []);
  return treatments.size === value.items.length && new Set(charges).size === charges.length;
});
export type TreatmentPricing = z.infer<typeof treatmentPricing>;

export const createCharge = z.strictObject({ patientId: financialId, consultationId: financialId, treatmentId: financialId,
  expectedConsultationVersion: minor, priceMinor: minor });
export const recordPayment = z.strictObject({ expectedChargeVersion: minor, operationId: financialId, amountMinor: minor.positive(), paidAt: instant, method: paymentMethod });
export const financialConflict = z.enum(["VERSION_CONFLICT", "OVERPAYMENT", "OPERATION_CONFLICT", "DUPLICATE_CHARGE",
  "ARCHIVED_PATIENT", "CONSULTATION_FINALIZED", "INELIGIBLE_TREATMENT"]);
export const financialProblem = z.object({ status: z.number().int(), code: financialConflict.optional() });

export type Charge = z.infer<typeof charge>;
export type ChargeCursor = z.infer<typeof chargeCursor>;
export type PaymentCursor = z.infer<typeof paymentCursor>;
export type Summary = z.infer<typeof summary>;
export type Verso = z.infer<typeof verso>;
export type PaymentPage = z.infer<typeof payments>;
export type CreateCharge = z.infer<typeof createCharge>;
export type RecordPayment = z.infer<typeof recordPayment>;
export type PaymentMethod = z.infer<typeof paymentMethod>;
export type FinancialConflict = z.infer<typeof financialConflict>;
