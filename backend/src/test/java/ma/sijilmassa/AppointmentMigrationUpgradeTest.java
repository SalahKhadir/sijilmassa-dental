package ma.sijilmassa;

import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
class AppointmentMigrationUpgradeTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:17.11-bookworm");
    @Test void v4PreservesExistingV3PatientMedicalDataAndAudit() {
        var source=new DriverManagerDataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword());
        var jdbc=new JdbcTemplate(source);
        Flyway.configure().dataSource(source).locations("classpath:db/migration").target("3").load().migrate();
        var checksums=jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history ORDER BY installed_rank");
        UUID patient=UUID.randomUUID();
        jdbc.update("""
            INSERT INTO patient(id,reference,first_name,last_name,sex,address,gsm,landline,profession,cin,medical_coverage,status,search_name,gsm_digits,landline_digits,created_at,updated_at)
            VALUES (?,'PAT-000001','Migration','Synthétique','UNANSWERED','','','','','','','ACTIVE','migration synthetique','','',now(),now())
            """,patient);
        jdbc.update("""
            INSERT INTO patient_medical_record(patient_id,questionnaire_version,history_report_status,history_other_details,allergy_report_status,allergy_clarification,under_medical_treatment,pregnant,additional_information,reason_for_consultation,created_at,updated_at)
            VALUES (?,1,'REPORTED','','UNANSWERED','','NO','UNANSWERED','UPGRADE-SYNTHETIC-CANARY','',now(),now())
            """,patient);
        jdbc.update("INSERT INTO patient_history_condition VALUES (?,'DIABETE')",patient);
        UUID actor=UUID.randomUUID(),event=UUID.randomUUID();
        String hash=new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(12).encode(UUID.randomUUID().toString());
        jdbc.update("INSERT INTO application_user(id,username,password_hash,role,created_at,updated_at) VALUES (?,'upgrade.appointment',?,'DENTIST',now(),now())",actor,hash);
        jdbc.update("INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id,target_patient_id) VALUES (?,now(),'PATIENT_CREATED',?,?)",event,actor,patient);
        var before=jdbc.queryForMap("SELECT * FROM patient WHERE id=?",patient);
        var clinical=jdbc.queryForMap("SELECT * FROM patient_medical_record WHERE patient_id=?",patient);
        Flyway upgraded=Flyway.configure().dataSource(source).locations("classpath:db/migration").target("4").load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(1);assertThat(upgraded.validateWithResult().validationSuccessful).isTrue();
        assertThat(jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE version IN ('1','2','3') ORDER BY installed_rank")).isEqualTo(checksums);
        assertThat(jdbc.queryForMap("SELECT * FROM patient WHERE id=?",patient)).isEqualTo(before);
        assertThat(jdbc.queryForMap("SELECT * FROM patient_medical_record WHERE patient_id=?",patient)).isEqualTo(clinical);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM patient_history_condition WHERE patient_id=?",Integer.class,patient)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM appointment",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE id=? AND actor_user_id=? AND target_patient_id=? AND target_appointment_id IS NULL AND event_type='PATIENT_CREATED'",Integer.class,event,actor,patient)).isEqualTo(1);
        assertThat(hash.equals(jdbc.queryForObject("SELECT password_hash FROM application_user WHERE id=?",String.class,actor))).isTrue();
    }
}
