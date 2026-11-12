package ma.sijilmassa.insurance;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

import static ma.sijilmassa.insurance.InsuranceModels.*;
import static ma.sijilmassa.insurance.InsurancePdfFailure.Code.*;
import static org.assertj.core.api.Assertions.*;

class InsurancePdfRendererTest {
    private static final LocalDate DATE = LocalDate.of(2026, 11, 12);
    private static final UUID PATIENT = UUID.fromString("a1000000-0000-4000-8000-000000000001");
    private final InsurancePdfRenderer renderer = new InsurancePdfRenderer();

    @ParameterizedTest
    @CsvSource({"CNSS_DENTAIRE,1,false", "CNSS_DENTAIRE,3,false", "CNOPS_DENTAIRE,1,false",
            "CNOPS_DENTAIRE,9,false", "CNOPS_DENTAIRE,1,true"})
    void preservesOriginalPagesAndFrozenData(DocumentType type, int count, boolean longAddress) throws IOException {
        boolean cnss = type == DocumentType.CNSS_DENTAIRE;
        String family = cnss ? "CNSS" : "CNOPS";
        String address = longAddress ? "12 avenue fictive des Jardins, bâtiment Émeraude, résidence des Orangers, étage trois" : "Rue fictive des Écoles";
        var snapshot = snapshot(type, count, count == 1 ? Purpose.ENTENTE_PREALABLE : Purpose.EXECUTION,
                cnss ? "012345678" : "REG-FICTIF", address, "Élodie");
        byte[] pdf = renderer.render(snapshot);
        assertThat(pdf).startsWith(new byte[]{'%', 'P', 'D', 'F', '-'});
        String directory = System.getenv("SYNTHETIC_INSURANCE_PDF_DIR");
        if (directory != null) Files.write(Path.of(directory, family + "-" + count + (longAddress ? "-long" : "") + ".pdf"), pdf);
        byte[] source = InsurancePdfRenderer.asset("insurance-pdf/feuille_dentaire_" + family + ".pdf", type.templateSha256());
        try (var generated = Loader.loadPDF(pdf); var original = Loader.loadPDF(source)) {
            assertThat(generated.getNumberOfPages()).isEqualTo(2);
            assertThat(generated.getDocumentCatalog().getAcroForm()).isNull();
            for (int index = 0; index < 2; index++) {
                var from = original.getPage(index);
                var to = generated.getPage(index);
                assertThat(to.getRotation()).isEqualTo(from.getRotation());
                assertThat(to.getMediaBox().toString()).isEqualTo(from.getMediaBox().toString());
                assertThat(to.getCropBox().toString()).isEqualTo(from.getCropBox().toString());
                assertThat(to.getTrimBox().toString()).isEqualTo(from.getTrimBox().toString());
                assertThat(to.getBleedBox().toString()).isEqualTo(from.getBleedBox().toString());
                assertThat(to.getArtBox().toString()).isEqualTo(from.getArtBox().toString());
                boolean embedded = false;
                for (var fontName : to.getResources().getFontNames()) {
                    if (to.getResources().getFont(fontName) instanceof PDType0Font font && font.isEmbedded()) embedded = true;
                }
                assertThat(embedded).isTrue();
                List<byte[]> streams = streams(to);
                assertThat(streams(from)).allSatisfy(bytes -> assertThat(streams.stream().anyMatch(candidate ->
                        Arrays.equals(candidate, bytes))).isTrue());
            }
            var stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            String text = stripper.getText(generated);
            assertThat(text).contains("Bénéficiaire Élodie", "Assuré Camille", "0,13").doesNotContain("150,01", "Description fictive confidentielle");
            if (cnss) assertThat(text.replaceAll("\\s+", "")).contains("012345678");
            else assertThat(text).contains("AFF-FICTIF", "REG-FICTIF");
            if (longAddress) assertThat(text).contains("étage trois");
            int previous = -1;
            for (int index = 0; index < count; index++) {
                int position = text.replaceAll("A +([0-9])", "A$1").indexOf("A" + (index + 1));
                assertThat(position).isGreaterThan(previous);
                previous = position;
            }
            if (count > 1) assertThat(text).contains("0,00", "12,34");
        }
    }

    @ParameterizedTest
    @EnumSource(value = DocumentType.class, names = {"CNSS_DENTAIRE", "CNOPS_DENTAIRE"})
    void marksOnlySelectedBoxesAndLeavesPaperSignaturesIntact(DocumentType type) throws IOException {
        boolean cnss = type == DocumentType.CNSS_DENTAIRE;
        String family = cnss ? "CNSS" : "CNOPS";
        var value = snapshot(type, 1, Purpose.ENTENTE_PREALABLE, "012345678", null, "Élodie");
        byte[] source = InsurancePdfRenderer.asset("insurance-pdf/feuille_dentaire_" + family + ".pdf", type.templateSha256());
        try (var original = Loader.loadPDF(source); var generated = Loader.loadPDF(renderer.render(value))) {
            var before = new PDFRenderer(original).renderImageWithDPI(0, 144);
            var after = new PDFRenderer(generated).renderImageWithDPI(0, 144);
            assertThat(differences(before, after, cnss ? 761 : 608, cnss ? 65 : 47, 7, 7)).isPositive();
            assertThat(differences(before, after, cnss ? 847 : 668, cnss ? 65 : 47, 7, 7)).isZero();
            assertThat(differences(before, after, cnss ? 732 : 583, cnss ? 167 : 157, 7, 7)).isPositive();
            assertThat(differences(before, after, cnss ? 799 : 652, cnss ? 167 : 157, 7, 7)).isZero();
            assertThat(differences(before, after, cnss ? 588 : 427, cnss ? 549 : 484, cnss ? 407 : 349, cnss ? 46 : 57)).isZero();
        }
    }

    private static int differences(BufferedImage original, BufferedImage generated, int x, int y, int width, int height) {
        int count = 0;
        for (int row = y * 2; row < (y + height) * 2; row++) {
            for (int column = x * 2; column < (x + width) * 2; column++) {
                if (original.getRGB(column, row) != generated.getRGB(column, row)) count++;
            }
        }
        return count;
    }

    @ParameterizedTest
    @EnumSource(value = Purpose.class, names = {"DEVIS", "RECUS"})
    void farIsRefusedForBothPurposes(Purpose purpose) {
        assertFailure(snapshot(DocumentType.FAR_DENTAIRE, 1, purpose, "Compte", null, "Élodie"), INSURANCE_PDF_FAR_UNAVAILABLE);
    }

    @Test void refusesUnrecognizedSnapshotsAndResourceFingerprints() {
        var good = snapshot(DocumentType.CNSS_DENTAIRE, 1, Purpose.ENTENTE_PREALABLE, "012345678", null, "Élodie");
        assertFailure(new Snapshot(1, good.documentType(), 1, "a".repeat(64), good.purpose(), good.beneficiary(),
                null, good.insured(), good.fields(), good.acts(), null), INSURANCE_PDF_TEMPLATE_UNSUPPORTED);
        assertThatThrownBy(() -> InsurancePdfRenderer.asset("insurance-pdf/feuille_dentaire_CNSS.pdf", "a".repeat(64)))
                .isInstanceOfSatisfying(InsurancePdfFailure.class, failure -> assertThat(failure.code()).isEqualTo(INSURANCE_PDF_INTEGRITY));
    }

    @Test void failsClosedForOverflowUnsupportedTextAndExcessActs() {
        assertFailure(snapshot(DocumentType.CNSS_DENTAIRE, 1, Purpose.ENTENTE_PREALABLE, "0123456789", null, "Élodie"), INSURANCE_PDF_LAYOUT_OVERFLOW);
        assertFailure(snapshot(DocumentType.CNOPS_DENTAIRE, 1, Purpose.ENTENTE_PREALABLE, "REG", "A".repeat(280), "Élodie"), INSURANCE_PDF_LAYOUT_OVERFLOW);
        assertFailure(snapshot(DocumentType.CNOPS_DENTAIRE, 1, Purpose.ENTENTE_PREALABLE, "REG", null, "مريض"), INSURANCE_PDF_UNSUPPORTED_TEXT);
        assertFailure(snapshot(DocumentType.CNSS_DENTAIRE, 4, Purpose.EXECUTION, "012345678", null, "Élodie"), INSURANCE_PDF_INTEGRITY);
        var good = snapshot(DocumentType.CNOPS_DENTAIRE, 1, Purpose.ENTENTE_PREALABLE, "REG", null, "Élodie");
        var wide = new ConfirmedAct(null, null, null, "Fictif", null, null, null, null, 9_007_199_254_740_991L, null, null);
        assertFailure(new Snapshot(1, good.documentType(), 1, good.templateSha256(), good.purpose(), good.beneficiary(),
                null, good.insured(), good.fields(), List.of(wide), null), INSURANCE_PDF_LAYOUT_OVERFLOW);
    }

    private void assertFailure(Snapshot value, InsurancePdfFailure.Code code) {
        assertThatThrownBy(() -> renderer.render(value)).isInstanceOfSatisfying(InsurancePdfFailure.class,
                failure -> assertThat(failure.code()).isEqualTo(code));
    }

    private static List<byte[]> streams(PDPage page) throws IOException {
        var values = new ArrayList<byte[]>();
        var streams = page.getContentStreams();
        while (streams.hasNext()) {
            try (var content = streams.next().createInputStream()) {
                values.add(content.readAllBytes());
            }
        }
        return values;
    }

    private static Snapshot snapshot(DocumentType type, int count, Purpose purpose, String registration, String address, String firstName) {
        boolean cnss = type == DocumentType.CNSS_DENTAIRE;
        boolean full = count > 1 || address != null && address.length() > 40;
        var patient = new Beneficiary(PATIENT, 0, firstName, "Bénéficiaire", full ? "XZ2345" : null,
                full ? LocalDate.of(1990, 5, 4) : null, full ? "F" : null);
        var insured = new Insured(Relationship.CONJOINT, InsuredSource.DOCUMENT_INPUT, "Camille", "Assuré",
                full ? "ZZ45321" : null, address, full ? "0612345678" : null);
        var declaration = full ? new DentistDeclaration("Erfoud", DATE) : null;
        var cnssFields = cnss ? new CnssFields(registration, "012345678", full ? List.of(CnssCare.SOINS, CnssCare.PROTHESE,
                CnssCare.ORTHODONTIE_FACIALE, CnssCare.AUTRES) : List.of(), full ? "012345678" : null, full ? DATE : null,
                full ? List.of("16", "26", "51", "71") : List.of(), declaration) : null;
        var cnopsFields = type == DocumentType.CNOPS_DENTAIRE ? new CnopsFields(registration, "AFF-FICTIF", "987654321",
                full ? List.of(CnopsCare.SOINS, CnopsCare.ORTHODONTIE_ODF, CnopsCare.PROTHESE, CnopsCare.AUTRES) : List.of(),
                full ? "12345678" : null, full ? DATE : null, full ? "Accident fictif, cause déclarée" : null,
                full ? "K02" : null, full ? List.of("16", "26", "51", "71") : List.of(), declaration) : null;
        var acts = IntStream.range(0, count).mapToObj(index -> new ConfirmedAct(null, null, full ? DATE.minusDays(index) : null,
                "Description fictive confidentielle", full ? "16" : null, "A" + (index + 1), full ? "D" : null,
                full ? new BigDecimal("12.5") : null, switch (index) { case 0 -> 13L; case 1 -> 0L; default -> 1234L; },
                FeeSource.MANUAL_QUOTE, 15001L)).toList();
        return new Snapshot(1, type, 1, type.templateSha256(), purpose, patient, null, insured,
                new Fields(null, full ? 0 : null, cnssFields, cnopsFields, null), acts, BigInteger.valueOf(15001L * count));
    }
}
