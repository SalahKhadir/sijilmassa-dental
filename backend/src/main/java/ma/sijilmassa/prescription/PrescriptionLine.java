package ma.sijilmassa.prescription;

import java.util.UUID;
import jakarta.persistence.*;

@Entity
@Table(name = "prescription_line")
class PrescriptionLine {
    @Id UUID id;
    @Column(name = "prescription_id", nullable = false, updatable = false) UUID prescriptionId;
    @Column(nullable = false) int position;
    @Column(name = "medication_name", nullable = false, length = 200) String medicationName;
    @Column(nullable = false, length = 300) String dosage;
    @Column(nullable = false, length = 200) String frequency;
    @Column(nullable = false, length = 200) String duration;
    @Column(nullable = false, length = 1500) String instructions;
    protected PrescriptionLine() { }
    PrescriptionLine(UUID prescriptionId) { id = UUID.randomUUID(); this.prescriptionId = prescriptionId; }
}
