package ma.sijilmassa.prescription.rendering;

import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import ma.sijilmassa.prescription.PrescriptionDtos;

/** Internal transport only, not an HTTP request DTO. Identity is copied from a server-owned read. */
public record RenderingRequest(int protocolVersion, UUID requestId, Mode mode, Record record, Patient patient) {
    public enum Mode { DRAFT, FINAL_LAYOUT_CHECK }
    public record Record(UUID id, UUID patientId, UUID consultationId, long version, LocalDate issuedDate,
            List<PrescriptionDtos.Line> medications, String generalInstructions, Instant createdAt, Instant updatedAt) {
        public Record { medications = List.copyOf(medications); }
        @Override public String toString() { return "Rendering record [withheld]"; }
    }
    public record Patient(UUID id, String reference, String firstName, String lastName, String displayName, long version) {
        @Override public String toString() { return "Rendering patient [withheld]"; }
    }
    public static RenderingRequest from(PrescriptionDtos.Details details, Mode mode) {
        if (details == null || details.content() == null || details.patient() == null || mode == null)
            throw new RenderingFailure(RenderingFailure.Code.INVALID_INPUT);
        var p = details.patient(); var c = details.content();
        return new RenderingRequest(1, UUID.randomUUID(), mode,
                new Record(details.id(), details.patientId(), c.consultationId(), details.version(), c.issuedDate(),
                        c.medications(), c.generalInstructions(), details.createdAt(), details.updatedAt()),
                new Patient(p.id(), p.reference(), p.firstName(), p.lastName(), p.displayName(), p.version()));
    }
    @Override public String toString() { return "Rendering request [withheld]"; }
}
