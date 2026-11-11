package ma.sijilmassa;

import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
class PrescriptionMigrationUpgradeTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");
    DriverManagerDataSource source;
    JdbcTemplate jdbc;
    UUID actor, patient, consultation;
    @BeforeEach void v6() {
        var root = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        String schema = "rx_" + UUID.randomUUID().toString().replace("-", "");
        new JdbcTemplate(root).execute("CREATE SCHEMA " + schema);
        source = new DriverManagerDataSource(POSTGRES.getJdbcUrl() + (POSTGRES.getJdbcUrl().contains("?") ? "&" : "?") + "currentSchema=" + schema, POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("6").load().migrate();
        jdbc = new JdbcTemplate(source); actor = UUID.randomUUID(); patient = UUID.randomUUID(); consultation = UUID.randomUUID();
        String hash = new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(12).encode(UUID.randomUUID().toString());
        jdbc.update("INSERT INTO application_user(id,username,password_hash,role,created_at,updated_at) VALUES (?,'migration.rx',?,'DENTIST',now(),now())", actor, hash);
        jdbc.update("""
            INSERT INTO patient(id,reference,first_name,last_name,sex,address,gsm,landline,profession,cin,medical_coverage,status,search_name,gsm_digits,landline_digits,created_at,updated_at)
            VALUES (?,'PAT-000001','Migration','Synthétique','UNANSWERED','','','','','','','ACTIVE','migration synthetique','','',now(),now())
            """, patient);
        jdbc.update("""
            INSERT INTO patient_medical_record(patient_id,questionnaire_version,history_report_status,history_other_details,allergy_report_status,allergy_clarification,under_medical_treatment,pregnant,additional_information,reason_for_consultation,created_at,updated_at)
            VALUES (?,1,'UNANSWERED','','UNANSWERED','','UNANSWERED','UNANSWERED','SYNTHETIC-RX-UPGRADE','',now(),now())
            """, patient);
        jdbc.update("INSERT INTO clinical_consultation(id,patient_id,consultation_date,status,chief_complaint,clinical_observations,assessment,treatment_plan,notes,created_at,updated_at) VALUES (?,?,'2026-11-10','TERMINEE','Synthétique','','','','',now(),now())", consultation, patient);
        jdbc.update("INSERT INTO clinical_treatment(id,consultation_id,treatment_date,description,tooth_reference,notes,created_at,updated_at) VALUES (?,?,'2026-11-10','Synthétique','','',now(),now())", UUID.randomUUID(), consultation);
        jdbc.update("INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id,target_consultation_id) VALUES (?,now(),'CONSULTATION_CREATED',?,?)", UUID.randomUUID(), actor, consultation);
    }
    Flyway upgrade() { var flyway = Flyway.configure().dataSource(source).schemas(sourceSchema()).target("7").load(); assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1); return flyway; }
    String sourceSchema() { return jdbc.queryForObject("SELECT current_schema()", String.class); }
    UUID draft() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO prescription(id,patient_id,consultation_id,issued_date,general_instructions,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,'2026-11-10','',now(),now(),?,?)", id, patient, consultation, actor, actor);
        return id;
    }
    UUID line(UUID parent, int position) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO prescription_line(id,prescription_id,position,medication_name,dosage,frequency,duration,instructions) VALUES (?,?,?,'Synthétique','','','','')", id, parent, position); return id;
    }
    @Test void migrationPreservesV6DataAndChecksumsWithoutSeedingOrCreatingPdfStorage() {
        var tables = List.of("patient", "patient_medical_record", "appointment", "clinical_consultation", "clinical_treatment", "application_user", "security_audit_event");
        var before = new HashMap<String, List<Map<String, Object>>>(); tables.forEach(t -> before.put(t, jdbc.queryForList("SELECT * FROM " + t)));
        var sums = jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history ORDER BY installed_rank");
        var flyway = upgrade(); assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("7");
        assertThat(jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE version <> '7' ORDER BY installed_rank")).isEqualTo(sums);
        tables.forEach(t -> {
            var after = jdbc.queryForList("SELECT * FROM " + t);
            if (t.equals("security_audit_event")) after.forEach(row -> row.remove("target_prescription_id"));
            assertThat(before.get(t).equals(after)).as("preserved %s", t).isTrue();
        });
        assertThat(jdbc.queryForObject("SELECT count(*) FROM prescription", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM prescription_line", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT to_regclass('prescription_document')", String.class)).isNull();
    }
    @Test void sqlConstraintsRejectWrongOwnershipUnsupportedLifecycleAndNoncontiguousLines() {
        upgrade(); var id = draft();
        assertThatThrownBy(() -> jdbc.update("UPDATE prescription SET patient_id=? WHERE id=?", UUID.randomUUID(), id)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        UUID other = UUID.randomUUID();
        jdbc.update("INSERT INTO patient SELECT ?,version,'PAT-000002',first_name,last_name,sex,date_of_birth,address,gsm,landline,profession,cin,medical_coverage,status,search_name,gsm_digits,landline_digits,created_at,updated_at FROM patient WHERE id=?", other, patient);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO prescription(id,patient_id,consultation_id,issued_date,general_instructions,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,'2026-11-10','',now(),now(),?,?)", UUID.randomUUID(), other, consultation, actor, actor)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE prescription SET status='FINALISEE' WHERE id=?", id)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE prescription SET corrects_prescription_id=id WHERE id=?", id)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> line(id, 1)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        line(id, 0); line(id, 1);
        assertThatThrownBy(() -> line(id, 1)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM prescription_line WHERE prescription_id=?", Integer.class, id)).isEqualTo(2);
    }
    @Test void sqlReorderingIsDeferredAndArchivedRecordsAndLinesAreImmutable() {
        upgrade(); var id = draft(); var a = line(id, 0); var b = line(id, 1);
        new TransactionTemplate(new DataSourceTransactionManager(source)).executeWithoutResult(tx -> {
            jdbc.update("UPDATE prescription_line SET position=1 WHERE id=?", a);
            jdbc.update("UPDATE prescription_line SET position=0 WHERE id=?", b);
        });
        jdbc.update("UPDATE prescription SET archived_at=now(),archived_by=?,updated_at=now(),version=version+1 WHERE id=?", actor, id);
        for (String sql : List.of("UPDATE prescription SET archived_at=NULL,archived_by=NULL WHERE id=?", "DELETE FROM prescription WHERE id=?"))
            assertThatThrownBy(() -> jdbc.update(sql, id)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE prescription_line SET dosage='Changement' WHERE id=?", a)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM prescription_line WHERE id=?", a)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> line(id, 2)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id,target_prescription_id,target_patient_id) VALUES (?,now(),'PRESCRIPTION_ARCHIVED',?,?,?)", UUID.randomUUID(), actor, id, patient)).isInstanceOf(org.springframework.dao.DataAccessException.class);
    }
}
