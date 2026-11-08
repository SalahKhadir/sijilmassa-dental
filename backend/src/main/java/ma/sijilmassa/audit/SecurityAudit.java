package ma.sijilmassa.audit;

import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SecurityAudit {
    private final SecurityAuditRepository events;
    private final Clock clock;

    public SecurityAudit(SecurityAuditRepository events, Clock clock) {
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public void record(AuditEventType type, UUID actor, UUID subject) {
        events.save(new SecurityAuditEvent(type, actor, subject, clock.instant()));
    }
}
