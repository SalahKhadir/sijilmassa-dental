package ma.sijilmassa.appointment;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import jakarta.validation.constraints.*;
import ma.sijilmassa.patient.PatientDtos.StrictInput;

public final class AppointmentDtos {
    private AppointmentDtos() { }
    public enum Status {
        EN_ATTENTE, CONFIRME, TERMINE, ANNULE, ABSENT;
        public boolean occupiesSlot() { return this == EN_ATTENTE || this == CONFIRME || this == TERMINE; }
    }
    public enum Type { CONSULTATION, CONTROLE, DETARTRAGE, SOIN_DENTAIRE, EXTRACTION, AUTRE }
    public record Create(@NotNull UUID patientId, @NotNull OffsetDateTime startAt,
            @NotNull OffsetDateTime endAt, @NotNull Type type) implements StrictInput { }
    public record Update(@NotNull @PositiveOrZero Long version, @NotNull UUID patientId,
            @NotNull OffsetDateTime startAt, @NotNull OffsetDateTime endAt, @NotNull Type type) implements StrictInput { }
    public record StatusUpdate(@NotNull @PositiveOrZero Long version, @NotNull Status status) implements StrictInput { }
    public record Details(UUID id, UUID patientId, Instant startAt, Instant endAt, Type type, Status status,
            Instant createdAt, Instant updatedAt, long version) { }
    public record CalendarPage(List<Details> items, long total, int page, int pageSize, long pageCount) { }
}
