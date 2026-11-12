package ma.sijilmassa.invoice;

import java.io.InputStream;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import static ma.sijilmassa.finance.FinancialModels.MAX_MINOR;
import static ma.sijilmassa.invoice.InvoicePdfFailure.Code.*;
import static org.assertj.core.api.Assertions.*;

class InvoicePdfRendererTest {
    private static final LocalDate DATE = LocalDate.of(2026, 11, 11);
    private final InvoicePdfRenderer renderer = new InvoicePdfRenderer();

    @Test void paidHistoricalLineLeavesDentsBlankAndKeepsExactA5BackgroundAndFonts() throws Exception {
        var invoice = new InvoiceDocument("2026-001", DATE, "Élodie", "Fictive", List.of(line(null, "Détartrage et contrôle", 50001, 50001)));
        byte[] bytes = render("01-historique-soldee", invoice);
        try (var pdf = Loader.loadPDF(bytes)) {
            assertThat(pdf.getNumberOfPages()).isEqualTo(1);
            var page = pdf.getPage(0);
            assertThat(page.getMediaBox().getWidth()).isCloseTo(419.5276f, within(0.01f));
            assertThat(page.getMediaBox().getHeight()).isCloseTo(595.2756f, within(0.01f));
            assertThat(page.getCropBox().getWidth()).isEqualTo(page.getMediaBox().getWidth());
            assertThat(page.getRotation()).isZero();
            assertThat(text(pdf)).contains("FACTURE Nº : 2026-001", "Patient : Élodie Fictive", "Témara, le : 11/11/2026",
                    "DATE", "DENTS", "DESCRIPTION", "PRIX", "Détartrage et contrôle", "500,01 DH", "0,00 DH",
                    "TOTAL", "MONTANT REÇU", "RESTE À PAYER", "cinq cents dirhams et un centime")
                    .doesNotContain("Page 1/1", "Quantité", "Référence du patient");
            assertThat(dents(page, 24)).isBlank();
            for (COSName name : page.getResources().getFontNames()) {
                assertThat(page.getResources().getFont(name).isEmbedded()).isTrue();
            }
            var images = new ArrayList<PDImageXObject>();
            for (COSName name : page.getResources().getXObjectNames()) {
                if (page.getResources().getXObject(name) instanceof PDImageXObject image) images.add(image);
            }
            assertThat(images).hasSize(1);
            var actual = images.getFirst().getImage();
            try (InputStream input = getClass().getResourceAsStream("/invoice/facture_background.png")) {
                var original = ImageIO.read(input);
                assertThat(actual.getWidth()).isEqualTo(1410);
                assertThat(actual.getHeight()).isEqualTo(2000);
                int[] expectedPixels = original.getRGB(0, 0, 1410, 2000, null, 0, 1410);
                int[] actualPixels = actual.getRGB(0, 0, 1410, 2000, null, 0, 1410);
                assertThat(java.util.Arrays.equals(actualPixels, expectedPixels)).isTrue();
            }
        }
    }

    @Test void largePartialInvoiceWrapsLongNamesAndReferencesAndKeepsDuplicateDescriptions() throws Exception {
        String description = "Réévaluation et contrôle après traitement, avec nettoyage et vérification des surfaces traitées. "
                + "Contrôle complémentaire et suivi des zones concernées.";
        var invoice = new InvoiceDocument("2026-002", DATE, "Éléonore-Anaïs Marie-Françoise Solène Camille",
                "Fictive de la Rivière des Amandiers et des Jardins", List.of(
                line("16 / 17, 18 / 21, 22 / 23, 24", description, MAX_MINOR, 25000),
                line(null, "Soin de contrôle", 99001, 0),
                line("37, 38", "Soin de contrôle", 20000, 10000),
                line("24", "Retouche et polissage", 18000, 0)));
        byte[] bytes = render("02-reference-longue-grand-total", invoice);
        try (var pdf = Loader.loadPDF(bytes)) {
            assertThat(pdf.getNumberOfPages()).isEqualTo(1);
            String content = text(pdf).replaceAll("\\s+", " ");
            assertThat(content).contains("Éléonore-Anaïs", "des Amandiers et des Jardins", "zones concernées",
                    "90 071 992 548 779,92 DH", "350,00 DH", "90 071 992 548 429,92 DH",
                    "Arrêtée la présente facture à la somme de", "quatre-vingt-douze centimes");
            assertThat(content.split("Soin de contrôle", -1)).hasSize(3);
            assertThat(dents(pdf.getPage(0), 150).replaceAll("\\s+", " ")).contains("16 / 17, 18 / 21, 22 / 23, 24", "37, 38");
            assertThat(bytes).hasSizeLessThan(2 * 1024 * 1024);
        }
    }

    @Test void nearCapacityIsOnePageAndAdditionalRowsOrLargeWordsRefuseOverflow() throws Exception {
        var simple = line("16", "Soin de contrôle", 35000, 0);
        var near = java.util.Collections.nCopies(9, simple);
        try (var pdf = Loader.loadPDF(render("03-capacite-a5", invoice(near)))) {
            assertThat(pdf.getNumberOfPages()).isEqualTo(1);
            assertThat(text(pdf).split("Soin de contrôle", -1)).hasSize(10);
        }
        fails(() -> renderer.render(invoice(java.util.Collections.nCopies(10, simple))), INVOICE_PDF_LAYOUT_OVERFLOW);
        fails(() -> renderer.render(invoice(java.util.Collections.nCopies(250, line(null, "Soin", MAX_MINOR, 0)))),
                INVOICE_PDF_LAYOUT_OVERFLOW);
        fails(() -> renderer.render(invoice(List.of(line(null, "Suivi ".repeat(150), 100, 0)))), INVOICE_PDF_LAYOUT_OVERFLOW);
        var large = new ArrayList<>(near.subList(0, 8));
        large.set(0, line("16", "Soin de contrôle", MAX_MINOR, 0));
        fails(() -> renderer.render(invoice(large)), INVOICE_PDF_LAYOUT_OVERFLOW);
    }

    @Test void invalidSnapshotAndUnsupportedTextFailWithoutPdf() {
        fails(() -> line(null, "Soin", 500, 501), INVOICE_PDF_INTEGRITY);
        fails(() -> line(null, "Soin", MAX_MINOR + 1, 0), INVOICE_PDF_INTEGRITY);
        fails(() -> new InvoiceDocument("../../facture", DATE, "Patient", "Fictif", List.of(line(null, "Soin", 100, 0))),
                INVOICE_PDF_INTEGRITY);
        fails(() -> invoice(java.util.Collections.nCopies(251, line(null, "Soin", 100, 0))), INVOICE_PDF_INTEGRITY);
        fails(() -> renderer.render(invoice(List.of(line(null, "Soin \u202Eprivé", 100, 0)))), INVOICE_PDF_UNSUPPORTED_TEXT);
        fails(() -> renderer.render(invoice(List.of(line(null, "Soin 🦷", 100, 0)))), INVOICE_PDF_UNSUPPORTED_TEXT);
    }

    @Test void frenchAmountWordsMatchSharedGoldenCasesAndRejectOutsideTheV10Range() throws Exception {
        try (var input = getClass().getResourceAsStream("/invoice-amount-golden.json")) {
            var cases = new JsonMapper().readTree(input);
            for (var row : cases) {
                assertThat(InvoiceAmountWords.format(new BigInteger(row.get("minor").asString()))).isEqualTo(row.get("words").asString());
            }
        }
        assertThat(InvoiceAmountWords.MAX_AMOUNT.toString()).isEqualTo("2251799813685247750");
        fails(() -> InvoiceAmountWords.format(InvoiceAmountWords.MAX_AMOUNT.add(BigInteger.ONE)), INVOICE_PDF_INTEGRITY);
        fails(() -> InvoiceAmountWords.format(BigInteger.ONE.negate()), INVOICE_PDF_INTEGRITY);
    }

    private static InvoiceDocument.Line line(String tooth, String description, long price, long received) {
        return new InvoiceDocument.Line(DATE, tooth, description, price, received);
    }

    private static InvoiceDocument invoice(List<InvoiceDocument.Line> lines) {
        return new InvoiceDocument("2026-003", DATE, "Patient", "Fictif", lines);
    }

    private byte[] render(String fixture, InvoiceDocument document) throws Exception {
        byte[] bytes = renderer.render(document);
        String folder = System.getProperty("invoice.pdf.samples");
        if (folder != null) Files.write(Files.createDirectories(Path.of(folder)).resolve(fixture + ".pdf"), bytes);
        return bytes;
    }

    private static String text(org.apache.pdfbox.pdmodel.PDDocument pdf) throws Exception {
        return new PDFTextStripper().getText(pdf);
    }

    private static String dents(PDPage page, float height) throws Exception {
        var extractor = new org.apache.pdfbox.text.PDFTextStripperByArea();
        extractor.addRegion("dents", new java.awt.geom.Rectangle2D.Float(88, 244, 38, height));
        extractor.extractRegions(page);
        return extractor.getTextForRegion("dents");
    }

    private static void fails(ThrowingCallable operation, InvoicePdfFailure.Code code) {
        assertThatThrownBy(operation).isInstanceOfSatisfying(InvoicePdfFailure.class, error -> assertThat(error.code()).isEqualTo(code));
    }
}
