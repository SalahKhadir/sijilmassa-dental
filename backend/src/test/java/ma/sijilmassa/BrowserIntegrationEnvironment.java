package ma.sijilmassa;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import ma.sijilmassa.security.AccountBootstrap;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.json.JsonMapper;

/** Test-classpath-only launcher. Owns a disposable database; never reads clinic .env or credentials. */
public final class BrowserIntegrationEnvironment {
    private BrowserIntegrationEnvironment() { }
    public static void main(String[] args) throws Exception {
        if (args.length < 1 || args.length > 2) throw new IllegalArgumentException("Expected a private temporary output directory");
        String mode = args.length == 2 ? args[1] : "off";
        if (!java.util.Set.of("off", "ready", "renderer-disabled", "missing-practitioner").contains(mode)) throw new IllegalArgumentException("Unknown synthetic prescription mode");
        Path directory = Path.of(args[0]).toAbsolutePath();
        try (var files = Files.list(directory)) {
            if (files.findAny().isPresent()) throw new IllegalArgumentException("Output directory must be empty");
        }
        Files.setPosixFilePermissions(directory, PosixFilePermissions.fromString("rwx------"));
        Path fixture = directory.resolve("users.json");
        Path runtime = directory.resolve("runtime.json");
        Path profile = directory.resolve("synthetic-practitioner.json");
        try (var postgres = new PostgreSQLContainer("postgres:17.11-bookworm")
                .withDatabaseName("sijilmassa_browser_synthetic").withUsername("browser_synthetic")
                .withPassword(password())) {
            postgres.start();
            var application = new SpringApplication(SijilmassaApplication.class, BrowserEntities.class);
            try (var context = application.run(
                    "--spring.profiles.active=dev", "--server.address=127.0.0.1", "--server.port=0",
                    "--spring.datasource.url=" + postgres.getJdbcUrl(),
                    "--spring.datasource.username=" + postgres.getUsername(),
                    "--spring.datasource.password=" + postgres.getPassword(),
                    "--spring.flyway.locations=classpath:db/migration")) {
                var jdbc = context.getBean(JdbcTemplate.class);
                var migrations = jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank", String.class);
                if (!migrations.equals(java.util.List.of("1", "2", "3", "4", "5", "6", "7", "8", "9"))
                        || !"validate".equals(context.getEnvironment().getProperty("spring.jpa.hibernate.ddl-auto"))
                        || jdbc.queryForObject("SELECT count(*) FROM patient", Integer.class) != 0) {
                    throw new IllegalStateException("Unexpected synthetic database baseline");
                }
                String dentistPassword = password();
                String receptionistPassword = password();
                context.getBean(AccountBootstrap.class).initialize("browser.dentist", dentistPassword,
                        "browser.reception", receptionistPassword);
                var json = JsonMapper.builder().build();
                privateFile(fixture, json.writeValueAsString(Map.of(
                        "dentist", Map.of("identifier", "browser.dentist", "password", dentistPassword),
                        "receptionist", Map.of("identifier", "browser.reception", "password", receptionistPassword), "prescriptionMode", mode)));
                org.springframework.context.ConfigurableApplicationContext active = context;
                try {
                    if (!mode.equals("off")) {
                        var dentistId = jdbc.queryForObject("SELECT id FROM application_user WHERE username='browser.dentist'", java.util.UUID.class);
                        var identity = new ma.sijilmassa.prescription.PractitionerProfiles.Profile(1, "synthetic-browser", "test-only", dentistId, true,
                                ma.sijilmassa.prescription.rendering.LocalPrescriptionRenderer.TEMPLATE,
                                "Dr Synthétique", "طبيب تجريبي", "Titre synthétique", "عنوان تجريبي", "Diplôme synthétique", "مؤهل تجريبي",
                                "Adresse synthétique", "عنوان تجريبي", java.util.List.of("Téléphone synthétique"), null);
                        privateFile(profile, json.writeValueAsString(identity));
                        var settings = new java.util.ArrayList<String>(java.util.List.of(
                                "--spring.profiles.active=dev", "--server.address=127.0.0.1", "--server.port=0",
                                "--spring.datasource.url=" + postgres.getJdbcUrl(), "--spring.datasource.username=" + postgres.getUsername(),
                                "--spring.datasource.password=" + postgres.getPassword(), "--spring.flyway.locations=classpath:db/migration",
                                "--prescription.rendering.enabled=" + !mode.equals("renderer-disabled"),
                                "--prescription.rendering.node-executable=" + System.getenv("SYNTHETIC_RX_NODE"),
                                "--prescription.rendering.worker-directory=" + System.getenv("SYNTHETIC_RX_WORKER"),
                                "--prescription.rendering.modules-directory=" + System.getenv("SYNTHETIC_RX_MODULES"),
                                "--prescription.rendering.manifest-sha256=" + System.getenv("SYNTHETIC_RX_MANIFEST")));
                        if (!mode.equals("missing-practitioner")) {
                            settings.add("--prescription.practitioner.file=" + profile);
                            settings.add("--prescription.practitioner.sha256=" + java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(profile))));
                        }
                        context.close();
                        active = new SpringApplication(SijilmassaApplication.class, BrowserEntities.class).run(settings.toArray(String[]::new));
                    }
                    privateFile(runtime, json.writeValueAsString(Map.of("backendOrigin",
                            "http://127.0.0.1:" + ((WebServerApplicationContext) active).getWebServer().getPort(), "postgresPort", postgres.getMappedPort(5432), "migrations", migrations, "jpaValidated", true)));
                    System.out.println("SYNTHETIC_BROWSER_ENVIRONMENT_READY");
                    System.in.read(); // Owner closes stdin to stop the backend and its container.
                } finally { if (active != context) active.close(); }
            }
        } finally {
            Files.deleteIfExists(fixture);
            Files.deleteIfExists(runtime);
            Files.deleteIfExists(profile);
        }
    }
    @TestConfiguration(proxyBeanMethods = false)
    @EntityScan(basePackages = {"ma.sijilmassa.patient", "ma.sijilmassa.security", "ma.sijilmassa.audit", "ma.sijilmassa.appointment", "ma.sijilmassa.clinical", "ma.sijilmassa.prescription"})
    static class BrowserEntities { }

    private static String password() {
        byte[] bytes = new byte[24]; new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    private static void privateFile(Path path, String text) throws Exception {
        Files.createFile(path, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
        Files.writeString(path, text);
    }
}
