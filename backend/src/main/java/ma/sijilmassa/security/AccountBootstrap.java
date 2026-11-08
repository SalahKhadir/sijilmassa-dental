package ma.sijilmassa.security;

import java.time.Clock;
import ma.sijilmassa.audit.AuditEventType;
import ma.sijilmassa.audit.SecurityAudit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountBootstrap {
    private final UserAccountRepository users;
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    private final SecurityAudit audit;
    private final Clock clock;

    public AccountBootstrap(UserAccountRepository users, JdbcTemplate jdbc, PasswordEncoder passwords,
            SecurityAudit audit, Clock clock) {
        this.users = users;
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public void initialize(String dentistUsername, String dentistPassword,
                           String receptionistUsername, String receptionistPassword) {
        // Serialize bootstrap even when the user table is empty, across application processes.
        jdbc.execute("SELECT pg_advisory_xact_lock(8273148201)");
        if (users.count() != 0) {
            throw new IllegalStateException("Initialisation refusée : des comptes existent déjà.");
        }
        String dentist = AccountRules.normalize(dentistUsername);
        String receptionist = AccountRules.normalize(receptionistUsername);
        AccountRules.validateBootstrap(dentist, dentistPassword);
        AccountRules.validateBootstrap(receptionist, receptionistPassword);
        if (dentist.equals(receptionist)) {
            throw new IllegalArgumentException("Les deux identifiants doivent être distincts.");
        }
        UserAccount first = users.save(new UserAccount(dentist, passwords.encode(dentistPassword), Role.DENTIST, clock.instant()));
        users.save(new UserAccount(receptionist, passwords.encode(receptionistPassword), Role.RECEPTIONIST, clock.instant()));
        audit.record(AuditEventType.ACCOUNTS_BOOTSTRAPPED, null, first.getId());
    }
}
