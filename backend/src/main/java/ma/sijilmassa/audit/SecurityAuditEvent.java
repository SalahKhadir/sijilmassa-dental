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

    protected SecurityAuditEvent() { }

    SecurityAuditEvent(AuditEventType type, UUID actor, UUID subject, Instant now) {
        id = UUID.randomUUID();
        eventType = type;
        actorUserId = actor;
        subjectUserId = subject;
        occurredAt = now;
    }
}
