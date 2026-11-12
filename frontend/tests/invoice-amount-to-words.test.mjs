import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { amountToFrenchWords, invoiceAmountSentence, MAX_INVOICE_TOTAL_MINOR } from "../src/lib/billing/amount-to-words.ts";

test("French invoice amounts keep the established singular, plural and centime wording", () => {
  for (const [amount, words] of [
    [0, "zéro dirham"],
    [1n, "zéro dirham et un centime"],
    ["50", "zéro dirham et cinquante centimes"],
    ["100", "un dirham"],
    ["101", "un dirham et un centime"],
    ["102", "un dirham et deux centimes"],
    ["2100", "vingt et un dirhams"],
    ["7100", "soixante et onze dirhams"],
    ["8000", "quatre-vingts dirhams"],
    ["8100", "quatre-vingt-un dirhams"],
    ["9050", "quatre-vingt-dix dirhams et cinquante centimes"],
    ["10050", "cent dirhams et cinquante centimes"],
    ["120000", "mille deux cents dirhams"],
    ["20000000", "deux cent mille dirhams"],
    ["8000000", "quatre-vingt mille dirhams"],
  ]) assert.equal(amountToFrenchWords(amount), words);
  assert.equal(invoiceAmountSentence("10050"), "Arrêtée la présente facture à la somme de cent dirhams et cinquante centimes.");
});

test("million and milliard are scale nouns, including the terminal de before the currency", () => {
  for (const [amount, words] of [
    ["100000000", "un million de dirhams"],
    ["100000001", "un million de dirhams et un centime"],
    ["100000100", "un million un dirhams"],
    ["20000000000", "deux cents millions de dirhams"],
    ["8000000000", "quatre-vingts millions de dirhams"],
    ["100000000000", "un milliard de dirhams"],
    ["100000000000000", "mille milliards de dirhams"],
    ["100000000000000000", "un million de milliards de dirhams"],
  ]) assert.equal(amountToFrenchWords(amount), words);
});

test("the maximum 250-line invoice and adjacent centimes stay exact above the safe integer range", () => {
  assert.equal(MAX_INVOICE_TOTAL_MINOR, 2_251_799_813_685_247_750n);
  const whole = "vingt-deux millions cinq cent dix-sept mille neuf cent quatre-vingt-dix-huit milliards "
    + "cent trente-six millions huit cent cinquante-deux mille quatre cent soixante-dix-sept dirhams";
  assert.equal(amountToFrenchWords(MAX_INVOICE_TOTAL_MINOR), whole + " et cinquante centimes");
  assert.equal(amountToFrenchWords(MAX_INVOICE_TOTAL_MINOR.toString()), whole + " et cinquante centimes");
  assert.equal(amountToFrenchWords(MAX_INVOICE_TOTAL_MINOR - 1n), whole + " et quarante-neuf centimes");
  assert.equal(amountToFrenchWords(MAX_INVOICE_TOTAL_MINOR - 49n), whole + " et un centime");
  assert.equal(amountToFrenchWords(MAX_INVOICE_TOTAL_MINOR - 50n), whole);
  assert.equal(amountToFrenchWords(MAX_INVOICE_TOTAL_MINOR - 51n), whole.replace("soixante-dix-sept dirhams", "soixante-seize dirhams") + " et quatre-vingt-dix-neuf centimes");
});

test("unsafe numbers, noncanonical strings and out-of-range amounts are refused", () => {
  for (const value of [NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, "", "01", " 1", "1\n", "+1",
    "-0", "1.00", "1,00", "1e2", "1 000", "١", {}, null, undefined]) {
    assert.throws(() => amountToFrenchWords(value), TypeError);
  }
  for (const value of [-1, -1n, MAX_INVOICE_TOTAL_MINOR + 1n, (MAX_INVOICE_TOTAL_MINOR + 1n).toString()]) {
    assert.throws(() => amountToFrenchWords(value), RangeError);
  }
});


test("French wording matches the shared backend PDF golden cases", () => {
  const fixture = new URL("../../backend/src/test/resources/invoice-amount-golden.json", import.meta.url);
  const cases = JSON.parse(readFileSync(fixture, "utf8"));
  for (const { minor, words } of cases) assert.equal(amountToFrenchWords(minor), words);
});
