package ma.sijilmassa.security;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

public final class AccountRules {
    private AccountRules() { }

    public static String normalize(String username) {
        return username.strip().toLowerCase(Locale.ROOT);
    }

    public static void validateBootstrap(String username, String password) {
        if (!username.matches("[a-z0-9][a-z0-9._-]{2,63}") || password.isBlank()
                || password.codePointCount(0, password.length()) < 12
                || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalArgumentException("Identifiant ou mot de passe non conforme aux règles d’initialisation.");
        }
    }
}
