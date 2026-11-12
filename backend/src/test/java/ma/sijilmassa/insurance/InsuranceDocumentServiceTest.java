package ma.sijilmassa.insurance;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

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
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
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

import static ma.sijilmassa.insurance.InsuranceFailure.Reason.*;
import static ma.sijilmassa.insurance.InsuranceModels.*;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
@SpringBootTest(properties = "spring.flyway.locations=classpath:db/migration,classpath:db/testmigration")
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
class InsuranceDocumentServiceTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");
    private static final LocalDate DATE = LocalDate.of(2026, 11, 11);
    private static final String CLINICAL_CANARY = "SYNTHETIC-PRIVATE-CLINICAL-NOTE";
    private static final InsuredInput SELF = new InsuredInput(Relationship.LUI_MEME, null, null, null, null, null);
    private static final ActFields QUOTE = new ActFields(null, "Travail prévu fictif", "16", null,
            null, new BigDecimal("12.5"), null, 15001L);
    private static final ActFields EXECUTED = new ActFields(null, null, null, "SYN01", "SC", null, 13L, null);

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired InsuranceDocumentService insurance;
    @Autowired ConsultationService clinical;
    @Autowired TreatmentFinancialService ledger;
    @Autowired PatientService patients;
    @Autowired AccountBootstrap bootstrap;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    private UUID dentist;
    private UUID receptionist;

    @BeforeEach void authenticateDentist() {
        if (count("application_user") == 0) {
            bootstrap.initialize("insurance.dentist", UUID.randomUUID().toString(),
                    "insurance.reception", UUID.randomUUID().toString());
        }
        dentist = jdbc.queryForObject("SELECT id FROM application_user WHERE role='DENTIST'", UUID.class);
        receptionist = jdbc.queryForObject("SELECT id FROM application_user WHERE role='RECEPTIONIST'", UUID.class);
        auth(Role.DENTIST, dentist, 0, Role.DENTIST);
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void createsPartialDraftAndReplacesFieldsAndActsAtExpectedVersion() {
        UUID patient = patient();
        var empty = cnss(null, null, null);
        var draft = create(patient, null, DocumentType.CNSS_DENTAIRE, Purpose.ENTENTE_PREALABLE, draft(empty));
        assertThat(draft.draft().acts()).isEmpty();
        assertThat(draft.lifecycle()).isEqualTo(Lifecycle.BROUILLON);
        assertThat(draft.version()).isZero();
        assertThat(draft.createdBy()).isEqualTo(dentist);

        var replacement = draft(cnss(SELF, "INS-FICTIF", "012345678"), quote());
        var revised = insurance.replaceDraft(patient, draft.id(), 0L, replacement);
        assertThat(revised.draft().fields().cnss().registrationNumber()).isEqualTo("INS-FICTIF");
        assertThat(revised.draft().acts()).containsExactly(quote());
        assertThat(revised.version()).isEqualTo(1);
        assertThat(revised.updatedAt()).isAfter(draft.updatedAt());
        assertThat(revised).isEqualTo(insurance.get(patient, draft.id()));
        fails(VERSION_CONFLICT, () -> insurance.replaceDraft(patient, draft.id(), 0L, replacement));
        assertThat(events(draft.id())).containsExactlyInAnyOrder("INSURANCE_DOCUMENT_CREATED", "INSURANCE_DRAFT_UPDATED");
    }

    @Test void exactTemplateVersionsAndPurposeMustMatchTheReference() throws Exception {
        UUID patient = patient();
        for (var type : DocumentType.values()) {
            var original = Path.of("../docs/references/pdf-templates/feuille_dentaire_"
                    + type.name().split("_")[0] + ".pdf");
            assertThat(type.templateSha256()).isEqualTo(HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(original))));
        }
        var input = draft(cnss(SELF, "CNSS-FICTIF", "012345678"), quote());
        fails(UNSUPPORTED_TEMPLATE, () -> insurance.createDraft(new CreateInput(patient, null, null, 1, Purpose.ENTENTE_PREALABLE, input)));
        fails(UNSUPPORTED_TEMPLATE, () -> insurance.createDraft(new CreateInput(patient, null, DocumentType.CNSS_DENTAIRE, 2,
                Purpose.ENTENTE_PREALABLE, input)));
        fails(INVALID_INPUT, () -> create(patient, null, DocumentType.CNSS_DENTAIRE, Purpose.DEVIS, input));
        fails(INVALID_INPUT, () -> create(patient, null, DocumentType.CNOPS_DENTAIRE, Purpose.ENTENTE_PREALABLE, input));
        var finalized = finish(create(patient, null, DocumentType.CNSS_DENTAIRE, Purpose.ENTENTE_PREALABLE, input));
        assertThat(finalized.snapshot().templateVersion()).isEqualTo(1);
        assertThat(finalized.snapshot().schemaVersion()).isEqualTo(1);
        assertThat(finalized.snapshot().templateSha256()).isEqualTo(DocumentType.CNSS_DENTAIRE.templateSha256());
    }

    @Test void patientAndConsultationOwnershipIsAlwaysScoped() {
        UUID patient = patient();
        UUID other = patient();
        var clinicalSource = treatment(other);
        var input = draft(cnss(SELF, "CNSS-FICTIF", "012345678"));
        fails(NOT_FOUND, () -> create(UUID.randomUUID(), null, DocumentType.CNSS_DENTAIRE, Purpose.EXECUTION, input));
        fails(INVALID_CONSULTATION, () -> create(patient, clinicalSource.id(), DocumentType.CNSS_DENTAIRE, Purpose.EXECUTION, input));
        var document = create(patient, null, DocumentType.CNSS_DENTAIRE, Purpose.EXECUTION, input);
        fails(NOT_FOUND, () -> insurance.get(other, document.id()));
        fails(NOT_FOUND, () -> insurance.replaceDraft(other, document.id(), 0L, input));
        fails(NOT_FOUND, () -> insurance.finalizeDocument(other, document.id(), new FinalizeInput(0L, 0L, null)));
        fails(INVALID_CONSULTATION, () -> finish(document));
    }

    @Test void archivalKeepsHistoryReadableAndBlocksEveryWrite() {
        UUID patient = patient();
        var input = draft(cnss(SELF, "CNSS-FICTIF", "012345678"), quote());
        var document = create(patient, null, DocumentType.CNSS_DENTAIRE, Purpose.ENTENTE_PREALABLE, input);
        var current = patients.get(patient);
        patients.update(patient, new PatientDtos.AdministrativeUpdate(current.version(), identity("Identité fictive"), PatientValues.Status.INACTIVE));
        assertThat(insurance.get(patient, document.id()).lifecycle()).isEqualTo(Lifecycle.BROUILLON);
        fails(ARCHIVED_PATIENT, () -> create(patient, null, DocumentType.CNSS_DENTAIRE, Purpose.ENTENTE_PREALABLE, input));
        fails(ARCHIVED_PATIENT, () -> insurance.replaceDraft(patient, document.id(), 0L, input));
        fails(ARCHIVED_PATIENT, () -> finish(document));
    }

    @Test void executionRequiresClosedConsultationAndCurrentReviewVersions() {
        UUID patient = patient();
        var source = treatment(patient);
        var input = draft(cnss(SELF, "CNSS-FICTIF", "012345678"), sourced(source, null));
        var document = create(patient, source.id(), DocumentType.CNSS_DENTAIRE, Purpose.EXECUTION, input);
        fails(INVALID_CONSULTATION, () -> finish(document));
        clinical.finalizeConsultation(patient, source.id(), source.version());
        fails(VERSION_CONFLICT, () -> finish(document));
        var reread = insurance.get(patient, document.id());
        fails(VERSION_CONFLICT, () -> insurance.finalizeDocument(patient, document.id(),
                new FinalizeInput(0L, reread.beneficiary().version() + 1, reread.consultation().version())));
        var result = finish(reread);
        assertThat(result.snapshot().acts()).singleElement().satisfies(line -> {
            assertThat(line.date()).isEqualTo(DATE);
            assertThat(line.feeMinor()).isNull();
            assertThat(line.feeSource()).isNull();
        });
        assertThat(result.snapshot().knownCompleteFeeTotalMinor()).isNull();
    }

    @Test void freezesExactV9PriceAndPatientFactsWithoutCreatingOrMutatingClinicalOrFinancialRecords(CapturedOutput output) {
        UUID patient = patient();
        var source = treatment(patient);
        var charge = ledger.createCharge(patient, source.id(), treatmentId(source), source.version(), 50001L);
        var closed = clinical.finalizeConsultation(patient, source.id(), source.version());
        int charges = count("treatment_charge");
        int payments = count("treatment_payment");
        int invoices = count("invoice");
        int prescriptions = count("prescription");
        int treatments = count("clinical_treatment");
        var input = draft(cnss(SELF, "SYNTHETIC-MEMBER-CANARY", "012345678"), sourced(source, charge.chargeId()));
        var finalized = finish(create(patient, source.id(), DocumentType.CNSS_DENTAIRE, Purpose.EXECUTION, input));
        assertThat(finalized.lifecycle()).isEqualTo(Lifecycle.FINALISE);
        assertThat(finalized.finalizedBy()).isEqualTo(dentist);
        assertThat(finalized.draft()).isNull();
        assertThat(finalized.snapshot().insured().source()).isEqualTo(InsuredSource.PATIENT);
        assertThat(finalized.snapshot().knownCompleteFeeTotalMinor()).isEqualTo(BigInteger.valueOf(50001));
        assertThat(finalized.snapshot().acts()).singleElement().satisfies(line -> {
            assertThat(line.treatmentId()).isEqualTo(treatmentId(source));
            assertThat(line.chargeId()).isEqualTo(charge.chargeId());
            assertThat(line.feeSource()).isEqualTo(FeeSource.V9_AGREED_PRICE);
            assertThat(line.feeMinor()).isEqualTo(50001L);
            assertThat(line.keyValueMinor()).isEqualTo(13L);
        });
        assertThat(count("treatment_charge")).isEqualTo(charges);
        assertThat(count("treatment_payment")).isEqualTo(payments);
        assertThat(count("invoice")).isEqualTo(invoices);
        assertThat(count("prescription")).isEqualTo(prescriptions);
        assertThat(count("clinical_treatment")).isEqualTo(treatments);
        assertThat(clinical.get(patient, source.id())).isEqualTo(closed);
        assertThat(output.getAll()).doesNotContain(CLINICAL_CANARY, "SYNTHETIC-MEMBER-CANARY");
        assertThat(jdbc.queryForObject("SELECT final_snapshot::text FROM insurance_document WHERE id = ?",
                String.class, finalized.id())).doesNotContain(CLINICAL_CANARY);
        assertThat(jdbc.queryForList("""
                SELECT event_type FROM security_audit_event
                WHERE actor_user_id = ? AND target_patient_id = ? AND target_insurance_document_id = ?
                """, String.class, dentist, patient, finalized.id())).containsExactlyInAnyOrder(
                    "INSURANCE_DOCUMENT_CREATED", "INSURANCE_DOCUMENT_FINALIZED");

        var live = patients.get(patient);
        patients.update(patient, new PatientDtos.AdministrativeUpdate(live.version(), identity("Nouveau prénom fictif"), PatientValues.Status.ACTIVE));
        ledger.recordPayment(patient, charge.chargeId(), 0L, new FinancialModels.PaymentInput(5000L, Instant.parse("2026-11-11T10:00:00Z"),
                FinancialModels.PaymentMethod.ESPECES, UUID.randomUUID()));
        assertThat(insurance.get(patient, finalized.id())).isEqualTo(finalized);
        fails(READ_ONLY, () -> insurance.replaceDraft(patient, finalized.id(), 1L, input));
        fails(READ_ONLY, () -> finish(finalized));
        assertThatThrownBy(() -> jdbc.update("UPDATE insurance_document SET final_snapshot = '{}'::jsonb WHERE id = ?", finalized.id()))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM insurance_act WHERE document_id = ?", finalized.id()))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM insurance_document WHERE id = ?", finalized.id()))
                .isInstanceOf(DataAccessException.class);
    }

    @Test void sourceValidationRejectsOtherTreatmentsWrongChargesAndDuplicateLines() {
        UUID patient = patient();
        UUID other = patient();
        var source = treatment(patient);
        var another = treatment(other);
        var foreignCharge = ledger.createCharge(other, another.id(), treatmentId(another), another.version(), 0L);
        var ownOther = treatment(patient);
        var mismatchedCharge = ledger.createCharge(patient, ownOther.id(), treatmentId(ownOther), ownOther.version(), 10L);
        Fields fields = cnss(SELF, "CNSS-FICTIF", "012345678");
        fails(INVALID_TREATMENT, () -> create(patient, source.id(), DocumentType.CNSS_DENTAIRE, Purpose.EXECUTION,
                draft(fields, sourced(another, null))));
        for (UUID charge : List.of(foreignCharge.chargeId(), mismatchedCharge.chargeId(), UUID.randomUUID())) {
            fails(INVALID_CHARGE, () -> create(patient, source.id(), DocumentType.CNSS_DENTAIRE, Purpose.EXECUTION,
                    draft(fields, sourced(source, charge))));
        }
        fails(INVALID_INPUT, () -> create(patient, source.id(), DocumentType.CNSS_DENTAIRE, Purpose.EXECUTION,
                draft(fields, sourced(source, null), sourced(source, null))));
    }

    @Test void finalizedQuoteUsesExplicitInsuredAndLeavesUnknownOptionalFieldsAbsent() {
        UUID patient = patient();
        var holder = new InsuredInput(Relationship.CONJOINT, "Assuré fictif", "Exemple", null, null, null);
        var fields = cnss(holder, "CNSS-FICTIF", "012345678");
        var result = finish(create(patient, null, DocumentType.CNSS_DENTAIRE, Purpose.ENTENTE_PREALABLE, draft(fields, quote())));
        assertThat(result.snapshot().insured().source()).isEqualTo(InsuredSource.DOCUMENT_INPUT);
        assertThat(result.snapshot().insured().firstName()).isEqualTo("Assuré fictif");
        assertThat(result.snapshot().insured().cin()).isNull();
        assertThat(result.snapshot().fields().attachmentCount()).isNull();
        assertThat(result.snapshot().acts().getFirst().date()).isNull();
        assertThat(result.snapshot().acts().getFirst().feeSource()).isEqualTo(FeeSource.MANUAL_QUOTE);
        assertThat(patients.get(patient).identity().firstName()).isEqualTo("Identité fictive");
    }

    @Test void missingInsurerSpecificFieldsFailWithoutLeavingFinalizationAudit() {
        UUID patient = patient();
        var noRelationship = create(patient, null, DocumentType.CNSS_DENTAIRE, Purpose.ENTENTE_PREALABLE,
                draft(cnss(null, "CNSS-FICTIF", "012345678"), quote()));
        fails(INCOMPLETE_DOCUMENT, () -> finish(noRelationship));
        var noAffiliation = create(patient, null, DocumentType.CNOPS_DENTAIRE, Purpose.ENTENTE_PREALABLE,
                draft(cnops(null, "K02"), quote()));
        fails(INCOMPLETE_DOCUMENT, () -> finish(noAffiliation));
        var incompleteFar = create(patient, null, DocumentType.FAR_DENTAIRE, Purpose.DEVIS,
                draft(far(null), quote()));
        fails(INCOMPLETE_DOCUMENT, () -> finish(incompleteFar));
        assertThat(events(noRelationship.id())).containsExactly("INSURANCE_DOCUMENT_CREATED");
        assertThat(events(noAffiliation.id())).containsExactly("INSURANCE_DOCUMENT_CREATED");
        assertThat(events(incompleteFar.id())).containsExactly("INSURANCE_DOCUMENT_CREATED");
    }

    @Test void cnopsAndFarPersistTheirOwnFieldsAndValidateCategoriesAndMarks() {
        UUID patient = patient();
        fails(INVALID_INPUT, () -> create(patient, null, DocumentType.CNOPS_DENTAIRE, Purpose.ENTENTE_PREALABLE,
                draft(cnops("AFF-FICTIF", "K02.1"), quote())));
        var cnops = finish(create(patient, null, DocumentType.CNOPS_DENTAIRE, Purpose.ENTENTE_PREALABLE,
                draft(cnops("AFF-FICTIF", "K02"), quote())));
        assertThat(cnops.snapshot().fields().cnops().diagnosisCategory()).isEqualTo("K02");
        assertThat(cnops.snapshot().fields().cnops().confirmedTeeth()).containsExactly("55");
        var unresolved = create(patient, null, DocumentType.FAR_DENTAIRE, Purpose.DEVIS,
                draft(far(new FarMark("16", null)), quote()));
        fails(INCOMPLETE_DOCUMENT, () -> finish(unresolved));
        var far = finish(create(patient, null, DocumentType.FAR_DENTAIRE, Purpose.DEVIS,
                draft(far(new FarMark("16", FarSymbol.CERCLE)), quote())));
        assertThat(far.snapshot().fields().far().marks()).containsExactly(new FarMark("16", FarSymbol.CERCLE));
        assertThatThrownBy(() -> far.snapshot().fields().far().marks().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThat(far.snapshot().fields().far().prospectusCount()).isZero();
        assertThat(far.snapshot().knownCompleteFeeTotalMinor()).isEqualTo(BigInteger.valueOf(15001));
    }

    @Test void farReceiptsRequireAgreedPriceAndKeepExplicitZero() {
        UUID patient = patient();
        var source = treatment(patient);
        var charge = ledger.createCharge(patient, source.id(), treatmentId(source), source.version(), 0L);
        clinical.finalizeConsultation(patient, source.id(), source.version());
        var fields = far(new FarMark("16", FarSymbol.CERCLE));
        var act = new ActInput(treatmentId(source), null, new ActFields(null, null, null, null, null, null, null, null));
        var pending = create(patient, source.id(), DocumentType.FAR_DENTAIRE, Purpose.RECUS, draft(fields, act));
        fails(INCOMPLETE_DOCUMENT, () -> finish(pending));
        var confirmed = finish(insurance.replaceDraft(patient, pending.id(), 0L,
                draft(fields, new ActInput(treatmentId(source), charge.chargeId(), act.fields()))));
        assertThat(confirmed.snapshot().knownCompleteFeeTotalMinor()).isEqualTo(BigInteger.ZERO);
        assertThat(confirmed.snapshot().acts().getFirst().feeMinor()).isZero();
    }

    @Test void receptionAndStaleOrForgedSessionsCannotReadOrWrite() {
        UUID patient = patient();
        var input = draft(cnops("AFF-FICTIF", "K02"), quote());
        var document = create(patient, null, DocumentType.CNOPS_DENTAIRE, Purpose.ENTENTE_PREALABLE, input);
        auth(Role.RECEPTIONIST, receptionist, 0, Role.RECEPTIONIST);
        assertThatThrownBy(() -> insurance.get(patient, document.id())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> insurance.replaceDraft(patient, document.id(), 0L, input)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> finish(document)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> create(patient, null, DocumentType.CNOPS_DENTAIRE, Purpose.ENTENTE_PREALABLE, input))
                .isInstanceOf(AccessDeniedException.class);
        auth(Role.DENTIST, receptionist, 0, Role.DENTIST);
        assertThatThrownBy(() -> insurance.get(patient, document.id())).isInstanceOf(AccessDeniedException.class);
        auth(Role.DENTIST, dentist, 99, Role.DENTIST);
        assertThatThrownBy(() -> insurance.get(patient, document.id())).isInstanceOf(AccessDeniedException.class);
    }

    @Test void auditFailureRollsBackFinalizationAndOuterRollbackRemovesDraftAndAudit() {
        UUID patient = patient();
        var input = draft(cnss(SELF, "CNSS-FICTIF", "012345678"), quote());
        var document = create(patient, null, DocumentType.CNSS_DENTAIRE, Purpose.ENTENTE_PREALABLE, input);
        jdbc.execute("""
                ALTER TABLE security_audit_event ADD CONSTRAINT synthetic_insurance_audit_reject
                CHECK (event_type <> 'INSURANCE_DOCUMENT_FINALIZED') NOT VALID
                """);
        try {
            assertThatThrownBy(() -> finish(document)).isInstanceOf(DataAccessException.class);
        } finally {
            jdbc.execute("ALTER TABLE security_audit_event DROP CONSTRAINT synthetic_insurance_audit_reject");
        }
        assertThat(insurance.get(patient, document.id())).isEqualTo(document);
        assertThat(events(document.id())).containsExactly("INSURANCE_DOCUMENT_CREATED");
        int auditBefore = count("security_audit_event");
        int docsBefore = count("insurance_document");
        int actsBefore = count("insurance_act");
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            create(patient, null, DocumentType.CNSS_DENTAIRE, Purpose.ENTENTE_PREALABLE, input);
            status.setRollbackOnly();
        });
        assertThat(count("security_audit_event")).isEqualTo(auditBefore);
        assertThat(count("insurance_document")).isEqualTo(docsBefore);
        assertThat(count("insurance_act")).isEqualTo(actsBefore);
    }

    @Test void competingEditsAtTheSameVersionHaveOneWinner() throws Exception {
        UUID patient = patient();
        var input = draft(cnss(SELF, "CNSS-FICTIF", "012345678"), quote());
        var document = create(patient, null, DocumentType.CNSS_DENTAIRE, Purpose.ENTENTE_PREALABLE, input);
        var barrier = new CyclicBarrier(2);
        Callable<String> edit = () -> {
            auth(Role.DENTIST, dentist, 0, Role.DENTIST);
            try {
                barrier.await(10, TimeUnit.SECONDS);
                insurance.replaceDraft(patient, document.id(), 0L, input);
                return "updated";
            } catch (InsuranceFailure exception) {
                return exception.reason().name();
            } finally {
                SecurityContextHolder.clearContext();
            }
        };
        try (var workers = Executors.newFixedThreadPool(2)) {
            var first = workers.submit(edit);
            var second = workers.submit(edit);
            assertThat(List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("updated", VERSION_CONFLICT.name());
        }
        assertThat(insurance.get(patient, document.id()).version()).isEqualTo(1);
        assertThat(events(document.id())).containsExactlyInAnyOrder("INSURANCE_DOCUMENT_CREATED", "INSURANCE_DRAFT_UPDATED");
    }

    private UUID patient() {
        return patients.create(new PatientDtos.AdministrativeCreate(identity("Identité fictive"), PatientValues.Status.ACTIVE)).id();
    }

    private static PatientDtos.Identity identity(String firstName) {
        return new PatientDtos.Identity(firstName, "Patient synthétique", PatientValues.Sex.F, LocalDate.of(1990, 5, 4),
                "Adresse fictive", "0612345678", "", "", "FICTIF1", "");
    }

    private ClinicalModels.Details treatment(UUID patient) {
        var consultation = clinical.create(patient, new ClinicalModels.Draft(null, DATE, "Motif fictif", CLINICAL_CANARY,
                CLINICAL_CANARY, CLINICAL_CANARY, CLINICAL_CANARY));
        return clinical.addTreatment(patient, consultation.id(), consultation.version(),
                new ClinicalModels.Treatment(DATE, "Soin fictif", "16", CLINICAL_CANARY));
    }

    private static UUID treatmentId(ClinicalModels.Details source) { return source.treatments().getFirst().id(); }

    private static ActInput quote() { return new ActInput(null, null, QUOTE); }

    private static ActInput sourced(ClinicalModels.Details source, UUID charge) {
        return new ActInput(treatmentId(source), charge, EXECUTED);
    }

    private static Fields cnss(InsuredInput insured, String registration, String inp) {
        return new Fields(insured, null, new CnssFields(registration, inp, null, null, null, null, null), null, null);
    }

    private static Fields cnops(String affiliation, String diagnosis) {
        return new Fields(SELF, null, null, new CnopsFields("CNOPS-FICTIF", affiliation, "012345678",
                List.of(CnopsCare.SOINS), null, null, null, diagnosis, List.of("55"), null), null);
    }

    private static Fields far(FarMark mark) {
        return new Fields(SELF, 0, null, null,
                new FarFields(mark == null ? null : "COMPTE-FICTIF", "Grade fictif", "Unité fictive", "012345678",
                        FarCare.SOINS, FarContext.MALADIE, 0, DATE, mark == null ? List.of() : List.of(mark)));
    }

    private static DraftInput draft(Fields fields, ActInput... lines) { return new DraftInput(fields, List.of(lines)); }

    private Details create(UUID patient, UUID consultation, DocumentType type, Purpose purpose, DraftInput input) {
        return insurance.createDraft(new CreateInput(patient, consultation, type, 1, purpose, input));
    }

    private Details finish(Details draft) {
        return insurance.finalizeDocument(draft.patientId(), draft.id(), new FinalizeInput(draft.version(),
                draft.beneficiary().version(), draft.consultation() == null ? null : draft.consultation().version()));
    }

    private List<String> events(UUID id) {
        return jdbc.queryForList("SELECT event_type FROM security_audit_event WHERE target_insurance_document_id = ?",
                String.class, id);
    }

    private int count(String table) { return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class); }

    private static void auth(Role claimed, UUID id, long version, Role authority) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new AccountPrincipal(id, "insurance.synthetic", claimed, version), null,
                List.of(new SimpleGrantedAuthority("ROLE_" + authority.name()))));
    }

    private static void fails(InsuranceFailure.Reason reason, Runnable operation) {
        assertThatThrownBy(operation::run).isInstanceOfSatisfying(InsuranceFailure.class,
                failure -> assertThat(failure.reason()).isEqualTo(reason));
    }
}
