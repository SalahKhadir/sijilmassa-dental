package ma.sijilmassa.patient.dossier;

import java.io.IOException;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import ma.sijilmassa.finance.FinancialModels.DossierLedger;
import ma.sijilmassa.finance.FinancialModels.Row;
import ma.sijilmassa.finance.FinancialModels.Settlement;
import ma.sijilmassa.finance.FinancialModels.Totals;
import ma.sijilmassa.patient.PatientDtos.*;
import ma.sijilmassa.patient.PatientValues.*;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

class DossierPdfRendererTest {
    private final DossierPdfRenderer renderer = new DossierPdfRenderer();

    @Test void shortDossierKeepsBothOfficialPagesAndAccentedFieldsAndMarks() throws Exception {
        byte[] bytes = renderer.render(data(identity("Éléonore", "Bâtiment B, résidence fictive"), List.of(
                row(0, "Détartrage synthétique", 30000, 12501), row(1, "Soin réglé synthétique", 50000, 50000)), false));
        sample("short", bytes);
        try (var document = Loader.loadPDF(bytes);
             var original = Loader.loadPDF(Path.of("../docs/references/pdf-templates/dossier-patient.pdf").toFile())) {
            assertThat(document.getNumberOfPages()).isEqualTo(2);
            assertBoxes(document.getPage(0));
            assertBoxes(document.getPage(1));
            assertOriginalStreams(original.getPage(0), document.getPage(0));
            assertOriginalStreams(original.getPage(1), document.getPage(1));
            assertThat(text(bytes, 1, 1)).contains("Fictive Éléonore", "03/02/1990", "Bâtiment B", "Ingénieure",
                    "Mutuelle fictive", "État général stable", "Contrôle préventif");
            assertThat(text(bytes, 2, 2)).contains("11/11/2026", "Détartrage synthétique", "300,00", "125,01", "174,99",
                    "Soin réglé synthétique", "TOTAL DES SOINS", "800,00", "TOTAL REÇU", "625,01", "RESTE À PAYER");
            var blank = new PDFRenderer(original).renderImage(0, 2);
            var filled = new PDFRenderer(document).renderImage(0, 2);
            // Compare a patch wholly inside each checkbox. Its border is outside the patch.
            assertThat(changed(blank, filled, 197, 394)).isGreaterThan(5); // F
            assertThat(changed(blank, filled, 363, 394)).isZero();       // M
            assertThat(changed(blank, filled, 26, 696)).isGreaterThan(5); // Diabète
            assertThat(changed(blank, filled, 171, 778)).isGreaterThan(5); // Antibiotique
            assertThat(changed(blank, filled, 237, 858)).isGreaterThan(5); // Traitement : oui
            assertThat(changed(blank, filled, 424, 932)).isGreaterThan(5); // Grossesse : non
        }
    }

    @Test void continuationRepeatsTheVersoAndAnnexKeepsLongRectoText() throws Exception {
        var rows = IntStream.range(0, 80).mapToObj(i -> row(i, i < 2 ? "Même soin fictif"
                : "Traitement synthétique numéro " + i + " avec libellé assez long pour revenir à la ligne", 10001, 100)).toList();
        var identity = identity("Éléonore ".repeat(8), "Résidence synthétique de démonstration, bâtiment de vérification. ".repeat(4));
        byte[] bytes = renderer.render(data(identity, rows, true));
        sample("continuation", bytes);
        try (var document = Loader.loadPDF(bytes);
             var original = Loader.loadPDF(Path.of("../docs/references/pdf-templates/dossier-patient.pdf").toFile())) {
            assertThat(document.getNumberOfPages()).isGreaterThanOrEqualTo(6);
            for (PDPage page : document.getPages()) assertBoxes(page);
            int financialPages = 0;
            int totals = 0;
            for (int i = 2; i <= document.getNumberOfPages(); i++) {
                var content = text(bytes, i, i);
                if (content.contains("Annexe du recto")) continue;
                financialPages++;
                assertOriginalStreams(original.getPage(1), document.getPage(i - 1));
                assertThat(content).contains("Traitement", "Reçu", "Reste", "Montants en DH");
                if (content.contains("TOTAL DES SOINS")) totals++;
            }
            assertThat(financialPages).isGreaterThanOrEqualTo(4);
            assertThat(totals).isEqualTo(1);
            var all = text(bytes, 1, document.getNumberOfPages());
            assertThat(all.replaceAll("\\s+", " ")).contains("Voir annexe", "Annexe du recto", "Nom et prénom", "Adresse", "FIN DE L’OBSERVATION",
                    "Précisions sur les antécédents", "Précisions sur les allergies", "8 000,80", "80,00", "7 920,80");
            assertThat(all.split("Même soin fictif", -1)).hasSize(3);
            assertThat(all.indexOf("numéro 19")).isLessThan(all.indexOf("numéro 79"));
        }
    }

    @Test void emptyLedgerHasTwoPagesAndUnknownAnswersStayDistinct() throws Exception {
        var blank = new DossierSnapshot.Data(identity("Éléonore", ""), MedicalContent.unanswered(), ledger(List.of()));
        byte[] bytes = renderer.render(blank);
        try (var document = Loader.loadPDF(bytes)) { assertThat(document.getNumberOfPages()).isEqualTo(2); }
        assertThat(text(bytes, 1, 1)).contains("Non renseigné").doesNotContain("Aucune catégorie cochée");
        assertThat(text(bytes, 2, 2)).contains("Aucun soin tarifé", "TOTAL DES SOINS", "TOTAL REÇU", "RESTE À PAYER", "0,00");
    }

    @Test void rejectsUnsupportedTextAndPageOverflowWithoutReturningPartialBytes() {
        assertThatThrownBy(() -> renderer.render(data(identity("اسم", ""), List.of(), false)))
                .isInstanceOfSatisfying(DossierFailure.class, error -> assertThat(error.reason()).isEqualTo(DossierFailure.Reason.UNSUPPORTED_TEXT));
        var rows = IntStream.range(0, 250).mapToObj(i -> row(i, "Long libellé synthétique répété ".repeat(30), 100, 0)).toList();
        assertThatThrownBy(() -> renderer.render(data(identity("Éléonore", ""), rows, false)))
                .isInstanceOfSatisfying(DossierFailure.class, error -> assertThat(error.reason()).isEqualTo(DossierFailure.Reason.DOSSIER_LIMIT));
    }

    private static DossierSnapshot.Data data(Identity identity, List<Row> rows, boolean longText) {
        String note = longText ? "Information médicale synthétique, préservée intégralement. ".repeat(28) + "FIN DE L’OBSERVATION" : "État général stable";
        var medical = new MedicalContent(1, new MedicalHistory(ReportStatus.REPORTED,
                longText ? List.of(Condition.DIABETE, Condition.AUTRES) : List.of(Condition.DIABETE), longText ? "Précision fictive" : ""),
                new Allergies(ReportStatus.REPORTED, List.of(Allergy.ANTIBIOTIQUE), longText ? "Allergie rapportée fictive" : ""),
                new Questionnaire(Answer.YES, Answer.NO, note, "Contrôle préventif"));
        return new DossierSnapshot.Data(identity, medical, ledger(rows));
    }

    private static Identity identity(String name, String address) {
        return new Identity(name, "Fictive", Sex.F, LocalDate.of(1990, 2, 3), address, "+212 600 000 001",
                "05 00 00 00 02", "Ingénieure", "XX000001", "Mutuelle fictive");
    }

    private static Row row(int index, String label, long price, long received) {
        return new Row(new UUID(0, index), 0, LocalDate.of(2026, 11, 11).plusDays(index), label,
                "MAD", price, received, price - received, received == price ? Settlement.SETTLED : Settlement.PARTIAL);
    }

    private static DossierLedger ledger(List<Row> rows) {
        var charges = rows.stream().map(r -> BigInteger.valueOf(r.priceMinor())).reduce(BigInteger.ZERO, BigInteger::add);
        var received = rows.stream().map(r -> BigInteger.valueOf(r.receivedMinor())).reduce(BigInteger.ZERO, BigInteger::add);
        return new DossierLedger(rows, new Totals("MAD", charges, received, charges.subtract(received)));
    }

    private static String text(byte[] bytes, int from, int to) throws IOException {
        try (var document = Loader.loadPDF(bytes)) {
            var stripper = new PDFTextStripper();
            stripper.setStartPage(from);
            stripper.setEndPage(to);
            return stripper.getText(document);
        }
    }

    private static int changed(java.awt.image.BufferedImage a, java.awt.image.BufferedImage b, int x, int y) {
        int changed = 0;
        for (int i = x + 2; i < x + 20; i++) {
            for (int j = y + 2; j < y + 20; j++) if (a.getRGB(i, j) != b.getRGB(i, j)) changed++;
        }
        return changed;
    }

    private static void assertOriginalStreams(PDPage source, PDPage filled) throws IOException {
        var output = new ArrayList<byte[]>();
        var streams = filled.getContentStreams();
        while (streams.hasNext()) output.add(decoded(streams.next()));
        var original = source.getContentStreams();
        while (original.hasNext()) {
            byte[] bytes = decoded(original.next());
            assertThat(output.stream().anyMatch(candidate -> Arrays.equals(candidate, bytes))).isTrue();
        }
    }

    private static byte[] decoded(org.apache.pdfbox.pdmodel.common.PDStream stream) throws IOException {
        try (var in = stream.createInputStream()) { return in.readAllBytes(); }
    }

    private static void assertBoxes(PDPage page) {
        for (var box : List.of(page.getMediaBox(), page.getCropBox())) {
            assertThat(box.getLowerLeftY()).isCloseTo(8.58f, within(0.01f));
            assertThat(box.getWidth()).isCloseTo(419.25f, within(0.01f));
            assertThat(box.getHeight()).isCloseTo(595.5f, within(0.01f));
        }
    }

    private static void sample(String name, byte[] bytes) throws IOException {
        String directory = System.getProperty("dossier.visual.dir");
        if (directory != null) Files.write(Path.of(directory, name + ".pdf"), bytes);
    }
}
