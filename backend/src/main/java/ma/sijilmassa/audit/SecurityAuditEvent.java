package ma.sijilmassa.audit;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.*;

@Entity
@Table(name = "security_audit_event")
public class SecurityAuditEvent {
    @Id private UUID id;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 32) private AuditEventType eventType;
    @Column(name = "actor_user_id") private UUID actorUserId;
    @Column(name = "subject_user_id") private UUID subjectUserId;

    @Column(name = "target_patient_id") private UUID targetPatientId;

    @Column(name = "target_appointment_id") private UUID targetAppointmentId;
    @Column(name = "target_consultation_id") private UUID targetConsultationId;
    @Column(name = "target_prescription_id") private UUID targetPrescriptionId;

    @Column(name = "target_charge_id") private UUID targetChargeId;
    @Column(name = "target_payment_id") private UUID targetPaymentId;

    protected SecurityAuditEvent() { }

    static SecurityAuditEvent financial(AuditEventType type, UUID actor, UUID charge, UUID payment, Instant now) {
        SecurityAuditEvent event = new SecurityAuditEvent(type, actor, null, now);
        event.targetChargeId = charge; event.targetPaymentId = payment;
        return event;
    }

    static SecurityAuditEvent prescription(AuditEventType type, UUID actor, UUID prescription, Instant now) {
        SecurityAuditEvent event = new SecurityAuditEvent(type, actor, null, now);
        event.targetPrescriptionId = prescription;
        return event;
    }

    static SecurityAuditEvent consultation(AuditEventType type, UUID actor, UUID consultation, Instant now) {
        SecurityAuditEvent event = new SecurityAuditEvent(type, actor, null, now);
        event.targetConsultationId = consultation;
        return event;
    }

    SecurityAuditEvent(AuditEventType type, UUID actor, UUID subject, Instant now) {
        this(type, actor, subject, null, now);
    }

    static SecurityAuditEvent appointment(AuditEventType type, UUID actor, UUID appointment, Instant now) {
        SecurityAuditEvent event = new SecurityAuditEvent(type, actor, null, now);
        event.targetAppointmentId = appointment;
        return event;
    }
    SecurityAuditEvent(AuditEventType type, UUID actor, UUID subject, UUID targetPatient, Instant now) {
        targetPatientId = targetPatient;
        id = UUID.randomUUID();
        eventType = type;
        actorUserId = actor;
        subjectUserId = subject;
        occurredAt = now;
    }
}
