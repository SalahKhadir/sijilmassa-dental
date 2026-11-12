package ma.sijilmassa;

import java.util.HashMap;
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
class InvoiceMigrationTest {
    @Container static final PostgreSQLContainer POSTGRES = TreatmentFinancialMigrationTest.POSTGRES;
    private TreatmentFinancialMigrationTest ledger;
    private JdbcTemplate jdbc;
    private UUID patient;
    private UUID actor;
    private UUID charge;

    @BeforeEach
    void v9() {
        ledger = new TreatmentFinancialMigrationTest();
        ledger.v8();
        ledger.v9();
        jdbc = ledger.fixture.jdbc;
        patient = ledger.fixture.patient;
        actor = ledger.fixture.actor;
        charge = ledger.charge(50001);
        ledger.payment(charge, 20001);
    }

    @Test void v10PreservesAllV9ChecksumsAndLedgerDataAndAddsEmptyInvoiceTables() {
        var tables = List.of("application_user", "patient", "patient_medical_record", "appointment",
                "clinical_consultation", "clinical_treatment", "prescription", "prescription_line",
                "prescription_document", "treatment_charge", "treatment_payment", "security_audit_event");
        var before = new HashMap<String, List<String>>();
        tables.forEach(table -> before.put(table, rows(table, false)));
        var checksums = jdbc.queryForList("SELECT version, checksum FROM flyway_schema_history ORDER BY installed_rank");

        var flyway = migrate();
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(jdbc.queryForList("SELECT version, checksum FROM flyway_schema_history WHERE version <> '10' ORDER BY installed_rank"))
                .isEqualTo(checksums);
        tables.forEach(table -> assertThat(rows(table, true)).as(table).isEqualTo(before.get(table)));
        assertThat(rows("invoice", true)).isEmpty();
        assertThat(rows("invoice_line", true)).isEmpty();
        assertThat(rows("invoice_number_sequence", true)).isEmpty();
    }

    @Test void databaseRejectsDuplicateAndForeignChargesAndProtectsIssuedInvoiceAndLineSnapshots() {
        migrate();
        UUID draft = draft(patient);
        UUID duplicate = draft(patient);
        UUID anotherPatient = otherPatient();
        UUID foreign = draft(anotherPatient);
        assertThatThrownBy(() -> line(foreign, charge)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> line(draft, UUID.randomUUID())).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> issue(draft)).isInstanceOf(DataAccessException.class);
        line(draft, charge);
        assertThatThrownBy(() -> line(draft, charge)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> line(duplicate, charge)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE invoice_line SET issued_price_minor = 1 WHERE invoice_id = ?", draft))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE invoice SET invoice_number = 'FORGED' WHERE id = ?", draft))
                .isInstanceOf(DataAccessException.class);

        issue(draft);
        assertThat(jdbc.queryForObject("SELECT invoice_number FROM invoice WHERE id = ?", String.class, draft)).isEqualTo("2026-001");
        assertThat(jdbc.queryForObject("SELECT issued_price_minor FROM invoice_line WHERE invoice_id = ?", Long.class, draft)).isEqualTo(50001L);
        assertThat(jdbc.queryForObject("SELECT issued_received_minor FROM invoice_line WHERE invoice_id = ?", Long.class, draft)).isEqualTo(20001L);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM invoice WHERE id = ?", draft)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE invoice SET patient_id = ? WHERE id = ?", anotherPatient, draft))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE invoice SET issued_first_name = 'Faux' WHERE id = ?", draft))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE invoice_line SET issued_received_minor = 0 WHERE invoice_id = ?", draft))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM invoice_line WHERE invoice_id = ?", draft)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> line(draft, UUID.randomUUID())).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> line(duplicate, charge)).isInstanceOf(DataAccessException.class);

        jdbc.update("""
                INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id,target_invoice_id)
                VALUES (?, now(), 'INVOICE_ISSUED', ?, ?)
                """, UUID.randomUUID(), actor, draft);
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id,target_invoice_id,target_charge_id)
                VALUES (?, now(), 'INVOICE_ISSUED', ?, ?, ?)
                """, UUID.randomUUID(), actor, draft, charge)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id,target_invoice_id)
                VALUES (?, now(), 'INVOICE_ISSUED', ?, ?)
                """, UUID.randomUUID(), actor, UUID.randomUUID())).isInstanceOf(DataAccessException.class);
    }

    @Test void v11KeepsHistoricalInvoicesAndCapturesReferencesForExistingDrafts() throws Exception {
        migrate();
        jdbc.update("UPDATE clinical_treatment SET tooth_reference = '16' WHERE id = ?", ledger.treatment);
        UUID historical = draft(patient);
        line(historical, charge);
        issue(historical);

        ledger.treatment = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO clinical_treatment(id, consultation_id, treatment_date, description, tooth_reference, notes, created_at, updated_at)
                VALUES (?, ?, DATE '2026-11-10', 'Synthétique', '17 / 18', '', now(), now())
                """, ledger.treatment, ledger.fixture.consultation);
        UUID newerCharge = ledger.charge(12345);
        UUID existingDraft = draft(patient);
        line(existingDraft, newerCharge);
        var invoices = rows("invoice", false);
        var lines = rows("invoice_line", false);
        var payments = rows("treatment_payment", false);
        var numbers = rows("invoice_number_sequence", false);
        var checksums = jdbc.queryForList("SELECT version, checksum FROM flyway_schema_history ORDER BY installed_rank");

        var upgraded = Flyway.configure().dataSource(ledger.fixture.source).schemas(ledger.fixture.sourceSchema()).target("11").load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(1);
        assertThat(upgraded.validateWithResult().validationSuccessful).isTrue();
        assertThat(jdbc.queryForList("SELECT version, checksum FROM flyway_schema_history WHERE version <> '11' ORDER BY installed_rank"))
                .isEqualTo(checksums);
        assertThat(rows("invoice", false)).isEqualTo(invoices);
        assertThat(rows("treatment_payment", false)).isEqualTo(payments);
        assertThat(rows("invoice_number_sequence", false)).isEqualTo(numbers);
        assertThat(jdbc.queryForList("""
                SELECT (to_jsonb(l) - 'issued_tooth_reference')::text FROM invoice_line l ORDER BY 1
                """, String.class)).isEqualTo(lines);
        assertThat(toothReference(historical)).isNull();
        assertThat(ma.sijilmassa.invoice.InvoicePdfUpgradeProbe.render(jdbc, patient, historical))
                .contains("FACTURE Nº : 2026-001", "500,01 DH", "200,01 DH", "300,00 DH", "11/11/2026")
                .doesNotContainPattern("(?m)^[ \t]*16[ \t]+Synthétique");
        assertThat(toothReference(existingDraft)).isNull();
        assertThatThrownBy(() -> jdbc.update("UPDATE invoice_line SET issued_tooth_reference = '16' WHERE invoice_id = ?", historical))
                .isInstanceOf(DataAccessException.class);
        issue(existingDraft);
        assertThat(toothReference(existingDraft)).isEqualTo("17 / 18");
        assertThat(jdbc.queryForObject("SELECT invoice_number FROM invoice WHERE id = ?", String.class, existingDraft))
                .isEqualTo("2026-002");
        assertThatThrownBy(() -> jdbc.update("UPDATE invoice_line SET issued_tooth_reference = NULL WHERE invoice_id = ?", existingDraft))
                .isInstanceOf(DataAccessException.class);
    }

    private String toothReference(UUID invoice) {
        return jdbc.queryForObject("SELECT issued_tooth_reference FROM invoice_line WHERE invoice_id = ?", String.class, invoice);
    }

    private Flyway migrate() {
        var flyway = Flyway.configure().dataSource(ledger.fixture.source).schemas(ledger.fixture.sourceSchema()).target("10").load();
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1);
        return flyway;
    }

    private List<String> rows(String table, boolean migrated) {
        String expression = "to_jsonb(t)" + (migrated && table.equals("security_audit_event") ? "-'target_invoice_id'" : "");
        return jdbc.queryForList("SELECT (" + expression + ")::text FROM " + table + " t ORDER BY (" + expression + ")::text", String.class);
    }

    private UUID draft(UUID owner) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO invoice(id,patient_id,lifecycle,version,created_at,updated_at,created_by)
                VALUES (?,?,'BROUILLON',0,TIMESTAMPTZ '2026-11-11 10:00Z',TIMESTAMPTZ '2026-11-11 10:00Z',?)
                """, id, owner, actor);
        return id;
    }

    private void line(UUID invoice, UUID selected) {
        jdbc.update("INSERT INTO invoice_line(invoice_id,charge_id,line_position) VALUES (?,?,1)", invoice, selected);
    }

    private void issue(UUID invoice) {
        jdbc.update("""
                UPDATE invoice SET lifecycle='EMISE',version=version+1,issued_by=?,
                    issued_at=TIMESTAMPTZ '2026-11-11 11:00Z',updated_at=TIMESTAMPTZ '2026-11-11 11:00Z' WHERE id=?
                """, actor, invoice);
    }

    private UUID otherPatient() {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO patient(id,reference,first_name,last_name,sex,address,gsm,landline,profession,cin,medical_coverage,
                    status,search_name,gsm_digits,landline_digits,created_at,updated_at)
                VALUES (?,'PAT-000002','Autre','Synthétique','UNANSWERED',
                    '','','','','','','ACTIVE','autre synthetique','','',now(),now())
                """, id);
        return id;
    }
}
