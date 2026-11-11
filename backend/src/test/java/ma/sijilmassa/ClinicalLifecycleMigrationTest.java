package ma.sijilmassa;

import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
class ClinicalLifecycleMigrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");

    @Test void v6RetainsV5ClinicalContentAndAddsRemovalAndStrictAuditTargets() {
        var source = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        var jdbc = new JdbcTemplate(source);
        Flyway.configure().dataSource(source).locations("classpath:db/migration").target("5").load().migrate();
        var checksums = jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history ORDER BY installed_rank");
        UUID patient = UUID.randomUUID(), consultation = UUID.randomUUID(), treatment = UUID.randomUUID(), actor = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO patient(id,reference,first_name,last_name,sex,address,gsm,landline,profession,cin,medical_coverage,status,search_name,gsm_digits,landline_digits,created_at,updated_at)
            VALUES (?,'PAT-000001','Migration','Synthétique','UNANSWERED','','','','','','','ACTIVE','migration synthetique','','',now(),now())
            """, patient);
        jdbc.update("""
            INSERT INTO clinical_consultation(id,patient_id,consultation_date,status,chief_complaint,clinical_observations,assessment,treatment_plan,notes,created_at,updated_at)
            VALUES (?,?,'2026-11-10','BROUILLON','Motif synthétique','','','','V5-CLINICAL-CANARY',now(),now())
            """, consultation, patient);
        jdbc.update("""
            INSERT INTO clinical_treatment(id,consultation_id,treatment_date,description,tooth_reference,notes,created_at,updated_at)
            VALUES (?,?,'2026-11-10','Soin synthétique','16','V5-TREATMENT-CANARY',now(),now())
            """, treatment, consultation);
        String hash = new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(12).encode(UUID.randomUUID().toString());
        jdbc.update("INSERT INTO application_user(id,username,password_hash,role,created_at,updated_at) VALUES (?,'upgrade.lifecycle',?,'DENTIST',now(),now())", actor, hash);
        jdbc.update("INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id,target_patient_id) VALUES (?,now(),'PATIENT_CREATED',?,?)", UUID.randomUUID(), actor, patient);
        var beforeConsultation = jdbc.queryForMap("SELECT * FROM clinical_consultation WHERE id=?", consultation);
        var beforeTreatment = jdbc.queryForMap("SELECT * FROM clinical_treatment WHERE id=?", treatment);
        var beforeAudit = jdbc.queryForList("SELECT * FROM security_audit_event");
        var beforePatient = jdbc.queryForMap("SELECT * FROM patient WHERE id=?", patient);
        var beforeAccount = jdbc.queryForMap("SELECT * FROM application_user WHERE id=?", actor);

        var flyway = Flyway.configure().dataSource(source).locations("classpath:db/migration").target("6").load();
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1);
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("6");
        assertThat(jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE version IN ('1','2','3','4','5') ORDER BY installed_rank")).isEqualTo(checksums);
        assertThat(jdbc.queryForMap("SELECT * FROM clinical_consultation WHERE id=?", consultation).equals(beforeConsultation)).isTrue();
        var afterTreatment = jdbc.queryForMap("SELECT * FROM clinical_treatment WHERE id=?", treatment);
        assertThat(afterTreatment.remove("removed_at")).isNull();
        assertThat(afterTreatment.equals(beforeTreatment)).isTrue();
        var afterAudit = jdbc.queryForList("SELECT * FROM security_audit_event");
        afterAudit.forEach(row -> assertThat(row.remove("target_consultation_id")).isNull());
        assertThat(afterAudit.equals(beforeAudit)).isTrue();
        assertThat(jdbc.queryForMap("SELECT * FROM patient WHERE id=?", patient).equals(beforePatient)).isTrue();
        assertThat(jdbc.queryForMap("SELECT * FROM application_user WHERE id=?", actor).equals(beforeAccount)).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM clinical_treatment WHERE removed_at IS NULL", Integer.class)).isEqualTo(1);
        assertThatThrownBy(() -> jdbc.update("UPDATE clinical_treatment SET removed_at=created_at-interval '1 second' WHERE id=?", treatment)).isInstanceOf(DataIntegrityViolationException.class);
        for (String action : java.util.List.of("CONSULTATION_CREATED", "CONSULTATION_DRAFT_UPDATED", "CONSULTATION_TREATMENT_CHANGED", "CONSULTATION_FINALIZED")) {
            assertThatThrownBy(() -> jdbc.update("INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id) VALUES (?,now(),?,?)", UUID.randomUUID(), action, actor)).isInstanceOf(DataIntegrityViolationException.class);
            jdbc.update("INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id,target_consultation_id) VALUES (?,now(),?,?,?)", UUID.randomUUID(), action, actor, consultation);
        }
        assertThatThrownBy(() -> jdbc.update("INSERT INTO security_audit_event(id,occurred_at,event_type,target_consultation_id) VALUES (?,now(),'CONSULTATION_CREATED',?)", UUID.randomUUID(), consultation)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id,target_consultation_id) VALUES (?,now(),'LOGIN_SUCCEEDED',?,?)", UUID.randomUUID(), actor, consultation)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id,target_consultation_id) VALUES (?,now(),'CONSULTATION_CREATED',?,?)", UUID.randomUUID(), actor, UUID.randomUUID())).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM clinical_consultation WHERE id=?", consultation)).isInstanceOf(DataIntegrityViolationException.class);
    }
}
