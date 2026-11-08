package ma.sijilmassa.security;

import java.io.Serializable;
import java.util.UUID;

/** No hash or credential is retained in a session. */
public record AccountPrincipal(UUID id, String username, Role role, long sessionVersion) implements Serializable {
    public UserIdentity identity() {
        return new UserIdentity(id, username, role);
    }

    public record UserIdentity(UUID id, String username, Role role) { }
}
