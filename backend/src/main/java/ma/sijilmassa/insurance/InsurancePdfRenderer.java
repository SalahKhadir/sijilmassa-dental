package ma.sijilmassa.insurance;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.concurrent.Semaphore;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.interactive.viewerpreferences.PDViewerPreferences;
import org.apache.pdfbox.util.Matrix;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import static ma.sijilmassa.insurance.InsuranceModels.*;
import static ma.sijilmassa.insurance.InsurancePdfFailure.Code.*;

@Component
final class InsurancePdfRenderer {
    static final int MAX_BYTES = 8 * 1024 * 1024;
    private static final String FONT_HASH = "76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8";
    private static final String FAR_HASH = "35278aba6d61ce76d8ac30e3ffba5c2f2f2d95cd5d60fabea3921bb55a239d43";
    private static final Template CNSS = new Template("CNSS",
            "9f829b1a26545a979e5cc94075307822aac95295529d572bfee17a82e5d51609", 728.40f, 1031.76f, 270);
    private static final Template CNOPS = new Template("CNOPS",
            "255e712e12aa0642c79ee6789e8e03c587425c6d4186f58e8fe094985b45efef", 799.44f, 574.08f, 0);

    private final Semaphore capacity = new Semaphore(2);

    byte[] render(Snapshot snapshot) {
        Template template = compatibleTemplate(snapshot);
        if (!capacity.tryAcquire()) throw new InsurancePdfFailure(INSURANCE_PDF_BUSY);
        try {
            byte[] background = asset("insurance-pdf/feuille_dentaire_" + template.family() + ".pdf", template.hash());
            byte[] regular = asset("dossier/LiberationSans-Regular.ttf", FONT_HASH);
            try (var document = Loader.loadPDF(background); var output = new BoundedOutput()) {
                template.verify(document);
                var font = PDType0Font.load(document, new ByteArrayInputStream(regular));
                for (int index = 0; index < 2; index++) {
                    var page = document.getPage(index);
                    try (var canvas = new PDPageContentStream(document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
                        canvas.transform(template.visualMatrix(page));
                        var form = new InsurancePdfLayout(canvas, font);
                        if (index == 0) form.identity(snapshot);
                        else form.acts(snapshot);
                    }
                }
                var preferences = document.getDocumentCatalog().getViewerPreferences();
                if (preferences == null) {
                    preferences = new PDViewerPreferences(new org.apache.pdfbox.cos.COSDictionary());
                    document.getDocumentCatalog().setViewerPreferences(preferences);
                }
                preferences.setPrintScaling(PDViewerPreferences.PRINT_SCALING.None);
                document.save(output);
                byte[] pdf = output.toByteArray();
                try (var reopened = Loader.loadPDF(pdf)) {
                    template.verify(reopened);
                }
                return pdf;
            }
        } catch (IOException failure) {
            throw new InsurancePdfFailure(INSURANCE_PDF_RENDER_FAILED);
        } finally {
            capacity.release();
        }
    }

    private static Template compatibleTemplate(Snapshot snapshot) {
        if (snapshot.schemaVersion() != 1 || snapshot.templateVersion() != 1 || snapshot.documentType() == null) {
            throw new InsurancePdfFailure(INSURANCE_PDF_TEMPLATE_UNSUPPORTED);
        }
        boolean far = snapshot.documentType() == DocumentType.FAR_DENTAIRE;
        boolean compatiblePurpose = far ? snapshot.purpose() == Purpose.DEVIS || snapshot.purpose() == Purpose.RECUS
                : snapshot.purpose() == Purpose.ENTENTE_PREALABLE || snapshot.purpose() == Purpose.EXECUTION;
        Template template = snapshot.documentType() == DocumentType.CNSS_DENTAIRE ? CNSS : CNOPS;
        if (!compatiblePurpose || !(far ? FAR_HASH : template.hash()).equals(snapshot.templateSha256())) {
            throw new InsurancePdfFailure(INSURANCE_PDF_TEMPLATE_UNSUPPORTED);
        }
        if (far) throw new InsurancePdfFailure(INSURANCE_PDF_FAR_UNAVAILABLE);
        if (snapshot.insured() == null || snapshot.insured().relationship() == null || snapshot.beneficiary() == null
                || snapshot.fields() == null || snapshot.acts().isEmpty() || snapshot.acts().size() > snapshot.documentType().maxActs()) {
            throw new InsurancePdfFailure(INSURANCE_PDF_INTEGRITY);
        }
        return template;
    }

    static byte[] asset(String name, String hash) throws IOException {
        try (var stream = new ClassPathResource(name).getInputStream()) {
            byte[] bytes = stream.readNBytes(MAX_BYTES + 1);
            if (bytes.length > MAX_BYTES || !HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)).equals(hash)) {
                throw new InsurancePdfFailure(INSURANCE_PDF_INTEGRITY);
            }
            return bytes;
        } catch (NoSuchAlgorithmException failure) {
            throw new InsurancePdfFailure(INSURANCE_PDF_INTEGRITY);
        }
    }

    private record Template(String family, String hash, float width, float height, int rotation) {
        void verify(PDDocument document) {
            if (document.getNumberOfPages() != 2 || document.isEncrypted() || document.getDocumentCatalog().getAcroForm() != null) {
                throw new InsurancePdfFailure(INSURANCE_PDF_INTEGRITY);
            }
            for (PDPage page : document.getPages()) {
                if (page.getRotation() != rotation || !matches(page.getMediaBox()) || !matches(page.getCropBox())
                        || !matches(page.getBleedBox()) || !matches(page.getTrimBox()) || !matches(page.getArtBox())) {
                    throw new InsurancePdfFailure(INSURANCE_PDF_INTEGRITY);
                }
            }
        }

        private boolean matches(PDRectangle box) {
            return box.getLowerLeftX() == 0 && box.getLowerLeftY() == 0
                    && Math.abs(box.getWidth() - width) < .01f && Math.abs(box.getHeight() - height) < .01f;
        }

        // Local coordinates are visual x and negative visual y, in points.
        Matrix visualMatrix(PDPage page) {
            var box = page.getCropBox();
            return rotation == 270 ? new Matrix(0, -1, 1, 0, box.getUpperRightX(), box.getUpperRightY())
                    : new Matrix(1, 0, 0, 1, box.getLowerLeftX(), box.getUpperRightY());
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
            if (length > MAX_BYTES - count) throw new InsurancePdfFailure(INSURANCE_PDF_RENDER_FAILED);
        }
    }
}
