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

/**
 * Converts a non-negative integer into standard French words.
 */
export function integerToFrenchWords(value: number | bigint): string {
  const n = typeof value === "bigint" ? Number(value) : Math.floor(value);
  if (n === 0) return "zéro";
  if (n < 0) return `moins ${integerToFrenchWords(-n)}`;

  function formatChunks(val: number): string {
    if (val < 1000) return under1000(val, false);
    if (val < 1_000_000) {
      const thousands = Math.floor(val / 1000);
      const remainder = val % 1000;
      const tStr =
        thousands === 1 ? "mille" : `${under1000(thousands, true)} mille`;
      if (remainder > 0) {
        return `${tStr} ${under1000(remainder, false)}`;
      }
      return tStr;
    }
    const millions = Math.floor(val / 1_000_000);
    const remainder = val % 1_000_000;
    const mStr =
      millions === 1 ? "un million" : `${formatChunks(millions)} millions`;
    if (remainder > 0) {
      return `${mStr} ${formatChunks(remainder)}`;
    }
    return mStr;
  }

  return formatChunks(n);
}

/**
 * Converts an amount in minor units (centimes) into French words with dirhams and centimes.
 * Examples:
 * - 60000 -> "six cents dirhams"
 * - 60050 -> "six cents dirhams et cinquante centimes"
 * - 100 -> "un dirham"
 * - 0 -> "zéro dirham"
 */
export function amountToFrenchWords(minor: number | bigint): string {
  const amount = BigInt(minor);
  if (amount < 0n) throw new Error("Un montant négatif ne peut pas être converti en lettres.");
  const dirhams = amount / 100n;
  const centimes = Number(amount % 100n);

  let result = "";
  if (dirhams === 0n && centimes === 0) {
    return "zéro dirham";
  }

  if (dirhams === 0n) {
    result = "zéro dirham";
  } else if (dirhams === 1n) {
    result = "un dirham";
  } else {
    result = `${integerToFrenchWords(dirhams)} dirhams`;
  }

  if (centimes > 0) {
    if (centimes === 1) {
      result += " et un centime";
    } else {
      result += ` et ${integerToFrenchWords(centimes)} centimes`;
    }
  }

  return result;
}

/**
 * Formats the official legal sentence declaring the invoice total.
 * Example: "Arrêtée la présente facture à la somme de six cents dirhams."
 */
export function invoiceAmountSentence(minor: number | bigint): string {
  return `Arrêtée la présente facture à la somme de ${amountToFrenchWords(minor)}.`;
}
