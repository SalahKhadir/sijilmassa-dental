package ma.sijilmassa.clinical;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.function.Supplier;
import java.util.concurrent.atomic.AtomicReference;
import ma.sijilmassa.security.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
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
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static ma.sijilmassa.clinical.ClinicalModels.*;
import static ma.sijilmassa.clinical.ClinicalFailure.Reason.*;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
@SpringBootTest(properties = "spring.flyway.locations=classpath:db/migration,classpath:db/testmigration")
@ActiveProfiles("test")
class ConsultationServiceTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }
    @Autowired ConsultationService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired AccountBootstrap bootstrap;
    @Autowired PlatformTransactionManager transactions;
    UUID dentist, receptionist;
    static final LocalDate DATE = LocalDate.of(2026, 11, 10);
    static final String CANARY = "SYNTHETIC-CLINICAL-CONTENT-NOT-FOR-AUDIT";

    @BeforeEach void accounts() {
        if (jdbc.queryForObject("SELECT count(*) FROM application_user", Integer.class) == 0)
            bootstrap.initialize("clinical.dentist", UUID.randomUUID().toString(), "clinical.reception", UUID.randomUUID().toString());
        dentist = jdbc.queryForObject("SELECT id FROM application_user WHERE username='clinical.dentist'", UUID.class);
        receptionist = jdbc.queryForObject("SELECT id FROM application_user WHERE username='clinical.reception'", UUID.class);
        authenticate(Role.DENTIST);
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    void authenticate(Role role) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new AccountPrincipal(role == Role.DENTIST ? dentist : receptionist, "clinical.synthetic", role, 0), null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role.name()))));
    }
    UUID patient() {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO patient(id,reference,first_name,last_name,sex,address,gsm,landline,profession,cin,medical_coverage,status,search_name,gsm_digits,landline_digits,created_at,updated_at)
            VALUES (?,'PAT-' || lpad(nextval('patient_reference_seq')::text,6,'0'),'Clinique','Synthétique','UNANSWERED','','','','','','','ACTIVE','clinique synthetique','','',now(),now())
            """, id);
        return id;
    }
    UUID appointment(UUID patient) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO appointment(id,patient_id,start_at,end_at,appointment_type,status,created_at,updated_at)
            VALUES (?,?,'2026-11-10T09:00Z','2026-11-10T10:00Z','CONSULTATION','ANNULE',now(),now())
            """, id, patient);
        return id;
    }
    Draft draft() { return new Draft(null, DATE, "Motif synthétique", CANARY, "", "", ""); }
    Draft linked(UUID appointment) { return new Draft(appointment, DATE, "Motif synthétique", CANARY, "", "", ""); }
    Treatment treatment() { return new Treatment(DATE, "Soin synthétique " + CANARY, "16, 17", CANARY); }
    Details create(UUID patient) { return service.create(patient, draft()); }
    Details add(Details c) { return service.addTreatment(c.patientId(), c.id(), c.version(), treatment()); }
    Details read(Details c) { return service.get(c.patientId(), c.id()); }
    int audits(UUID id) { return jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE target_consultation_id=?", Integer.class, id); }
    void failure(Runnable operation, ClinicalFailure.Reason reason) {
        assertThatThrownBy(operation::run).isInstanceOfSatisfying(ClinicalFailure.class, e -> {
            assertThat(e.reason()).isEqualTo(reason);
            assertThat(e.getMessage()).doesNotContain(CANARY);
        });
    }

    @Test void createsAndReadsDraftWithDetachedContentAndNoTreatments() {
        UUID patient = patient();
        var c = create(patient);
        assertThat(c.patientId()).isEqualTo(patient);
        assertThat(c.status()).isEqualTo(Consultation.Status.BROUILLON);
        assertThat(c.version()).isZero();
        assertThat(c.content().appointmentId()).isNull();
        assertThat(c.treatments()).isEmpty();
        assertThat(read(c)).isEqualTo(c);
        assertThat(audits(c.id())).isEqualTo(1);
    }

    @Test void updatesOnlyItsPatientAndReturnsNewVersionAndTimestamps() {
        var c = create(patient());
        var input = new Draft(null, DATE.plusDays(1), " Autre motif ", "Observation", "Évaluation", "Plan", "Notes");
        var updated = service.update(c.patientId(), c.id(), c.version(), input);
        assertThat(updated.version()).isEqualTo(c.version() + 1);
        assertThat(updated.content()).isEqualTo(input);
        assertThat(updated.createdAt()).isEqualTo(c.createdAt());
        assertThat(updated.updatedAt()).isAfter(c.updatedAt());
        assertThat(read(updated)).isEqualTo(updated);
        UUID other = patient();
        failure(() -> service.update(other, c.id(), updated.version(), input), CONSULTATION_NOT_FOUND);
        assertThat(read(c).patientId()).isEqualTo(c.patientId());
    }

    @Test void addsAndEditsMultipleTreatmentsKeepingStableIdentifiers() {
        var first = add(create(patient()));
        var c = service.addTreatment(first.patientId(), first.id(), first.version(), new Treatment(DATE.minusDays(1), "Autre soin", "Arcade supérieure", ""));
        UUID treatment = first.treatments().getFirst().id();
        assertThat(c.treatments()).hasSize(2);
        assertThat(c.treatments().getFirst().content().treatmentDate()).isEqualTo(DATE.minusDays(1));
        var changed = service.editTreatment(c.patientId(), c.id(), treatment, c.version(), new Treatment(DATE, "Soin corrigé", "16", "Note corrigée"));
        var edited = changed.treatments().stream().filter(t -> t.id().equals(treatment)).findFirst().orElseThrow();
        assertThat(changed.version()).isEqualTo(c.version() + 1);
        assertThat(edited.version()).isEqualTo(1);
        assertThat(edited.createdAt()).isEqualTo(first.treatments().getFirst().createdAt());
        assertThat(edited.content().description()).isEqualTo("Soin corrigé");
    }

    @Test void logicallyRemovesAndRetainsTreatmentWithoutImplicitRestore() {
        var c = add(create(patient()));
        UUID treatment = c.treatments().getFirst().id();
        var removed = service.removeTreatment(c.patientId(), c.id(), treatment, c.version());
        assertThat(removed.version()).isEqualTo(c.version() + 1);
        assertThat(read(removed).treatments()).isEmpty();
        assertThat(jdbc.queryForObject("SELECT notes FROM clinical_treatment WHERE id=? AND removed_at IS NOT NULL", String.class, treatment)).isEqualTo(CANARY);
        var history = service.removedTreatments(c.patientId(), c.id(), null);
        assertThat(history).hasSize(1);
        assertThat(history.getFirst().treatment().id()).isEqualTo(treatment);
        assertThat(history.getFirst().removedAt()).isNotNull();
        failure(() -> service.editTreatment(c.patientId(), c.id(), treatment, removed.version(), treatment()), INVALID_STATE);
        failure(() -> service.removeTreatment(c.patientId(), c.id(), treatment, removed.version()), INVALID_STATE);
        var added = add(removed);
        assertThat(added.treatments().getFirst().id()).isNotEqualTo(treatment);
        assertThat(service.removedTreatments(c.patientId(), c.id(), null)).hasSize(1);
    }

    @Test void finalizationValidatesOnlyActiveTreatmentsAndAllowsZero() {
        var c = add(create(patient()));
        UUID treatment = c.treatments().getFirst().id();
        var removed = service.removeTreatment(c.patientId(), c.id(), treatment, c.version());
        // A retired legacy reference must not become part of the active finalization validation.
        jdbc.update("UPDATE clinical_treatment SET tooth_reference='legacy<>reference' WHERE id=?", treatment);
        var done = service.finalizeConsultation(c.patientId(), c.id(), removed.version());
        assertThat(done.status()).isEqualTo(Consultation.Status.TERMINEE);
        assertThat(done.treatments()).isEmpty();
        assertThat(service.removedTreatments(c.patientId(), c.id(), null)).hasSize(1);
        var active = add(create(patient()));
        jdbc.update("UPDATE clinical_treatment SET tooth_reference='legacy<>reference' WHERE id=?", active.treatments().getFirst().id());
        failure(() -> service.finalizeConsultation(active.patientId(), active.id(), active.version()), INVALID_TREATMENT);
        assertThat(read(active).status()).isEqualTo(Consultation.Status.BROUILLON);
    }

    @Test void finalizedConsultationsAndTreatmentsAreImmutableIncludingDuplicateFinalization() {
        var c = add(create(patient()));
        UUID treatment = c.treatments().getFirst().id();
        var done = service.finalizeConsultation(c.patientId(), c.id(), c.version());
        int audits = audits(c.id());
        for (Runnable operation : List.<Runnable>of(
                () -> service.update(c.patientId(), c.id(), done.version(), draft()),
                () -> service.addTreatment(c.patientId(), c.id(), done.version(), treatment()),
                () -> service.editTreatment(c.patientId(), c.id(), treatment, done.version(), treatment()),
                () -> service.removeTreatment(c.patientId(), c.id(), treatment, done.version()),
                () -> service.finalizeConsultation(c.patientId(), c.id(), done.version()))) failure(operation, INVALID_STATE);
        failure(() -> service.finalizeConsultation(c.patientId(), c.id(), c.version()), CONCURRENCY_CONFLICT);
        assertThat(read(done)).isEqualTo(done);
        assertThat(audits(c.id())).isEqualTo(audits);
    }

    @Test void archivedPatientsRemainReadableButRejectEveryClinicalWrite() {
        var c = add(create(patient()));
        UUID treatment = c.treatments().getFirst().id();
        jdbc.update("UPDATE patient SET status='INACTIVE' WHERE id=?", c.patientId());
        for (Runnable operation : List.<Runnable>of(
                () -> create(c.patientId()),
                () -> service.update(c.patientId(), c.id(), c.version(), draft()),
                () -> service.addTreatment(c.patientId(), c.id(), c.version(), treatment()),
                () -> service.editTreatment(c.patientId(), c.id(), treatment, c.version(), treatment()),
                () -> service.removeTreatment(c.patientId(), c.id(), treatment, c.version()),
                () -> service.finalizeConsultation(c.patientId(), c.id(), c.version()))) failure(operation, ARCHIVED_PATIENT);
        assertThat(read(c)).isEqualTo(c);
        assertThat(service.history(c.patientId(), null).items()).hasSize(1);
        assertThat(service.removedTreatments(c.patientId(), c.id(), null)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT status FROM patient WHERE id=?", String.class, c.patientId())).isEqualTo("INACTIVE");
    }

    @Test void optionalAppointmentsAreUniqueAndOwnedWithoutChangingTheirStatus() {
        UUID patient = patient(), appointment = appointment(patient);
        var linked = service.create(patient, linked(appointment));
        assertThat(linked.content().appointmentId()).isEqualTo(appointment);
        failure(() -> service.create(patient, linked(appointment)), DUPLICATE_APPOINTMENT);
        failure(() -> service.create(patient(), linked(appointment)), INVALID_APPOINTMENT);
        failure(() -> service.create(patient, linked(UUID.randomUUID())), INVALID_APPOINTMENT);
        var walkIn = create(patient);
        failure(() -> service.update(patient, walkIn.id(), walkIn.version(), linked(appointment)), DUPLICATE_APPOINTMENT);
        UUID otherAppointment = appointment(patient);
        var moved = service.update(patient, linked.id(), linked.version(), linked(otherAppointment));
        assertThat(moved.content().appointmentId()).isEqualTo(otherAppointment);
        assertThat(service.create(patient, linked(appointment)).content().appointmentId()).isEqualTo(appointment);
        assertThat(jdbc.queryForObject("SELECT status FROM appointment WHERE id=?", String.class, appointment)).isEqualTo("ANNULE");
    }

    @Test void typedFailuresDistinguishMissingResourcesAndInvalidTreatments() {
        failure(() -> create(UUID.randomUUID()), PATIENT_NOT_FOUND);
        UUID patient = patient();
        failure(() -> service.get(patient, UUID.randomUUID()), CONSULTATION_NOT_FOUND);
        failure(() -> service.history(UUID.randomUUID(), null), PATIENT_NOT_FOUND);
        var c = create(patient);
        failure(() -> service.editTreatment(patient, c.id(), UUID.randomUUID(), c.version(), treatment()), TREATMENT_NOT_FOUND);
        var other = add(create(patient()));
        failure(() -> service.removeTreatment(patient, c.id(), other.treatments().getFirst().id(), c.version()), TREATMENT_NOT_FOUND);
        failure(() -> service.update(patient, c.id(), null, draft()), INVALID_INPUT);
        failure(() -> service.history(patient, new Cursor(null, UUID.randomUUID())), INVALID_INPUT);
    }

    @Test void clinicalValidationRejectsInvalidContentWithoutLoggingOrAuditingIt() {
        UUID patient = patient();
        for (Draft input : List.of(
                new Draft(null, DATE, " ", "", "", "", CANARY),
                new Draft(null, DATE, "x".repeat(501), "", "", "", CANARY),
                new Draft(null, LocalDate.of(10000, 1, 1), "Motif", "", "", "", CANARY),
                new Draft(null, DATE, "Motif", null, "", "", CANARY),
                new Draft(null, DATE, "Motif", "", "", "", "x".repeat(5001)))) failure(() -> service.create(patient, input), INVALID_INPUT);
        var c = create(patient);
        for (Treatment input : List.of(new Treatment(DATE, " ", "", CANARY),
                new Treatment(DATE, CANARY, "<script>", ""), new Treatment(DATE, "Soin", "16", "x".repeat(2001)),
                new Treatment(DATE, "Soin\0" + CANARY, "16", ""), new Treatment(null, CANARY, "", ""))) {
            failure(() -> service.addTreatment(patient, c.id(), c.version(), input), INVALID_TREATMENT);
            assertThat(input.toString()).doesNotContain(CANARY);
        }
        assertThat(draft().toString()).doesNotContain(CANARY);
        assertThat(audits(c.id())).isEqualTo(1);
        assertThat(read(c).treatments()).isEmpty();
    }

    @Test void activeTreatmentLimitIsEnforcedAndRemovalFreesCapacity() {
        var c = create(patient());
        for (int i = 0; i < 50; i++) c = add(c);
        var full = c;
        failure(() -> add(full), INVALID_TREATMENT);
        var removed = service.removeTreatment(c.patientId(), c.id(), c.treatments().getFirst().id(), c.version());
        var added = add(removed);
        assertThat(added.treatments()).hasSize(50);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM clinical_treatment WHERE consultation_id=?", Integer.class, c.id())).isEqualTo(51);
    }

    @Test void patientHistoryIsBoundedChronologicalAndScoped() {
        UUID patient = patient();
        for (int i = 0; i < 53; i++) service.create(patient, new Draft(null, DATE.plusDays(i / 3), "Motif", "", "", "", ""));
        create(patient());
        var first = service.history(patient, null);
        assertThat(first.items()).hasSize(50);
        var second = service.history(patient, first.nextCursor());
        assertThat(second.items()).hasSize(3);
        assertThat(second.nextCursor()).isNull();
        var actual = new java.util.ArrayList<UUID>(); first.items().forEach(c -> actual.add(c.id())); second.items().forEach(c -> actual.add(c.id()));
        assertThat(actual).doesNotHaveDuplicates().containsExactlyElementsOf(jdbc.queryForList("SELECT id FROM clinical_consultation WHERE patient_id=? ORDER BY consultation_date DESC,id DESC", UUID.class, patient));
    }

    @Test void receptionistAndAnonymousAreDeniedOnEveryServiceMethod() {
        var c = add(create(patient()));
        UUID treatment = c.treatments().getFirst().id();
        List<Runnable> operations = List.of(() -> create(c.patientId()), () -> read(c),
                () -> service.update(c.patientId(), c.id(), c.version(), draft()),
                () -> service.addTreatment(c.patientId(), c.id(), c.version(), treatment()),
                () -> service.editTreatment(c.patientId(), c.id(), treatment, c.version(), treatment()),
                () -> service.removeTreatment(c.patientId(), c.id(), treatment, c.version()),
                () -> service.finalizeConsultation(c.patientId(), c.id(), c.version()),
                () -> service.history(c.patientId(), null), () -> service.removedTreatments(c.patientId(), c.id(), null));
        authenticate(Role.RECEPTIONIST);
        operations.forEach(op -> assertThatThrownBy(op::run).isInstanceOf(AccessDeniedException.class));
        SecurityContextHolder.clearContext();
        operations.forEach(op -> assertThatThrownBy(op::run).isInstanceOf(org.springframework.security.core.AuthenticationException.class));
        authenticate(Role.DENTIST);
        assertThat(read(c)).isEqualTo(c);
        assertThat(audits(c.id())).isEqualTo(2);
    }

    @Test void staleParentVersionsRejectAllMutationKindsWithoutExtraAudit() {
        var c = add(create(patient()));
        UUID treatment = c.treatments().getFirst().id();
        var updated = service.update(c.patientId(), c.id(), c.version(), draft());
        for (Runnable operation : List.<Runnable>of(
                () -> service.update(c.patientId(), c.id(), c.version(), draft()),
                () -> service.addTreatment(c.patientId(), c.id(), c.version(), treatment()),
                () -> service.editTreatment(c.patientId(), c.id(), treatment, c.version(), treatment()),
                () -> service.removeTreatment(c.patientId(), c.id(), treatment, c.version()),
                () -> service.finalizeConsultation(c.patientId(), c.id(), c.version()))) failure(operation, CONCURRENCY_CONFLICT);
        assertThat(read(updated)).isEqualTo(updated);
        assertThat(audits(c.id())).isEqualTo(3);
    }

    @Test void concurrentDraftUpdatesCannotOverwriteEachOther() throws Exception {
        var c = create(patient());
        race(() -> service.update(c.patientId(), c.id(), c.version(), new Draft(null, DATE, "Première modification", "", "", "", "")),
                () -> service.update(c.patientId(), c.id(), c.version(), draft()));
        assertThat(read(c).content().chiefComplaint()).isEqualTo("Première modification");
        assertThat(read(c).version()).isEqualTo(c.version() + 1);
        assertThat(audits(c.id())).isEqualTo(2);
    }

    @Test void concurrentChangesToDifferentTreatmentsShareTheParentVersion() throws Exception {
        var c = add(add(create(patient())));
        var first = c.treatments().getFirst(); var last = c.treatments().getLast();
        race(() -> service.editTreatment(c.patientId(), c.id(), first.id(), c.version(), new Treatment(DATE, "Première correction", "16", "")),
                () -> service.removeTreatment(c.patientId(), c.id(), last.id(), c.version()));
        assertThat(read(c).treatments()).hasSize(2);
        assertThat(read(c).version()).isEqualTo(c.version() + 1);
        assertThat(service.removedTreatments(c.patientId(), c.id(), null)).isEmpty();
    }

    @Test void finalizationWinsAgainstConcurrentTreatmentEdit() throws Exception {
        var c = add(create(patient()));
        race(() -> service.finalizeConsultation(c.patientId(), c.id(), c.version()),
                () -> service.editTreatment(c.patientId(), c.id(), c.treatments().getFirst().id(), c.version(), treatment()));
        assertThat(read(c).status()).isEqualTo(Consultation.Status.TERMINEE);
        assertThat(read(c).treatments().getFirst().version()).isZero();
    }

    @Test void treatmentChangeWinsAndStaleFinalizationIsRejected() throws Exception {
        var c = add(create(patient()));
        race(() -> service.removeTreatment(c.patientId(), c.id(), c.treatments().getFirst().id(), c.version()),
                () -> service.finalizeConsultation(c.patientId(), c.id(), c.version()));
        assertThat(read(c).status()).isEqualTo(Consultation.Status.BROUILLON);
        assertThat(read(c).treatments()).isEmpty();
    }

    @Test void concurrentCreationHasOnlyOneAppointmentAssociationAndOneAudit() throws Exception {
        UUID patient = patient(), appointment = appointment(patient);
        // Hold the first insert uncommitted: the second pre-check cannot see it and must hit the unique constraint.
        race(() -> service.create(patient, linked(appointment)),
                () -> service.create(patient, linked(appointment)), DUPLICATE_APPOINTMENT);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM clinical_consultation WHERE appointment_id=?", Integer.class, appointment)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM security_audit_event e JOIN clinical_consultation c ON c.id=e.target_consultation_id WHERE c.appointment_id=?", Integer.class, appointment)).isEqualTo(1);
    }

    @Test void concurrentFinalizationsProduceOneTransitionAndOneAudit() throws Exception {
        var c = create(patient());
        race(() -> service.finalizeConsultation(c.patientId(), c.id(), c.version()),
                () -> service.finalizeConsultation(c.patientId(), c.id(), c.version()));
        assertThat(read(c).status()).isEqualTo(Consultation.Status.TERMINEE);
        assertThat(audits(c.id())).isEqualTo(2);
    }

    @Test void archiveWinningThePatientLockRejectsTheWaitingClinicalWrite() throws Exception {
        var c = create(patient());
        race(() -> {
            jdbc.update("UPDATE patient SET status='INACTIVE',version=version+1 WHERE id=?", c.patientId());
            return c;
        }, () -> service.update(c.patientId(), c.id(), c.version(), draft()), ARCHIVED_PATIENT);
        assertThat(read(c)).isEqualTo(c);
        assertThat(audits(c.id())).isEqualTo(1);
    }

    @Test void removedHistoryIsBoundedAndCanBeReadAcrossPages() {
        var c = create(patient());
        for (int i = 0; i < 51; i++) {
            c = add(c);
            c = service.removeTreatment(c.patientId(), c.id(), c.treatments().getFirst().id(), c.version());
        }
        var first = service.removedTreatments(c.patientId(), c.id(), null);
        assertThat(first).hasSize(50);
        var last = first.getLast().treatment();
        var next = service.removedTreatments(c.patientId(), c.id(), new Cursor(last.content().treatmentDate(), last.id()));
        assertThat(next).hasSize(1);
        assertThat(first.stream().map(t -> t.treatment().id()).toList()).doesNotContain(next.getFirst().treatment().id());
        assertThat(read(c).treatments()).isEmpty();
        UUID other = patient(), consultationId = c.id();
        failure(() -> service.removedTreatments(other, consultationId, null), CONSULTATION_NOT_FOUND);
    }

    @Test void clinicalAuditIsCompleteAttributedAndContainsNoClinicalPayload() {
        var c = create(patient());
        c = service.update(c.patientId(), c.id(), c.version(), draft());
        c = add(c);
        c = service.editTreatment(c.patientId(), c.id(), c.treatments().getFirst().id(), c.version(), treatment());
        c = service.removeTreatment(c.patientId(), c.id(), c.treatments().getFirst().id(), c.version());
        c = add(c);
        c = service.finalizeConsultation(c.patientId(), c.id(), c.version());
        assertThat(jdbc.queryForList("SELECT event_type FROM security_audit_event WHERE target_consultation_id=? ORDER BY occurred_at,id", String.class, c.id()))
                .containsExactly("CONSULTATION_CREATED", "CONSULTATION_DRAFT_UPDATED", "CONSULTATION_TREATMENT_CHANGED", "CONSULTATION_TREATMENT_CHANGED", "CONSULTATION_TREATMENT_CHANGED", "CONSULTATION_TREATMENT_CHANGED", "CONSULTATION_FINALIZED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE target_consultation_id=? AND actor_user_id=? AND occurred_at IS NOT NULL AND subject_user_id IS NULL AND target_patient_id IS NULL AND target_appointment_id IS NULL AND target_charge_id IS NULL AND target_payment_id IS NULL AND target_invoice_id IS NULL AND target_insurance_document_id IS NULL", Integer.class, c.id(), dentist)).isEqualTo(7);
        assertThat(jdbc.queryForObject("SELECT string_agg(row_to_json(e)::text,'') FROM security_audit_event e WHERE target_consultation_id=?", String.class, c.id())).doesNotContain(CANARY, "Soin synthétique", "Motif synthétique");
        assertThat(jdbc.queryForList("SELECT column_name FROM information_schema.columns WHERE table_name='security_audit_event'", String.class))
                .containsExactlyInAnyOrder("id", "occurred_at", "event_type", "actor_user_id", "subject_user_id", "target_patient_id", "target_appointment_id", "target_consultation_id", "target_prescription_id", "target_charge_id", "target_payment_id", "target_invoice_id", "target_insurance_document_id");
    }

    @Test void everyMutationRollsBackIfAuditInsertionFails() {
        var c = add(create(patient()));
        UUID treatment = c.treatments().getFirst().id();
        var parent = jdbc.queryForMap("SELECT * FROM clinical_consultation WHERE id=?", c.id());
        var children = jdbc.queryForList("SELECT * FROM clinical_treatment WHERE consultation_id=? ORDER BY id", c.id());
        int beforeAudit = audits(c.id());
        jdbc.execute("CREATE FUNCTION reject_clinical_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_consultation_id IS NOT NULL THEN RAISE EXCEPTION 'Synthetic audit rejection'; END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER reject_clinical_audit BEFORE INSERT ON security_audit_event FOR EACH ROW EXECUTE FUNCTION reject_clinical_audit()");
        try {
            for (Runnable operation : List.<Runnable>of(() -> create(c.patientId()),
                    () -> service.update(c.patientId(), c.id(), c.version(), draft()),
                    () -> service.addTreatment(c.patientId(), c.id(), c.version(), treatment()),
                    () -> service.editTreatment(c.patientId(), c.id(), treatment, c.version(), new Treatment(DATE, "Correction", "16", "")),
                    () -> service.removeTreatment(c.patientId(), c.id(), treatment, c.version()),
                    () -> service.finalizeConsultation(c.patientId(), c.id(), c.version()))) {
                assertThatThrownBy(operation::run).isInstanceOf(RuntimeException.class);
                assertThat(jdbc.queryForMap("SELECT * FROM clinical_consultation WHERE id=?", c.id())).isEqualTo(parent);
                assertThat(jdbc.queryForList("SELECT * FROM clinical_treatment WHERE consultation_id=? ORDER BY id", c.id())).isEqualTo(children);
                assertThat(audits(c.id())).isEqualTo(beforeAudit);
            }
            assertThat(service.history(c.patientId(), null).items()).hasSize(1);
        } finally {
            jdbc.execute("DROP TRIGGER reject_clinical_audit ON security_audit_event");
            jdbc.execute("DROP FUNCTION reject_clinical_audit()");
        }
    }

    @Test void outerTransactionRollsBackClinicalRowsAndAuditTogether() {
        UUID patient = patient();
        var id = new AtomicReference<UUID>();
        assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            var c = add(create(patient)); id.set(c.id());
            throw new IllegalStateException("Synthetic rollback");
        })).isInstanceOf(IllegalStateException.class).hasMessage("Synthetic rollback");
        assertThat(service.history(patient, null).items()).isEmpty();
        assertThat(audits(id.get())).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM clinical_treatment WHERE consultation_id=?", Integer.class, id.get())).isZero();
    }

    private Object outcome(Supplier<Details> operation) {
        try { return operation.get(); } catch (ClinicalFailure failure) { return failure.reason(); }
    }
    private void race(Supplier<Details> first, Supplier<Details> second) throws Exception {
        race(first, second, CONCURRENCY_CONFLICT);
    }
    private void race(Supplier<Details> first, Supplier<Details> second, ClinicalFailure.Reason expected) throws Exception {
        var written = new CountDownLatch(1); var release = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var a = executor.submit(() -> {
                authenticate(Role.DENTIST);
                try {
                    return new TransactionTemplate(transactions).execute(tx -> {
                        var result = first.get(); written.countDown(); await(release); return result;
                    });
                } finally { clear(); }
            });
            try {
                assertThat(written.await(10, TimeUnit.SECONDS)).isTrue();
                var b = executor.submit(() -> {
                    authenticate(Role.DENTIST);
                    try { return outcome(second); } finally { clear(); }
                });
                try { awaitDatabaseLock(); } finally { release.countDown(); }
                assertThat(a.get(20, TimeUnit.SECONDS)).isNotNull();
                assertThat(b.get(20, TimeUnit.SECONDS)).isEqualTo(expected);
            } finally { release.countDown(); }
        }
    }
    private void awaitDatabaseLock() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            if (jdbc.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock'", Integer.class) > 0) return;
            Thread.sleep(10);
        }
        fail("Expected a real PostgreSQL row-lock wait");
    }
    private static void await(CountDownLatch latch) {
        try { if (!latch.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Timed out waiting for synthetic transaction"); }
        catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw new IllegalStateException("Interrupted synthetic transaction"); }
    }
}
