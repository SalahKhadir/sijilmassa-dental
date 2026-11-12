export function parseMad(input: string): number | undefined {
  const match = /^([0-9]{1,14})(?:[,.]([0-9]{1,2}))?$/.exec(input.trim());
  if (!match) return undefined;
  const minor = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : undefined;
}

const dirhams = new Intl.NumberFormat("fr-MA");
export function formatMad(minor: number | string): string {
  const value = BigInt(minor);
  return `${dirhams.format(value / 100n)},${String(value % 100n).padStart(2, "0")}\u00a0DH`;
}

export function validPaymentAmount(amount: number | undefined, remaining: number): amount is number {
  return amount !== undefined && Number.isSafeInteger(amount) && amount > 0 && amount <= remaining;
}
