package ma.sijilmassa;

import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.*;

@Testcontainers
class InsuranceMigrationTest {
    @Container static final PostgreSQLContainer POSTGRES = TreatmentFinancialMigrationTest.POSTGRES;
    private static final String CNSS_FIELDS = "{\"cnss\": {}}";
    private TreatmentFinancialMigrationTest ledger;
    private JdbcTemplate jdbc;
    private UUID patient;
    private UUID actor;
    private UUID charge;
    private UUID treatment;
    private UUID consultation;
    private UUID invoice;

    @BeforeEach void v11() {
        ledger = new TreatmentFinancialMigrationTest();
        ledger.v8();
        ledger.v9();
        jdbc = ledger.fixture.jdbc;
        patient = ledger.fixture.patient;
        actor = ledger.fixture.actor;
        charge = ledger.charge(70001);
        ledger.payment(charge, 21001);
        treatment = jdbc.queryForObject("SELECT treatment_id FROM treatment_charge WHERE id=?", UUID.class, charge);
        consultation = jdbc.queryForObject("SELECT consultation_id FROM treatment_charge WHERE id=?", UUID.class, charge);
        assertThat(flyway("11").migrate().migrationsExecuted).isEqualTo(2);
        invoice = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO invoice(id,patient_id,lifecycle,version,created_at,updated_at,created_by)
                VALUES (?,?,'BROUILLON',0,TIMESTAMPTZ '2026-11-11 10:00Z',TIMESTAMPTZ '2026-11-11 10:00Z',?)
                """, invoice, patient, actor);
        jdbc.update("INSERT INTO invoice_line(invoice_id,charge_id,line_position) VALUES (?,?,1)", invoice, charge);
        jdbc.update("""
                UPDATE invoice SET lifecycle='EMISE',version=version+1,issued_by=?,
                    issued_at=TIMESTAMPTZ '2026-11-11 11:00Z',updated_at=TIMESTAMPTZ '2026-11-11 11:00Z' WHERE id=?
                """, actor, invoice);
    }

    @Test void upgradeFromV11PreservesPriorChecksumsAndLiveData() {
        var checksums = checksums();
        String priorCharge = row("treatment_charge", charge);
        String priorInvoice = row("invoice", invoice);
        var priorLines = jdbc.queryForList("SELECT to_jsonb(t)::text FROM invoice_line t ORDER BY invoice_id", String.class);
        var priorPayments = jdbc.queryForList("SELECT to_jsonb(t)::text FROM treatment_payment t ORDER BY id", String.class);
        var priorEvents = jdbc.queryForList("SELECT to_jsonb(t)::text FROM security_audit_event t ORDER BY id", String.class);
        var migrated = migrate();
        assertThat(migrated.validateWithResult().validationSuccessful).isTrue();
        assertThat(checksums().stream().filter(row -> !row.get("version").equals("12")).toList()).isEqualTo(checksums);
        assertThat(row("treatment_charge", charge)).isEqualTo(priorCharge);
        assertThat(row("invoice", invoice)).isEqualTo(priorInvoice);
        assertThat(jdbc.queryForList("SELECT to_jsonb(t)::text FROM invoice_line t ORDER BY invoice_id", String.class)).isEqualTo(priorLines);
        assertThat(jdbc.queryForList("SELECT to_jsonb(t)::text FROM treatment_payment t ORDER BY id", String.class)).isEqualTo(priorPayments);
        assertThat(jdbc.queryForList("SELECT (to_jsonb(t)-'target_insurance_document_id')::text FROM security_audit_event t ORDER BY id",
                String.class)).isEqualTo(priorEvents);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM insurance_document", Integer.class)).isZero();
    }

    @Test void constraintsRejectInvalidTemplateOwnershipDuplicateLinesAndAuditScope() {
        migrate();
        assertThatThrownBy(() -> draft(patient, consultation, "CNSS_DENTAIRE", 2, "EXECUTION", CNSS_FIELDS))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> draft(patient, consultation, "CNSS_MALADIE", 1, "EXECUTION", CNSS_FIELDS))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> draft(patient, consultation, "CNOPS_DENTAIRE", 1, "EXECUTION", CNSS_FIELDS))
                .isInstanceOf(DataAccessException.class);
        UUID otherPatient = jdbc.queryForObject("""
                INSERT INTO patient(id,reference,first_name,last_name,sex,address,gsm,landline,profession,cin,medical_coverage,
                    status,search_name,gsm_digits,landline_digits,created_at,updated_at)
                VALUES (gen_random_uuid(),'PAT-999999','Patient','Fictif','UNANSWERED','','','','','','','ACTIVE',
                    'patient fictif','','',now(),now()) RETURNING id
                """, UUID.class);
        assertThatThrownBy(() -> draft(otherPatient, consultation, "CNSS_DENTAIRE", 1, "EXECUTION", CNSS_FIELDS))
                .isInstanceOf(DataAccessException.class);
        UUID document = draft(patient, consultation, "CNSS_DENTAIRE", 1, "EXECUTION", CNSS_FIELDS);
        UUID detached = draft(patient, null, "CNSS_DENTAIRE", 1, "EXECUTION", CNSS_FIELDS);
        assertThatThrownBy(() -> act(detached, treatment, charge, 1)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> act(document, treatment, UUID.randomUUID(), 1)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> act(document, treatment, charge, 4)).isInstanceOf(DataAccessException.class);
        act(document, treatment, charge, 1);
        assertThatThrownBy(() -> act(document, treatment, charge, 2)).isInstanceOf(DataAccessException.class);
        UUID unpriced = jdbc.queryForObject("""
                INSERT INTO clinical_treatment(id,consultation_id,version,treatment_date,description,tooth_reference,notes,created_at,updated_at)
                VALUES (gen_random_uuid(),?,0,DATE '2026-11-11','Autre soin fictif','','',now(),now()) RETURNING id
                """, UUID.class, consultation);
        UUID otherVisit = jdbc.queryForObject("""
                INSERT INTO clinical_consultation(id,patient_id,version,consultation_date,status,chief_complaint,
                    clinical_observations,assessment,treatment_plan,notes,created_at,updated_at)
                VALUES (gen_random_uuid(),?,0,DATE '2026-11-11','BROUILLON','Motif fictif','','','','',now(),now()) RETURNING id
                """, UUID.class, otherPatient);
        act(document, unpriced, null, 2);
        assertThatThrownBy(() -> jdbc.update("UPDATE clinical_treatment SET consultation_id=? WHERE id=?", otherVisit, unpriced))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE insurance_document SET version=2,updated_at=now() WHERE id=?", document))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id,target_patient_id,target_insurance_document_id)
                VALUES (gen_random_uuid(),now(),'INSURANCE_DOCUMENT_CREATED',?,?,?)
                """, actor, otherPatient, document)).isInstanceOf(DataAccessException.class);
    }

    private UUID draft(UUID owner, UUID visit, String type, int template, String purpose, String fields) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO insurance_document(id,patient_id,consultation_id,document_type,template_version,purpose,lifecycle,
                    version,form_data,created_at,updated_at,created_by,updated_by)
                VALUES (?,?,?,?,?,?,'BROUILLON',0,?::jsonb,now(),now(),?,?)
                """, id, owner, visit, type, template, purpose, fields, actor, actor);
        return id;
    }

    private void act(UUID document, UUID source, UUID fee, int position) {
        jdbc.update("INSERT INTO insurance_act(document_id,line_position,treatment_id,charge_id,act_data) VALUES (?,?,?,?,'{}')",
                document, position, source, fee);
    }

    private Flyway migrate() {
        var target = flyway("12");
        assertThat(target.migrate().migrationsExecuted).isEqualTo(1);
        return target;
    }

    private Flyway flyway(String version) {
        return Flyway.configure().dataSource(ledger.fixture.source).schemas(ledger.fixture.sourceSchema()).target(version).load();
    }

    private List<java.util.Map<String, Object>> checksums() {
        return jdbc.queryForList("SELECT version, checksum FROM flyway_schema_history ORDER BY installed_rank");
    }

    private String row(String table, UUID id) {
        return jdbc.queryForObject("SELECT to_jsonb(t)::text FROM " + table + " t WHERE id=?", String.class, id);
    }
}
