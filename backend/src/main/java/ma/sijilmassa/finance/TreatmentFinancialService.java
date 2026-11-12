package ma.sijilmassa.finance;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import jakarta.persistence.EntityManager;
import ma.sijilmassa.audit.AuditEventType;
import ma.sijilmassa.audit.SecurityAudit;
import ma.sijilmassa.patient.PatientRepository;
import ma.sijilmassa.security.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static ma.sijilmassa.finance.FinancialModels.*;
import static ma.sijilmassa.finance.FinancialFailure.Reason.*;

@Service
@PreAuthorize(RolePolicies.ADMINISTRATIVE)
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class TreatmentFinancialService {
    private final FinancialRepository ledger;
    private final PatientRepository patients;
    private final SecurityAudit audit;
    private final EntityManager em;
    private final Clock clock;
    public TreatmentFinancialService(FinancialRepository ledger, PatientRepository patients, SecurityAudit audit, EntityManager em, Clock clock) {
        this.ledger = ledger; this.patients = patients; this.audit = audit; this.em = em; this.clock = clock;
    }
    /** Agreed price assigned exactly once. Does not edit or increment the clinical aggregate. */
    @PreAuthorize(RolePolicies.CLINICAL)
    @Transactional(isolation = Isolation.READ_COMMITTED, timeout = 10)
    public Row createCharge(UUID patientId, UUID consultationId, UUID treatmentId, Long expectedConsultationVersion, Long priceMinor) {
        return write(() -> {
            version(expectedConsultationVersion); money(priceMinor, false); id(consultationId); id(treatmentId);
            UUID actor = actor(true, true);
            activePatient(patientId);
            var source = ledger.lockSource(patientId, consultationId, treatmentId).orElseThrow(() -> failure(NOT_FOUND));
            if (source.consultationVersion() != expectedConsultationVersion) throw failure(VERSION_CONFLICT);
            if (!source.status().equals("BROUILLON")) throw failure(CONSULTATION_FINALIZED);
            if (source.removedAt() != null) throw failure(INELIGIBLE_TREATMENT);
            if (ledger.charged(treatmentId)) throw failure(DUPLICATE_CHARGE);
            UUID charge = UUID.randomUUID();
            ledger.insertCharge(charge, patientId, consultationId, treatmentId, source, priceMinor, clock.instant().truncatedTo(ChronoUnit.MICROS), actor);
            audit.recordCharge(AuditEventType.TREATMENT_CHARGE_CREATED, actor, charge);
            em.flush(); return row(patientId, charge);
        });
    }
    /** Idempotent per charge/operation, with a new expected charge version for every distinct collection. */
    @Transactional(isolation = Isolation.READ_COMMITTED, timeout = 10)
    public Receipt recordPayment(UUID patientId, UUID chargeId, Long expectedVersion, PaymentInput input) {
        return write(() -> {
            version(expectedVersion); id(chargeId); validate(input);
            UUID actor = actor(false, true);
            activePatient(patientId);
            UUID consultation = ledger.consultation(patientId, chargeId).orElseThrow(() -> failure(NOT_FOUND));
            ledger.lockConsultation(patientId, consultation);
            var charge = ledger.lockCharge(patientId, chargeId).orElseThrow(() -> failure(NOT_FOUND));
            var existing = ledger.operation(chargeId, input.operationId());
            if (existing.isPresent()) {
                var payment = existing.get();
                if (payment.amountMinor() != input.amountMinor() || !payment.paidAt().equals(input.paidAt()) || payment.method() != input.method()) throw failure(OPERATION_CONFLICT);
                return new Receipt(payment, row(patientId, chargeId));
            }
            if (charge.version() != expectedVersion || charge.version() == MAX_MINOR) throw failure(VERSION_CONFLICT);
            var current = row(patientId, chargeId);
            if (input.amountMinor() > current.remainingMinor()) throw failure(OVERPAYMENT);
            Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
            Instant recorded = now.isAfter(charge.updatedAt()) ? now : charge.updatedAt().plusNanos(1000);
            var payment = new Payment(UUID.randomUUID(), chargeId, input.amountMinor(), input.paidAt(), input.method(), recorded, actor, input.operationId());
            ledger.insertPayment(payment); // Database guard advances the charge version in this same transaction.
            audit.recordPayment(AuditEventType.TREATMENT_PAYMENT_RECORDED, actor, chargeId, payment.id());
            em.flush(); return new Receipt(payment, row(patientId, chargeId));
        });
    }
    @PreAuthorize(RolePolicies.CLINICAL)
    public ConsultationPricing consultationPricing(UUID patientId, UUID consultationId) {
        actor(true, false);
        id(patientId);
        id(consultationId);
        long version = ledger.consultationVersion(patientId, consultationId).orElseThrow(() -> failure(NOT_FOUND));
        var items = ledger.treatmentPrices(patientId, consultationId);
        // Match the clinical limit. Reject legacy overflow instead of returning an incomplete snapshot.
        if (items.size() > 50) throw failure(STORAGE_FAILURE);
        return new ConsultationPricing(patientId, consultationId, version, items);
    }
    private static final int MAX_DOSSIER_CHARGES = 250;

    @PreAuthorize(RolePolicies.CLINICAL)
    public Optional<DossierLedger> dossierLedger(UUID patientId) {
        actor(true, false);
        patient(patientId);
        var rows = ledger.firstRows(patientId, MAX_DOSSIER_CHARGES + 1);
        if (rows.size() > MAX_DOSSIER_CHARGES) return Optional.empty();
        return Optional.of(new DossierLedger(rows, ledger.totals(patientId)));
    }

    public Row getCharge(UUID patientId, UUID chargeId) { actor(false, false); patient(patientId); id(chargeId); return row(patientId, chargeId); }
    public Summary summary(UUID patientId, Cursor after) {
        actor(false, false); patient(patientId);
        if (after != null && (after.date() == null || after.date().getYear() < 1 || after.date().getYear() > 9999 || after.chargeId() == null)) throw failure(INVALID_INPUT);
        var rows = ledger.rows(patientId, after); var last = rows.isEmpty() ? null : rows.getLast();
        return new Summary(rows, rows.size() == 50 ? new Cursor(last.date(), last.chargeId()) : null, ledger.totals(patientId));
    }
    public PaymentPage payments(UUID patientId, UUID chargeId, PaymentCursor after) {
        actor(false, false); patient(patientId); id(chargeId); row(patientId, chargeId);
        if (after != null && (!instant(after.paidAt()) || after.paymentId() == null)) throw failure(INVALID_INPUT);
        var values = ledger.payments(chargeId, after); var last = values.isEmpty() ? null : values.getLast();
        return new PaymentPage(values, values.size() == 50 ? new PaymentCursor(last.paidAt(), last.id()) : null);
    }
    private Row row(UUID patient, UUID charge) { return ledger.row(patient, charge).orElseThrow(() -> failure(NOT_FOUND)); }
    private void patient(UUID value) { id(value); if (!patients.existsById(value)) throw failure(NOT_FOUND); }
    private void activePatient(UUID value) {
        id(value); var patient = patients.lockForMedicalUpdate(value).orElseThrow(() -> failure(NOT_FOUND));
        if (!patient.isActive()) throw failure(ARCHIVED_PATIENT);
    }
    private UUID actor(boolean dentistOnly, boolean lock) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof AccountPrincipal principal)
                || (dentistOnly && principal.role() != Role.DENTIST)) throw denied();
        // Read a fresh minimal account projection; a managed JPA entity may already be stale in an enclosing transaction.
        var account = ledger.account(principal.id(), lock).orElseThrow(TreatmentFinancialService::denied);
        if (!account.active() || account.role() != principal.role() || account.sessionVersion() != principal.sessionVersion()) throw denied();
        return principal.id();
    }
    private static void validate(PaymentInput value) {
        if (value == null || value.method() == null || value.operationId() == null || !instant(value.paidAt())) throw failure(INVALID_INPUT);
        money(value.amountMinor(), true);
    }
    private static boolean instant(Instant value) {
        return value != null && value.getNano() % 1000 == 0 && !value.isBefore(Instant.parse("0001-01-01T00:00:00Z")) && value.isBefore(Instant.parse("+10000-01-01T00:00:00Z"));
    }
    private static void id(UUID value) { if (value == null) throw failure(INVALID_INPUT); }
    private static void version(Long value) { if (value == null || value < 0 || value > MAX_MINOR) throw failure(INVALID_INPUT); }
    private static void money(Long value, boolean positive) { if (value == null || value < (positive ? 1 : 0) || value > MAX_MINOR) throw failure(INVALID_INPUT); }
    private static FinancialFailure failure(FinancialFailure.Reason reason) { return new FinancialFailure(reason); }
    private static AccessDeniedException denied() { return new AccessDeniedException("Accès refusé."); }
    private static <T> T write(Supplier<T> operation) {
        try { return operation.get(); }
        catch (FinancialFailure | AccessDeniedException exception) { throw exception; }
        catch (RuntimeException exception) { throw failure(STORAGE_FAILURE); }
    }
}
