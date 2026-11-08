package ma.sijilmassa.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Single-process, bounded fixed windows; denied attempts never extend a window. */
@Component
public class LoginThrottle {
    private static final int ACCOUNT_LIMIT = 5;
    private static final int GLOBAL_LIMIT = 60;
    private static final int MAX_KEYS = 4096;
    private final Clock clock;
    private final Map<String, Window> accounts = new HashMap<>();
    private Window global;

    public LoginThrottle(Clock clock) {
        this.clock = clock;
        global = new Window(clock.instant());
    }

    public record Decision(boolean allowed, boolean auditRequired) { }

    public synchronized Decision reserve(String normalizedUsername) {
        Instant now = clock.instant();
        if (global.expired(now)) {
            global = new Window(now);
            accounts.values().removeIf(window -> window.expired(now));
        }
        if (global.count >= GLOBAL_LIMIT) {
            return global.denied();
        }
        global.count++;
        String key = digest(normalizedUsername);
        Window window = accounts.get(key);
        if (window == null || window.expired(now)) {
            if (window == null && accounts.size() >= MAX_KEYS) {
                return global.denied();
            }
            window = new Window(now);
            accounts.put(key, window);
        }
        if (window.count >= ACCOUNT_LIMIT) { return window.denied(); }
        window.count++;
        return new Decision(true, false);
    }

    private static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 indisponible", impossible);
        }
    }

    private static final class Window {
        private final Instant start;
        private int count;
        private boolean reported;
        Decision denied() {
            boolean first = !reported;
            reported = true;
            return new Decision(false, first);
        }
        Window(Instant start) { this.start = start; }
        boolean expired(Instant now) { return !now.isBefore(start.plusSeconds(60)); }
    }
}
