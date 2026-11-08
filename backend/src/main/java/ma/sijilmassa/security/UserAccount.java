package ma.sijilmassa.security;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.*;

@Entity
@Table(name = "application_user")
public class UserAccount {
    @Id private UUID id;
    @Column(nullable = false, length = 64) private String username;
    @Column(name = "password_hash", nullable = false, length = 60) private String passwordHash;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16) private Role role;
    @Column(nullable = false) private boolean active;
    @Column(name = "session_version", nullable = false) private long sessionVersion;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "last_login_at") private Instant lastLoginAt;

    protected UserAccount() { }

    public UserAccount(String username, String passwordHash, Role role, Instant now) {
        this.id = UUID.randomUUID();
        this.username = username;
        this.passwordHash = passwordHash;
        this.role = role;
        this.active = true;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public UUID getId() { return id; }
    public String getUsername() { return username; }
    public String getPasswordHash() { return passwordHash; }
    public Role getRole() { return role; }
    public boolean isActive() { return active; }
    public long getSessionVersion() { return sessionVersion; }
    public Instant getLastLoginAt() { return lastLoginAt; }

    public void recordLogin(Instant now) {
        lastLoginAt = now;
        updatedAt = now;
    }

    public AccountPrincipal principal() {
        return new AccountPrincipal(id, username, role, sessionVersion);
    }
}
