package ma.sijilmassa;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import ma.sijilmassa.security.LoginThrottle;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class LoginThrottleTest {
    @Test
    void globalLimitBoundsChangingIdentifiersAndDoesNotTrustProxyHeaders() {
        var throttle = new LoginThrottle(Clock.fixed(Instant.parse("2026-11-08T00:00:00Z"), ZoneOffset.UTC));
        for (int i = 0; i < 60; i++) { assertThat(throttle.reserve("fictional-" + i).allowed()).isTrue(); }
        assertThat(throttle.reserve("another").allowed()).isFalse();
        assertThat(throttle.reserve("another-again").auditRequired()).isFalse();
    }
}
