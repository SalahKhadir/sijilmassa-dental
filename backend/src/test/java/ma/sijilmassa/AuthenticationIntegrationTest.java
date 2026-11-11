package ma.sijilmassa;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpCookie;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import jakarta.servlet.DispatcherType;
import ma.sijilmassa.audit.SecurityAudit;
import ma.sijilmassa.common.api.ApiProblems;
import ma.sijilmassa.security.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.*;

@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.flyway.locations=classpath:db/migration,classpath:db/testmigration",
                "server.servlet.session.cookie.secure=false"})
@ActiveProfiles("test")
@Import(AuthenticationIntegrationTest.Probes.class)
class AuthenticationIntegrationTest {
    private static final String DENTIST = "dentist.demo";
    private static final String RECEPTION = "reception.demo";
    // Synthetic values used only inside the ephemeral test database.
    private static final String PASSWORD = "Fictional-test-passphrase-82";
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired AccountBootstrap bootstrap;
    @Autowired UserAccountRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired JsonMapper mapper;
    @Autowired MutableClock clock;

    @BeforeEach
    void resetSyntheticDatabase() {
        jdbc.execute("TRUNCATE TABLE prescription_document, prescription_line, prescription, security_audit_event, application_user");
        clock.advance(120);
        bootstrap.initialize(" Dentist.Demo ", PASSWORD, RECEPTION, PASSWORD);
    }

    @Test
    void bootstrapPersistsNormalizedHashedAccountsAndFailsClosed() {
        UserAccount dentist = users.findByUsername(DENTIST).orElseThrow();
        assertThat(dentist.getId()).isNotNull();
        assertThat(dentist.getRole()).isEqualTo(Role.DENTIST);
        assertThat(dentist.isActive()).isTrue();
        assertThat(dentist.getPasswordHash()).startsWith("$2a$12$").isNotEqualTo(PASSWORD);
        assertThat(encoder.matches(PASSWORD, dentist.getPasswordHash())).isTrue();
        assertThat(users.count()).isEqualTo(2);
        assertThatThrownBy(() -> bootstrap.initialize("other.dentist", PASSWORD, "other.reception", PASSWORD))
                .isInstanceOf(IllegalStateException.class);
        assertThat(users.count()).isEqualTo(2);
        assertThat(events("ACCOUNTS_BOOTSTRAPPED")).isEqualTo(1);
    }

    @Test
    void emptyDatabaseBootstrapValidatesAndIsAtomic() {
        jdbc.execute("TRUNCATE TABLE prescription_document, prescription_line, prescription, security_audit_event, application_user");
        assertThatThrownBy(() -> bootstrap.initialize("same", PASSWORD, "SAME", PASSWORD))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(users.count()).isZero();
        assertThatThrownBy(() -> bootstrap.initialize("valid.name", "short", "valid.other", PASSWORD))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(users.count()).isZero();
        assertThatThrownBy(() -> bootstrap.initialize("valid.name", "é".repeat(37), "valid.other", PASSWORD))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(users.count()).isZero();
    }

    @Test
    void concurrentBootstrapAllowsExactlyOneAdministratorAction() throws Exception {
        jdbc.execute("TRUNCATE TABLE prescription_document, prescription_line, prescription, security_audit_event, application_user");
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> tryBootstrap("first"));
            var second = executor.submit(() -> tryBootstrap("second"));
            assertThat(java.util.List.of(first.get(30, java.util.concurrent.TimeUnit.SECONDS),
                    second.get(30, java.util.concurrent.TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
        assertThat(users.count()).isEqualTo(2);
        assertThat(events("ACCOUNTS_BOOTSTRAPPED")).isEqualTo(1);
    }

    private boolean tryBootstrap(String prefix) {
        try {
            bootstrap.initialize(prefix + ".dentist", PASSWORD, prefix + ".reception", PASSWORD);
            return true;
        } catch (IllegalStateException alreadyInitialized) {
            return false;
        }
    }

    @Test
    void schemaRejectsDuplicatesUnknownRolesPlaintextAndInvalidAuditTypes() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE version IN ('1','2') AND success", Integer.class))
                .isEqualTo(2);
        String hash = users.findByUsername(DENTIST).orElseThrow().getPasswordHash();
        String sql = "INSERT INTO application_user(id,username,password_hash,role,active,created_at,updated_at) VALUES (?,?,?, ?,true,now(),now())";
        assertThatThrownBy(() -> jdbc.update(sql, UUID.randomUUID(), DENTIST, hash, "DENTIST"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(sql, UUID.randomUUID(), "bad.role", hash, "ADMIN"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(sql, UUID.randomUUID(), "bad.password", "plaintext", "DENTIST"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(sql, UUID.randomUUID(), "UPPERCASE", hash, "DENTIST"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO security_audit_event(id,occurred_at,event_type) VALUES (?,now(),'UNKNOWN')", UUID.randomUUID()))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test
    void loginRotatesSessionAndCsrfAndMeContainsOnlyPublicIdentity() throws Exception {
        Browser browser = new Browser();
        String csrf = browser.csrf();
        String anonymousId = browser.sessionId();
        var response = browser.login(" DENTIST.DEMO ", PASSWORD, csrf);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(browser.sessionId()).isNotEqualTo(anonymousId);
        JsonNode identity = mapper.readTree(response.body());
        assertThat(identity.size()).isEqualTo(3);
        assertThat(identity.get("username").asText()).isEqualTo(DENTIST);
        assertThat(identity.get("role").asText()).isEqualTo("DENTIST");
        assertThat(identity.has("passwordHash")).isFalse();
        assertThat(users.findByUsername(DENTIST).orElseThrow().getLastLoginAt()).isEqualTo(clock.instant());
        assertThat(browser.get("/api/v1/auth/me").body()).isEqualTo(response.body());
        assertThat(browser.post("/api/v1/auth/logout", "", csrf).statusCode()).isEqualTo(403);
        assertThat(browser.csrf()).isNotEqualTo(csrf);
        assertThat(events("LOGIN_SUCCEEDED")).isEqualTo(1);
        assertThat(rawGet("/api/v1/auth/me", anonymousId).statusCode()).isEqualTo(401);
    }

    @Test
    void incorrectUnknownAndDisabledLoginsAreIndistinguishable() throws Exception {
        Browser browser = new Browser();
        String csrf = browser.csrf();
        var wrong = browser.login(DENTIST, "incorrect-synthetic", csrf);
        var unknown = browser.login("unknown.demo", "incorrect-synthetic", csrf);
        jdbc.update("UPDATE application_user SET active=false WHERE username=?", RECEPTION);
        var disabled = browser.login(RECEPTION, PASSWORD, csrf);
        for (var response : java.util.List.of(wrong, unknown, disabled)) {
            assertThat(response.statusCode()).isEqualTo(401);
            assertThat(response.headers().firstValue("content-type").orElseThrow()).startsWith("application/problem+json");
            assertThat(mapper.readTree(response.body()).get("detail").asText())
                    .isEqualTo("Authentification refusée ou session expirée.");
            assertThat(response.body()).doesNotContain("passwordHash", "incorrect-synthetic", "unknown.demo");
        }
        assertThat(browser.get("/api/v1/auth/me").statusCode()).isEqualTo(401);
        assertThat(events("LOGIN_FAILED")).isEqualTo(3);
        assertThat(events("ACCOUNT_DISABLED")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE event_type='LOGIN_FAILED' AND subject_user_id IS NULL", Integer.class)).isEqualTo(1);
        assertThat(users.findByUsername(DENTIST).orElseThrow().getLastLoginAt()).isNull();
    }

    @Test
    void csrfIsRequiredForLoginAndLogoutAndCannotComeFromAnotherSession() throws Exception {
        Browser first = new Browser();
        Browser second = new Browser();
        String firstToken = first.csrf();
        String secondToken = second.csrf();
        assertThat(first.login(DENTIST, PASSWORD, null).statusCode()).isEqualTo(403);
        assertThat(first.login(DENTIST, PASSWORD, secondToken).statusCode()).isEqualTo(403);
        assertThat(first.login(DENTIST, PASSWORD, firstToken).statusCode()).isEqualTo(200);
        assertThat(first.post("/api/v1/auth/logout", "", null).statusCode()).isEqualTo(403);
        assertThat(first.get("/api/v1/auth/me").statusCode()).isEqualTo(200);
    }

    @Test
    void logoutInvalidatesSessionAndRejectsReplayedCookie() throws Exception {
        Browser browser = authenticated(DENTIST);
        String session = browser.sessionId();
        var response = browser.post("/api/v1/auth/logout", "", browser.csrf());
        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.headers().allValues("set-cookie")).anyMatch(cookie -> cookie.startsWith("JSESSIONID=;") && (cookie.contains("Max-Age=0") || cookie.contains("Expires=Thu, 01 Jan 1970")));
        assertThat(rawGet("/api/v1/auth/me", session).statusCode()).isEqualTo(401);
        assertThat(browser.get("/api/v1/auth/me").statusCode()).isEqualTo(401);
        assertThat(events("LOGOUT")).isEqualTo(1);
    }

    @Test
    void accountDisableRevokesExistingSessionOnNextRequest() throws Exception {
        Browser browser = authenticated(DENTIST);
        String session = browser.sessionId();
        jdbc.update("UPDATE application_user SET active=false WHERE username=?", DENTIST);
        assertThat(browser.get("/api/v1/auth/me").statusCode()).isEqualTo(401);
        assertThat(rawGet("/api/v1/auth/me", session).statusCode()).isEqualTo(401);
        assertThat(events("ACCOUNT_DISABLED")).isEqualTo(1);
    }

    @Test
    void roleChangesAndExplicitVersionBumpsRevokeSessions() throws Exception {
        Browser dentist = authenticated(DENTIST);
        jdbc.update("UPDATE application_user SET role='RECEPTIONIST' WHERE username=?", DENTIST);
        assertThat(dentist.get("/api/v1/_testroles/clinical").statusCode()).isEqualTo(401);
        Browser reception = authenticated(RECEPTION);
        jdbc.update("UPDATE application_user SET session_version=session_version+1 WHERE username=?", RECEPTION);
        assertThat(reception.get("/api/v1/auth/me").statusCode()).isEqualTo(401);
        assertThat(events("SESSION_REVOKED")).isEqualTo(2);
    }

    @Test
    void dentistAndReceptionRolesAreEnforcedByMethodSecurity() throws Exception {
        Browser dentist = authenticated(DENTIST);
        Browser reception = authenticated(RECEPTION);
        assertThat(dentist.get("/api/v1/_testroles/clinical").statusCode()).isEqualTo(200);
        assertThat(dentist.get("/api/v1/_testroles/administrative").statusCode()).isEqualTo(200);
        assertThat(reception.get("/api/v1/_testroles/administrative").statusCode()).isEqualTo(200);
        var denied = reception.get("/api/v1/_testroles/clinical");
        assertThat(denied.statusCode()).isEqualTo(403);
        assertThat(mapper.readTree(denied.body()).get("status").asInt()).isEqualTo(403);
        assertThat(dentist.get("/api/v1/unconfigured").statusCode()).isEqualTo(403);
        assertThat(reception.get("/api/v1/unconfigured").statusCode()).isEqualTo(403);
        assertThat(new Browser().get("/api/v1/_testroles/clinical").statusCode()).isEqualTo(401);
    }

    @Test
    void loginThrottlingIsGenericTemporaryAndAuditedWithoutIdentifiers() throws Exception {
        Browser browser = new Browser();
        String csrf = browser.csrf();
        for (int attempt = 0; attempt < 5; attempt++) {
            assertThat(browser.login(DENTIST, "incorrect-synthetic", csrf).statusCode()).isEqualTo(401);
        }
        var denied = browser.login(DENTIST, PASSWORD, csrf);
        assertThat(denied.statusCode()).isEqualTo(429);
        assertThat(denied.headers().firstValue("retry-after").orElseThrow()).isEqualTo("60");
        assertThat(browser.login(DENTIST, PASSWORD, csrf).statusCode()).isEqualTo(429);
        assertThat(events("LOGIN_THROTTLED")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE event_type='LOGIN_THROTTLED' AND actor_user_id IS NULL AND subject_user_id IS NULL", Integer.class)).isEqualTo(1);
        clock.advance(61);
        assertThat(browser.login(DENTIST, PASSWORD, csrf).statusCode()).isEqualTo(200);
    }

    @Test
    void healthAndDefaultDenialRemainMinimalAndNoPublicSignupExists() throws Exception {
        Browser browser = new Browser();
        var health = browser.get("/actuator/health");
        assertThat(health.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(health.body()).size()).isEqualTo(1);
        assertThat(mapper.readTree(health.body()).get("status").asText()).isEqualTo("UP");
        assertThat(browser.get("/api/v1/patients").statusCode()).isEqualTo(401);
        assertThat(browser.get("/actuator/env").statusCode()).isEqualTo(401);
        assertThat(browser.post("/api/v1/auth/register", "{}", browser.csrf()).statusCode()).isEqualTo(401);
        var token = browser.get("/api/v1/auth/csrf");
        assertThat(token.headers().firstValue("cache-control").orElseThrow()).contains("no-store");
        assertThat(token.headers().allValues("access-control-allow-origin")).isEmpty();
    }

    @Test
    void developmentCookieIsHttpOnlyStrictAndNeverUrlRewritten() throws Exception {
        Browser browser = new Browser();
        var response = browser.get("/api/v1/auth/csrf");
        assertThat(response.headers().allValues("set-cookie")).anySatisfy(cookie -> {
            assertThat(cookie).contains("HttpOnly", "SameSite=Strict", "Path=/");
            assertThat(cookie).doesNotContain("Secure");
        });
        assertThat(response.body()).doesNotContain("jsessionid");
    }

    private int events(String type) {
        return jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE event_type=?", Integer.class, type);
    }

    private Browser authenticated(String username) throws Exception {
        Browser browser = new Browser();
        assertThat(browser.login(username, PASSWORD, browser.csrf()).statusCode()).isEqualTo(200);
        return browser;
    }

    private HttpResponse<String> rawGet(String path, String sessionId) throws Exception {
        return HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .header("Cookie", "JSESSIONID=" + sessionId).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    private class Browser {
        private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        private final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();
        HttpResponse<String> get(String path) throws Exception { return send("GET", path, null, null); }
        HttpResponse<String> post(String path, String body, String csrf) throws Exception { return send("POST", path, body, csrf); }
        HttpResponse<String> login(String name, String password, String csrf) throws Exception {
            return post("/api/v1/auth/login", mapper.writeValueAsString(Map.of("identifier", name, "password", password)), csrf);
        }
        String csrf() throws Exception {
            var response = get("/api/v1/auth/csrf");
            assertThat(response.statusCode()).isEqualTo(200);
            JsonNode data = mapper.readTree(response.body());
            assertThat(data.get("headerName").asText()).isEqualTo("X-CSRF-TOKEN");
            return data.get("token").asText();
        }
        String sessionId() { return cookies.getCookieStore().getCookies().stream().filter(cookie -> cookie.getName().equals("JSESSIONID")).map(HttpCookie::getValue).findFirst().orElseThrow(); }
        private HttpResponse<String> send(String method, String path, String body, String csrf) throws Exception {
            var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path));
            if (csrf != null) { request.header("X-CSRF-TOKEN", csrf); }
            if (method.equals("POST")) {
                request.header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body));
            } else { request.GET(); }
            return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
        }
    }

    static class MutableClock extends Clock {
        private final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-11-08T12:00:00Z"));
        void advance(long seconds) { now.updateAndGet(value -> value.plusSeconds(seconds)); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now.get(); }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Probes {
        @Bean @Primary MutableClock testClock() { return new MutableClock(); }
        @Bean RoleProbe roleProbe() { return new RoleProbe(); }
        @Bean @Order(0)
        SecurityFilterChain roleChain(HttpSecurity http, SecurityContextRepository contexts,
                HttpSessionCsrfTokenRepository csrf, UserAccountRepository users, SecurityAudit audit,
                ApiProblems problems) throws Exception {
            return http.securityMatcher("/api/v1/_testroles/**")
                    .securityContext(context -> context.securityContextRepository(contexts))
                    .csrf(configuration -> configuration.csrfTokenRepository(csrf))
                    .authorizeHttpRequests(auth -> auth.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll().anyRequest().authenticated())
                    .addFilterBefore(new SessionAccountFilter(users, audit, problems), AuthorizationFilter.class)
                    .exceptionHandling(errors -> errors.authenticationEntryPoint((request,response,error) -> problems.write(401,request,response)))
                    .build();
        }
    }

    @RestController
    @org.springframework.boot.test.context.TestComponent
    static class RoleProbe {
        @GetMapping("/api/v1/_testroles/clinical")
        @PreAuthorize(RolePolicies.CLINICAL)
        public Map<String,String> clinical() { return Map.of("scope", "clinical-test"); }
        @GetMapping("/api/v1/_testroles/administrative")
        @PreAuthorize(RolePolicies.ADMINISTRATIVE)
        public Map<String,String> administrative() { return Map.of("scope", "administrative-test"); }
    }
}
