package ma.sijilmassa.invoice;

import java.io.IOException;
import java.math.BigInteger;
import java.text.Normalizer;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.apache.pdfbox.pdmodel.font.PDFont;

import static ma.sijilmassa.invoice.InvoicePdfFailure.Code.INVOICE_PDF_LAYOUT_OVERFLOW;
import static ma.sijilmassa.invoice.InvoicePdfFailure.Code.INVOICE_PDF_UNSUPPORTED_TEXT;

/** All positions are PDF points from the bottom left of the portrait page. */
final class InvoicePdfLayout {
    static final float WIDTH = 419.5276f;
    static final float HEIGHT = 595.2756f;
    static final float LEFT = 28;
    static final float RIGHT = 391.5f;
    static final float HEADER_HEIGHT = 18;
    static final float BODY_SIZE = 8.5f;
    static final float LEADING = 10.5f;
    static final float PATIENT_BASELINE = 392;
    static final float PATIENT_LEADING = 11;
    static final float WORDS_LEADING = 11.5f;
    static final float SUMMARY_X = 192;
    private static final float TABLE_TOP = 370;
    private static final float MIN_TABLE_BOTTOM = 175;
    private static final float MIN_WORDS_BASELINE = 118;
    private static final float WORDS_OFFSET = 59;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/uuuu", Locale.FRANCE);
    private static final Pattern THOUSANDS = Pattern.compile("\\B(?=(\\d{3})+(?!\\d))");
    private static final Pattern TOKENS = Pattern.compile(" +|[^ ]+");
    static final List<Column> COLUMNS = List.of(
            new Column("DATE", LEFT, 88), new Column("DENTS", 88, 126),
            new Column("DESCRIPTION", 126, 315.5f), new Column("PRIX", 315.5f, RIGHT));
    static final List<String> SUMMARY_LABELS = List.of("TOTAL", "MONTANT REÇU", "RESTE À PAYER");

    record Column(String label, float left, float right) { float width() { return right - left; } }
    record Row(List<List<String>> cells, float top, float bottom) { }
    record Plan(String title, String date, List<String> patient, float nameX, float tableTop, float tableBottom,
            List<Row> rows, List<String> totals, List<String> words) { }

    private InvoicePdfLayout() { }

    static Plan plan(InvoiceDocument source, PDFont regular, PDFont bold) throws IOException {
        String title = "FACTURE Nº : " + source.number();
        if (width(bold, title, 14.5f) > RIGHT - LEFT) throw overflow();
        float nameX = LEFT + width(bold, "Patient : ", BODY_SIZE);
        var patient = wrap(source.firstName() + " " + source.lastName(), regular, RIGHT - nameX, BODY_SIZE);
        float top = Math.min(TABLE_TOP, PATIENT_BASELINE - (patient.size() - 1) * PATIENT_LEADING - 12);
        var balance = source.balance();
        var totals = List.of(money(balance.totalMinor()), money(balance.receivedMinor()), money(balance.remainingMinor()));
        for (int i = 0; i < totals.size(); i++) {
            float size = i == 2 ? 9.5f : 9;
            float labelWidth = width(bold, SUMMARY_LABELS.get(i), size);
            if (labelWidth + 8 + width(i == 1 ? regular : bold, totals.get(i), size) > RIGHT - SUMMARY_X) throw overflow();
        }
        var words = wrap("Arrêtée la présente facture à la somme de " + InvoiceAmountWords.format(balance.totalMinor()) + ".",
                regular, RIGHT - LEFT, BODY_SIZE);
        float floor = Math.max(MIN_TABLE_BOTTOM, MIN_WORDS_BASELINE + WORDS_OFFSET + (words.size() - 1) * WORDS_LEADING);
        float y = top - HEADER_HEIGHT;
        var rows = new ArrayList<Row>();
        for (var line : source.lines()) {
            var cells = List.of(
                    wrap(DATE.format(line.date()), regular, COLUMNS.get(0).width() - 10, BODY_SIZE),
                    wrap(line.toothReference() == null ? "" : line.toothReference(), regular, COLUMNS.get(1).width() - 8, BODY_SIZE),
                    wrap(line.description(), regular, COLUMNS.get(2).width() - 10, BODY_SIZE),
                    wrap(money(BigInteger.valueOf(line.priceMinor())), regular, COLUMNS.get(3).width() - 10, BODY_SIZE));
            int height = cells.stream().mapToInt(List::size).max().orElseThrow();
            float bottom = y - Math.max(18, 8 + LEADING * height);
            if (bottom < floor) throw overflow();
            rows.add(new Row(cells, y, bottom));
            y = bottom;
        }
        return new Plan(title, "Témara, le : " + DATE.format(source.date()), patient, nameX, top, y,
                List.copyOf(rows), totals, words);
    }

    private static String money(BigInteger minor) {
        var parts = minor.divideAndRemainder(BigInteger.valueOf(100));
        return THOUSANDS.matcher(parts[0].toString()).replaceAll(" ") + "," + (parts[1].intValueExact() < 10 ? "0" : "")
                + parts[1] + " DH";
    }

    static float width(PDFont font, String text, float size) throws IOException {
        try {
            return font.getStringWidth(text) * size / 1000;
        } catch (IllegalArgumentException failure) {
            throw new InvoicePdfFailure(INVOICE_PDF_UNSUPPORTED_TEXT);
        }
    }

    private static List<String> wrap(String input, PDFont font, float maxWidth, float size) throws IOException {
        String text = Normalizer.normalize(input, Normalizer.Form.NFC);
        if (text.codePoints().anyMatch(InvoicePdfLayout::unsupported)) throw new InvoicePdfFailure(INVOICE_PDF_UNSUPPORTED_TEXT);
        var lines = new ArrayList<String>();
        for (String paragraph : text.split("\\R", -1)) {
            String line = "";
            var tokens = TOKENS.matcher(paragraph);
            while (tokens.find()) {
                String token = tokens.group();
                if (width(font, line + token, size) <= maxWidth) {
                    line += token;
                    continue;
                }
                if (!line.isBlank()) lines.add(line.stripTrailing());
                line = "";
                if (token.isBlank()) continue;
                for (int index = 0; index < token.length();) {
                    int cp = token.codePointAt(index);
                    String glyph = Character.toString(cp);
                    if (width(font, glyph, size) > maxWidth) throw overflow();
                    if (width(font, line + glyph, size) > maxWidth) {
                        lines.add(line);
                        line = "";
                    }
                    line += glyph;
                    index += Character.charCount(cp);
                }
            }
            lines.add(line.stripTrailing());
        }
        return List.copyOf(lines);
    }

    private static boolean unsupported(int cp) {
        if (cp == '\r' || cp == '\n') return false;
        return Character.isISOControl(cp) || Character.getType(cp) == Character.FORMAT
                || Character.getType(cp) == Character.NON_SPACING_MARK
                || Character.getDirectionality(cp) == Character.DIRECTIONALITY_RIGHT_TO_LEFT
                || Character.getDirectionality(cp) == Character.DIRECTIONALITY_RIGHT_TO_LEFT_ARABIC;
    }

    private static InvoicePdfFailure overflow() { return new InvoicePdfFailure(INVOICE_PDF_LAYOUT_OVERFLOW); }
}
