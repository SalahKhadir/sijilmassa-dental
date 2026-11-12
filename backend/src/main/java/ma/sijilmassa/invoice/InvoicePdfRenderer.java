package ma.sijilmassa.invoice;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.concurrent.Semaphore;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import static ma.sijilmassa.invoice.InvoicePdfFailure.Code.*;
import static ma.sijilmassa.invoice.InvoicePdfLayout.*;

@Component
class InvoicePdfRenderer {
    private static final int MAX_BYTES = 2 * 1024 * 1024;
    private static final float[] INK = {42 / 255f, 26 / 255f, 29 / 255f};
    private static final float[] BURGUNDY = {94 / 255f, 11 / 255f, 27 / 255f};
    private static final Semaphore RENDER_SLOTS = new Semaphore(2);

    byte[] render(InvoiceDocument source) {
        if (!RENDER_SLOTS.tryAcquire()) throw new InvoicePdfFailure(INVOICE_PDF_BUSY);
        try (var document = new PDDocument()) {
            var regular = font(document, "dossier/LiberationSans-Regular.ttf",
                    "76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8");
            var bold = font(document, "invoice/LiberationSans-Bold.ttf",
                    "788abee4c806d660e8aee46689dd8540cd4bb98da03dcc9d171ce3efd99a9173");
            var plan = InvoicePdfLayout.plan(source, regular, bold);
            var image = PDImageXObject.createFromByteArray(document, asset("invoice/facture_background.png",
                    "124825673d6d3623bcaafea91786b026a3e73c9635b98faae085fb59ba9196b5"), "facture_background.png");
            if (image.getWidth() != 1410 || image.getHeight() != 2000) throw new InvoicePdfFailure(INVOICE_PDF_RENDER_FAILED);
            var page = new PDPage(new PDRectangle(WIDTH, HEIGHT));
            document.addPage(page);
            document.setDocumentId((long) source.number().hashCode());
            document.getDocumentInformation().setTitle("Facture " + source.number());
            try (var canvas = new PDPageContentStream(document, page)) {
                float scale = Math.min(WIDTH / image.getWidth(), HEIGHT / image.getHeight());
                float width = image.getWidth() * scale;
                float height = image.getHeight() * scale;
                canvas.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
                draw(canvas, plan, regular, bold);
            }
            var output = new BoundedOutput();
            document.save(output);
            return output.toByteArray();
        } catch (IOException | IllegalArgumentException failure) {
            // PDFBox errors can contain private document text.
            throw new InvoicePdfFailure(INVOICE_PDF_RENDER_FAILED);
        } finally {
            RENDER_SLOTS.release();
        }
    }

    private static void draw(PDPageContentStream canvas, Plan plan, PDFont regular, PDFont bold) throws IOException {
        ink(canvas, INK);
        text(canvas, regular, plan.date(), RIGHT - width(regular, plan.date(), BODY_SIZE), 448, BODY_SIZE);
        ink(canvas, BURGUNDY);
        text(canvas, bold, plan.title(), (WIDTH - width(bold, plan.title(), 14.5f)) / 2, 418, 14.5f);
        ink(canvas, INK);
        text(canvas, bold, "Patient : ", LEFT, PATIENT_BASELINE, BODY_SIZE);
        for (int i = 0; i < plan.patient().size(); i++) {
            text(canvas, regular, plan.patient().get(i), plan.nameX(), PATIENT_BASELINE - i * PATIENT_LEADING, BODY_SIZE);
        }
        table(canvas, plan, regular, bold);
        summary(canvas, plan, regular, bold);
        identifier(canvas, regular, bold, "IF : ", "73149010", 104);
        identifier(canvas, regular, bold, "ICE : ", "003999044000004", 92);
        identifier(canvas, regular, bold, "INP : ", "084209071", 80);
    }

    private static void table(PDPageContentStream canvas, Plan plan, PDFont regular, PDFont bold) throws IOException {
        canvas.setNonStrokingColor(245 / 255f, 225 / 255f, 229 / 255f);
        canvas.addRect(LEFT, plan.tableTop() - HEADER_HEIGHT, RIGHT - LEFT, HEADER_HEIGHT);
        canvas.fill();
        ink(canvas, INK);
        canvas.setStrokingColor(INK[0], INK[1], INK[2]);
        canvas.setLineWidth(0.5f);
        canvas.addRect(LEFT, plan.tableBottom(), RIGHT - LEFT, plan.tableTop() - plan.tableBottom());
        canvas.stroke();
        for (var column : COLUMNS) {
            float x = column.left() + (column.width() - width(bold, column.label(), BODY_SIZE)) / 2;
            text(canvas, bold, column.label(), x, plan.tableTop() - 12, BODY_SIZE);
            if (column.left() != LEFT) rule(canvas, column.left(), plan.tableBottom(), column.left(), plan.tableTop());
        }
        rule(canvas, LEFT, plan.tableTop() - HEADER_HEIGHT, RIGHT, plan.tableTop() - HEADER_HEIGHT);
        for (var row : plan.rows()) {
            for (int index = 0; index < COLUMNS.size(); index++) {
                var column = COLUMNS.get(index);
                var lines = row.cells().get(index);
                for (int line = 0; line < lines.size(); line++) {
                    String value = lines.get(line);
                    float x = switch (index) {
                        case 1 -> column.left() + (column.width() - width(regular, value, BODY_SIZE)) / 2;
                        case 3 -> column.right() - 5 - width(regular, value, BODY_SIZE);
                        default -> column.left() + 5;
                    };
                    text(canvas, regular, value, x, row.top() - 12 - line * LEADING, BODY_SIZE);
                }
            }
            if (row.bottom() != plan.tableBottom()) rule(canvas, LEFT, row.bottom(), RIGHT, row.bottom());
        }
    }

    private static void summary(PDPageContentStream canvas, Plan plan, PDFont regular, PDFont bold) throws IOException {
        for (int i = 0; i < plan.totals().size(); i++) {
            float y = plan.tableBottom() - 14 - i * 14;
            float size = i == 2 ? 9.5f : 9;
            PDFont font = i == 1 ? regular : bold;
            if (i == 2) {
                rule(canvas, SUMMARY_X, y + 10, RIGHT, y + 10);
                ink(canvas, BURGUNDY);
            }
            text(canvas, bold, SUMMARY_LABELS.get(i), SUMMARY_X, y, size);
            String value = plan.totals().get(i);
            text(canvas, font, value, RIGHT - width(font, value, size), y, size);
        }
        ink(canvas, INK);
        for (int i = 0; i < plan.words().size(); i++) {
            text(canvas, regular, plan.words().get(i), LEFT, plan.tableBottom() - 59 - i * WORDS_LEADING, BODY_SIZE);
        }
    }

    private static void identifier(PDPageContentStream canvas, PDFont regular, PDFont bold, String label, String value, float y)
            throws IOException {
        text(canvas, bold, label, LEFT, y, BODY_SIZE);
        text(canvas, regular, value, LEFT + width(bold, label, BODY_SIZE), y, BODY_SIZE);
    }

    private static void ink(PDPageContentStream canvas, float[] color) throws IOException {
        canvas.setNonStrokingColor(color[0], color[1], color[2]);
    }

    private static void rule(PDPageContentStream canvas, float x, float y, float endX, float endY) throws IOException {
        canvas.moveTo(x, y);
        canvas.lineTo(endX, endY);
        canvas.stroke();
    }

    private static void text(PDPageContentStream canvas, PDFont font, String value, float x, float y, float size) throws IOException {
        if (value.isEmpty()) return;
        canvas.beginText();
        canvas.setFont(font, size);
        canvas.newLineAtOffset(x, y);
        canvas.showText(value);
        canvas.endText();
    }

    private static PDType0Font font(PDDocument document, String path, String hash) throws IOException {
        return PDType0Font.load(document, new ByteArrayInputStream(asset(path, hash)));
    }

    private static byte[] asset(String path, String expected) throws IOException {
        try (var stream = new ClassPathResource(path).getInputStream()) {
            byte[] bytes = stream.readNBytes(MAX_BYTES + 1);
            if (bytes.length > MAX_BYTES || !HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)).equals(expected)) {
                throw new InvoicePdfFailure(INVOICE_PDF_RENDER_FAILED);
            }
            return bytes;
        } catch (NoSuchAlgorithmException failure) {
            throw new InvoicePdfFailure(INVOICE_PDF_RENDER_FAILED);
        }
    }

    private static final class BoundedOutput extends ByteArrayOutputStream {
        @Override public synchronized void write(int value) {
            check(1);
            super.write(value);
        }

        @Override public synchronized void write(byte[] bytes, int offset, int length) {
            check(length);
            super.write(bytes, offset, length);
        }

        private void check(int length) {
            if (length > MAX_BYTES - count) throw new InvoicePdfFailure(INVOICE_PDF_RENDER_FAILED);
        }
    }
}
