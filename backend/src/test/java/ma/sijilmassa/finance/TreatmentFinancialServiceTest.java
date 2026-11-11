package ma.sijilmassa.finance;

import java.math.BigInteger;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import ma.sijilmassa.audit.*;
import ma.sijilmassa.clinical.*;
import ma.sijilmassa.security.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.json.JsonMapper;
import static ma.sijilmassa.finance.FinancialModels.*;
import static ma.sijilmassa.finance.FinancialFailure.Reason.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@Testcontainers
@SpringBootTest(properties = "spring.flyway.locations=classpath:db/migration,classpath:db/testmigration")
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
class TreatmentFinancialServiceTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl); registry.add("spring.datasource.username", POSTGRES::getUsername); registry.add("spring.datasource.password", POSTGRES::getPassword);
    }
    @Autowired TreatmentFinancialService service;
    @Autowired ConsultationService clinical;
    @Autowired AccountBootstrap bootstrap;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Autowired JsonMapper json;
    @MockitoSpyBean SecurityAudit audit;
    SecurityAudit auditTarget;
    @Autowired jakarta.persistence.EntityManager em;
    UUID dentist, receptionist;
    static final LocalDate DATE = LocalDate.of(2026,11,11);
    static final Instant PAID = Instant.parse("2026-11-11T10:00:00Z");
    static final String CANARY = "SYNTHETIC-CONFIDENTIAL-NOTES-86A1";
    @BeforeEach void accounts() {
        auditTarget = org.springframework.test.util.AopTestUtils.getUltimateTargetObject(audit);
        reset(auditTarget);
        if (jdbc.queryForObject("SELECT count(*) FROM application_user", Integer.class) == 0) bootstrap.initialize("ledger.dentist", UUID.randomUUID().toString(), "ledger.reception", UUID.randomUUID().toString());
        dentist = jdbc.queryForObject("SELECT id FROM application_user WHERE username='ledger.dentist'", UUID.class);
        receptionist = jdbc.queryForObject("SELECT id FROM application_user WHERE username='ledger.reception'", UUID.class);
        authenticate(Role.DENTIST);
    }
    @AfterEach void clear() { reset(auditTarget); SecurityContextHolder.clearContext(); }
    void authenticate(Role role) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new AccountPrincipal(role == Role.DENTIST ? dentist : receptionist, "ledger.synthetic", role, 0), null, List.of(new SimpleGrantedAuthority("ROLE_"+role.name()))));
    }
    UUID patient() {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO patient(id,reference,first_name,last_name,sex,address,gsm,landline,profession,cin,medical_coverage,status,search_name,gsm_digits,landline_digits,created_at,updated_at)
            VALUES (?,'PAT-' || lpad(nextval('patient_reference_seq')::text,6,'0'),'Ledger','Synthétique','UNANSWERED','','','','','','','ACTIVE','ledger synthetique','','',now(),now())
            """, id); return id;
    }
    ClinicalModels.Details consultation(UUID patient) { return clinical.create(patient, new ClinicalModels.Draft(null, DATE, "Motif fictif", CANARY, CANARY, CANARY, CANARY)); }
    ClinicalModels.Details add(ClinicalModels.Details c) { return clinical.addTreatment(c.patientId(), c.id(), c.version(), new ClinicalModels.Treatment(DATE, "Traitement fictif", "16", CANARY)); }
    UUID treatment(ClinicalModels.Details c) { return c.treatments().getFirst().id(); }
    Row charge(ClinicalModels.Details c, long price) { return service.createCharge(c.patientId(), c.id(), treatment(c), c.version(), price); }
    Row fresh(UUID patient, long price) { return charge(add(consultation(patient)), price); }
    PaymentInput payment(long amount) { return new PaymentInput(amount, PAID, PaymentMethod.ESPECES, UUID.randomUUID()); }
    Receipt pay(UUID patient, Row charge, long amount) { return service.recordPayment(patient, charge.chargeId(), charge.version(), payment(amount)); }
    long events(UUID charge) { return jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE target_charge_id=?", Long.class, charge); }
    void failure(Runnable operation, FinancialFailure.Reason reason) {
        assertThatThrownBy(operation::run).isInstanceOfSatisfying(FinancialFailure.class, e -> { assertThat(e.reason()).isEqualTo(reason); assertThat(e.getMessage()).doesNotContain(CANARY); });
    }
    <T> T as(Role role, Supplier<T> task) { authenticate(role); try { return task.get(); } finally { SecurityContextHolder.clearContext(); } }

    @Test void dentistAssignsExplicitPriceOnceWithoutMutatingClinicalAggregate() {
        var c = add(consultation(patient())); var before = clinical.get(c.patientId(), c.id());
        var row = charge(c, 30000);
        assertThat(row.priceMinor()).isEqualTo(30000); assertThat(row.remainingMinor()).isEqualTo(30000); assertThat(row.receivedMinor()).isZero(); assertThat(row.currency()).isEqualTo("MAD");
        assertThat(row.date()).isEqualTo(DATE); assertThat(row.treatmentLabel()).isEqualTo("Traitement fictif"); assertThat(row.version()).isZero();
        assertThat(clinical.get(c.patientId(), c.id())).isEqualTo(before); assertThat(events(row.chargeId())).isEqualTo(1);
        failure(() -> charge(c, 30000), DUPLICATE_CHARGE);
    }
    @Test void receptionistCannotCreateAChargeEvenWithAClinicalTreatmentIdentifier() {
        var c = add(consultation(patient())); authenticate(Role.RECEPTIONIST);
        assertThatThrownBy(() -> charge(c, 100)).isInstanceOf(AccessDeniedException.class);
        assertThat(service.summary(c.patientId(), null).items()).isEmpty();
    }
    @Test void ownershipRequiresPatientConsultationAndTreatmentTogether() {
        var c = add(consultation(patient())); var foreign = add(consultation(patient()));
        failure(() -> service.createCharge(foreign.patientId(), c.id(), treatment(c), c.version(), 1L), NOT_FOUND);
        failure(() -> service.createCharge(c.patientId(), c.id(), treatment(foreign), c.version(), 1L), NOT_FOUND);
        assertThat(service.summary(c.patientId(), null).totals().chargesMinor()).isZero();
    }
    @Test void staleClinicalVersionCannotAssignACharge() {
        var c = add(consultation(patient()));
        failure(() -> service.createCharge(c.patientId(), c.id(), treatment(c), c.version()-1, 1L), VERSION_CONFLICT);
    }
    @Test void removedTreatmentCannotBecomeACharge() {
        var c = add(consultation(patient())); var removed = clinical.removeTreatment(c.patientId(), c.id(), treatment(c), c.version());
        failure(() -> service.createCharge(c.patientId(), c.id(), treatment(c), removed.version(), 1L), INELIGIBLE_TREATMENT);
    }
    @Test void finalizedConsultationCannotReceiveNewPrices() {
        var c = add(consultation(patient())); var closed = clinical.finalizeConsultation(c.patientId(), c.id(), c.version());
        failure(() -> service.createCharge(c.patientId(), c.id(), treatment(c), closed.version(), 1L), CONSULTATION_FINALIZED);
    }
    @Test void unpricedTreatmentsDoNotSilentlyAcquireZeroOrDefaultCharges() {
        var c = add(consultation(patient())); clinical.finalizeConsultation(c.patientId(), c.id(), c.version());
        assertThat(service.summary(c.patientId(), null).items()).isEmpty(); assertThat(service.summary(c.patientId(), null).totals().chargesMinor()).isZero();
    }
    @Test void explicitZeroPriceIsSettledWithoutAFabricatedPayment() {
        UUID p=patient(); var row=fresh(p,0);
        assertThat(row.settlement()).isEqualTo(Settlement.SETTLED); assertThat(service.payments(p,row.chargeId(),null).items()).isEmpty();
        failure(() -> pay(p,row,1),OVERPAYMENT); failure(() -> pay(p,row,0),INVALID_INPUT);
    }
    @Test void bothRolesCanCollectMultiplePartialPaymentsWithExactCentimes() {
        UUID p=patient(); var row=fresh(p,7); var first=pay(p,row,1);
        authenticate(Role.RECEPTIONIST); var second=pay(p,first.charge(),2);
        assertThat(second.charge().receivedMinor()).isEqualTo(3); assertThat(second.charge().remainingMinor()).isEqualTo(4); assertThat(second.charge().version()).isEqualTo(2);
        assertThat(first.payment().recordedBy()).isEqualTo(dentist); assertThat(second.payment().recordedBy()).isEqualTo(receptionist); assertThat(events(row.chargeId())).isEqualTo(3);
    }
    @Test void approvedThreeTreatmentExampleProducesDerivedPatientTotals() {
        UUID p=patient(); var a=fresh(p,30000); var b=fresh(p,50000); fresh(p,40000);
        pay(p,a,20000); authenticate(Role.RECEPTIONIST); pay(p,b,50000);
        var summary=service.summary(p,null);
        assertThat(summary.items()).hasSize(3); assertThat(summary.totals()).isEqualTo(new Totals("MAD",BigInteger.valueOf(120000),BigInteger.valueOf(70000),BigInteger.valueOf(50000)));
        assertThat(service.getCharge(p,a.chargeId()).remainingMinor()).isEqualTo(10000); assertThat(service.getCharge(p,b.chargeId()).settlement()).isEqualTo(Settlement.SETTLED);
    }
    @Test void aPaymentNeverSettlesAnotherTreatmentOrAnotherPatient() {
        UUID p=patient(), other=patient(); var a=fresh(p,100); var b=fresh(p,200); pay(p,a,100);
        assertThat(service.getCharge(p,b.chargeId()).remainingMinor()).isEqualTo(200);
        failure(() -> service.recordPayment(other,b.chargeId(),0L,payment(1)),NOT_FOUND);
        failure(() -> service.getCharge(other,b.chargeId()),NOT_FOUND); failure(() -> service.payments(other,b.chargeId(),null),NOT_FOUND);
    }
    @Test void overpaymentRollsBackWithoutAnAuditOrVersionChange() {
        UUID p=patient(); var row=fresh(p,100); var first=pay(p,row,90);
        failure(() -> pay(p,first.charge(),11),OVERPAYMENT);
        assertThat(service.getCharge(p,row.chargeId())).isEqualTo(first.charge()); assertThat(service.payments(p,row.chargeId(),null).items()).hasSize(1); assertThat(events(row.chargeId())).isEqualTo(2);
    }
    @Test void staleChargeVersionDoesNotReplayAnotherCollection() {
        UUID p=patient(); var row=fresh(p,100); pay(p,row,10);
        failure(() -> pay(p,row,10),VERSION_CONFLICT); assertThat(service.getCharge(p,row.chargeId()).receivedMinor()).isEqualTo(10);
    }
    @Test void identicalOperationReplayReturnsTheOriginalReceiptWithoutDuplicatingAudit() {
        UUID p=patient(); var row=fresh(p,100); var input=payment(10); var first=service.recordPayment(p,row.chargeId(),0L,input);
        authenticate(Role.RECEPTIONIST); var replay=service.recordPayment(p,row.chargeId(),0L,input);
        assertThat(replay).isEqualTo(first); assertThat(events(row.chargeId())).isEqualTo(2); assertThat(service.payments(p,row.chargeId(),null).items()).hasSize(1);
    }
    @Test void reusedOperationWithDifferentAmountDateOrMethodIsRejected() {
        UUID p=patient(); var row=fresh(p,100); var input=payment(10); service.recordPayment(p,row.chargeId(),0L,input);
        for(var changed:List.of(new PaymentInput(11L,PAID,input.method(),input.operationId()),new PaymentInput(10L,PAID.plusSeconds(1),input.method(),input.operationId()),new PaymentInput(10L,PAID,PaymentMethod.CARTE,input.operationId())))
            failure(() -> service.recordPayment(p,row.chargeId(),1L,changed),OPERATION_CONFLICT);
    }
    @Test void simultaneousDentistAndReceptionistCannotExceedRemainingBalance() throws Exception {
        UUID p=patient(); var row=fresh(p,100); var gate=new CountDownLatch(1); var ready=new CountDownLatch(2);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var calls=new ArrayList<Future<Object>>();
            for(var role:List.of(Role.DENTIST,Role.RECEPTIONIST)) calls.add(executor.submit(() -> as(role,() -> {
                ready.countDown(); try { gate.await(); } catch(InterruptedException e) { throw new IllegalStateException(e); }
                try { return pay(p,row,70); } catch(FinancialFailure e) { return e.reason(); }
            })));
            assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue(); gate.countDown();
            var results=List.of(calls.get(0).get(15,TimeUnit.SECONDS),calls.get(1).get(15,TimeUnit.SECONDS));
            assertThat(results.stream().filter(Receipt.class::isInstance).count()).isEqualTo(1); assertThat(results).contains(VERSION_CONFLICT);
        }
        assertThat(service.getCharge(p,row.chargeId()).receivedMinor()).isEqualTo(70); assertThat(service.payments(p,row.chargeId(),null).items()).hasSize(1);
    }
    @Test void simultaneousSameOperationProducesOneImmutablePayment() throws Exception {
        UUID p=patient(); var row=fresh(p,100); var input=payment(10); var gate=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var a=executor.submit(() -> as(Role.DENTIST,() -> { await(gate); return service.recordPayment(p,row.chargeId(),0L,input); }));
            var b=executor.submit(() -> as(Role.RECEPTIONIST,() -> { await(gate); return service.recordPayment(p,row.chargeId(),0L,input); }));
            gate.countDown(); assertThat(a.get(15,TimeUnit.SECONDS)).isEqualTo(b.get(15,TimeUnit.SECONDS));
        }
        assertThat(events(row.chargeId())).isEqualTo(2); assertThat(service.getCharge(p,row.chargeId()).receivedMinor()).isEqualTo(10);
    }
    @Test void paymentsAfterFinalizationNeverModifyFinalizedClinicalContent() {
        var c=add(consultation(patient())); var row=charge(c,100); var closed=clinical.finalizeConsultation(c.patientId(),c.id(),c.version());
        authenticate(Role.RECEPTIONIST); pay(c.patientId(),row,50); authenticate(Role.DENTIST);
        assertThat(clinical.get(c.patientId(),c.id())).isEqualTo(closed); assertThat(service.getCharge(c.patientId(),row.chargeId()).remainingMinor()).isEqualTo(50);
    }
    @Test void priceAndSourceIdentityAreImmutableBeforeAndAfterClinicalFinalization() {
        var c=add(consultation(patient())); var row=charge(c,100);
        for(int i=0;i<2;i++) {
            assertThatThrownBy(() -> jdbc.update("UPDATE treatment_charge SET price_minor=200 WHERE id=?",row.chargeId())).isInstanceOf(org.springframework.dao.DataAccessException.class);
            if(i==0) clinical.finalizeConsultation(c.patientId(),c.id(),c.version());
        }
        assertThat(service.getCharge(c.patientId(),row.chargeId()).priceMinor()).isEqualTo(100);
    }
    @Test void chargedTreatmentsCannotBeRemovedRedatedOrRelabelledButDraftNotesCanChange() {
        var c=add(consultation(patient())); charge(c,100);
        for(String change:List.of("removed_at=now(),updated_at=now()","treatment_date='2026-11-12'","description='Autre libellé fictif'"))
            assertThatThrownBy(() -> jdbc.update("UPDATE clinical_treatment SET "+change+" WHERE id=?",treatment(c))).isInstanceOf(org.springframework.dao.DataAccessException.class);
        var edited=clinical.editTreatment(c.patientId(),c.id(),treatment(c),c.version(),new ClinicalModels.Treatment(DATE,"Traitement fictif","17","Autre note fictive"));
        assertThat(edited.treatments().getFirst().content().notes()).isEqualTo("Autre note fictive");
    }
    @Test void immutablePaymentsAndChargesCannotBeDestroyed() {
        UUID p=patient(); var row=fresh(p,100); var receipt=pay(p,row,10);
        for(String sql:List.of("UPDATE treatment_payment SET amount_minor=1 WHERE id=?","DELETE FROM treatment_payment WHERE id=?"))
            assertThatThrownBy(() -> jdbc.update(sql,receipt.payment().id())).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM treatment_charge WHERE id=?",row.chargeId())).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(service.getCharge(p,row.chargeId()).receivedMinor()).isEqualTo(10);
    }
    @Test void archivedPatientsRemainReadableButRejectAllFinancialWritesIncludingReplays() {
        UUID p=patient(); var row=fresh(p,100); var input=payment(10); service.recordPayment(p,row.chargeId(),0L,input);
        jdbc.update("UPDATE patient SET status='INACTIVE',version=version+1,updated_at=clock_timestamp() WHERE id=?",p);
        authenticate(Role.RECEPTIONIST); assertThat(service.summary(p,null).totals().outstandingMinor()).isEqualTo(BigInteger.valueOf(90)); assertThat(service.payments(p,row.chargeId(),null).items()).hasSize(1);
        failure(() -> service.recordPayment(p,row.chargeId(),0L,input),ARCHIVED_PATIENT);
        authenticate(Role.DENTIST); var c=clinical.history(p,null).items().getFirst();
        failure(() -> service.createCharge(p,c.id(),UUID.randomUUID(),c.version(),1L),ARCHIVED_PATIENT);
    }
    @Test void failedChargeAuditRollsBackTheCharge() {
        var c=add(consultation(patient())); doThrow(new IllegalStateException(CANARY)).when(auditTarget).recordCharge(any(),any(),any());
        failure(() -> charge(c,100),STORAGE_FAILURE); assertThat(service.summary(c.patientId(),null).items()).isEmpty();
    }
    @Test void failedPaymentAuditRollsBackPaymentVersionAndBalanceTogether() {
        UUID p=patient(); var row=fresh(p,100); doThrow(new IllegalStateException(CANARY)).when(auditTarget).recordPayment(any(),any(),any(),any());
        failure(() -> pay(p,row,10),STORAGE_FAILURE);
        assertThat(service.getCharge(p,row.chargeId())).isEqualTo(row); assertThat(service.payments(p,row.chargeId(),null).items()).isEmpty(); assertThat(events(row.chargeId())).isEqualTo(1);
    }
    @Test void enclosingFailureRollsBackClinicalWorkChargePaymentAndAudit() {
        UUID p=patient();
        assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            var c=add(consultation(p)); var row=charge(c,100); pay(p,row,10); throw new IllegalStateException("Rollback synthétique");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(service.summary(p,null).items()).isEmpty(); assertThat(clinical.history(p,null).items()).isEmpty();
    }
    @Test void receptionistProjectionContainsOnlyCollectionFactsAndNoClinicalCanary(CapturedOutput output) {
        UUID p=patient(); var row=fresh(p,100); authenticate(Role.RECEPTIONIST); var receipt=pay(p,row,10);
        String serialized=json.writeValueAsString(service.summary(p,null))+json.writeValueAsString(service.payments(p,row.chargeId(),null));
        assertThat(serialized).contains("Traitement fictif").doesNotContain(CANARY,"chiefComplaint","clinicalObservations","assessment","toothReference","allergies","prescription","notes");
        assertThat(Arrays.stream(Row.class.getRecordComponents()).map(java.lang.reflect.RecordComponent::getName)).containsExactly("chargeId","version","date","treatmentLabel","currency","priceMinor","receivedMinor","remainingMinor","settlement");
        assertThat(receipt.toString()).doesNotContain("Traitement fictif","100"); assertThat(output.getAll()).doesNotContain(CANARY);
    }
    @Test void aggregateTotalsRemainExactAboveTheJavascriptSafeIntegerRange() {
        UUID p=patient(); fresh(p,MAX_MINOR); fresh(p,MAX_MINOR);
        assertThat(service.summary(p,null).totals().chargesMinor()).isEqualTo(BigInteger.valueOf(MAX_MINOR).multiply(BigInteger.TWO));
    }
    @Test void boundedFinancialRowsKeepChronologicalCursorAndWholePatientTotals() {
        UUID p=patient(); for(int i=0;i<53;i++) fresh(p,1);
        var first=service.summary(p,null); var next=service.summary(p,first.nextCursor());
        assertThat(first.items()).hasSize(50); assertThat(first.nextCursor()).isNotNull(); assertThat(next.items()).hasSize(3); assertThat(next.nextCursor()).isNull();
        var ids=new ArrayList<UUID>(); first.items().forEach(r->ids.add(r.chargeId())); next.items().forEach(r->ids.add(r.chargeId()));
        assertThat(ids).doesNotHaveDuplicates().containsExactlyElementsOf(jdbc.queryForList("SELECT id FROM treatment_charge WHERE patient_id=? ORDER BY treatment_date,id",UUID.class,p));
        assertThat(first.totals().chargesMinor()).isEqualTo(BigInteger.valueOf(53)); assertThat(next.totals()).isEqualTo(first.totals());
    }
    @Test void boundedPaymentHistoryUsesExclusiveStableTimeAndUuidCursor() {
        UUID p=patient(); var row=fresh(p,100); for(int i=0;i<53;i++) row=pay(p,row,1).charge();
        var first=service.payments(p,row.chargeId(),null); var next=service.payments(p,row.chargeId(),first.nextCursor());
        assertThat(first.items()).hasSize(50); assertThat(next.items()).hasSize(3); assertThat(next.nextCursor()).isNull();
        var ids=new ArrayList<UUID>(); first.items().forEach(r->ids.add(r.id())); next.items().forEach(r->ids.add(r.id()));
        assertThat(ids).doesNotHaveDuplicates().containsExactlyElementsOf(jdbc.queryForList("SELECT id FROM treatment_payment WHERE charge_id=? ORDER BY paid_at,id",UUID.class,row.chargeId()));
    }
    @Test void validationRejectsNullsBoundsAndPrecisionWithoutWriting() {
        var c=add(consultation(patient()));
        for(Long price:Arrays.asList(null,-1L,MAX_MINOR+1,Long.MAX_VALUE)) failure(() -> service.createCharge(c.patientId(),c.id(),treatment(c),c.version(),price),INVALID_INPUT);
        var row=charge(c,100);
        for(PaymentInput input:Arrays.asList(null,new PaymentInput(null,PAID,PaymentMethod.ESPECES,UUID.randomUUID()),new PaymentInput(-1L,PAID,PaymentMethod.ESPECES,UUID.randomUUID()),new PaymentInput(1L,PAID.plusNanos(1),PaymentMethod.ESPECES,UUID.randomUUID()),new PaymentInput(1L,null,PaymentMethod.ESPECES,UUID.randomUUID()),new PaymentInput(1L,PAID,null,UUID.randomUUID()),new PaymentInput(1L,PAID,PaymentMethod.ESPECES,null)))
            failure(() -> service.recordPayment(c.patientId(),row.chargeId(),0L,input),INVALID_INPUT);
        failure(() -> service.summary(c.patientId(),new Cursor(DATE,null)),INVALID_INPUT);
        failure(() -> service.payments(c.patientId(),row.chargeId(),new PaymentCursor(PAID,null)),INVALID_INPUT);
        assertThat(service.getCharge(c.patientId(),row.chargeId()).version()).isZero();
    }
    @Test void inactiveOrRevokedAccountsCannotReadOrCollect() {
        UUID p=patient(); var row=fresh(p,100);
        jdbc.update("UPDATE application_user SET session_version=session_version+1 WHERE id=?",dentist);
        try { assertThatThrownBy(() -> service.getCharge(p,row.chargeId())).isInstanceOf(AccessDeniedException.class); assertThatThrownBy(() -> pay(p,row,1)).isInstanceOf(AccessDeniedException.class); }
        finally { jdbc.update("UPDATE application_user SET session_version=session_version-1 WHERE id=?",dentist); }
        jdbc.update("UPDATE application_user SET active=false WHERE id=?",receptionist); authenticate(Role.RECEPTIONIST);
        try { assertThatThrownBy(() -> service.summary(p,null)).isInstanceOf(AccessDeniedException.class); }
        finally { jdbc.update("UPDATE application_user SET active=true WHERE id=?",receptionist); }
    }
    @Test void unauthenticatedAndMismatchedPrincipalRolesCannotReadFinancialData() {
        UUID p=patient(); SecurityContextHolder.clearContext(); assertThatThrownBy(() -> service.summary(p,null)).isInstanceOf(org.springframework.security.authentication.AuthenticationCredentialsNotFoundException.class);
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(new AccountPrincipal(dentist,"synthetic",Role.RECEPTIONIST,0),null,List.of(new SimpleGrantedAuthority("ROLE_RECEPTIONIST"))));
        assertThatThrownBy(() -> service.summary(p,null)).isInstanceOf(AccessDeniedException.class);
    }
    @Test void directSqlCannotOverpayOrAdvanceVersionWithoutAPayment() {
        UUID p=patient(); var row=fresh(p,100); pay(p,row,90);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO treatment_payment(id,charge_id,operation_id,amount_minor,paid_at,method,recorded_at,recorded_by) VALUES (?,?,?,11,?,'CARTE',clock_timestamp()+interval '1 second',?)",UUID.randomUUID(),row.chargeId(),UUID.randomUUID(),Timestamp.from(PAID),dentist)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE treatment_charge SET version=version+1,updated_at=updated_at+interval '1 second' WHERE id=?",row.chargeId())).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(service.getCharge(p,row.chargeId()).receivedMinor()).isEqualTo(90);
    }
    @Test void chargeCreationAndClinicalFinalizationShareTheParentLock() throws Exception {
        var c=add(consultation(patient())); var gate=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var a=executor.submit(() -> as(Role.DENTIST,() -> { await(gate); try { return (Object)charge(c,100); } catch(FinancialFailure e) { return e.reason(); } }));
            var b=executor.submit(() -> as(Role.DENTIST,() -> { await(gate); return clinical.finalizeConsultation(c.patientId(),c.id(),c.version()); }));
            gate.countDown(); Object charge=a.get(15,TimeUnit.SECONDS); assertThat(b.get(15,TimeUnit.SECONDS).status()).isEqualTo(Consultation.Status.TERMINEE);
            assertThat(charge instanceof Row || charge == CONSULTATION_FINALIZED).isTrue();
        }
        assertThat(clinical.get(c.patientId(),c.id()).version()).isEqualTo(c.version()+1);
    }
    @Test void aCachedAccountCannotHideSessionRevocationFromAnEnclosingTransaction() {
        UUID p=patient(); var row=fresh(p,100);
        assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            em.find(UserAccount.class,dentist);
            jdbc.update("UPDATE application_user SET session_version=session_version+1 WHERE id=?",dentist);
            service.recordPayment(p,row.chargeId(),0L,payment(1));
        })).isInstanceOf(AccessDeniedException.class);
        assertThat(service.getCharge(p,row.chargeId()).receivedMinor()).isZero();
    }
    private static void await(CountDownLatch gate) { try { gate.await(); } catch(InterruptedException exception) { Thread.currentThread().interrupt(); throw new IllegalStateException(exception); } }
}
