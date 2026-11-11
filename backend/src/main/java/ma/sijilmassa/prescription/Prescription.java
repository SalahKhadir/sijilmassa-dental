package ma.sijilmassa.prescription;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import jakarta.persistence.*;

@Entity
@Table(name = "prescription")
public class Prescription {
    public enum Status { BROUILLON, FINALISEE }
    @Id UUID id;
    @Version @Column(nullable = false) Long version;
    @Column(name = "patient_id", nullable = false, updatable = false) UUID patientId;
    @Column(name = "consultation_id") UUID consultationId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) Status status;
    @Column(name = "issued_date", nullable = false) LocalDate issuedDate;
    @Column(name = "general_instructions", nullable = false, length = 2000) String generalInstructions;
    @Column(name = "created_at", nullable = false, updatable = false) Instant createdAt;
    @Column(name = "updated_at", nullable = false) Instant updatedAt;
    @Column(name = "created_by", nullable = false, updatable = false) UUID createdBy;
    @Column(name = "updated_by", nullable = false) UUID updatedBy;
    @Column(name = "finalized_at") Instant finalizedAt;
    @Column(name = "finalized_by") UUID finalizedBy;
    @Column(name = "archived_at") Instant archivedAt;
    @Column(name = "archived_by") UUID archivedBy;
    // Reserved, guarded as NULL by V7; no correction workflow is available.
    @Column(name = "corrects_prescription_id", updatable = false) UUID correctsPrescriptionId;

    protected Prescription() { }
    Prescription(UUID patientId, UUID actor, Instant now) {
        id = UUID.randomUUID(); this.patientId = patientId; status = Status.BROUILLON;
        createdBy = actor; updatedBy = actor; createdAt = now; updatedAt = now;
    }
}
