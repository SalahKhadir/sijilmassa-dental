package ma.sijilmassa.insurance;

import java.io.IOException;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;

import static ma.sijilmassa.insurance.InsuranceModels.*;
import static ma.sijilmassa.insurance.InsurancePdfFailure.Code.*;

/** Coordinates measured separately on each original. Visual origin is top left. */
final class InsurancePdfLayout {
    private static final float TEXT_SIZE = 8;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/uuuu", Locale.ROOT);
    private static final float[] CNSS_ACT_CODE = {0, 11.5f, 23.5f, 35};
    private static final float[] CNSS_DATE = {0, 10, 24, 34, 48, 58, 68, 78};
    private static final float[] CNOPS_DATE = {0, 9.8f, 23.4f, 33.2f, 47, 56.8f, 66.6f, 76.4f};
    private static final float[] CNOPS_DECLARATION_DATE = {0, 9.8f, 21.6f, 31.4f, 43.2f, 53, 62.8f, 72.6f};

    private final PDPageContentStream canvas;
    private final PDFont font;

    InsurancePdfLayout(PDPageContentStream canvas, PDFont font) {
        this.canvas = canvas;
        this.font = font;
    }

    void identity(Snapshot snapshot) throws IOException {
        var holder = snapshot.insured();
        var patient = snapshot.beneficiary();
        if (snapshot.documentType() == DocumentType.CNSS_DENTAIRE) {
            var fields = snapshot.fields().cnss();
            if (fields == null) throw new InsurancePdfFailure(INSURANCE_PDF_INTEGRITY);
            check(snapshot.purpose() == Purpose.ENTENTE_PREALABLE ? 764 : 850, 68, 5);
            text(name(holder.lastName(), holder.firstName()), 650, 108, 273);
            digits(required(fields.registrationNumber()), 669, 127, 9, 10);
            digits(holder.cin(), 813, 142, 9, 10);
            switch (holder.relationship()) {
                case CONJOINT -> check(734.5f, 170, 3.4f);
                case ENFANT -> check(802.5f, 170, 3.4f);
                case LUI_MEME -> check(876.5f, 170, 3.4f);
            }
            address(holder.address(), 629, 187, 322, 11);
            text(snapshot.fields().attachmentCount(), 819, 229, 53);
            text(name(patient.lastName(), patient.firstName()), 650, 275, 272);
            dateSlots(patient.dateOfBirth(), 771, 290, CNSS_DATE);
            digits(patient.cin(), 779, 311, 9, 10);
            sex(patient.sex(), 842, 897, 328);
            digits(practitioner(fields.practitionerInp()), 627, 367, 9, 10);
            for (var care : list(fields.careTypes())) {
                check(791, switch (care) {
                    case SOINS -> 392;
                    case PROTHESE -> 409;
                    case ORTHODONTIE_FACIALE -> 425;
                    case AUTRES -> 441;
                }, 5);
            }
            digits(fields.priorAuthorizationNumber(), 762, 464, 9, 10);
            dateSlots(fields.accidentDate(), 766, 481, CNSS_DATE);
            if (fields.dentistDeclaration() != null) {
                text(fields.dentistDeclaration().place(), 861, 528, 86);
                dateSlots(fields.dentistDeclaration().date(), 857, 541, CNSS_DATE);
            }
        } else {
            var fields = snapshot.fields().cnops();
            if (fields == null) throw new InsurancePdfFailure(INSURANCE_PDF_INTEGRITY);
            check(snapshot.purpose() == Purpose.ENTENTE_PREALABLE ? 610.5f : 671, 49.5f, 4);
            if (holder.source() == InsuredSource.DOCUMENT_INPUT) text(holder.phone(), 579, 69.5f, 100);
            text(name(holder.lastName(), holder.firstName()), 515, 101.5f, 179);
            text(required(fields.affiliationNumber()), 515, 115.5f, 179);
            text(required(fields.registrationNumber()), 515, 129.5f, 179);
            text(holder.cin(), 515, 143.5f, 179);
            switch (holder.relationship()) {
                case CONJOINT -> check(585.5f, 160.5f, 4.5f);
                case ENFANT -> check(655.5f, 160.5f, 4.5f);
                case LUI_MEME -> { /* This original has no self checkbox. */ }
            }
            address(holder.address(), 478, 191.5f, 233, 11.5f);
            text(snapshot.fields().attachmentCount(), 529, 228.4f, 166);
            text(name(patient.lastName(), patient.firstName()), 513, 271.5f, 196);
            dateSlots(patient.dateOfBirth(), 566, 285.7f, CNOPS_DATE);
            digits(patient.cin(), 571, 299.5f, 8, 9.6f);
            sex(patient.sex(), 574, 654.5f, 310);
            digits(practitioner(fields.practitionerInpe()), 574, 346, 9, 9.7f);
            for (var care : list(fields.careTypes())) {
                switch (care) {
                    case SOINS -> check(517.5f, 379, 4);
                    case PROTHESE -> check(691, 379, 4);
                    case ORTHODONTIE_ODF -> check(517.5f, 394, 4);
                    case AUTRES -> check(691, 394, 4);
                }
            }
            digits(fields.priorAuthorizationNumber(), 576, 413.8f, 8, 9.7f);
            dateSlots(fields.accidentDate(), 570, 438.5f, CNOPS_DATE);
            text(fields.accidentCauses(), 523, 452, 218);
            if (fields.dentistDeclaration() != null) {
                text(fields.dentistDeclaration().place(), 656, 468, 95);
                dateSlots(fields.dentistDeclaration().date(), 663, 480.4f, CNOPS_DECLARATION_DATE);
            }
        }
    }

    void acts(Snapshot snapshot) throws IOException {
        boolean cnss = snapshot.documentType() == DocumentType.CNSS_DENTAIRE;
        float[] rows = cnss ? new float[]{88, 162, 233} : new float[]{73, 90.5f, 108.5f, 126.7f, 145.2f, 163.2f, 180.5f, 199, 216.5f};
        for (int index = 0; index < snapshot.acts().size(); index++) {
            var act = snapshot.acts().get(index);
            float y = rows[index];
            text(act.tooth(), cnss ? 588 : 425, y, cnss ? 44 : 38);
            if (cnss) slots(act.actCode(), 635.5f, y, CNSS_ACT_CODE, 11);
            else text(act.actCode(), 469, y, 41);
            text(date(act.date()), cnss ? 685 : 516, y, cnss ? 47 : 42);
            String key = act.keyLetter() == null ? "" : act.keyLetter();
            if (act.coefficient() != null) key = (key + " " + act.coefficient().toPlainString().replace('.', ',')).strip();
            text(key, cnss ? 738 : 564, y, cnss ? 45 : 40);
            right(money(act.keyValueMinor()), cnss ? 788 : 608, y, cnss ? 44 : 33);
            // Montant facturé has no approved source in the insurance snapshot.
        }
        if (!cnss) slots(snapshot.fields().cnops().diagnosisCategory(), 580, 236.5f, new float[]{0, 18.5f, 37}, 17);
        for (String tooth : list(cnss ? snapshot.fields().cnss().confirmedTeeth() : snapshot.fields().cnops().confirmedTeeth())) {
            var point = InsurancePdfTeeth.position(snapshot.documentType(), tooth);
            canvas.setLineWidth(.7f);
            canvas.addRect(point.x() - 1.4f, -point.y() - 1.4f, 2.8f, 2.8f);
            canvas.stroke();
        }
    }

    private static <T> List<T> list(List<T> values) {
        return values == null ? List.of() : values;
    }

    private static String required(String value) {
        if (value == null || value.isBlank()) throw new InsurancePdfFailure(INSURANCE_PDF_INTEGRITY);
        return value;
    }

    private static String practitioner(String value) {
        if (!required(value).matches("[0-9]{9}")) throw new InsurancePdfFailure(INSURANCE_PDF_INTEGRITY);
        return value;
    }

    private static String name(String last, String first) {
        return required(last) + " " + required(first);
    }

    private static String date(LocalDate value) {
        return value == null ? null : DATE.format(value);
    }

    private static String money(Long minor) {
        if (minor == null) return null;
        if (minor < 0 || minor > 9_007_199_254_740_991L) throw new InsurancePdfFailure(INSURANCE_PDF_INTEGRITY);
        return (minor / 100) + "," + (minor % 100 < 10 ? "0" : "") + minor % 100;
    }

    private void dateSlots(LocalDate value, float x, float y, float[] offsets) throws IOException {
        if (value != null) slots(date(value).replace("/", ""), x, y, offsets, 9);
    }

    private void digits(String value, float x, float y, int count, float step) throws IOException {
        if (value == null) return;
        float[] offsets = new float[count];
        for (int i = 0; i < count; i++) offsets[i] = i * step;
        slots(value, x, y, offsets, step);
    }

    private void slots(String value, float x, float y, float[] offsets, float cellWidth) throws IOException {
        if (value == null) return;
        int[] codepoints = normalized(value).codePoints().toArray();
        if (codepoints.length > offsets.length) throw new InsurancePdfFailure(INSURANCE_PDF_LAYOUT_OVERFLOW);
        for (int i = 0; i < codepoints.length; i++) {
            String glyph = Character.toString(codepoints[i]);
            float spare = cellWidth - width(glyph);
            if (spare < 0) throw new InsurancePdfFailure(INSURANCE_PDF_LAYOUT_OVERFLOW);
            draw(glyph, x + offsets[i] + spare / 2, y);
        }
    }

    private void sex(String sex, float male, float female, float y) throws IOException {
        if ("M".equals(sex)) check(male, y, 3);
        if ("F".equals(sex)) check(female, y, 3);
    }

    private void check(float x, float y, float size) throws IOException {
        float radius = size / 2;
        canvas.setLineWidth(.8f);
        canvas.moveTo(x - radius, -y + radius);
        canvas.lineTo(x + radius, -y - radius);
        canvas.moveTo(x - radius, -y - radius);
        canvas.lineTo(x + radius, -y + radius);
        canvas.stroke();
    }

    private void address(String value, float x, float y, float available, float leading) throws IOException {
        if (value == null || value.isEmpty()) return;
        String text = normalized(value);
        if (width(text) <= available) {
            draw(text, x, y);
            return;
        }
        int split = text.lastIndexOf(' ');
        while (split > 0 && width(text.substring(0, split)) > available) split = text.lastIndexOf(' ', split - 1);
        if (split <= 0) throw new InsurancePdfFailure(INSURANCE_PDF_LAYOUT_OVERFLOW);
        text(text.substring(0, split).stripTrailing(), x, y, available);
        text(text.substring(split + 1).stripLeading(), x, y + leading, available);
    }

    private void text(Object value, float x, float y, float available) throws IOException {
        place(value == null ? null : value.toString(), x, y, available, false);
    }

    private void right(String value, float x, float y, float available) throws IOException {
        place(value, x, y, available, true);
    }

    private void place(String value, float x, float y, float available, boolean right) throws IOException {
        if (value == null || value.isEmpty()) return;
        String content = normalized(value);
        float spare = available - width(content);
        if (spare < 0) throw new InsurancePdfFailure(INSURANCE_PDF_LAYOUT_OVERFLOW);
        draw(content, x + (right ? spare : 0), y);
    }

    private static String normalized(String value) {
        String result = Normalizer.normalize(value, Normalizer.Form.NFC);
        if (result.codePoints().anyMatch(code -> {
            var script = Character.UnicodeScript.of(code);
            return Character.isISOControl(code) || Character.getType(code) == Character.FORMAT
                    || (script != Character.UnicodeScript.LATIN && script != Character.UnicodeScript.COMMON);
        })) throw new InsurancePdfFailure(INSURANCE_PDF_UNSUPPORTED_TEXT);
        return result;
    }

    private float width(String value) throws IOException {
        try {
            return font.getStringWidth(value) * TEXT_SIZE / 1000;
        } catch (IllegalArgumentException failure) {
            throw new InsurancePdfFailure(INSURANCE_PDF_UNSUPPORTED_TEXT);
        }
    }

    private void draw(String value, float x, float y) throws IOException {
        canvas.beginText();
        canvas.setFont(font, TEXT_SIZE);
        canvas.newLineAtOffset(x, -y);
        canvas.showText(value);
        canvas.endText();
    }
}
