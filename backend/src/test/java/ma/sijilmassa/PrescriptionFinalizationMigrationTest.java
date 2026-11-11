package ma.sijilmassa;

import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;

/** Exercise the existing V7 draft fixture before applying only V8. */
@Testcontainers
class PrescriptionFinalizationMigrationTest {
    @Container static final PostgreSQLContainer POSTGRES = PrescriptionMigrationUpgradeTest.POSTGRES;
    PrescriptionMigrationUpgradeTest fixture;
    @BeforeEach void v7() { fixture = new PrescriptionMigrationUpgradeTest(); fixture.v6(); fixture.upgrade(); }
    @Test void additiveUpgradePreservesExistingDraftLinesClinicalDataAndChecksums() {
        var id=fixture.draft();fixture.line(id,0);fixture.line(id,1);
        var jdbc=fixture.jdbc;
        var checksums=jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history ORDER BY installed_rank");
        var tables=List.of("prescription_line","patient","patient_medical_record","clinical_consultation","clinical_treatment","application_user","security_audit_event");
        var before=new HashMap<String,List<Map<String,Object>>>();tables.forEach(t->before.put(t,jdbc.queryForList("SELECT * FROM "+t)));
        var prescription=jdbc.queryForMap("SELECT * FROM prescription WHERE id=?",id);
        var flyway=Flyway.configure().dataSource(fixture.source).schemas(fixture.sourceSchema()).target("8").load();
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1);assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE version<>'8' ORDER BY installed_rank")).isEqualTo(checksums);
        tables.forEach(t->assertThat(jdbc.queryForList("SELECT * FROM "+t)).as(t).isEqualTo(before.get(t)));
        var after=jdbc.queryForMap("SELECT * FROM prescription WHERE id=?",id);
        assertThat(after.remove("finalized_at")).isNull();assertThat(after.remove("finalized_by")).isNull();assertThat(after).isEqualTo(prescription);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM prescription_document",Integer.class)).isZero();
    }
    @Test void draftCannotAcquireAnOrphanDocumentAndSchemaRequiresBoundedHashVerifiedBytes() {
        var id=fixture.draft();var jdbc=fixture.jdbc;
        Flyway.configure().dataSource(fixture.source).schemas(fixture.sourceSchema()).target("8").load().migrate();
        for(String sql:List.of(
                "INSERT INTO prescription_document(prescription_id,snapshot,pdf_bytes,pdf_sha256,pdf_size,finalized_at,finalized_by) VALUES (?,'{}','x'::bytea,repeat('0',64),1,now(),?)",
                "UPDATE prescription SET status='FINALISEE',version=version+1,finalized_at=updated_at+interval '1 second',updated_at=updated_at+interval '1 second',finalized_by=? WHERE id=?")) {
            Object[] args=sql.startsWith("INSERT")?new Object[]{id,fixture.actor}:new Object[]{fixture.actor,id};
            assertThatThrownBy(()->jdbc.update(sql,args)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        }
        assertThat(jdbc.queryForObject("SELECT status FROM prescription WHERE id=?",String.class,id)).isEqualTo("BROUILLON");
    }
}
