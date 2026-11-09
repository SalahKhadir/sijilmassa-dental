package ma.sijilmassa.patient;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public final class PatientValues {
    private PatientValues() { }
    public interface WireValue { @JsonValue String value(); }
    private static <E extends Enum<E> & WireValue> E parse(E[] values, String text) {
        for (E value : values) if (value.value().equals(text)) return value;
        throw new IllegalArgumentException("Valeur non autorisée.");
    }
    public enum Status implements WireValue {
        ACTIVE("active"), INACTIVE("inactive");
        private final String value;
        Status(String value) { this.value = value; }
        public String value() { return value; }
        @JsonCreator public static Status from(String value) { return parse(values(), value); }
    }
    public enum Sex implements WireValue {
        UNANSWERED("unanswered"), F("F"), M("M");
        private final String value;
        Sex(String value) { this.value = value; }
        public String value() { return value; }
        @JsonCreator public static Sex from(String value) { return parse(values(), value); }
    }
    public enum ReportStatus implements WireValue {
        UNANSWERED("unanswered"), REPORTED("reported");
        private final String value;
        ReportStatus(String value) { this.value = value; }
        public String value() { return value; }
        @JsonCreator public static ReportStatus from(String value) { return parse(values(), value); }
    }
    public enum Answer implements WireValue {
        UNANSWERED("unanswered"), YES("yes"), NO("no");
        private final String value;
        Answer(String value) { this.value = value; }
        public String value() { return value; }
        @JsonCreator public static Answer from(String value) { return parse(values(), value); }
    }
    public enum Condition implements WireValue {
        CARDIAQUE("Cardiaque"), OSTEOPOROSE("Ostéoporose"), CHIRURGIE("Chirurgie"),
        MALADIE_DU_SANG("Maladie du sang"), DIABETE("Diabète"), SINUSITE("Sinusite"),
        AUTRES("Autres"), APPAREIL_GASTRIQUE("Appareil gastrique");
        private final String value;
        Condition(String value) { this.value = value; }
        public String value() { return value; }
        @JsonCreator public static Condition from(String value) { return parse(values(), value); }
    }
    public enum Allergy implements WireValue {
        ASPIRINE("Aspirine"), ANTIBIOTIQUE("Antibiotique"), ANESTHESIE("Anesthésie"),
        ALIMENT("Aliment"), AUTRES("Autres");
        private final String value;
        Allergy(String value) { this.value = value; }
        public String value() { return value; }
        @JsonCreator public static Allergy from(String value) { return parse(values(), value); }
    }
}
