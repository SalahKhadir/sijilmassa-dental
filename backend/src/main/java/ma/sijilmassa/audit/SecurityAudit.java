package ma.sijilmassa.audit;

import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

@Service
public class SecurityAudit {
    private final SecurityAuditRepository events;
    private final Clock clock;

    public SecurityAudit(SecurityAuditRepository events, Clock clock) {
        this.events = events;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void recordCharge(AuditEventType type, UUID actor, UUID charge) {
        events.save(SecurityAuditEvent.financial(type, actor, charge, null, clock.instant()));
    }
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordPayment(AuditEventType type, UUID actor, UUID charge, UUID payment) {
        events.save(SecurityAuditEvent.financial(type, actor, charge, payment, clock.instant()));
    }
    @Transactional
    public void record(AuditEventType type, UUID actor, UUID subject) {
        events.save(new SecurityAuditEvent(type, actor, subject, clock.instant()));
    }
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordAppointment(AuditEventType type, UUID actor, UUID appointmentId) {
        events.save(SecurityAuditEvent.appointment(type, actor, appointmentId, clock.instant()));
    }
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordPrescription(AuditEventType type, UUID actor, UUID prescriptionId) {
        events.save(SecurityAuditEvent.prescription(type, actor, prescriptionId, clock.instant()));
    }
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordConsultation(AuditEventType type, UUID actor, UUID consultationId) {
        events.save(SecurityAuditEvent.consultation(type, actor, consultationId, clock.instant()));
    }
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordPatient(AuditEventType type, UUID actor, UUID patientId) {
        events.save(new SecurityAuditEvent(type, actor, null, patientId, clock.instant()));
    }
}
