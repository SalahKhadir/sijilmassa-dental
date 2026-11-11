package ma.sijilmassa.prescription;

import java.time.LocalDate;
import java.util.UUID;
import static ma.sijilmassa.prescription.PrescriptionFailure.Reason.INVALID_INPUT;
import static ma.sijilmassa.prescription.PrescriptionDtos.*;

final class PrescriptionValidation {
    private PrescriptionValidation() { }
    static PrescriptionFailure invalid() { return new PrescriptionFailure(INVALID_INPUT); }
    static boolean date(LocalDate value) { return value != null && value.getYear() >= 1 && value.getYear() <= 9999; }
    static void version(Long value) { if (value == null || value < 0 || value > MAX_VERSION) throw invalid(); }
    static void content(DraftContent c) {
        if (c == null || !date(c.issuedDate()) || c.medications() == null || c.medications().size() > 20) throw invalid();
        text(c.generalInstructions(), 2000);
        for (LineInput line : c.medications()) {
            if (line == null) throw invalid();
            text(line.medicationName(), 200); text(line.dosage(), 300); text(line.frequency(), 200);
            text(line.duration(), 200); text(line.instructions(), 1500);
        }
    }
    static String text(String value, int max) {
        if (value == null || value.length() > max) throw invalid();
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (ch < 32 && ch != '\t' && ch != '\r' && ch != '\n') throw invalid();
            if (Character.isHighSurrogate(ch)) {
                if (++i == value.length() || !Character.isLowSurrogate(value.charAt(i))) throw invalid();
            } else if (Character.isLowSurrogate(ch)) throw invalid();
        }
        return value.replaceAll("^[ \\t\\r\\n]+|[ \\t\\r\\n]+$", "");
    }
    static UUID uuid(String value) {
        if (value == null || !value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) throw invalid();
        return UUID.fromString(value);
    }
}
