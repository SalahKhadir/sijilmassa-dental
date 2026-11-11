package ma.sijilmassa.clinical;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.OptBoolean;
import ma.sijilmassa.patient.PatientDtos.StrictInput;

/** Explicit transport allowlists; no entities or mutable service results are bound. */
public final class ConsultationDtos {
    private ConsultationDtos() { }
    public record DraftContent(UUID appointmentId,
            @NotNull @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "uuuu-MM-dd", lenient = OptBoolean.FALSE) LocalDate consultationDate,
            @NotBlank @Size(max = 500) String chiefComplaint,
            @NotNull @Size(max = 5000) String clinicalObservations,
            @NotNull @Size(max = 5000) String assessment,
            @NotNull @Size(max = 5000) String treatmentPlan,
            @NotNull @Size(max = 5000) String notes) implements StrictInput {
        ClinicalModels.Draft command() { return new ClinicalModels.Draft(appointmentId, consultationDate, chiefComplaint, clinicalObservations, assessment, treatmentPlan, notes); }
        @Override public String toString() { return "Clinical draft DTO [content withheld]"; }
    }
    public record TreatmentContent(
            @NotNull @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "uuuu-MM-dd", lenient = OptBoolean.FALSE) LocalDate treatmentDate,
            @NotBlank @Size(max = 1000) String description,
            @NotNull @Size(max = 50) String toothReference,
            @NotNull @Size(max = 2000) String notes) implements StrictInput {
        ClinicalModels.Treatment command() { return new ClinicalModels.Treatment(treatmentDate, description, toothReference, notes); }
        @Override public String toString() { return "Clinical treatment DTO [content withheld]"; }
    }
    public record Create(@NotNull UUID patientId, @NotNull @Valid DraftContent content) implements StrictInput { }
    public record Update(@NotNull @PositiveOrZero Long version, @NotNull @Valid DraftContent content) implements StrictInput { }
    public record TreatmentMutation(@NotNull @PositiveOrZero Long version, @NotNull @Valid TreatmentContent content) implements StrictInput { }
    public record ExpectedVersion(@NotNull @PositiveOrZero Long version) implements StrictInput { }
    public record TreatmentDetails(UUID id, long version, TreatmentContent content, Instant createdAt, Instant updatedAt) { }
    public record Details(UUID id, UUID patientId, long version, Consultation.Status status, DraftContent content,
            List<TreatmentDetails> treatments, Instant createdAt, Instant updatedAt) {
        public Details { treatments = List.copyOf(treatments); }
    }
    public record Cursor(LocalDate date, UUID id) { }
    public record Summary(UUID id, LocalDate consultationDate, Consultation.Status status, long version) { }
    public record HistoryPage(List<Summary> items, Cursor nextCursor) {
        public HistoryPage { items = List.copyOf(items); }
    }
    public record RemovedTreatment(TreatmentDetails treatment, Instant removedAt) { }
    public record RemovedPage(List<RemovedTreatment> items, Cursor nextCursor) {
        public RemovedPage { items = List.copyOf(items); }
    }

    static Details response(ClinicalModels.Details c) {
        return new Details(c.id(), c.patientId(), c.version(), c.status(), draft(c.content()),
                c.treatments().stream().map(ConsultationDtos::treatment).toList(), c.createdAt(), c.updatedAt());
    }
    static HistoryPage response(ClinicalModels.HistoryPage page) {
        return new HistoryPage(page.items().stream().map(c -> new Summary(c.id(), c.consultationDate(), c.status(), c.version())).toList(),
                page.nextCursor() == null ? null : new Cursor(page.nextCursor().date(), page.nextCursor().id()));
    }
    static RemovedPage removed(List<ClinicalModels.RemovedTreatment> page) {
        var items = page.stream().map(t -> new RemovedTreatment(treatment(t.treatment()), t.removedAt())).toList();
        var last = items.isEmpty() ? null : items.getLast().treatment();
        return new RemovedPage(items, items.size() == 50 ? new Cursor(last.content().treatmentDate(), last.id()) : null);
    }
    private static DraftContent draft(ClinicalModels.Draft c) {
        return new DraftContent(c.appointmentId(), c.consultationDate(), c.chiefComplaint(), c.clinicalObservations(), c.assessment(), c.treatmentPlan(), c.notes());
    }
    private static TreatmentDetails treatment(ClinicalModels.TreatmentDetails t) {
        var c = t.content();
        return new TreatmentDetails(t.id(), t.version(), new TreatmentContent(c.treatmentDate(), c.description(), c.toothReference(), c.notes()), t.createdAt(), t.updatedAt());
    }
}
