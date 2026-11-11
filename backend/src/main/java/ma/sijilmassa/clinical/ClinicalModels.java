package ma.sijilmassa.clinical;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Service commands and detached results. No transport or persistence objects escape the service. */
public final class ClinicalModels {
    private ClinicalModels() { }
    public record Draft(UUID appointmentId, LocalDate consultationDate, String chiefComplaint,
            String clinicalObservations, String assessment, String treatmentPlan, String notes) {
        public Draft {
            chiefComplaint = trim(chiefComplaint); clinicalObservations = trim(clinicalObservations);
            assessment = trim(assessment); treatmentPlan = trim(treatmentPlan); notes = trim(notes);
        }
        @Override public String toString() { return "Clinical draft [content withheld]"; }
    }
    public record Treatment(LocalDate treatmentDate, String description, String toothReference, String notes) {
        public Treatment { description = trim(description); toothReference = trim(toothReference); notes = trim(notes); }
        @Override public String toString() { return "Clinical treatment [content withheld]"; }
    }
    public record TreatmentDetails(UUID id, long version, Treatment content, Instant createdAt, Instant updatedAt) { }
    public record Details(UUID id, UUID patientId, long version, Consultation.Status status, Draft content,
            List<TreatmentDetails> treatments, Instant createdAt, Instant updatedAt) {
        public Details { treatments = List.copyOf(treatments); }
    }
    public record Summary(UUID id, LocalDate consultationDate, Consultation.Status status, long version) { }
    public record Cursor(LocalDate date, UUID id) { }
    public record HistoryPage(List<Summary> items, Cursor nextCursor) {
        public HistoryPage { items = List.copyOf(items); }
    }
    public record RemovedTreatment(TreatmentDetails treatment, Instant removedAt) { }
    private static String trim(String value) { return value == null ? null : value.strip(); }
}
