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
        if (args.length != 1) throw new IllegalArgumentException("Expected a private temporary output directory");
        Path directory = Path.of(args[0]).toAbsolutePath();
        try (var files = Files.list(directory)) {
            if (files.findAny().isPresent()) throw new IllegalArgumentException("Output directory must be empty");
        }
        Files.setPosixFilePermissions(directory, PosixFilePermissions.fromString("rwx------"));
        Path fixture = directory.resolve("users.json");
        Path runtime = directory.resolve("runtime.json");
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
                if (!migrations.equals(java.util.List.of("1", "2", "3"))
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
                        "receptionist", Map.of("identifier", "browser.reception", "password", receptionistPassword))));
                privateFile(runtime, json.writeValueAsString(Map.of("backendOrigin",
                        "http://127.0.0.1:" + ((WebServerApplicationContext) context).getWebServer().getPort(), "postgresPort", postgres.getMappedPort(5432), "migrations", migrations, "jpaValidated", true)));
                System.out.println("SYNTHETIC_BROWSER_ENVIRONMENT_READY");
                System.in.read(); // Owner closes stdin to stop the backend and its container.
            }
        } finally {
            Files.deleteIfExists(fixture);
            Files.deleteIfExists(runtime);
        }
    }
    @TestConfiguration(proxyBeanMethods = false)
    @EntityScan(basePackages = {"ma.sijilmassa.patient", "ma.sijilmassa.security", "ma.sijilmassa.audit"})
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
