package ma.sijilmassa.clinical;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import jakarta.persistence.*;
import ma.sijilmassa.patient.Patient;
import ma.sijilmassa.appointment.Appointment;

@Entity
@Table(name = "clinical_consultation")
public class Consultation {
    public enum Status { BROUILLON, TERMINEE }

    @Id UUID id;
    @Version @Column(nullable = false) Long version;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_id", nullable = false, updatable = false) Patient patient;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "appointment_id") Appointment appointment;
    @Column(name = "consultation_date", nullable = false) LocalDate consultationDate;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) Status status;
    @Column(name = "chief_complaint", nullable = false, length = 500) String chiefComplaint;
    @Column(name = "clinical_observations", nullable = false, length = 5000) String clinicalObservations = "";
    @Column(nullable = false, length = 5000) String assessment = "";
    @Column(name = "treatment_plan", nullable = false, length = 5000) String treatmentPlan = "";
    @Column(nullable = false, length = 5000) String notes = "";
    @Column(name = "created_at", nullable = false, updatable = false) Instant createdAt;
    @Column(name = "updated_at", nullable = false) Instant updatedAt;

    protected Consultation() { }
    Consultation(Patient patient, Appointment appointment, LocalDate date, String chiefComplaint, Instant now) {
        id = UUID.randomUUID(); this.patient = patient; this.appointment = appointment;
        consultationDate = date; this.chiefComplaint = chiefComplaint;
        status = Status.BROUILLON; createdAt = now.truncatedTo(java.time.temporal.ChronoUnit.MICROS); updatedAt = createdAt;
    }
    @PreUpdate
    void touch() {
        Instant now = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        updatedAt = now.isAfter(updatedAt) ? now : updatedAt.plusNanos(1000);
    }
}
