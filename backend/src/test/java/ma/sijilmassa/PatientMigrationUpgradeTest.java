package ma.sijilmassa;

import java.util.Properties;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;

/** Verify the actual upgrade path with existing phase 8.2 identity and audit rows. */
@Testcontainers
class PatientMigrationUpgradeTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");

    @Test
    void v3PreservesExistingV2AccountsAuditAndMigrationChecksums() {
        var source = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Properties properties = new Properties();
        properties.setProperty("logServerErrorDetail", "false");
        source.setConnectionProperties(properties);
        Flyway.configure().dataSource(source).locations("classpath:db/migration").target("2").load().migrate();
        JdbcTemplate jdbc = new JdbcTemplate(source);
        var oldChecksums = jdbc.queryForList("SELECT version, checksum FROM flyway_schema_history WHERE version IN ('1','2') ORDER BY installed_rank");
        UUID actor = UUID.randomUUID(), event = UUID.randomUUID();
        String hash = new BCryptPasswordEncoder(12).encode(UUID.randomUUID().toString());
        jdbc.update("INSERT INTO application_user(id,username,password_hash,role,active,created_at,updated_at) VALUES (?,'upgrade.synthetic',?,'DENTIST',true,now(),now())", actor, hash);
        jdbc.update("INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id,subject_user_id) VALUES (?,now(),'LOGIN_SUCCEEDED',?,?)", event, actor, actor);

        Flyway upgraded = Flyway.configure().dataSource(source).locations("classpath:db/migration").load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(1);
        assertThat(upgraded.validateWithResult().validationSuccessful).isTrue();
        assertThat(jdbc.queryForList("SELECT version, checksum FROM flyway_schema_history WHERE version IN ('1','2') ORDER BY installed_rank")).isEqualTo(oldChecksums);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM application_user WHERE id=? AND active AND role='DENTIST'", Integer.class, actor)).isEqualTo(1);
        // Boolean assertion prevents an accidental hash dump in an assertion failure.
        assertThat(hash.equals(jdbc.queryForObject("SELECT password_hash FROM application_user WHERE id=?", String.class, actor))).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE id=? AND actor_user_id=? AND target_patient_id IS NULL", Integer.class, event, actor)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM patient", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM patient_medical_record", Integer.class)).isZero();
    }
}
