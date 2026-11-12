package ma.sijilmassa.patient.dossier;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

/** Draws in points measured down from the top of the visible page. */
final class DossierPage implements AutoCloseable {
    private final PDPageContentStream stream;
    private final PDFont font;
    private final float top;

    DossierPage(PDDocument document, PDPage page, PDFont font) throws IOException {
        this.font = font;
        top = page.getCropBox().getUpperRightY();
        stream = new PDPageContentStream(document, page, PDPageContentStream.AppendMode.APPEND, true, true);
    }

    float width(String value, float size) throws IOException {
        try {
            return font.getStringWidth(value) * size / 1000;
        } catch (IllegalArgumentException exception) {
            throw new DossierFailure(DossierFailure.Reason.UNSUPPORTED_TEXT);
        }
    }

    List<String> wrap(String input, float maxWidth, float size) throws IOException {
        // Preserve paragraph breaks. The embedded font is used for left-to-right Latin text.
        if (input.codePoints().anyMatch(cp -> !Character.isWhitespace(cp)
                && (Character.isISOControl(cp) || Character.getType(cp) == Character.FORMAT
                || Character.getDirectionality(cp) == Character.DIRECTIONALITY_RIGHT_TO_LEFT
                || Character.getDirectionality(cp) == Character.DIRECTIONALITY_RIGHT_TO_LEFT_ARABIC
                || Character.getType(cp) == Character.NON_SPACING_MARK))) {
            throw new DossierFailure(DossierFailure.Reason.UNSUPPORTED_TEXT);
        }
        var lines = new ArrayList<String>();
        for (String paragraph : input.strip().split("\\R", -1)) {
            String line = "";
            for (String word : paragraph.strip().split("(?U)\\s+")) {
                if (word.isEmpty()) continue;
                String joined = line.isEmpty() ? word : line + " " + word;
                if (width(joined, size) <= maxWidth) {
                    line = joined;
                    continue;
                }
                if (!line.isEmpty()) lines.add(line);
                line = "";
                for (int i = 0; i < word.length();) {
                    int cp = word.codePointAt(i);
                    String glyph = Character.toString(cp);
                    String next = line + glyph;
                    if (width(next, size) > maxWidth) {
                        if (line.isEmpty()) throw new DossierFailure(DossierFailure.Reason.DOSSIER_LIMIT);
                        lines.add(line);
                        line = glyph;
                    } else {
                        line = next;
                    }
                    i += Character.charCount(cp);
                }
            }
            lines.add(line);
        }
        return lines;
    }

    void text(String value, float x, float baseline, float size) throws IOException {
        if (value.isEmpty()) return;
        stream.beginText();
        stream.setFont(font, size);
        stream.newLineAtOffset(x, top - baseline);
        stream.showText(value);
        stream.endText();
    }

    void right(String value, float x, float baseline, float size) throws IOException {
        text(value, x - width(value, size), baseline, size);
    }

    void rule(float left, float right, float y) throws IOException {
        stream.setStrokingColor(0.64f);
        stream.setLineWidth(0.35f);
        stream.moveTo(left, top - y);
        stream.lineTo(right, top - y);
        stream.stroke();
    }

    void tick(float left, float y) throws IOException {
        stream.setStrokingColor(0f);
        stream.setLineWidth(1.3f);
        stream.moveTo(left + 2.3f, top - y - 6);
        stream.lineTo(left + 5, top - y - 9);
        stream.lineTo(left + 10.5f, top - y - 3);
        stream.stroke();
    }

    @Override public void close() throws IOException { stream.close(); }
}
