package ma.sijilmassa.security;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.UUID;
import ma.sijilmassa.audit.AuditEventType;
import ma.sijilmassa.audit.SecurityAudit;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LocalAuthenticationService {
    public record Result(AccountPrincipal principal, boolean throttled) { }
    private final UserAccountRepository users;
    private final PasswordEncoder passwords;
    private final LoginThrottle throttle;
    private final SecurityAudit audit;
    private final Clock clock;
    private final String dummyHash;

    public LocalAuthenticationService(UserAccountRepository users, PasswordEncoder passwords,
            LoginThrottle throttle, SecurityAudit audit, Clock clock) {
        this.users = users;
        this.passwords = passwords;
        this.throttle = throttle;
        this.audit = audit;
        this.clock = clock;
        dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    @Transactional
    public Result login(String username, String password) {
        String normalized = AccountRules.normalize(username);
        var decision = throttle.reserve(normalized);
        if (!decision.allowed()) {
            // No lookup or untrusted identifier is retained for throttled requests.
            if (decision.auditRequired()) { audit.record(AuditEventType.LOGIN_THROTTLED, null, null); }
            return new Result(null, true);
        }
        UserAccount user = users.findForLogin(normalized).orElse(null);
        boolean withinLimit = password.getBytes(StandardCharsets.UTF_8).length <= 72;
        // Unknown and disabled accounts still incur the password hash work.
        boolean matches = passwords.matches(withinLimit ? password : "", user == null ? dummyHash : user.getPasswordHash());
        if (!withinLimit || !matches || user == null || !user.isActive()) {
            UUID subject = user == null ? null : user.getId();
            audit.record(AuditEventType.LOGIN_FAILED, null, subject);
            if (user != null && !user.isActive()) {
                audit.record(AuditEventType.ACCOUNT_DISABLED, null, subject);
            }
            return new Result(null, false);
        }
        user.recordLogin(clock.instant());
        audit.record(AuditEventType.LOGIN_SUCCEEDED, user.getId(), user.getId());
        return new Result(user.principal(), false);
    }
}
