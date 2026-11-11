package ma.sijilmassa.clinical;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import jakarta.persistence.EntityManager;
import jakarta.persistence.OptimisticLockException;
import jakarta.persistence.PersistenceException;
import ma.sijilmassa.appointment.Appointment;
import ma.sijilmassa.appointment.AppointmentRepository;
import ma.sijilmassa.audit.AuditEventType;
import ma.sijilmassa.audit.SecurityAudit;
import ma.sijilmassa.patient.Patient;
import ma.sijilmassa.patient.PatientRepository;
import ma.sijilmassa.security.AccountPrincipal;
import ma.sijilmassa.security.RolePolicies;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import static ma.sijilmassa.clinical.ClinicalFailure.Reason.*;
import static ma.sijilmassa.clinical.ClinicalModels.*;

@Service
@PreAuthorize(RolePolicies.CLINICAL)
@Transactional(readOnly = true)
public class ConsultationService {
    private final ConsultationRepository consultations;
    private final ClinicalTreatmentRepository treatments;
    private final PatientRepository patients;
    private final AppointmentRepository appointments;
    private final EntityManager em;
    private final SecurityAudit audit;
    private final Clock clock;

    public ConsultationService(ConsultationRepository consultations, ClinicalTreatmentRepository treatments,
            PatientRepository patients, AppointmentRepository appointments, EntityManager em, SecurityAudit audit, Clock clock) {
        this.consultations = consultations; this.treatments = treatments; this.patients = patients;
        this.appointments = appointments; this.em = em; this.audit = audit; this.clock = clock;
    }

    @Transactional
    public Details create(UUID patientId, Draft input) {
        UUID actor = actor();
        validateDraft(input);
        Patient patient = activePatient(patientId);
        var consultation = new Consultation(patient, null, input.consultationDate(), input.chiefComplaint(), clock.instant());
        apply(consultation, input, appointment(patientId, input.appointmentId(), consultation.id));
        consultations.save(consultation);
        flush();
        audit.recordConsultation(AuditEventType.CONSULTATION_CREATED, actor, consultation.id);
        flush();
        return details(consultation, patientId);
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ, readOnly = true)
    public Details get(UUID patientId, UUID consultationId) {
        patient(patientId);
        return details(existing(patientId, consultationId), patientId);
    }

    @Transactional
    public Details update(UUID patientId, UUID consultationId, Long version, Draft input) {
        UUID actor = actor();
        validateDraft(input);
        Consultation consultation = editable(patientId, consultationId, version);
        apply(consultation, input, appointment(patientId, input.appointmentId(), consultationId));
        return finish(consultation, patientId, actor, AuditEventType.CONSULTATION_DRAFT_UPDATED);
    }

    @Transactional
    public Details addTreatment(UUID patientId, UUID consultationId, Long version, Treatment input) {
        UUID actor = actor();
        validateTreatment(input);
        Consultation consultation = editable(patientId, consultationId, version);
        if (active(consultation).size() >= 50) throw new ClinicalFailure(INVALID_TREATMENT);
        var treatment = new ClinicalTreatment(consultation, input.treatmentDate(), input.description(), clock.instant());
        apply(treatment, input);
        treatments.save(treatment);
        return finish(consultation, patientId, actor, AuditEventType.CONSULTATION_TREATMENT_CHANGED);
    }

    @Transactional
    public Details editTreatment(UUID patientId, UUID consultationId, UUID treatmentId, Long version, Treatment input) {
        UUID actor = actor();
        validateTreatment(input);
        Consultation consultation = editable(patientId, consultationId, version);
        ClinicalTreatment treatment = activeTreatment(patientId, consultationId, treatmentId);
        apply(treatment, input);
        // Mark even identical submissions as a successful versioned mutation.
        treatment.updatedAt = advance(treatment.updatedAt);
        return finish(consultation, patientId, actor, AuditEventType.CONSULTATION_TREATMENT_CHANGED);
    }

    @Transactional
    public Details removeTreatment(UUID patientId, UUID consultationId, UUID treatmentId, Long version) {
        UUID actor = actor();
        Consultation consultation = editable(patientId, consultationId, version);
        ClinicalTreatment treatment = activeTreatment(patientId, consultationId, treatmentId);
        treatment.removedAt = advance(treatment.updatedAt);
        treatment.updatedAt = treatment.removedAt;
        return finish(consultation, patientId, actor, AuditEventType.CONSULTATION_TREATMENT_CHANGED);
    }

    @Transactional
    public Details finalizeConsultation(UUID patientId, UUID consultationId, Long version) {
        UUID actor = actor();
        Consultation consultation = editable(patientId, consultationId, version);
        validateDraft(draft(consultation));
        active(consultation).forEach(t -> validateTreatment(content(t)));
        consultation.status = Consultation.Status.TERMINEE;
        return finish(consultation, patientId, actor, AuditEventType.CONSULTATION_FINALIZED);
    }

    public HistoryPage history(UUID patientId, Cursor before) {
        patient(patientId);
        validateCursor(before);
        List<Consultation> page = before == null
                ? consultations.findTop50ByPatient_IdOrderByConsultationDateDescIdDesc(patientId)
                : consultations.historyBefore(patientId, before.date(), before.id());
        Cursor next = page.size() == 50 ? new Cursor(page.getLast().consultationDate, page.getLast().id) : null;
        return new HistoryPage(page.stream().map(c -> new Summary(c.id, c.consultationDate, c.status, c.version)).toList(), next);
    }

    /** Explicit internal history, protected by the same dentist-only service boundary. Never part of active views. */
    @Transactional(isolation = Isolation.REPEATABLE_READ, readOnly = true)
    public List<RemovedTreatment> removedTreatments(UUID patientId, UUID consultationId, Cursor after) {
        patient(patientId);
        existing(patientId, consultationId);
        validateCursor(after);
        return treatments.removedAfter(consultationId, after == null ? null : after.date(), after == null ? null : after.id())
                .stream().map(t -> new RemovedTreatment(treatmentDetails(t), t.removedAt)).toList();
    }

    private Consultation editable(UUID patientId, UUID id, Long version) {
        if (version == null || version < 0) throw new ClinicalFailure(INVALID_INPUT);
        // Consistent lock order: patient SHARE (coordinates archive), then consultation UPDATE.
        activePatient(patientId);
        if (id == null) throw new ClinicalFailure(CONSULTATION_NOT_FOUND);
        Consultation consultation = consultations.lockForUpdate(id, patientId)
                .orElseThrow(() -> new ClinicalFailure(CONSULTATION_NOT_FOUND));
        if (!Objects.equals(consultation.version, version)) throw new ClinicalFailure(CONCURRENCY_CONFLICT);
        if (consultation.status != Consultation.Status.BROUILLON) throw new ClinicalFailure(INVALID_STATE);
        return consultation;
    }

    private Details finish(Consultation consultation, UUID patientId, UUID actor, AuditEventType event) {
        // Dirty the parent on EVERY child mutation. @Version advances before the result is constructed.
        consultation.updatedAt = advance(consultation.updatedAt);
        flush();
        audit.recordConsultation(event, actor, consultation.id);
        flush();
        return details(consultation, patientId);
    }

    private Patient activePatient(UUID id) {
        if (id == null) throw new ClinicalFailure(PATIENT_NOT_FOUND);
        Patient patient = patients.lockForMedicalUpdate(id).orElseThrow(() -> new ClinicalFailure(PATIENT_NOT_FOUND));
        if (!patient.isActive()) throw new ClinicalFailure(ARCHIVED_PATIENT);
        return patient;
    }
    private void patient(UUID id) {
        if (id == null || !patients.existsById(id)) throw new ClinicalFailure(PATIENT_NOT_FOUND);
    }
    private Consultation existing(UUID patientId, UUID id) {
        if (id == null) throw new ClinicalFailure(CONSULTATION_NOT_FOUND);
        return consultations.findByIdAndPatient_Id(id, patientId).orElseThrow(() -> new ClinicalFailure(CONSULTATION_NOT_FOUND));
    }
    private Appointment appointment(UUID patientId, UUID appointmentId, UUID excludedId) {
        if (appointmentId == null) return null;
        Appointment appointment = appointments.findByIdAndPatientId(appointmentId, patientId)
                .orElseThrow(() -> new ClinicalFailure(INVALID_APPOINTMENT));
        if (consultations.existsByAppointment_IdAndIdNot(appointmentId, excludedId)) throw new ClinicalFailure(DUPLICATE_APPOINTMENT);
        return appointment;
    }
    private ClinicalTreatment activeTreatment(UUID patientId, UUID consultationId, UUID treatmentId) {
        if (treatmentId == null) throw new ClinicalFailure(TREATMENT_NOT_FOUND);
        ClinicalTreatment treatment = treatments.findByIdAndConsultation_IdAndConsultation_Patient_Id(treatmentId, consultationId, patientId)
                .orElseThrow(() -> new ClinicalFailure(TREATMENT_NOT_FOUND));
        if (treatment.removedAt != null) throw new ClinicalFailure(INVALID_STATE);
        return treatment;
    }
    private List<ClinicalTreatment> active(Consultation consultation) {
        var active = treatments.activeForConsultation(consultation.id);
        if (active.size() > 50) throw new ClinicalFailure(INVALID_TREATMENT);
        return active;
    }
    private Details details(Consultation consultation, UUID patientId) {
        return new Details(consultation.id, patientId, consultation.version, consultation.status, draft(consultation),
                active(consultation).stream().map(this::treatmentDetails).toList(), consultation.createdAt, consultation.updatedAt);
    }
    private Draft draft(Consultation c) {
        UUID appointmentId = c.appointment == null ? null : (UUID) em.getEntityManagerFactory().getPersistenceUnitUtil().getIdentifier(c.appointment);
        return new Draft(appointmentId, c.consultationDate, c.chiefComplaint, c.clinicalObservations, c.assessment, c.treatmentPlan, c.notes);
    }
    private Treatment content(ClinicalTreatment t) { return new Treatment(t.treatmentDate, t.description, t.toothReference, t.notes); }
    private TreatmentDetails treatmentDetails(ClinicalTreatment t) { return new TreatmentDetails(t.id, t.version, content(t), t.createdAt, t.updatedAt); }
    private static void apply(Consultation c, Draft input, Appointment appointment) {
        c.appointment = appointment; c.consultationDate = input.consultationDate(); c.chiefComplaint = input.chiefComplaint();
        c.clinicalObservations = input.clinicalObservations(); c.assessment = input.assessment();
        c.treatmentPlan = input.treatmentPlan(); c.notes = input.notes();
    }
    private static void apply(ClinicalTreatment t, Treatment input) {
        t.treatmentDate = input.treatmentDate(); t.description = input.description();
        t.toothReference = input.toothReference(); t.notes = input.notes();
    }
    private Instant advance(Instant previous) {
        Instant now = clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        return now.isAfter(previous) ? now : previous.plusNanos(1000);
    }
    private static boolean date(LocalDate date) { return date != null && date.getYear() >= 1 && date.getYear() <= 9999; }
    private static boolean text(String value, int limit, boolean required) {
        return value != null && value.length() <= limit && (!required || !value.isBlank()) && value.indexOf('\0') < 0;
    }
    private static void validateDraft(Draft input) {
        if (input == null || !date(input.consultationDate()) || !text(input.chiefComplaint(), 500, true)
                || !text(input.clinicalObservations(), 5000, false) || !text(input.assessment(), 5000, false)
                || !text(input.treatmentPlan(), 5000, false) || !text(input.notes(), 5000, false)) throw new ClinicalFailure(INVALID_INPUT);
    }
    private static void validateTreatment(Treatment input) {
        if (input == null || !date(input.treatmentDate()) || !text(input.description(), 1000, true)
                || !text(input.toothReference(), 50, false) || !input.toothReference().matches("(?U)[\\p{L}\\p{N}\\s.,/()\\-]*")
                || !text(input.notes(), 2000, false)) throw new ClinicalFailure(INVALID_TREATMENT);
    }
    private static void validateCursor(Cursor cursor) {
        if (cursor != null && (!date(cursor.date()) || cursor.id() == null)) throw new ClinicalFailure(INVALID_INPUT);
    }
    private UUID actor() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AccountPrincipal principal)) throw new AccessDeniedException("Accès refusé.");
        return principal.id();
    }
    private void flush() {
        try {
            em.flush();
        } catch (OptimisticLockException exception) {
            throw new ClinicalFailure(CONCURRENCY_CONFLICT);
        } catch (PersistenceException exception) {
            for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
                if (cause instanceof org.hibernate.exception.ConstraintViolationException constraint) {
                    if ("clinical_consultation_appointment_unique".equals(constraint.getConstraintName())) throw new ClinicalFailure(DUPLICATE_APPOINTMENT);
                    if ("clinical_consultation_appointment_patient_fk".equals(constraint.getConstraintName())) throw new ClinicalFailure(INVALID_APPOINTMENT);
                }
            }
            throw exception;
        }
    }
}
