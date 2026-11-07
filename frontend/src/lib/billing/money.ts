export class BillingError extends Error {
  constructor(
    message: string,
    public readonly field?: "patientId" | "consultationId" | "amountMinor",
  ) {
    super(message);
    this.name = "BillingError";
  }
}
export function safeMinor(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new BillingError(
      "Le montant dépasse la limite de calcul prise en charge.",
    );
  return Number(value);
}
export function requireMinor(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new BillingError(
      "Le montant doit être un entier positif ou nul en centimes.",
    );
  return value;
}
/** Exact parsing. No decimal rounding, exponent, or thousands separator. */
export function parseMinor(text: string): number {
  const value = text.trim();
  if (!/^\d{1,14}(?:[.,]\d{1,2})?$/.test(value))
    throw new BillingError(
      "Saisissez un montant positif ou nul avec deux décimales au maximum, sans séparateur de milliers.",
    );
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  return safeMinor(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
}
export function minorInput(value: number): string {
  const amount = BigInt(requireMinor(value));
  return `${amount / 100n},${String(amount % 100n).padStart(2, "0")}`;
}
const integerFormat = new Intl.NumberFormat("fr-MA", {
  maximumFractionDigits: 0,
});
export function formatMinor(value: number): string {
  const amount = BigInt(requireMinor(value));
  return `${integerFormat.format(amount / 100n)},${String(amount % 100n).padStart(2, "0")} DH`;
}
export function lineTotal(quantity: number, unitPriceMinor: number): number {
  if (!Number.isSafeInteger(quantity) || quantity <= 0)
    throw new BillingError(
      "La quantité doit être un entier strictement positif.",
    );
  return safeMinor(BigInt(quantity) * BigInt(requireMinor(unitPriceMinor)));
}
export function sumMinor(values: readonly number[]): number {
  return safeMinor(
    values.reduce((sum, value) => sum + BigInt(requireMinor(value)), 0n),
  );
}
