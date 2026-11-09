package ma.sijilmassa.patient;

import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import static ma.sijilmassa.patient.PatientValues.*;

/** Explicit allowlists: entities and mixed frontend Patient objects are never bound. */
public final class PatientDtos {
    private PatientDtos() { }
    public interface StrictInput {
        @JsonAnySetter
        default void rejectUnknown(String name, Object ignored) {
            throw new IllegalArgumentException("Champ non autorisé.");
        }
    }
    static String trim(String value) { return value == null ? null : value.strip(); }
    static String name(String value) { return value == null ? null : value.replaceAll("(?U)\\s+", " ").strip(); }

    public record Identity(
            @NotBlank @Size(max = 80) String firstName,
            @NotBlank @Size(max = 80) String lastName,
            @NotNull Sex sex, LocalDate dateOfBirth,
            @NotNull @Size(max = 300) String address,
            @NotNull @Size(max = 40) String gsm,
            @NotNull @Size(max = 40) String landline,
            @NotNull @Size(max = 120) String profession,
            @NotNull @Size(max = 30) String cin,
            @NotNull @Size(max = 120) String medicalCoverage) implements StrictInput {
        public Identity {
            firstName = name(firstName); lastName = name(lastName);
            address = trim(address); gsm = trim(gsm); landline = trim(landline);
            profession = trim(profession); cin = trim(cin); medicalCoverage = trim(medicalCoverage);
        }
        @JsonIgnore @AssertTrue public boolean isPhoneFormatValid() { return phone(gsm) && phone(landline); }
        private static boolean phone(String value) {
            if (value == null || value.isEmpty()) return true;
            int digits = value.replaceAll("[^0-9]", "").length();
            return digits >= 6 && digits <= 20 && value.matches("[+0-9\\s().#-]+");
        }
    }
    public record AdministrativeCreate(@NotNull @Valid Identity identity, @NotNull Status status) implements StrictInput { }
    public record AdministrativeUpdate(@NotNull @PositiveOrZero Long version,
            @NotNull @Valid Identity identity, @NotNull Status status) implements StrictInput { }
    public record AdministrativeDetails(UUID id, String reference, Identity identity, Status status,
            Instant createdAt, Instant updatedAt, long version) { }
    public record DirectoryIdentity(String firstName, String lastName, Sex sex, LocalDate dateOfBirth,
            String gsm, String landline) { }
    public record DirectoryEntry(UUID id, String reference, DirectoryIdentity identity,
            Status status, Instant createdAt, long version) { }
    public record DirectoryPage(List<DirectoryEntry> items, long total, int page, int pageSize, long pageCount) { }

    public record MedicalHistory(@NotNull ReportStatus reportStatus,
            @NotNull @Size(max = 8) List<@NotNull Condition> conditions,
            @NotNull @Size(max = 1000) String otherDetails) implements StrictInput {
        public MedicalHistory { otherDetails = trim(otherDetails); }
        @JsonIgnore @AssertTrue public boolean isConsistent() {
            if (conditions == null || otherDetails == null || reportStatus == null) return true;
            return new HashSet<>(conditions).size() == conditions.size()
                    && (reportStatus != ReportStatus.UNANSWERED || (conditions.isEmpty() && otherDetails.isEmpty()))
                    && (otherDetails.isEmpty() || conditions.contains(Condition.AUTRES));
        }
    }
    public record Allergies(@NotNull ReportStatus reportStatus,
            @NotNull @Size(max = 5) List<@NotNull Allergy> categories,
            @NotNull @Size(max = 1000) String clarification) implements StrictInput {
        public Allergies { clarification = trim(clarification); }
        @JsonIgnore @AssertTrue public boolean isConsistent() {
            if (categories == null || clarification == null || reportStatus == null) return true;
            return new HashSet<>(categories).size() == categories.size()
                    && (reportStatus != ReportStatus.UNANSWERED || (categories.isEmpty() && clarification.isEmpty()));
        }
    }
    public record Questionnaire(@NotNull Answer underMedicalTreatment, @NotNull Answer pregnant,
            @NotNull @Size(max = 2000) String additionalInformation,
            @NotNull @Size(max = 2000) String reasonForConsultation) implements StrictInput {
        public Questionnaire { additionalInformation = trim(additionalInformation); reasonForConsultation = trim(reasonForConsultation); }
    }
    public record MedicalContent(@NotNull @Min(1) @Max(1) Integer questionnaireVersion,
            @NotNull @Valid MedicalHistory medicalHistory, @NotNull @Valid Allergies allergies,
            @NotNull @Valid Questionnaire healthQuestionnaire) implements StrictInput {
        public static MedicalContent unanswered() {
            return new MedicalContent(1, new MedicalHistory(ReportStatus.UNANSWERED, List.of(), ""),
                    new Allergies(ReportStatus.UNANSWERED, List.of(), ""),
                    new Questionnaire(Answer.UNANSWERED, Answer.UNANSWERED, "", ""));
        }
    }
    public record MedicalUpdate(@NotNull @PositiveOrZero Long version,
            @NotNull @Valid MedicalContent record) implements StrictInput { }
    public record MedicalDetails(UUID patientId, long version, Instant createdAt,
            Instant updatedAt, MedicalContent record) { }
    public record ClinicalCreate(@NotNull @Valid AdministrativeCreate patient,
            @NotNull @Valid MedicalContent medicalRecord) implements StrictInput { }
    public record ClinicalCreated(AdministrativeDetails patient, MedicalDetails medicalRecord) { }
}
