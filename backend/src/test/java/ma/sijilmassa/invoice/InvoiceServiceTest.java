package ma.sijilmassa.invoice;

import java.math.BigInteger;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import ma.sijilmassa.clinical.ClinicalModels;
import ma.sijilmassa.clinical.ConsultationService;
import ma.sijilmassa.finance.FinancialModels;
import ma.sijilmassa.finance.TreatmentFinancialService;
import ma.sijilmassa.patient.PatientDtos;
import ma.sijilmassa.patient.PatientService;
import ma.sijilmassa.patient.PatientValues;
import ma.sijilmassa.security.AccountBootstrap;
import ma.sijilmassa.security.AccountPrincipal;
import ma.sijilmassa.security.Role;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.json.JsonMapper;

import static ma.sijilmassa.invoice.InvoiceFailure.Reason.*;
import static ma.sijilmassa.invoice.InvoiceModels.*;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
@SpringBootTest(properties = "spring.flyway.locations=classpath:db/migration,classpath:db/testmigration")
@ActiveProfiles("test")
@Import(InvoiceServiceTest.TestTime.class)
@ExtendWith(OutputCaptureExtension.class)
class InvoiceServiceTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");
    private static final Instant NOW = Instant.parse("2026-11-11T10:00:00Z");
    private static final String CANARY = "SYNTHETIC-CONFIDENTIAL-INVOICE-CANARY";

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired InvoiceService invoices;
    @Autowired TreatmentFinancialService ledger;
    @Autowired ConsultationService clinical;
    @Autowired PatientService patients;
    @Autowired AccountBootstrap bootstrap;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Autowired JsonMapper json;
    @Autowired TestClock clock;
    private UUID dentist;
    private UUID receptionist;

    @BeforeEach
    void setup() {
        clock.now = NOW;
        if (count("application_user") == 0) {
            bootstrap.initialize("invoice.dentist", UUID.randomUUID().toString(),
                    "invoice.reception", UUID.randomUUID().toString());
        }
        dentist = jdbc.queryForObject("SELECT id FROM application_user WHERE username='invoice.dentist'", UUID.class);
        receptionist = jdbc.queryForObject("SELECT id FROM application_user WHERE username='invoice.reception'", UUID.class);
        authenticate(Role.DENTIST, 0);
    }

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    @Test void draftSelectionPreservesOrderAndReleasesRemovedReservations() {
        UUID patient = patient();
        UUID first = charge(patient, "Premier soin fictif", 50001).chargeId();
        UUID second = charge(patient, "Autre soin fictif", 0).chargeId();
        int sequencesBefore = count("invoice_number_sequence");
        var draft = invoices.createDraft(patient, List.of(second, first));
        assertThat(draft.lifecycle()).isEqualTo(Lifecycle.BROUILLON);
        assertThat(draft.version()).isZero();
        assertThat(draft.issuance()).isNull();
        assertThat(draft.settlement()).isNull();
        assertThat(draft.lines()).extracting(Line::chargeId).containsExactly(second, first);
        assertThat(draft.lines()).extracting(Line::receivedAtIssueMinor).containsOnlyNulls();
        assertThat(draft.currentBalance()).isEqualTo(balance(50001, 0));
        assertThat(count("invoice_number_sequence")).isEqualTo(sequencesBefore);
        failure(() -> invoices.createDraft(patient, List.of(first)), CHARGE_RESERVED);
        var revised = invoices.replaceDraftCharges(patient, draft.id(), 0L, List.of(second));
        assertThat(revised.version()).isEqualTo(1);
        assertThat(revised.lines()).extracting(Line::chargeId).containsExactly(second);
        var reused = invoices.createDraft(patient, List.of(first));
        assertThat(reused.lines()).extracting(Line::chargeId).containsExactly(first);
        assertThat(events(draft.id())).containsExactly("INVOICE_CREATED", "INVOICE_DRAFT_UPDATED");
    }

    @Test void validatesOwnershipMissingChargesDuplicateSelectionAndEmptyIssue() {
        UUID patient = patient();
        UUID charge = charge(patient, "Soin fictif", 100).chargeId();
        UUID other = patient();
        failure(() -> invoices.createDraft(other, List.of(charge)), CHARGE_NOT_FOUND);
        failure(() -> invoices.createDraft(patient, List.of(UUID.randomUUID())), CHARGE_NOT_FOUND);
        failure(() -> invoices.createDraft(patient, List.of(charge, charge)), INVALID_SELECTION);
        failure(() -> invoices.createDraft(patient, null), INVALID_SELECTION);
        failure(() -> invoices.createDraft(patient, java.util.Collections.nCopies(251, charge)), INVALID_SELECTION);
        var draft = invoices.createDraft(patient, List.of());
        failure(() -> invoices.get(other, draft.id()), NOT_FOUND);
        failure(() -> invoices.issue(other, draft.id(), 0L), NOT_FOUND);
        failure(() -> invoices.issue(patient, draft.id(), 0L), EMPTY_DRAFT);
        assertThat(events(draft.id())).containsExactly("INVOICE_CREATED");
    }

    @Test void staleVersionCannotReplaceOrIssueAndIssuedSnapshotsAreImmutable() {
        UUID patient = patient();
        UUID charge = charge(patient, "Soin fictif", 100).chargeId();
        var draft = invoices.createDraft(patient, List.of());
        var revised = invoices.replaceDraftCharges(patient, draft.id(), 0L, List.of(charge));
        failure(() -> invoices.replaceDraftCharges(patient, draft.id(), 0L, List.of()), VERSION_CONFLICT);
        failure(() -> invoices.issue(patient, draft.id(), 0L), VERSION_CONFLICT);
        failure(() -> invoices.issue(patient, draft.id(), null), INVALID_VERSION);
        var issued = invoices.issue(patient, draft.id(), revised.version());
        assertThat(issued.version()).isEqualTo(2);
        assertThat(issued.lifecycle()).isEqualTo(Lifecycle.EMISE);
        assertThat(issued.settlement()).isEqualTo(Settlement.DUE);
        failure(() -> invoices.issue(patient, draft.id(), issued.version()), INVOICE_ISSUED);
        failure(() -> invoices.replaceDraftCharges(patient, draft.id(), issued.version(), List.of()), INVOICE_ISSUED);
        failure(() -> invoices.createDraft(patient, List.of(charge)), CHARGE_RESERVED);
        assertThat(invoices.get(patient, draft.id())).isEqualTo(issued);
    }

    @Test void reconcilesPartialPaymentsBeforeAndAfterIssuanceWithoutLedgerWrites() {
        UUID patient = patient();
        var source = treatment(patient, "Détartrage fictif");
        var charge = ledger.createCharge(patient, source.id(), source.treatments().getFirst().id(), source.version(), 50001L);
        var finalClinical = clinical.finalizeConsultation(patient, source.id(), source.version());
        pay(patient, charge.chargeId(), 0, 12000);
        pay(patient, charge.chargeId(), 1, 8000);
        var draft = invoices.createDraft(patient, List.of(charge.chargeId()));
        assertThat(draft.currentBalance()).isEqualTo(balance(50001, 20000));
        int chargesBefore = countForPatient("treatment_charge", patient);
        var issued = invoices.issue(patient, draft.id(), 0L);
        assertThat(countForPatient("treatment_charge", patient)).isEqualTo(chargesBefore).isEqualTo(1);
        assertThat(ledger.payments(patient, charge.chargeId(), null).items()).hasSize(2);
        assertThat(ledger.getCharge(patient, charge.chargeId()).version()).isEqualTo(2);
        assertThat(issued.issuance().balanceAtIssue()).isEqualTo(balance(50001, 20000));
        assertThat(issued.lines().getFirst().receivedAtIssueMinor()).isEqualTo(20000);
        pay(patient, charge.chargeId(), 2, 10000);
        pay(patient, charge.chargeId(), 3, 20001);
        var current = invoices.get(patient, draft.id());
        assertThat(current.issuance()).isEqualTo(issued.issuance());
        assertThat(current.version()).isEqualTo(issued.version());
        assertThat(current.currentBalance()).isEqualTo(balance(50001, 50001));
        assertThat(current.settlement()).isEqualTo(Settlement.SETTLED);
        assertThat(ledger.payments(patient, charge.chargeId(), null).items()).hasSize(4);
        assertThat(clinical.get(patient, source.id())).isEqualTo(finalClinical);
    }

    @Test void snapshotsRecordedReferencesByChargeEvenForIdenticalLabels() {
        UUID patient = patient();
        String label = "Soin fictif commun";
        var single = treatment(patient, label, "16");
        var multiple = treatment(patient, label, "17 / 18");
        var missing = treatment(patient, label, "");
        var singleCharge = ledger.createCharge(patient, single.id(), single.treatments().getFirst().id(), single.version(), 100L);
        var multipleCharge = ledger.createCharge(patient, multiple.id(), multiple.treatments().getFirst().id(), multiple.version(), 200L);
        var missingCharge = ledger.createCharge(patient, missing.id(), missing.treatments().getFirst().id(), missing.version(), 300L);
        var draft = invoices.createDraft(patient, List.of(multipleCharge.chargeId(), missingCharge.chargeId(), singleCharge.chargeId()));
        assertThat(draft.lines()).extracting(Line::issuedToothReference).containsOnlyNulls();

        var source = multiple.treatments().getFirst();
        String fullReference = "17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 31, 32/ 33";
        assertThat(fullReference).hasSize(50);
        var edited = clinical.editTreatment(patient, multiple.id(), source.id(), multiple.version(),
                new ClinicalModels.Treatment(source.content().treatmentDate(), label, fullReference, CANARY));
        var issued = as(Role.RECEPTIONIST, () -> invoices.issue(patient, draft.id(), draft.version()));
        assertThat(issued.lines()).extracting(Line::chargeId)
                .containsExactly(multipleCharge.chargeId(), missingCharge.chargeId(), singleCharge.chargeId());
        assertThat(issued.lines()).extracting(Line::issuedToothReference).containsExactly(fullReference, null, "16");

        var changed = as(Role.DENTIST, () -> clinical.editTreatment(patient, multiple.id(), source.id(), edited.version(),
                new ClinicalModels.Treatment(source.content().treatmentDate(), label, "48", CANARY)));
        assertThat(changed.treatments().getFirst().content().toothReference()).isEqualTo("48");
        assertThat(as(Role.RECEPTIONIST, () -> invoices.get(patient, draft.id()))).isEqualTo(issued);
    }

    @Test void identityAtIssueSurvivesPatientEditsAndTotalsRemainExactBeyondJavascriptRange() {
        UUID patient = patient();
        long maximum = FinancialModels.MAX_MINOR;
        UUID a = charge(patient, "Premier soin fictif", maximum).chargeId();
        UUID b = charge(patient, "Autre soin fictif", maximum).chargeId();
        var draft = invoices.createDraft(patient, List.of(a, b));
        rename(patient, "Élodie");
        var issued = invoices.issue(patient, draft.id(), 0L);
        rename(patient, "Éléonore");
        assertThat(issued.patient().firstName()).isEqualTo("Élodie");
        assertThat(invoices.get(patient, draft.id()).patient()).isEqualTo(issued.patient());
        assertThat(issued.currentBalance().totalMinor()).isEqualTo(new BigInteger("18014398509481982"));
        assertThat(issued.issuance().balanceAtIssue()).isEqualTo(issued.currentBalance());
    }

    @Test void distinctInvoicesCountOnlyPaymentsForTheirOwnChargesIncludingZeroPrice() {
        UUID patient = patient();
        UUID a = charge(patient, "Soin A", 300).chargeId();
        UUID b = charge(patient, "Soin B", 400).chargeId();
        UUID zero = charge(patient, "Soin gratuit", 0).chargeId();
        pay(patient, a, 0, 120);
        pay(patient, b, 0, 40);
        var first = invoices.issue(patient, invoices.createDraft(patient, List.of(a)).id(), 0L);
        var second = invoices.issue(patient, invoices.createDraft(patient, List.of(b)).id(), 0L);
        var free = invoices.issue(patient, invoices.createDraft(patient, List.of(zero)).id(), 0L);
        assertThat(first.currentBalance()).isEqualTo(balance(300, 120));
        assertThat(second.currentBalance()).isEqualTo(balance(400, 40));
        assertThat(free.settlement()).isEqualTo(Settlement.SETTLED);
        assertThat(ledger.payments(patient, zero, null).items()).isEmpty();
    }

    @Test void numbersUseCasablancaYearAndDraftsDoNotConsumeThem() {
        UUID patient = patient();
        clock.now = Instant.parse("2024-12-31T22:30:00Z");
        var first = invoices.createDraft(patient, List.of(charge(patient, "Soin A", 200).chargeId()));
        var second = invoices.createDraft(patient, List.of(charge(patient, "Soin B", 300).chargeId()));
        assertThat(invoices.issue(patient, first.id(), 0L).issuance().number()).isEqualTo("2024-001");
        clock.now = Instant.parse("2024-12-31T23:30:00Z");
        var issued = invoices.issue(patient, second.id(), 0L);
        assertThat(issued.issuance().number()).isEqualTo("2025-001");
        assertThat(issued.issuance().date()).isEqualTo(LocalDate.of(2025, 1, 1));
        failure(() -> invoices.issue(patient, second.id(), 0L), INVOICE_ISSUED);
        var third = invoices.createDraft(patient, List.of(charge(patient, "Soin C", 1).chargeId()));
        assertThat(invoices.issue(patient, third.id(), 0L).issuance().number()).isEqualTo("2025-002");
    }

    @Test void independentConcurrentIssuesAllocateDifferentPermanentNumbers() throws Exception {
        UUID patient = patient();
        clock.now = Instant.parse("2037-06-03T12:00:00Z");
        var a = invoices.createDraft(patient, List.of(charge(patient, "Soin A", 100).chargeId()));
        var b = invoices.createDraft(patient, List.of(charge(patient, "Soin B", 100).chargeId()));
        var results = parallel(() -> as(Role.DENTIST, () -> invoices.issue(patient, a.id(), 0L).issuance().number()),
                () -> as(Role.RECEPTIONIST, () -> invoices.issue(patient, b.id(), 0L).issuance().number()));
        assertThat(results).containsExactlyInAnyOrder("2037-001", "2037-002");
    }

    @Test void concurrentAttemptsToInvoiceSameChargeHaveOneWinner() throws Exception {
        UUID patient = patient();
        UUID charge = charge(patient, "Soin unique", 100).chargeId();
        var results = parallel(() -> as(Role.DENTIST, () -> tryInvoice(patient, charge)),
                () -> as(Role.RECEPTIONIST, () -> tryInvoice(patient, charge)));
        assertThat(results.stream().filter(Details.class::isInstance).count()).isEqualTo(1);
        assertThat(results).contains(CHARGE_RESERVED);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM invoice_line WHERE charge_id = ?", Integer.class, charge)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM invoice WHERE patient_id = ?", Integer.class, patient)).isEqualTo(1);
    }

    @Test void twoIssuesOfOneDraftCommitOnlyOneSnapshotAndAuditEvent() throws Exception {
        UUID patient = patient();
        var draft = invoices.createDraft(patient, List.of(charge(patient, "Soin unique", 100).chargeId()));
        var results = parallel(() -> as(Role.DENTIST, () -> tryIssue(patient, draft.id())),
                () -> as(Role.RECEPTIONIST, () -> tryIssue(patient, draft.id())));
        assertThat(results.stream().filter(Details.class::isInstance).count()).isEqualTo(1);
        assertThat(results).contains(INVOICE_ISSUED);
        assertThat(events(draft.id())).containsExactly("INVOICE_CREATED", "INVOICE_ISSUED");
    }

    @Test void issuanceWaitsForAnInFlightPaymentAndCapturesItOnceCommitted() throws Exception {
        UUID patient = patient();
        UUID charge = charge(patient, "Soin en cours d’encaissement", 500).chargeId();
        var draft = invoices.createDraft(patient, List.of(charge));
        var paid = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var writer = executor.submit(() -> as(Role.RECEPTIONIST, () -> new TransactionTemplate(transactions).execute(tx -> {
                pay(patient, charge, 0, 200);
                paid.countDown();
                await(release);
                return null;
            })));
            try {
                await(paid);
                var reader = executor.submit(() -> as(Role.DENTIST, () -> invoices.issue(patient, draft.id(), 0L)));
                awaitInvoiceLock();
                release.countDown();
                writer.get(12, TimeUnit.SECONDS);
                var issued = reader.get(12, TimeUnit.SECONDS);
                assertThat(issued.issuance().balanceAtIssue()).isEqualTo(balance(500, 200));
                assertThat(issued.currentBalance()).isEqualTo(issued.issuance().balanceAtIssue());
            } finally {
                release.countDown();
            }
        }
    }

    @Test void auditFailureRollsBackDraftEditsAndNumberAndSnapshotOnIssue() {
        UUID patient = patient();
        clock.now = Instant.parse("2038-06-03T12:00:00Z");
        UUID a = charge(patient, "Soin A", 100).chargeId();
        UUID b = charge(patient, "Soin B", 200).chargeId();
        var draft = invoices.createDraft(patient, List.of(a));
        jdbc.execute("""
                CREATE FUNCTION reject_invoice_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF NEW.target_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Synthetic audit rejection' USING ERRCODE='23514'; END IF;
                    RETURN NEW;
                END $$;
                CREATE TRIGGER reject_invoice_test_audit BEFORE INSERT ON security_audit_event
                    FOR EACH ROW EXECUTE FUNCTION reject_invoice_test_audit();
                """);
        try {
            assertThatThrownBy(() -> invoices.createDraft(patient, List.of(b))).isInstanceOf(DataAccessException.class);
            assertThatThrownBy(() -> invoices.replaceDraftCharges(patient, draft.id(), 0L, List.of(b))).isInstanceOf(DataAccessException.class);
            assertThatThrownBy(() -> invoices.issue(patient, draft.id(), 0L)).isInstanceOf(DataAccessException.class);
            assertThat(invoices.get(patient, draft.id())).isEqualTo(draft);
            assertThat(events(draft.id())).containsExactly("INVOICE_CREATED");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM invoice_number_sequence WHERE invoice_year = 2038", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM invoice_line WHERE charge_id = ?", Integer.class, b)).isZero();
        } finally {
            jdbc.execute("DROP TRIGGER reject_invoice_test_audit ON security_audit_event; DROP FUNCTION reject_invoice_test_audit()");
        }
        assertThat(invoices.issue(patient, draft.id(), 0L).issuance().number()).isEqualTo("2038-001");
    }

    @Test void archivedHistoryIsReadableButDraftWritesAndIssuanceAreRefused() {
        UUID patient = patient();
        var issued = invoices.issue(patient, invoices.createDraft(patient,
                List.of(charge(patient, "Soin A", 100).chargeId())).id(), 0L);
        var draft = invoices.createDraft(patient, List.of(charge(patient, "Soin B", 100).chargeId()));
        jdbc.update("UPDATE patient SET status='INACTIVE', version=version+1, updated_at=updated_at+interval '1 second' WHERE id=?", patient);
        assertThat(invoices.get(patient, issued.id())).isEqualTo(issued);
        assertThat(invoices.get(patient, draft.id())).isEqualTo(draft);
        failure(() -> invoices.createDraft(patient, List.of()), ARCHIVED_PATIENT);
        failure(() -> invoices.replaceDraftCharges(patient, draft.id(), 0L, List.of()), ARCHIVED_PATIENT);
        failure(() -> invoices.issue(patient, draft.id(), 0L), ARCHIVED_PATIENT);
    }

    @Test void receptionistCanInvoiceExistingChargesWithoutConfidentialFieldsAndRevocationIsRespected(CapturedOutput output) {
        UUID patient = patient();
        UUID charge = charge(patient, "Soin fictif facturable", 100).chargeId();
        authenticate(Role.RECEPTIONIST, 0);
        var draft = invoices.createDraft(patient, List.of(charge));
        var result = invoices.issue(patient, draft.id(), 0L);
        assertThat(result.issuance().issuedBy()).isEqualTo(receptionist);
        assertThat(json.writeValueAsString(result)).contains("Soin fictif facturable", "\"issuedToothReference\":\"16\"")
                .doesNotContain(CANARY, "consultationId", "treatmentId", "notes", "questionnaire", "prescription");
        assertThat(result.toString()).doesNotContain("Soin fictif facturable", "Patient synthétique");
        assertThat(output.getAll()).doesNotContain(CANARY);
        authenticate(Role.RECEPTIONIST, 1);
        assertThatThrownBy(() -> invoices.get(patient, result.id())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> invoices.createDraft(patient, List.of())).isInstanceOf(AccessDeniedException.class);
        SecurityContextHolder.clearContext();
        assertThatThrownBy(() -> invoices.get(patient, result.id())).isInstanceOf(AuthenticationException.class);
    }

    private Object tryInvoice(UUID patient, UUID charge) {
        try { return invoices.issue(patient, invoices.createDraft(patient, List.of(charge)).id(), 0L); }
        catch (InvoiceFailure failure) { return failure.reason(); }
    }

    private Object tryIssue(UUID patient, UUID draft) {
        try { return invoices.issue(patient, draft, 0L); }
        catch (InvoiceFailure failure) { return failure.reason(); }
    }

    private void awaitInvoiceLock() throws InterruptedException {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < until) {
            if (Boolean.TRUE.equals(jdbc.queryForObject("""
                    SELECT EXISTS (SELECT 1 FROM pg_stat_activity
                    WHERE pid <> pg_backend_pid() AND query LIKE '%UPDATE invoice SET lifecycle%' AND wait_event_type = 'Lock')
                    """, Boolean.class))) return;
            Thread.sleep(25);
        }
        throw new AssertionError("Invoice did not wait for the payment lock");
    }

    private static <T> List<T> parallel(Callable<T> a, Callable<T> b) throws Exception {
        var gate = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var left = executor.submit(() -> { gate.await(5, TimeUnit.SECONDS); return a.call(); });
            var right = executor.submit(() -> { gate.await(5, TimeUnit.SECONDS); return b.call(); });
            return List.of(left.get(15, TimeUnit.SECONDS), right.get(15, TimeUnit.SECONDS));
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) throw new AssertionError("Synthetic transaction timed out");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }

    private UUID patient() {
        return patients.create(new PatientDtos.AdministrativeCreate(identity("Patient synthétique"), PatientValues.Status.ACTIVE)).id();
    }

    private void rename(UUID patient, String name) {
        var current = patients.get(patient);
        patients.update(patient, new PatientDtos.AdministrativeUpdate(current.version(), identity(name), current.status()));
    }

    private static PatientDtos.Identity identity(String name) {
        return new PatientDtos.Identity(name, "Facture fictive", PatientValues.Sex.UNANSWERED, null,
                "", "", "", "", "", "");
    }

    private ClinicalModels.Details treatment(UUID patient, String label) {
        return treatment(patient, label, "16");
    }

    private ClinicalModels.Details treatment(UUID patient, String label, String toothReference) {
        LocalDate date = clock.instant().atZone(ZoneOffset.UTC).toLocalDate();
        var consultation = clinical.create(patient, new ClinicalModels.Draft(null, date, "Motif fictif", CANARY, CANARY, CANARY, CANARY));
        return clinical.addTreatment(patient, consultation.id(), consultation.version(), new ClinicalModels.Treatment(date, label, toothReference, CANARY));
    }

    private FinancialModels.Row charge(UUID patient, String label, long price) {
        var consultation = treatment(patient, label);
        return ledger.createCharge(patient, consultation.id(), consultation.treatments().getFirst().id(), consultation.version(), price);
    }

    private void pay(UUID patient, UUID charge, long version, long amount) {
        ledger.recordPayment(patient, charge, version, new FinancialModels.PaymentInput(amount, NOW, FinancialModels.PaymentMethod.ESPECES, UUID.randomUUID()));
    }

    private void authenticate(Role role, long version) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new AccountPrincipal(role == Role.DENTIST ? dentist : receptionist, "invoice.synthetic", role, version),
                null, List.of(new SimpleGrantedAuthority("ROLE_" + role.name()))));
    }

    private <T> T as(Role role, Supplier<T> operation) {
        authenticate(role, 0);
        try { return operation.get(); }
        finally { SecurityContextHolder.clearContext(); }
    }

    private List<String> events(UUID id) {
        return jdbc.queryForList("SELECT event_type FROM security_audit_event WHERE target_invoice_id = ? ORDER BY occurred_at, event_type",
                String.class, id);
    }

    private int count(String table) { return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class); }
    private int countForPatient(String table, UUID id) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE patient_id = ?", Integer.class, id);
    }

    private static Balance balance(long total, long received) {
        return new Balance(BigInteger.valueOf(total), BigInteger.valueOf(received), BigInteger.valueOf(total - received));
    }

    private static void failure(Runnable call, InvoiceFailure.Reason reason) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(InvoiceFailure.class, error -> assertThat(error.reason()).isEqualTo(reason));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class TestTime {
        @Bean @Primary TestClock invoiceClock() { return new TestClock(); }
    }

    static final class TestClock extends Clock {
        volatile Instant now = NOW;
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
        @Override public Instant instant() { return now; }
    }
}
