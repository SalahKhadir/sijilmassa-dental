package ma.sijilmassa;

import java.time.Instant;
import java.sql.Timestamp;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

/** V8 data, including opaque immutable document bytes, survives only the additive V9 migration. */
@Testcontainers
class TreatmentFinancialMigrationTest {
    @Container static final PostgreSQLContainer POSTGRES = PrescriptionMigrationUpgradeTest.POSTGRES;
    PrescriptionMigrationUpgradeTest fixture;
    UUID treatment;
    @BeforeEach void v8() {
        fixture = new PrescriptionMigrationUpgradeTest(); fixture.v6(); fixture.upgrade();
        Flyway.configure().dataSource(fixture.source).schemas(fixture.sourceSchema()).target("8").load().migrate();
        treatment=fixture.jdbc.queryForObject("SELECT id FROM clinical_treatment WHERE consultation_id=?",UUID.class,fixture.consultation);
    }
    Flyway v9() { var f=Flyway.configure().dataSource(fixture.source).schemas(fixture.sourceSchema()).target("9").load(); assertThat(f.migrate().migrationsExecuted).isEqualTo(1); return f; }
    UUID charge(long price) {
        UUID id=UUID.randomUUID(); fixture.jdbc.update("UPDATE clinical_consultation SET status='BROUILLON' WHERE id=?",fixture.consultation);
        fixture.jdbc.update("""
            INSERT INTO treatment_charge(id,patient_id,consultation_id,treatment_id,treatment_date,treatment_label,price_minor,currency,created_at,updated_at,created_by)
            VALUES (?,?,?,?,'2026-11-10','Synthétique',?,'MAD',now(),now(),?)
            """,id,fixture.patient,fixture.consultation,treatment,price,fixture.actor); return id;
    }
    UUID payment(UUID charge,long amount) {
        UUID id=UUID.randomUUID(); fixture.jdbc.update("""
            INSERT INTO treatment_payment(id,charge_id,operation_id,amount_minor,paid_at,method,recorded_at,recorded_by)
            VALUES (?,?,?,?,'2026-11-11T10:00Z','ESPECES',clock_timestamp()+interval '1 second',?)
            """,id,charge,UUID.randomUUID(),amount,fixture.actor); return id;
    }
    List<String> rows(String table,boolean audit) {
        String expression="to_jsonb(t)"+(audit?"-'target_charge_id'-'target_payment_id'":"");
        return fixture.jdbc.queryForList("SELECT ("+expression+")::text FROM "+table+" t ORDER BY ("+expression+")::text",String.class);
    }
    @Test void v9PreservesV1ToV8ChecksumsAndAllExistingContentIncludingStoredBytes() {
        UUID id=fixture.draft(); fixture.line(id,0);
        Instant finalized=fixture.jdbc.queryForObject("SELECT updated_at FROM prescription WHERE id=?",Timestamp.class,id).toInstant().plusSeconds(1);
        byte[] bytes="%PDF-SYNTHETIC-IMMUTABLE-UPGRADE-BYTES".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        var snapshot=Map.of("schemaVersion",1,"prescription",Map.of("id",id,"patientId",fixture.patient,"version",0,"medications",List.of(Map.of())),
                "patient",Map.of("id",fixture.patient),"practitioner",Map.of("dentistUserId",fixture.actor),"generation",Map.of(),"finalizedAt",finalized.toString(),"finalizedBy",fixture.actor);
        new TransactionTemplate(new DataSourceTransactionManager(fixture.source)).executeWithoutResult(tx -> {
            fixture.jdbc.update("UPDATE prescription SET status='FINALISEE',version=1,finalized_at=?,updated_at=?,finalized_by=? WHERE id=?",Timestamp.from(finalized),Timestamp.from(finalized),fixture.actor,id);
            fixture.jdbc.update("INSERT INTO prescription_document(prescription_id,snapshot,pdf_bytes,pdf_sha256,pdf_size,finalized_at,finalized_by) VALUES (?,?::jsonb,?,encode(sha256(?),'hex'),?,?,?)",
                    id,JsonMapper.builder().build().writeValueAsString(snapshot),bytes,bytes,bytes.length,Timestamp.from(finalized),fixture.actor);
        });
        var tables=List.of("application_user","patient","patient_medical_record","appointment","clinical_consultation","clinical_treatment","prescription","prescription_line","prescription_document","security_audit_event");
        var before=new HashMap<String,List<String>>(); tables.forEach(t->before.put(t,rows(t,t.equals("security_audit_event"))));
        var sums=fixture.jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history ORDER BY installed_rank");
        var f=v9(); assertThat(f.validateWithResult().validationSuccessful).isTrue();
        assertThat(fixture.jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE version<>'9' ORDER BY installed_rank")).isEqualTo(sums);
        tables.forEach(t->assertThat(rows(t,t.equals("security_audit_event"))).as(t).isEqualTo(before.get(t)));
        assertThat(fixture.jdbc.queryForObject("SELECT pdf_bytes FROM prescription_document WHERE prescription_id=?",byte[].class,id)).isEqualTo(bytes);
        assertThat(fixture.jdbc.queryForObject("SELECT count(*) FROM treatment_charge",Integer.class)).isZero();
        assertThat(fixture.jdbc.queryForObject("SELECT count(*) FROM treatment_payment",Integer.class)).isZero();
        assertThat(fixture.jdbc.queryForObject("SELECT count(*) FROM information_schema.columns WHERE table_name='patient' AND column_name IN ('balance','balance_minor','outstanding_minor') AND table_schema=current_schema()",Integer.class)).isZero();
    }
    @Test void chargeForeignKeysAndUniqueTreatmentPreventDuplicateOrMismatchedAccounts() {
        v9(); UUID charge=charge(100);
        assertThatThrownBy(()->charge(100)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(()->fixture.jdbc.update("UPDATE treatment_charge SET patient_id=? WHERE id=?",UUID.randomUUID(),charge)).isInstanceOf(DataAccessException.class);
        assertThat(fixture.jdbc.queryForObject("SELECT count(*) FROM pg_constraint WHERE conrelid='treatment_charge'::regclass AND contype='f' AND confdeltype='r'",Integer.class)).isEqualTo(4);
        assertThat(fixture.jdbc.queryForList("SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND tablename IN ('treatment_charge','treatment_payment')",String.class))
                .contains("treatment_charge_patient_history_idx","treatment_charge_consultation_idx","treatment_payment_history_idx","treatment_payment_operation_unique");
    }
    @Test void sqlEnforcesExplicitBoundedMadPricesPositivePaymentsAndNoOverpayment() {
        v9();
        for(long invalid:List.of(-1L,9007199254740992L)) assertThatThrownBy(()->charge(invalid)).isInstanceOf(DataAccessException.class);
        UUID c=charge(100);
        for(long invalid:List.of(-1L,0L,101L,9007199254740992L)) assertThatThrownBy(()->payment(c,invalid)).isInstanceOf(DataAccessException.class);
        UUID paid=payment(c,100);
        assertThat(fixture.jdbc.queryForObject("SELECT version FROM treatment_charge WHERE id=?",Long.class,c)).isEqualTo(1);
        assertThatThrownBy(()->payment(c,1)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(()->fixture.jdbc.update("UPDATE treatment_charge SET currency='EUR' WHERE id=?",c)).isInstanceOf(DataAccessException.class);
        assertThat(fixture.jdbc.queryForObject("SELECT amount_minor FROM treatment_payment WHERE id=?",Long.class,paid)).isEqualTo(100);
    }
    @Test void chargeAndPaymentHistoryAreRetainedWithImmutableOwnershipAndRestrictiveReferences() {
        v9(); UUID c=charge(100), p=payment(c,10);
        for(String sql:List.of("DELETE FROM treatment_payment WHERE id=?","UPDATE treatment_payment SET recorded_by=NULL WHERE id=?","UPDATE treatment_payment SET charge_id=id WHERE id=?"))
            assertThatThrownBy(()->fixture.jdbc.update(sql,p)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(()->fixture.jdbc.update("DELETE FROM treatment_charge WHERE id=?",c)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(()->fixture.jdbc.update("DELETE FROM application_user WHERE id=?",fixture.actor)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(()->fixture.jdbc.update("DELETE FROM clinical_treatment WHERE id=?",treatment)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(()->fixture.jdbc.update("UPDATE treatment_charge SET version=version+1,updated_at=updated_at+interval '1 second' WHERE id=?",c)).isInstanceOf(DataAccessException.class);
    }
    @Test void financialAuditTargetsCannotBeMixedWithClinicalTargetsOrAnotherCharge() {
        v9(); UUID c=charge(100), p=payment(c,10);
        fixture.jdbc.update("INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id,target_charge_id,target_payment_id) VALUES (?,now(),'TREATMENT_PAYMENT_RECORDED',?,?,?)",UUID.randomUUID(),fixture.actor,c,p);
        assertThatThrownBy(()->fixture.jdbc.update("INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id,target_charge_id,target_consultation_id) VALUES (?,now(),'TREATMENT_CHARGE_CREATED',?,?,?)",UUID.randomUUID(),fixture.actor,c,fixture.consultation)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(()->fixture.jdbc.update("INSERT INTO security_audit_event(id,occurred_at,event_type,actor_user_id,target_charge_id,target_payment_id) VALUES (?,now(),'TREATMENT_PAYMENT_RECORDED',?,?,?)",UUID.randomUUID(),fixture.actor,c,UUID.randomUUID())).isInstanceOf(DataAccessException.class);
    }
}
