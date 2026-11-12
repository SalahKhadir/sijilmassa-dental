/**
 * Converts numbers and monetary amounts into grammatically correct French words.
 * Follows standard French cardinal spelling rules (invariable mille, plural cents/vingts
 * when terminal and unhyphenated, hyphenated tens and units, etc.).
 */

const UNITS = [
  "",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
] as const;

const TEENS = [
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
  "dix-sept",
  "dix-huit",
  "dix-neuf",
] as const;

const TENS = [
  "",
  "dix",
  "vingt",
  "trente",
  "quarante",
  "cinquante",
  "soixante",
  "soixante",
  "quatre-vingt",
  "quatre-vingt",
] as const;

function under100(val: number, beforeMille: boolean): string {
  if (val < 10) return UNITS[val];
  if (val < 20) return TEENS[val - 10];
  const tens = Math.floor(val / 10);
  const units = val % 10;

  if (tens === 7) {
    if (units === 1) return "soixante et onze";
    return `soixante-${TEENS[units]}`;
  }
  if (tens === 8) {
    if (units === 0) return beforeMille ? "quatre-vingt" : "quatre-vingts";
    return `quatre-vingt-${UNITS[units]}`;
  }
  if (tens === 9) {
    return `quatre-vingt-${TEENS[units]}`;
  }
  if (units === 1) return `${TENS[tens]} et un`;
  if (units === 0) return TENS[tens];
  return `${TENS[tens]}-${UNITS[units]}`;
}

function under1000(val: number, beforeMille: boolean): string {
  if (val < 100) return under100(val, beforeMille);
  const hundreds = Math.floor(val / 100);
  const remainder = val % 100;
  let hStr = "";

  if (hundreds === 1) {
    hStr = "cent";
  } else if (remainder === 0 && !beforeMille) {
    hStr = `${UNITS[hundreds]} cents`;
  } else {
    hStr = `${UNITS[hundreds]} cent`;
  }

  if (remainder > 0) {
    return `${hStr} ${under100(remainder, beforeMille)}`;
  }
  return hStr;
}

// V10 allows 250 lines, each priced up to 9,007,199,254,740,991 centimes.
export const MAX_INVOICE_TOTAL_MINOR = 250n * 9_007_199_254_740_991n;
const MILLION = 1_000_000n;
const SCALES = [
  { value: 1_000_000_000n, name: "milliard" },
  { value: MILLION, name: "million" },
  { value: 1_000n, name: "mille" },
] as const;

function endsInScaleNoun(value: bigint) {
  return value >= MILLION && value % MILLION === 0n;
}

function spellInteger(value: bigint, beforeMille = false): string {
  for (const scale of SCALES) {
    if (value < scale.value) continue;
    const count = value / scale.value;
    const remainder = value % scale.value;
    const isMille = scale.name === "mille";
    const head = isMille && count === 1n
      ? "mille"
      : `${spellInteger(count, isMille)}${endsInScaleNoun(count) ? " de " : " "}${scale.name}${!isMille && count > 1n ? "s" : ""}`;
    return remainder === 0n ? head : `${head} ${spellInteger(remainder, beforeMille)}`;
  }
  // Only a group of at most three digits reaches the existing spelling rules.
  return value === 0n ? "zéro" : under1000(Number(value), beforeMille);
}

function exactInteger(value: number | bigint): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  throw new TypeError("Utilisez un entier exact.");
}

export function integerToFrenchWords(value: number | bigint): string {
  const integer = exactInteger(value);
  if (integer < 0n) return `moins ${spellInteger(-integer)}`;
  return spellInteger(integer);
}

/** Accepts exact centimes, including the canonical decimal string from the invoice API. */
export function amountToFrenchWords(minor: number | bigint | string): string {
  if (typeof minor === "string" && !/^(?:0|[1-9][0-9]{0,18})$/.test(minor)) {
    throw new TypeError("Utilisez une chaîne entière de centimes sans signe ni séparateur.");
  }
  const amount = typeof minor === "string" ? BigInt(minor) : exactInteger(minor);
  if (amount < 0n || amount > MAX_INVOICE_TOTAL_MINOR) {
    throw new RangeError("Le montant est hors des limites d’une facture.");
  }

  const dirhams = amount / 100n;
  const centimes = amount % 100n;
  const unit = dirhams <= 1n ? " dirham" : endsInScaleNoun(dirhams) ? " de dirhams" : " dirhams";
  const base = spellInteger(dirhams) + unit;
  if (centimes === 0n) return base;
  return `${base} et ${spellInteger(centimes)} ${centimes === 1n ? "centime" : "centimes"}`;
}

export function invoiceAmountSentence(minor: number | bigint | string): string {
  return `Arrêtée la présente facture à la somme de ${amountToFrenchWords(minor)}.`;
}
