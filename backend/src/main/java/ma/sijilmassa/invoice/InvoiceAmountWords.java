package ma.sijilmassa.invoice;

import java.math.BigInteger;

import static ma.sijilmassa.finance.FinancialModels.MAX_MINOR;

final class InvoiceAmountWords {
    static final BigInteger MAX_AMOUNT = BigInteger.valueOf(MAX_MINOR).multiply(BigInteger.valueOf(InvoiceDocument.MAX_LINES));
    private static final BigInteger CENT = BigInteger.valueOf(100);
    private static final BigInteger MILLE = BigInteger.valueOf(1_000);
    private static final BigInteger MILLION = BigInteger.valueOf(1_000_000);
    private static final BigInteger MILLIARD = BigInteger.valueOf(1_000_000_000);
    private static final String[] UNITS = {"", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"};
    private static final String[] TEENS = {"dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"};
    private static final String[] TENS = {"", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"};

    private InvoiceAmountWords() { }

    static String format(BigInteger centimes) {
        if (centimes == null || centimes.signum() < 0 || centimes.compareTo(MAX_AMOUNT) > 0) {
            throw new InvoicePdfFailure(InvoicePdfFailure.Code.INVOICE_PDF_INTEGRITY);
        }
        var parts = centimes.divideAndRemainder(CENT);
        var whole = parts[0];
        var fraction = parts[1];
        String unit = whole.compareTo(BigInteger.ONE) <= 0 ? " dirham" : (endsInScale(whole) ? " de dirhams" : " dirhams");
        String words = spell(whole, false) + unit;
        if (fraction.signum() == 0) return words;
        return words + " et " + spell(fraction, false) + (fraction.equals(BigInteger.ONE) ? " centime" : " centimes");
    }

    private static boolean endsInScale(BigInteger value) {
        return value.compareTo(MILLION) >= 0 && value.remainder(MILLION).signum() == 0;
    }

    private static String spell(BigInteger value, boolean beforeMille) {
        if (value.compareTo(MILLIARD) >= 0) return scaled(value, MILLIARD, "milliard", beforeMille);
        if (value.compareTo(MILLION) >= 0) return scaled(value, MILLION, "million", beforeMille);
        if (value.compareTo(MILLE) >= 0) return scaled(value, MILLE, "mille", beforeMille);
        return value.signum() == 0 ? "zéro" : underThousand(value.intValueExact(), beforeMille);
    }

    private static String scaled(BigInteger value, BigInteger scale, String name, boolean beforeMille) {
        var parts = value.divideAndRemainder(scale);
        var count = parts[0];
        boolean mille = scale.equals(MILLE);
        String head = name;
        if (!mille || !count.equals(BigInteger.ONE)) {
            head = spell(count, mille) + (endsInScale(count) ? " de " : " ") + name;
            if (!mille && count.compareTo(BigInteger.ONE) > 0) head += "s";
        }
        return parts[1].signum() == 0 ? head : head + " " + spell(parts[1], beforeMille);
    }

    private static String underThousand(int value, boolean beforeMille) {
        if (value < 100) return underHundred(value, beforeMille);
        int hundreds = value / 100;
        int remainder = value % 100;
        String word = hundreds == 1 ? "cent" : UNITS[hundreds] + " cent";
        if (remainder != 0) return word + " " + underHundred(remainder, beforeMille);
        return hundreds > 1 && !beforeMille ? word + "s" : word;
    }

    private static String underHundred(int value, boolean beforeMille) {
        if (value < 10) return UNITS[value];
        if (value < 20) return TEENS[value - 10];
        int tens = value / 10;
        int unit = value % 10;
        return switch (tens) {
            case 7 -> unit == 1 ? "soixante et onze" : "soixante-" + TEENS[unit];
            case 8 -> unit == 0 ? (beforeMille ? "quatre-vingt" : "quatre-vingts") : "quatre-vingt-" + UNITS[unit];
            case 9 -> "quatre-vingt-" + TEENS[unit];
            default -> TENS[tens] + switch (unit) {
                case 0 -> "";
                case 1 -> " et un";
                default -> "-" + UNITS[unit];
            };
        };
    }
}
