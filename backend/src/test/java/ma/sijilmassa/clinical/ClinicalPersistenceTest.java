package ma.sijilmassa.clinical;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.UUID;
import jakarta.persistence.EntityManager;
import ma.sijilmassa.patient.Patient;
import ma.sijilmassa.appointment.Appointment;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
@SpringBootTest(properties = "spring.flyway.locations=classpath:db/migration,classpath:db/testmigration")
@ActiveProfiles("test")
class ClinicalPersistenceTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }
    @Autowired ConsultationRepository consultations;
    @Autowired ClinicalTreatmentRepository treatments;
    @Autowired EntityManager em;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    private static final LocalDate DATE = LocalDate.of(2026, 11, 10);

    UUID patient() {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO patient(id,reference,first_name,last_name,sex,address,gsm,landline,profession,cin,medical_coverage,status,search_name,gsm_digits,landline_digits,created_at,updated_at)
            VALUES (?, 'PAT-' || lpad(nextval('patient_reference_seq')::text,6,'0'),'Clinique','Synthétique','UNANSWERED','','','','','','','ACTIVE','clinique synthetique','','',now(),now())
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
    Consultation draft(UUID patient, UUID appointment, LocalDate date) {
        return new TransactionTemplate(transactions).execute(tx -> consultations.save(new Consultation(
                em.getReference(Patient.class, patient), appointment == null ? null : em.getReference(Appointment.class, appointment),
                date, "Motif synthétique", Instant.now())));
    }
    ClinicalTreatment treatment(Consultation consultation, LocalDate date) {
        return new TransactionTemplate(transactions).execute(tx -> {
            var treatment = new ClinicalTreatment(em.getReference(Consultation.class, consultation.id), date, "Soin synthétique", Instant.now());
            treatment.toothReference = "16, 17";
            return treatments.save(treatment);
        });
    }

    @Test void draftWithoutTreatmentsPersistsAndRelationshipsAreLazy() {
        UUID patient = patient();
        var draft = draft(patient, null, DATE);
        new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            var read = consultations.findByIdAndPatient_Id(draft.id, patient).orElseThrow();
            assertThat(read.status).isEqualTo(Consultation.Status.BROUILLON);
            assertThat(read.version).isZero();
            assertThat(read.appointment).isNull();
            assertThat(read.notes).isEmpty();
            assertThat(em.getEntityManagerFactory().getPersistenceUnitUtil().isLoaded(read, "patient")).isFalse();
            assertThat(treatments.findTop50ByConsultation_IdAndConsultation_Patient_IdOrderByTreatmentDateAscIdAsc(read.id, patient)).isEmpty();
        });
        assertThat(consultations.findByIdAndPatient_Id(draft.id, UUID.randomUUID())).isEmpty();
    }

    @Test void clinicalFieldsFinalizedStateAndMultipleTreatmentsRoundTrip() {
        UUID patient = patient();
        var draft = draft(patient, null, DATE);
        var later = treatment(draft, DATE.plusDays(1));
        var earlier = treatment(draft, DATE.minusDays(1));
        draft.clinicalObservations = "Observation synthétique"; draft.assessment = "Évaluation synthétique";
        draft.treatmentPlan = "Plan synthétique"; draft.notes = "Note synthétique";
        draft.status = Consultation.Status.TERMINEE;
        var saved = consultations.save(draft);
        var read = consultations.findByIdAndPatient_Id(saved.id, patient).orElseThrow();
        assertThat(read.status).isEqualTo(Consultation.Status.TERMINEE);
        assertThat(read.clinicalObservations).isEqualTo(draft.clinicalObservations);
        assertThat(read.assessment).isEqualTo(draft.assessment);
        assertThat(read.treatmentPlan).isEqualTo(draft.treatmentPlan);
        assertThat(read.notes).isEqualTo(draft.notes);
        assertThat(read.updatedAt).isAfter(read.createdAt);
        assertThat(treatments.findTop50ByConsultation_IdAndConsultation_Patient_IdOrderByTreatmentDateAscIdAsc(draft.id, patient))
                .extracting(t -> t.id).containsExactly(earlier.id, later.id);
        assertThat(treatments.treatmentsAfter(draft.id, patient, earlier.treatmentDate, earlier.id)).extracting(t -> t.id).containsExactly(later.id);
        assertThat(treatments.findByIdAndConsultation_IdAndConsultation_Patient_Id(earlier.id, draft.id, patient).orElseThrow().toothReference).isEqualTo("16, 17");
        assertThat(treatments.findByIdAndConsultation_IdAndConsultation_Patient_Id(earlier.id, draft.id, UUID.randomUUID())).isEmpty();
    }

    @Test void appointmentMustBeUniqueAndBelongToPatientAndCannotBeReassigned() {
        UUID patient = patient(), other = patient(), appointment = appointment(patient);
        var draft = draft(patient, appointment, DATE);
        assertThat(draft.appointment).isNotNull();
        assertThatThrownBy(() -> draft(other, appointment, DATE)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> draft(patient, appointment, DATE)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE appointment SET patient_id=? WHERE id=?", other, appointment)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM appointment WHERE id=?", appointment)).isInstanceOf(DataIntegrityViolationException.class);
        new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            var read = consultations.findByIdAndPatient_Id(draft.id, patient).orElseThrow();
            assertThat(em.getEntityManagerFactory().getPersistenceUnitUtil().isLoaded(read, "appointment")).isFalse();
            assertThat(em.getEntityManagerFactory().getPersistenceUnitUtil().getIdentifier(read.appointment)).isEqualTo(appointment);
        });
    }

    @Test void foreignKeysRejectOrphansAndDeletionDoesNotCascade() {
        UUID patient = patient();
        var draft = draft(patient, null, DATE);
        treatment(draft, DATE);
        assertThatThrownBy(() -> draft(UUID.randomUUID(), null, DATE)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE clinical_treatment SET consultation_id=? WHERE consultation_id=?", UUID.randomUUID(), draft.id)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM clinical_consultation WHERE id=?", draft.id)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM patient WHERE id=?", patient)).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM patient WHERE id=?", Integer.class, patient)).isEqualTo(1);
    }

    @Test void consultationAndTreatmentRejectStaleVersions() {
        UUID patient = patient();
        var draft = draft(patient, null, DATE);
        var stale = consultations.findByIdAndPatient_Id(draft.id, patient).orElseThrow();
        draft.notes = "Première correction synthétique";
        var saved = consultations.save(draft);
        assertThat(saved.version).isEqualTo(1);
        stale.notes = "Correction obsolète";
        assertThatThrownBy(() -> consultations.save(stale)).isInstanceOf(ObjectOptimisticLockingFailureException.class);
        var treatment = treatment(saved, DATE);
        var staleTreatment = treatments.findByIdAndConsultation_IdAndConsultation_Patient_Id(treatment.id, draft.id, patient).orElseThrow();
        treatment.notes = "Première correction synthétique";
        var updated = treatments.save(treatment);
        assertThat(updated.version).isEqualTo(1);
        assertThat(updated.updatedAt).isAfter(updated.createdAt);
        staleTreatment.notes = "Correction obsolète";
        assertThatThrownBy(() -> treatments.save(staleTreatment)).isInstanceOf(ObjectOptimisticLockingFailureException.class);
    }

    @Test void historyIsBoundedDeterministicAndPatientScoped() {
        UUID patient = patient();
        var inserted = new ArrayList<UUID>();
        for (int i = 0; i < 53; i++) inserted.add(draft(patient, null, DATE.plusDays(i / 3)).id);
        draft(patient(), null, DATE.plusYears(1));
        var first = consultations.findTop50ByPatient_IdOrderByConsultationDateDescIdDesc(patient);
        assertThat(first).hasSize(50);
        var cursor = first.getLast();
        var next = consultations.historyBefore(patient, cursor.consultationDate, cursor.id);
        assertThat(next).hasSize(3);
        var actual = new ArrayList<UUID>(); first.forEach(c -> actual.add(c.id)); next.forEach(c -> actual.add(c.id));
        assertThat(actual).doesNotHaveDuplicates().containsExactlyElementsOf(jdbc.queryForList(
                "SELECT id FROM clinical_consultation WHERE patient_id=? ORDER BY consultation_date DESC,id DESC", UUID.class, patient));
        assertThat(actual).containsExactlyInAnyOrderElementsOf(inserted);
    }

    @Test void databaseRejectsInvalidStatusesContentDatesVersionsAndTimestamps() {
        var draft = draft(patient(), null, DATE);
        var treatment = treatment(draft, DATE);
        for (String assignment : new String[]{"status='UNKNOWN'", "version=-1", "chief_complaint=' '",
                "notes=repeat('x',5001)", "consultation_date='10000-01-01'", "updated_at=created_at-interval '1 second'"}) {
            assertThatThrownBy(() -> jdbc.update("UPDATE clinical_consultation SET " + assignment + " WHERE id=?", draft.id))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
        for (String assignment : new String[]{"description=' '", "version=-1", "tooth_reference=repeat('x',51)",
                "notes=repeat('x',2001)", "treatment_date='10000-01-01'", "updated_at=created_at-interval '1 second'"}) {
            assertThatThrownBy(() -> jdbc.update("UPDATE clinical_treatment SET " + assignment + " WHERE id=?", treatment.id))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
    }

    @Test void treatmentPagesAreBoundedAndKeepDateAndIdOrdering() {
        UUID patient = patient();
        var draft = draft(patient, null, DATE);
        for (int i = 0; i < 53; i++) treatment(draft, DATE.plusDays(i / 3));
        var first = treatments.findTop50ByConsultation_IdAndConsultation_Patient_IdOrderByTreatmentDateAscIdAsc(draft.id, patient);
        assertThat(first).hasSize(50);
        var cursor = first.getLast();
        var next = treatments.treatmentsAfter(draft.id, patient, cursor.treatmentDate, cursor.id);
        assertThat(next).hasSize(3);
        var actual = new ArrayList<UUID>(); first.forEach(t -> actual.add(t.id)); next.forEach(t -> actual.add(t.id));
        assertThat(actual).doesNotHaveDuplicates().containsExactlyElementsOf(jdbc.queryForList(
                "SELECT id FROM clinical_treatment WHERE consultation_id=? ORDER BY treatment_date,id", UUID.class, draft.id));
        assertThat(treatments.treatmentsAfter(draft.id, UUID.randomUUID(), cursor.treatmentDate, cursor.id)).isEmpty();
    }

    @Test void enclosingTransactionRollsBackConsultationAndTreatmentsTogether() {
        UUID patient = patient();
        assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            var draft = consultations.save(new Consultation(em.getReference(Patient.class, patient), null, DATE, "Motif synthétique", Instant.now()));
            treatments.save(new ClinicalTreatment(draft, DATE, "Soin synthétique", Instant.now()));
            em.flush();
            throw new IllegalStateException("Synthetic rollback");
        })).isInstanceOf(IllegalStateException.class).hasMessage("Synthetic rollback");
        assertThat(consultations.findTop50ByPatient_IdOrderByConsultationDateDescIdDesc(patient)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM clinical_treatment t JOIN clinical_consultation c ON c.id=t.consultation_id WHERE c.patient_id=?", Integer.class, patient)).isZero();
    }
}
