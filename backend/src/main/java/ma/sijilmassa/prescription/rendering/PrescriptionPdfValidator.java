package ma.sijilmassa.prescription.rendering;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdfparser.PDFParser;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.springframework.stereotype.Component;
import static ma.sijilmassa.prescription.rendering.RenderingFailure.Code.*;

/** Independent structural inspection of bounded output from the pinned worker. No rendering or filesystem cache. */
@Component
public class PrescriptionPdfValidator {
    public void validate(byte[] bytes, int maxBytes) {
        if (bytes == null || bytes.length == 0) throw new RenderingFailure(INVALID_OUTPUT);
        if (bytes.length > maxBytes) throw new RenderingFailure(PDF_TOO_LARGE);
        if (bytes.length < 16 || !new String(bytes, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-")
                || !new String(bytes, Math.max(0, bytes.length - 32), Math.min(32, bytes.length), StandardCharsets.US_ASCII).stripTrailing().endsWith("%%EOF"))
            throw new RenderingFailure(INVALID_OUTPUT);
        try (var buffer = new RandomAccessReadBuffer(bytes)) {
            var parser = new PDFParser(buffer);
            try (var pdf = parser.parse(false)) {
                if (pdf.isEncrypted() || pdf.getNumberOfPages() != 1) throw new RenderingFailure(INVALID_OUTPUT);
                var page = pdf.getPage(0);
                if (!box(page.getMediaBox()) || !box(page.getCropBox()) || page.getRotation() != 0 || page.getUserUnit() != 1
                        || !page.hasContents() || !page.getAnnotations().isEmpty()) throw new RenderingFailure(INVALID_OUTPUT);
                var catalog = pdf.getDocumentCatalog();
                var dictionary = catalog.getCOSObject();
                if (dictionary.containsKey(COSName.ACRO_FORM) || dictionary.containsKey(COSName.OPEN_ACTION)
                        || dictionary.containsKey(COSName.AA) || dictionary.containsKey(COSName.NAMES)) throw new RenderingFailure(INVALID_OUTPUT);
            }
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof RenderingFailure failure) throw failure;
            throw new RenderingFailure(INVALID_OUTPUT);
        }
    }
    private boolean box(PDRectangle box) {
        return Math.abs(box.getLowerLeftX()) < .01 && Math.abs(box.getLowerLeftY() - 8.580014) < .01
                && Math.abs(box.getWidth() - 419.25) < .01 && Math.abs(box.getHeight() - 595.499986) < .01;
    }
}
