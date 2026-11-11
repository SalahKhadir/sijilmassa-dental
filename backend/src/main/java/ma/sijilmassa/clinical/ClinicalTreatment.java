package ma.sijilmassa.clinical;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import jakarta.persistence.*;

@Entity
@Table(name = "clinical_treatment")
public class ClinicalTreatment {
    @Id UUID id;
    @Version @Column(nullable = false) Long version;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "consultation_id", nullable = false, updatable = false) Consultation consultation;
    @Column(name = "treatment_date", nullable = false) LocalDate treatmentDate;
    @Column(nullable = false, length = 1000) String description;
    @Column(name = "tooth_reference", nullable = false, length = 50) String toothReference = "";
    @Column(nullable = false, length = 2000) String notes = "";
    @Column(name = "created_at", nullable = false, updatable = false) Instant createdAt;
    @Column(name = "updated_at", nullable = false) Instant updatedAt;
    @Column(name = "removed_at") Instant removedAt;

    protected ClinicalTreatment() { }
    ClinicalTreatment(Consultation consultation, LocalDate date, String description, Instant now) {
        id = UUID.randomUUID(); this.consultation = consultation;
        treatmentDate = date; this.description = description; createdAt = now.truncatedTo(java.time.temporal.ChronoUnit.MICROS); updatedAt = createdAt;
    }
    @PreUpdate
    void touch() {
        Instant now = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        updatedAt = now.isAfter(updatedAt) ? now : updatedAt.plusNanos(1000);
    }
}
