import { z } from "zod";
import { financialId } from "../financial/schemas";
import { isCalendarDate } from "../patients/dates";

const currency = z.literal("MAD");
const version = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const date = z.string().refine(value => !value.startsWith("0000") && isCalendarDate(value));
const instant = z.iso.datetime().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/);
const invoiceNumber = z.string().regex(/^\d{4}-\d{3,19}$/);
const money = z.string().regex(/^(?:0|[1-9]\d{0,19})$/);
const settlement = z.enum(["DUE", "PARTIAL", "SETTLED"]);
const balance = z.strictObject({ totalMinor: money, receivedMinor: money, remainingMinor: money }).refine(value => {
  if (!Object.values(value).every(item => money.safeParse(item).success)) return false;
  return BigInt(value.receivedMinor) + BigInt(value.remainingMinor) === BigInt(value.totalMinor);
});
const draftFinancial = z.strictObject({ balance, settlement: z.null() });
const issuedFinancial = z.strictObject({ balance, settlement }).refine(value =>
  value.settlement === (value.balance.remainingMinor === "0" ? "SETTLED" : value.balance.receivedMinor === "0" ? "DUE" : "PARTIAL"));
const identity = z.strictObject({ reference: z.string().min(1), firstName: z.string().min(1), lastName: z.string().min(1) });
const charge = z.strictObject({ chargeId: financialId, treatmentDate: date, treatmentLabel: z.string().min(1).max(1000), priceMinor: version });
const issuedLine = charge.extend({
  receivedAtIssueMinor: version,
  toothReference: z.string().min(1).max(50).nullable().optional(),
}).refine(line => line.receivedAtIssueMinor <= line.priceMinor);
const detailFields = { invoiceId: financialId, patientId: financialId, version, currency, createdAt: instant, updatedAt: instant };
const draft = z.strictObject({ ...detailFields, lifecycle: z.literal("BROUILLON"),
  draft: z.strictObject({ billingIdentity: identity, lines: z.array(charge).max(250) }),
  issuanceSnapshot: z.null(), currentFinancialState: draftFinancial });
const issued = z.strictObject({ ...detailFields, lifecycle: z.literal("EMISE"), draft: z.null(),
  issuanceSnapshot: z.strictObject({ invoiceNumber, issueDate: date, issuedAt: instant, billingIdentity: identity,
    lines: z.array(issuedLine).min(1).max(250), balanceAtIssue: balance }),
  currentFinancialState: issuedFinancial });

const uniqueIds = (ids: readonly string[]) => new Set(ids.map(id => id.toLowerCase())).size === ids.length;
export const sumPrices = (lines: readonly { priceMinor: number }[]) =>
  lines.reduce((sum, line) => sum + BigInt(line.priceMinor), 0n).toString();

export const invoiceDetail = z.discriminatedUnion("lifecycle", [draft, issued]).refine(value => {
  const lines = value.draft?.lines ?? value.issuanceSnapshot?.lines ?? [];
  if (lines.some(line => !version.safeParse(line.priceMinor).success)) return false;
  const total = sumPrices(lines);
  if (!uniqueIds(lines.map(line => line.chargeId)) || total !== value.currentFinancialState.balance.totalMinor) return false;
  if (value.lifecycle === "BROUILLON") return true;
  const snapshot = value.issuanceSnapshot;
  if (snapshot.lines.some(line => !version.safeParse(line.receivedAtIssueMinor).success)) return false;
  const received = snapshot.lines.reduce((sum, line) => sum + BigInt(line.receivedAtIssueMinor), 0n).toString();
  return snapshot.balanceAtIssue.totalMinor === total && snapshot.balanceAtIssue.receivedMinor === received
    && money.safeParse(value.currentFinancialState.balance.receivedMinor).success
    && BigInt(value.currentFinancialState.balance.receivedMinor) >= BigInt(received);
});
const historyFields = { invoiceId: financialId, createdAt: instant };
const historyItem = z.discriminatedUnion("lifecycle", [
  z.strictObject({ ...historyFields, lifecycle: z.literal("BROUILLON"), invoiceNumber: z.null(), issueDate: z.null(),
    issuedAt: z.null(), currentFinancialState: draftFinancial }),
  z.strictObject({ ...historyFields, lifecycle: z.literal("EMISE"), invoiceNumber, issueDate: date,
    issuedAt: instant, currentFinancialState: issuedFinancial }),
]);
export const historyCursor = z.strictObject({ afterCreatedAt: instant, afterInvoiceId: financialId });
export const eligibleCursor = z.strictObject({ afterDate: date, afterChargeId: financialId });
export const historyPage = z.strictObject({ currency, items: z.array(historyItem).max(50), nextCursor: historyCursor.nullable() });
export const eligiblePage = z.strictObject({ currency, items: z.array(charge).max(50), nextCursor: eligibleCursor.nullable() });
const chargeIds = z.array(financialId).max(250).refine(uniqueIds);
export const createDraft = z.strictObject({ patientId: financialId, chargeIds: chargeIds.refine(ids => ids.length > 0) });
export const replaceDraft = z.strictObject({ expectedVersion: version, chargeIds });
export const issueDraft = z.strictObject({ expectedVersion: version });
export const invoiceConflict = z.enum(["VERSION_CONFLICT", "CHARGE_RESERVED", "INVOICE_ISSUED", "EMPTY_DRAFT", "ARCHIVED_PATIENT"]);
export const invoiceProblem = z.object({ status: z.number().int(), code: invoiceConflict.optional() });

export type InvoiceConflict = z.infer<typeof invoiceConflict>;
export type InvoiceDetail = z.infer<typeof invoiceDetail>;
export type DraftInvoice = z.infer<typeof draft>;
export type DraftCharge = z.infer<typeof charge>;
export type InvoiceBalance = z.infer<typeof balance>;
export type HistoryCursor = z.infer<typeof historyCursor>;
export type EligibleCursor = z.infer<typeof eligibleCursor>;
