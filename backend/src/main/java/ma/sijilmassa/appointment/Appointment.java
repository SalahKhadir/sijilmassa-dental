package ma.sijilmassa.appointment;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.*;
import static ma.sijilmassa.appointment.AppointmentDtos.*;

@Entity
@Table(name = "appointment")
public class Appointment {
    @Id UUID id;
    @Version @Column(nullable = false) Long version;
    @Column(name = "patient_id", nullable = false) UUID patientId;
    @Column(name = "start_at", nullable = false) Instant startAt;
    @Column(name = "end_at", nullable = false) Instant endAt;
    @Enumerated(EnumType.STRING) @Column(name = "appointment_type", nullable = false, length = 24) Type type;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) Status status;
    @Column(name = "created_at", nullable = false, updatable = false) Instant createdAt;
    @Column(name = "updated_at", nullable = false) Instant updatedAt;
    protected Appointment() { }
    Appointment(Create input, Instant now) {
        id = UUID.randomUUID(); patientId = input.patientId(); startAt = input.startAt().toInstant();
        endAt = input.endAt().toInstant(); type = input.type(); status = Status.EN_ATTENTE; createdAt = now; updatedAt = now;
    }
    void touch(Instant now) { updatedAt = now.isAfter(updatedAt) ? now : updatedAt.plusNanos(1000); }
    Details details() { return new Details(id, patientId, startAt, endAt, type, status, createdAt, updatedAt, version); }
}
