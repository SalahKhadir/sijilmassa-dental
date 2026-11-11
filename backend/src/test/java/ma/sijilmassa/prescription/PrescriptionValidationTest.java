package ma.sijilmassa.prescription;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static ma.sijilmassa.prescription.PrescriptionDtos.*;

class PrescriptionValidationTest {
    @Test void allowsIncompleteDraftsAndPreservesInternalWhitespace() {
        PrescriptionValidation.content(new DraftContent(null, LocalDate.of(1, 1, 1), List.of(), ""));
        assertThat(PrescriptionValidation.text(" \tTexte\n intérieur\r\n", 100)).isEqualTo("Texte\n intérieur");
        assertThat(PrescriptionValidation.text("\u00a0texte\u00a0", 100)).isEqualTo("\u00a0texte\u00a0");
    }
    @Test void rejectsControlsAndUnpairedSurrogatesWithoutEchoingContent() {
        for (String value : List.of("SECRET\0", "SECRET\u0001", "SECRET\ud800", "SECRET\udc00"))
            assertThatThrownBy(() -> PrescriptionValidation.text(value, 100)).isInstanceOf(PrescriptionFailure.class).hasMessageNotContaining("SECRET");
        assertThat(PrescriptionValidation.text("\ud83e\uddb7", 2)).hasSize(2);
        assertThatThrownBy(() -> PrescriptionValidation.text("\ud83e\uddb7", 1)).isInstanceOf(PrescriptionFailure.class);
    }
    @Test void validatesDateAndAggregateSizeAtServiceBoundary() {
        assertThatThrownBy(() -> PrescriptionValidation.content(new DraftContent(null, LocalDate.of(10000, 1, 1), List.of(), "")))
                .isInstanceOf(PrescriptionFailure.class);
        var line = new LineInput(null, "", "", "", "", "");
        assertThatThrownBy(() -> PrescriptionValidation.content(new DraftContent(null, LocalDate.now(), java.util.Collections.nCopies(21, line), "")))
                .isInstanceOf(PrescriptionFailure.class);
        assertThatThrownBy(() -> PrescriptionValidation.content(null)).isInstanceOf(PrescriptionFailure.class);
    }
    @Test void versionsAreSafeIntegersAndUuidSyntaxIsCanonical() {
        PrescriptionValidation.version(MAX_VERSION);
        for (Long value : new Long[]{null, -1L, MAX_VERSION + 1})
            assertThatThrownBy(() -> PrescriptionValidation.version(value)).isInstanceOf(PrescriptionFailure.class);
        var id = UUID.randomUUID(); assertThat(PrescriptionValidation.uuid(id.toString())).isEqualTo(id);
        for (String value : List.of("1-1-1-1-1", "prescription-demo-001", ""))
            assertThatThrownBy(() -> PrescriptionValidation.uuid(value)).isInstanceOf(PrescriptionFailure.class);
    }
    @Test void dtoToStringDoesNotLeakClinicalOrPatientText() {
        var content = new DraftContent(null, LocalDate.now(), List.of(new LineInput(null, "SECRET", "", "", "", "")), "SECRET");
        assertThat(new Create(UUID.randomUUID(), content).toString()).doesNotContain("SECRET");
        assertThat(new PatientDisplay(UUID.randomUUID(), "SECRET", "SECRET", "SECRET", "SECRET", 0, "active").toString()).doesNotContain("SECRET");
    }
}
