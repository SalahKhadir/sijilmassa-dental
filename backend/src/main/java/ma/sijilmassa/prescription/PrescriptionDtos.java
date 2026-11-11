package ma.sijilmassa.prescription;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import com.fasterxml.jackson.annotation.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import ma.sijilmassa.patient.PatientDtos.StrictInput;

public final class PrescriptionDtos {
    private PrescriptionDtos() { }
    public static final long MAX_VERSION = 9007199254740991L;
    public record LineInput(UUID id,
            @NotNull @Size(max = 200) String medicationName,
            @NotNull @Size(max = 300) String dosage,
            @NotNull @Size(max = 200) String frequency,
            @NotNull @Size(max = 200) String duration,
            @NotNull @Size(max = 1500) String instructions) implements StrictInput {
        @Override public String toString() { return "Prescription line [content withheld]"; }
    }
    public record DraftContent(@JsonProperty(required = true) UUID consultationId,
            @NotNull @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "uuuu-MM-dd", lenient = OptBoolean.FALSE) LocalDate issuedDate,
            @NotNull @Size(max = 20) List<@NotNull @Valid LineInput> medications,
            @NotNull @Size(max = 2000) String generalInstructions) implements StrictInput {
        @Override public String toString() { return "Prescription content [withheld]"; }
    }
    public record Create(@NotNull UUID patientId, @NotNull @Valid DraftContent content) implements StrictInput { }
    public record Update(@NotNull @Min(0) @Max(MAX_VERSION) Long version,
            @NotNull @Valid DraftContent content) implements StrictInput { }
    public record Finalize(@NotNull @Min(0) @Max(MAX_VERSION) Long version,
            @NotNull @Min(0) @Max(MAX_VERSION) Long patientVersion) implements StrictInput { }
    public record SnapshotPatient(String firstName, String lastName, String displayName, String reference) {
        @Override public String toString() { return "Snapshot patient [withheld]"; }
    }
    public record Document(int snapshotSchemaVersion, Instant capturedAt, SnapshotPatient patientIdentity,
            String practitionerDisplayName, String templateId, String templateSha256, String rendererId,
            String pdfSha256, int pdfBytes) {
        @Override public String toString() { return "Prescription document metadata [withheld]"; }
    }
    public record ExpectedVersion(@NotNull @Min(0) @Max(MAX_VERSION) Long version) implements StrictInput { }
    public record Line(UUID id, String medicationName, String dosage, String frequency, String duration, String instructions) {
        @Override public String toString() { return "Prescription line [content withheld]"; }
    }
    public record StoredContent(UUID consultationId, LocalDate issuedDate, List<Line> medications, String generalInstructions) {
        public StoredContent { medications = List.copyOf(medications); }
        @Override public String toString() { return "Prescription content [withheld]"; }
    }
    public record PatientDisplay(UUID id, String reference, String firstName, String lastName,
            String displayName, long version, String status) {
        @Override public String toString() { return "Prescription patient [identity withheld]"; }
    }
    public record Details(UUID id, UUID patientId, long version, Prescription.Status status, StoredContent content,
            PatientDisplay patient, Instant createdAt, Instant updatedAt, Instant finalizedAt, Instant archivedAt,
            Document document) { }
    public record Summary(UUID id, LocalDate issuedDate, Prescription.Status status, long version,
            UUID consultationId, Instant finalizedAt, Instant archivedAt) { }
    public record Cursor(LocalDate date, UUID id) { }
    public record HistoryPage(List<Summary> items, Cursor nextCursor) {
        public HistoryPage { items = List.copyOf(items); }
    }
}
