package ma.sijilmassa.invoice;

import java.math.BigInteger;
import java.time.LocalDate;
import java.util.List;
import java.util.regex.Pattern;

import static ma.sijilmassa.finance.FinancialModels.MAX_MINOR;
import static ma.sijilmassa.invoice.InvoiceModels.Balance;
import static ma.sijilmassa.invoice.InvoicePdfFailure.Code.INVOICE_PDF_INTEGRITY;

/** Frozen billing fields only. V10 stores the amounts per line, so the document totals are derived here. */
record InvoiceDocument(String number, LocalDate date, String firstName, String lastName, List<Line> lines) {
    static final int MAX_LINES = 250;
    private static final Pattern NUMBER = Pattern.compile("[0-9]{4}-[0-9]{3,19}");

    record Line(LocalDate date, String toothReference, String description, Long priceMinor, Long receivedMinor) {
        Line {
            if (!validDate(date) || !text(description, 1000) || (toothReference != null && !text(toothReference, 50))
                    || priceMinor == null || receivedMinor == null || priceMinor < 0 || priceMinor > MAX_MINOR
                    || receivedMinor < 0 || receivedMinor > priceMinor) {
                throw new InvoicePdfFailure(INVOICE_PDF_INTEGRITY);
            }
        }
        @Override public String toString() { return "Invoice PDF line [withheld]"; }
    }

    InvoiceDocument {
        if (number == null || !NUMBER.matcher(number).matches() || !validDate(date)
                || !number.startsWith(String.format(java.util.Locale.ROOT, "%04d-", date.getYear()))
                || !text(firstName, 80) || !text(lastName, 80) || lines == null || lines.isEmpty()
                || lines.size() > MAX_LINES || lines.stream().anyMatch(java.util.Objects::isNull)) {
            throw new InvoicePdfFailure(INVOICE_PDF_INTEGRITY);
        }
        lines = List.copyOf(lines);
    }

    Balance balance() {
        BigInteger total = BigInteger.ZERO;
        BigInteger received = BigInteger.ZERO;
        for (var line : lines) {
            total = total.add(BigInteger.valueOf(line.priceMinor()));
            received = received.add(BigInteger.valueOf(line.receivedMinor()));
        }
        return new Balance(total, received, total.subtract(received));
    }

    String filename() { return "facture-" + number + ".pdf"; }
    @Override public String toString() { return "Invoice PDF document [withheld]"; }

    private static boolean validDate(LocalDate date) {
        return date != null && date.getYear() >= 1 && date.getYear() <= 9999;
    }

    private static boolean text(String value, int max) {
        return value != null && !value.isBlank() && value.codePointCount(0, value.length()) <= max;
    }
}
