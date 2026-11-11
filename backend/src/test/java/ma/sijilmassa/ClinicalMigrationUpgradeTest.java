package ma.sijilmassa;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
class ClinicalMigrationUpgradeTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");

    @Test void v5PreservesV4RecordsAuditAndChecksumsWithoutSeedingClinicalData() {
        var source = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        var jdbc = new JdbcTemplate(source);
        Flyway.configure().dataSource(source).locations("classpath:db/migration").target("4").load().migrate();
        var checksums = jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history ORDER BY installed_rank");
        UUID patient = UUID.randomUUID(), appointment = UUID.randomUUID(), actor = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO patient(id,reference,first_name,last_name,sex,address,gsm,landline,profession,cin,medical_coverage,status,search_name,gsm_digits,landline_digits,created_at,updated_at)
            VALUES (?,'PAT-000001','Migration','Synthétique','UNANSWERED','','','','','','','ACTIVE','migration synthetique','','',now(),now())
            """, patient);
        jdbc.update("""
            INSERT INTO patient_medical_record(patient_id,questionnaire_version,history_report_status,history_other_details,allergy_report_status,allergy_clarification,under_medical_treatment,pregnant,additional_information,reason_for_consultation,created_at,updated_at)
            VALUES (?,1,'REPORTED','','UNANSWERED','','NO','UNANSWERED','SYNTHETIC-UPGRADE-CANARY','',now(),now())
            """, patient);
        jdbc.update("INSERT INTO patient_history_condition VALUES (?,'DIABETE')", patient);
        jdbc.update("""
            INSERT INTO appointment(id,patient_id,start_at,end_at,appointment_type,status,created_at,updated_at)
            VALUES (?,?,'2026-11-10T09:00Z','2026-11-10T10:00Z','CONSULTATION','CONFIRME',now(),now())
            """, appointment, patient);
        var hash = new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(12).encode(UUID.randomUUID().toString());
        jdbc.update("INSERT INTO application_user(id,username,password_hash,role,created_at,updated_at) VALUES (?,'upgrade.clinical',?,'DENTIST',now(),now())", actor, hash);
        jdbc.update("INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id,target_appointment_id) VALUES (?,now(),'APPOINTMENT_CREATED',?,?)", UUID.randomUUID(), actor, appointment);
        var tables = List.of("patient", "patient_medical_record", "patient_history_condition", "patient_allergy_category", "appointment", "application_user", "security_audit_event");
        Map<String, List<Map<String, Object>>> before = new LinkedHashMap<>();
        tables.forEach(table -> before.put(table, jdbc.queryForList("SELECT * FROM " + table)));

        Flyway upgraded = Flyway.configure().dataSource(source).locations("classpath:db/migration").target("5").load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(1);
        assertThat(upgraded.validateWithResult().validationSuccessful).isTrue();
        assertThat(upgraded.info().current().getVersion().getVersion()).isEqualTo("5");
        assertThat(jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE version IN ('1','2','3','4') ORDER BY installed_rank")).isEqualTo(checksums);
        // Do not dump hashes or clinical canaries if preservation fails.
        tables.forEach(table -> assertThat(before.get(table).equals(jdbc.queryForList("SELECT * FROM " + table))).as("preserved %s", table).isTrue());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM clinical_consultation", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM clinical_treatment", Integer.class)).isZero();
        assertThat(jdbc.queryForList("SELECT indexname FROM pg_indexes WHERE tablename IN ('clinical_consultation','clinical_treatment')", String.class))
                .contains("clinical_consultation_patient_history_idx", "clinical_treatment_chronology_idx", "clinical_consultation_appointment_unique");
    }
}
