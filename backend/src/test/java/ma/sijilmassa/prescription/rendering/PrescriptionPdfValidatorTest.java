package ma.sijilmassa.prescription.rendering;

import java.io.ByteArrayOutputStream;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class PrescriptionPdfValidatorTest {
    final PrescriptionPdfValidator validator = new PrescriptionPdfValidator();
    byte[] pdf(int pages, boolean a5, int rotation) throws Exception {
        try (var pdf = new PDDocument(); var out = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) {
                var page = new PDPage(a5 ? new PDRectangle(0, 8.580014f, 419.25f, 595.499986f) : PDRectangle.A4);
                page.setRotation(rotation); pdf.addPage(page);
                try (var content = new PDPageContentStream(pdf, page)) { content.moveTo(20, 20); content.lineTo(30, 30); content.stroke(); }
            }
            pdf.save(out); return out.toByteArray();
        }
    }
    @Test void acceptsOneCorrectlySizedStructuredPage() throws Exception { validator.validate(pdf(1, true, 0), 2097152); }
    @Test void rejectsEmptyInvalidOrTruncatedStructure() throws Exception {
        for (byte[] bytes : new byte[][]{new byte[0], "SECRET".getBytes(), "%PDF-1.4\nSECRET\n%%EOF".getBytes(), java.util.Arrays.copyOf(pdf(1, true, 0), 100)})
            assertThatThrownBy(() -> validator.validate(bytes, 2097152)).isInstanceOf(RenderingFailure.class).hasMessageNotContaining("SECRET");
    }
    @Test void rejectsExcessiveSize() throws Exception {
        var bytes = pdf(1, true, 0);
        assertThatThrownBy(() -> validator.validate(bytes, 10)).isInstanceOfSatisfying(RenderingFailure.class, e -> assertThat(e.code()).isEqualTo(RenderingFailure.Code.PDF_TOO_LARGE));
    }
    @Test void rejectsMultipleOrMissingPages() throws Exception {
        for (int pages : new int[]{0, 2}) { var bytes = pdf(pages, true, 0); assertThatThrownBy(() -> validator.validate(bytes, 2097152)).isInstanceOf(RenderingFailure.class); }
    }
    @Test void rejectsWrongDimensionsAndRotation() throws Exception {
        for (byte[] bytes : new byte[][]{pdf(1, false, 0), pdf(1, true, 90)}) assertThatThrownBy(() -> validator.validate(bytes, 2097152)).isInstanceOf(RenderingFailure.class);
    }
}
