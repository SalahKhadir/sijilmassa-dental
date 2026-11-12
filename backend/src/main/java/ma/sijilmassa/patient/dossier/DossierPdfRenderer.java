package ma.sijilmassa.patient.dossier;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigInteger;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import ma.sijilmassa.finance.FinancialModels.DossierLedger;
import ma.sijilmassa.finance.FinancialModels.Row;
import ma.sijilmassa.patient.PatientValues.Allergy;
import ma.sijilmassa.patient.PatientValues.Answer;
import ma.sijilmassa.patient.PatientValues.Condition;
import ma.sijilmassa.patient.PatientValues.ReportStatus;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import static ma.sijilmassa.patient.dossier.DossierFailure.Reason.*;

@Component
class DossierPdfRenderer {
    private static final int MAX_PAGES = 24;
    private static final int MAX_BYTES = 2 * 1024 * 1024;
    private static final float WIDTH = 419.25f;
    private static final float HEIGHT = 595.5f;
    private static final float CROP_BOTTOM = 8.58f;
    private static final float TEXT_SIZE = 9;
    private static final float LINE_HEIGHT = 11;
    private static final float TABLE_START = 66;
    private static final float TABLE_END = 579;
    private static final float[] COLUMN_EDGES = {19, 67.5f, 250, 300, 350, 400.5f};
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/uuuu", Locale.FRANCE);
    private static final Pattern THOUSANDS = Pattern.compile("\\B(?=(\\d{3})+(?!\\d))");
    private record AnnexField(String label, String value) { }
    private record Cell(List<String> lines, boolean rightAligned, float size) { }
    private record TableRow(List<Cell> cells, float height) { }

    byte[] render(DossierSnapshot.Data data) {
        try (var document = Loader.loadPDF(asset("dossier-patient.pdf",
                "f68cf8351f368bf2b0d52dd3c2aa0e421294442c729c114b169d4107f11e69b4"))) {
            validateTemplate(document);
            var font = PDType0Font.load(document, new ByteArrayInputStream(asset("LiberationSans-Regular.ttf",
                    "76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8")));
            var annex = new ArrayList<AnnexField>();
            try (var recto = new DossierPage(document, document.getPage(0), font)) {
                recto(recto, data, annex);
            }
            verso(document, font, data.ledger());
            annex(document, font, annex);
            var output = new ByteArrayOutputStream();
            document.save(output);
            if (output.size() > MAX_BYTES) throw new DossierFailure(DOSSIER_LIMIT);
            return output.toByteArray();
        } catch (IOException | IllegalArgumentException exception) {
            // PDFBox messages can contain source strings. Keep them out of the HTTP response and application logs.
            throw new DossierFailure(DOSSIER_RENDER_FAILED);
        }
    }

    private static byte[] asset(String name, String expected) throws IOException {
        try (var input = new ClassPathResource("dossier/" + name).getInputStream()) {
            byte[] bytes = input.readNBytes(MAX_BYTES + 1);
            if (bytes.length > MAX_BYTES || !HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)).equals(expected)) {
                throw new DossierFailure(DOSSIER_RENDER_FAILED);
            }
            return bytes;
        } catch (NoSuchAlgorithmException exception) {
            throw new DossierFailure(DOSSIER_RENDER_FAILED);
        }
    }

    private static void validateTemplate(PDDocument document) {
        if (document.getNumberOfPages() != 2 || document.isEncrypted() || document.getDocumentCatalog().getAcroForm() != null) {
            throw new DossierFailure(DOSSIER_RENDER_FAILED);
        }
        for (PDPage page : document.getPages()) {
            if (page.getRotation() != 0 || !officialBox(page.getMediaBox()) || !officialBox(page.getCropBox())) {
                throw new DossierFailure(DOSSIER_RENDER_FAILED);
            }
        }
    }

    private static boolean officialBox(PDRectangle box) {
        return box.getLowerLeftX() == 0 && Math.abs(box.getLowerLeftY() - CROP_BOTTOM) < 0.01f
                && Math.abs(box.getWidth() - WIDTH) < 0.01f && Math.abs(box.getHeight() - HEIGHT) < 0.01f;
    }

    private static void recto(DossierPage page, DossierSnapshot.Data data, List<AnnexField> annex) throws IOException {
        var identity = data.identity();
        field(page, annex, "Nom et prénom", identity.lastName() + " " + identity.firstName(), 122, 180, 400, 1);
        switch (identity.sex()) {
            case F -> page.tick(98, 196);
            case M -> page.tick(180.5f, 196);
            case UNANSWERED -> page.text("Non renseigné", 222, 205, 8);
        }
        field(page, annex, "Date de naissance", identity.dateOfBirth() == null ? "" : DATE.format(identity.dateOfBirth()), 137, 220.5f, 400, 1);
        field(page, annex, "Adresse", identity.address(), 73, 239, 400, 1);
        field(page, annex, "GSM", identity.gsm(), 52, 259, 178, 1);
        field(page, annex, "Fixe", identity.landline(), 277, 259.5f, 400, 1);
        field(page, annex, "Profession", identity.profession(), 88, 277, 179, 1);
        field(page, annex, "CIN", identity.cin(), 293, 277, 400, 1);
        field(page, annex, "Couverture médicale", identity.medicalCoverage(), 152, 297, 400, 1);

        var medical = data.medical();
        var history = medical.medicalHistory();
        for (Condition condition : history.conditions()) {
            switch (condition) {
                case CARDIAQUE -> page.tick(12.5f, 331);
                case OSTEOPOROSE -> page.tick(104, 331);
                case CHIRURGIE -> page.tick(206, 331);
                case MALADIE_DU_SANG -> page.tick(297.5f, 331.5f);
                case DIABETE -> page.tick(12.5f, 348);
                case SINUSITE -> page.tick(104, 348);
                case AUTRES -> page.tick(206, 348);
                case APPAREIL_GASTRIQUE -> page.tick(297.5f, 348);
            }
        }
        groupStatus(page, history.reportStatus(), history.conditions().isEmpty(), history.otherDetails(), 367);
        if (!history.otherDetails().isBlank()) annex.add(new AnnexField("Précisions sur les antécédents", history.otherDetails()));

        var allergies = medical.allergies();
        for (Allergy allergy : allergies.categories()) {
            switch (allergy) {
                case ASPIRINE -> page.tick(12.5f, 388.5f);
                case ANTIBIOTIQUE -> page.tick(85, 388.5f);
                case ANESTHESIE -> page.tick(176, 388.5f);
                case ALIMENT -> page.tick(262, 389);
                case AUTRES -> page.tick(340, 389);
            }
        }
        groupStatus(page, allergies.reportStatus(), allergies.categories().isEmpty(), allergies.clarification(), 407);
        if (!allergies.clarification().isBlank()) annex.add(new AnnexField("Précisions sur les allergies", allergies.clarification()));

        var questionnaire = medical.healthQuestionnaire();
        answer(page, questionnaire.underMedicalTreatment(), 428.5f);
        answer(page, questionnaire.pregnant(), 465.5f);
        field(page, annex, "Informations complémentaires sur la santé", questionnaire.additionalInformation(), 14, 507, 400, 2);
        field(page, annex, "Motif de consultation", questionnaire.reasonForConsultation(), 14, 560, 400, 2);
    }

    private static void groupStatus(DossierPage page, ReportStatus status, boolean empty, String details, float baseline) throws IOException {
        String text = status == ReportStatus.UNANSWERED ? "Non renseigné" : empty ? "Aucune catégorie cochée" : "";
        if (!details.isBlank()) text += (text.isEmpty() ? "" : " / ") + "Précisions en annexe";
        page.text(text, 14, baseline, 7.5f);
    }

    private static void answer(DossierPage page, Answer answer, float top) throws IOException {
        switch (answer) {
            case YES -> page.tick(118.5f, top);
            case NO -> page.tick(211.5f, top);
            case UNANSWERED -> page.text("Non renseigné", 268, top + 9, 8);
        }
    }

    private static void field(DossierPage page, List<AnnexField> annex, String label, String value,
            float x, float baseline, float right, int slots) throws IOException {
        if (value.isBlank()) return;
        var lines = page.wrap(nfc(value), right - x, TEXT_SIZE);
        if (lines.size() > slots) {
            annex.add(new AnnexField(label, value));
            page.text("Voir annexe", x, baseline, TEXT_SIZE);
            return;
        }
        for (int index = 0; index < lines.size(); index++) {
            page.text(lines.get(index), x, baseline + index * 17.5f, TEXT_SIZE);
        }
    }

    private static void verso(PDDocument document, PDType0Font font, DossierLedger ledger) throws IOException {
        var original = document.getPage(1);
        var base = new COSDictionary(original.getCOSObject());
        base.removeItem(COSName.STRUCT_PARENTS);
        base.removeItem(COSName.ANNOTS);
        var originalStreams = new ArrayList<PDStream>();
        original.getContentStreams().forEachRemaining(originalStreams::add);
        int rowIndex = 0;
        boolean totalsWritten = false;
        PDPage target = original;
        while (!totalsWritten) {
            try (var page = new DossierPage(document, target, font)) {
                page.text("Montants en DH", COLUMN_EDGES[1] + 4, 61, 7.5f);
                float y = TABLE_START;
                if (ledger.rows().isEmpty()) {
                    page.text("Aucun soin tarifé", 72, y + 12, TEXT_SIZE);
                    y += 20;
                }
                while (rowIndex < ledger.rows().size()) {
                    var row = financialRow(page, ledger.rows().get(rowIndex));
                    if (y + row.height() > TABLE_END) {
                        if (y == TABLE_START) throw new DossierFailure(DOSSIER_LIMIT);
                        break;
                    }
                    paintRow(page, row, y);
                    y += row.height();
                    rowIndex++;
                }
                if (rowIndex == ledger.rows().size()) {
                    var totals = List.of(totalRow(page, "TOTAL DES SOINS", ledger.totals().chargesMinor(), 2),
                            totalRow(page, "TOTAL REÇU", ledger.totals().receivedMinor(), 3),
                            totalRow(page, "RESTE À PAYER", ledger.totals().outstandingMinor(), 4));
                    float needed = 6;
                    for (TableRow total : totals) needed += total.height();
                    if (y + needed <= TABLE_END) {
                        y += 6;
                        page.rule(COLUMN_EDGES[0], COLUMN_EDGES[5], y);
                        for (TableRow total : totals) {
                            paintRow(page, total, y);
                            y += total.height();
                        }
                        totalsWritten = true;
                    }
                }
            }
            if (!totalsWritten) {
                target = new PDPage(new COSDictionary(base));
                target.setContents(originalStreams);
                addPage(document, target);
            }
        }
    }

    private static TableRow financialRow(DossierPage page, Row row) throws IOException {
        return row(page, List.of(DATE.format(row.date()), nfc(row.treatmentLabel()), money(BigInteger.valueOf(row.priceMinor())),
                money(BigInteger.valueOf(row.receivedMinor())), money(BigInteger.valueOf(row.remainingMinor()))));
    }

    private static TableRow totalRow(DossierPage page, String label, BigInteger amount, int column) throws IOException {
        var values = new ArrayList<>(List.of("", label, "", "", ""));
        values.set(column, money(amount));
        return row(page, values);
    }

    private static TableRow row(DossierPage page, List<String> values) throws IOException {
        var cells = new ArrayList<Cell>();
        int lineCount = 1;
        for (int i = 0; i < values.size(); i++) {
            float size = i == 0 ? 8 : TEXT_SIZE;
            var lines = page.wrap(values.get(i), COLUMN_EDGES[i + 1] - COLUMN_EDGES[i] - 8, size);
            cells.add(new Cell(lines, i >= 2, size));
            lineCount = Math.max(lineCount, lines.size());
        }
        return new TableRow(cells, 6 + lineCount * LINE_HEIGHT);
    }

    private static void paintRow(DossierPage page, TableRow row, float top) throws IOException {
        for (int i = 0; i < row.cells().size(); i++) {
            var cell = row.cells().get(i);
            for (int line = 0; line < cell.lines().size(); line++) {
                float baseline = top + 10 + line * LINE_HEIGHT;
                if (cell.rightAligned()) page.right(cell.lines().get(line), COLUMN_EDGES[i + 1] - 4, baseline, cell.size());
                else page.text(cell.lines().get(line), COLUMN_EDGES[i] + 4, baseline, cell.size());
            }
        }
        page.rule(COLUMN_EDGES[0], COLUMN_EDGES[5], top + row.height());
    }

    private static void annex(PDDocument document, PDType0Font font, List<AnnexField> fields) throws IOException {
        if (fields.isEmpty()) return;
        int index = 0;
        int lineIndex = 0;
        while (index < fields.size()) {
            var target = new PDPage(new PDRectangle(0, CROP_BOTTOM, WIDTH, HEIGHT));
            addPage(document, target);
            try (var page = new DossierPage(document, target, font)) {
                page.text("Annexe du recto", 20, 34, 16);
                float y = 56;
                while (index < fields.size() && y + 24 < 573) {
                    var field = fields.get(index);
                    var lines = page.wrap(nfc(field.value()), WIDTH - 40, 10);
                    page.text(field.label() + (lineIndex > 0 ? " (suite)" : ""), 20, y, 11);
                    y += 16;
                    while (lineIndex < lines.size() && y <= 573) {
                        page.text(lines.get(lineIndex++), 20, y, 10);
                        y += 13;
                    }
                    if (lineIndex < lines.size()) break;
                    index++;
                    lineIndex = 0;
                    y += 9;
                }
            }
        }
    }

    private static void addPage(PDDocument document, PDPage page) {
        if (document.getNumberOfPages() >= MAX_PAGES) throw new DossierFailure(DOSSIER_LIMIT);
        document.addPage(page);
    }

    private static String nfc(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFC);
    }

    private static String money(BigInteger minor) {
        var parts = minor.divideAndRemainder(BigInteger.valueOf(100));
        return THOUSANDS.matcher(parts[0].toString()).replaceAll(" ") + "," + (parts[1].intValueExact() < 10 ? "0" : "") + parts[1];
    }
}
