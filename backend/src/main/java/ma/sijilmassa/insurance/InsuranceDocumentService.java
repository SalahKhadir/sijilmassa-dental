package ma.sijilmassa.insurance;

import java.math.BigInteger;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import ma.sijilmassa.audit.AuditEventType;
import ma.sijilmassa.audit.SecurityAudit;
import ma.sijilmassa.security.AccountPrincipal;
import ma.sijilmassa.security.Role;
import ma.sijilmassa.security.RolePolicies;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import static ma.sijilmassa.finance.FinancialModels.MAX_MINOR;
import static ma.sijilmassa.insurance.InsuranceFailure.Reason.*;
import static ma.sijilmassa.insurance.InsuranceModels.*;

@Service
@PreAuthorize(RolePolicies.CLINICAL)
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class InsuranceDocumentService {
    static final int PAGE_SIZE = 50;
    private final InsuranceRepository documents;
    private final SecurityAudit audit;
    private final Clock clock;

    InsuranceDocumentService(InsuranceRepository documents, SecurityAudit audit, Clock clock) {
        this.documents = documents;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, timeout = 10)
    public Details createDraft(CreateInput input) {
        UUID actor = actor(true);
        InsuranceValidation.template(input);
        var patient = patient(input.patientId(), true);
        var consultation = consultation(input.patientId(), input.consultationId(), true);
        var draft = InsuranceValidation.draft(input.documentType(), input.purpose(), input.draft());
        validateSources(input.patientId(), consultation, draft);
        UUID id = UUID.randomUUID();
        documents.insert(id, input, draft.fields(), actor, instant());
        documents.replaceActs(id, draft.acts());
        audit.recordInsuranceDocument(AuditEventType.INSURANCE_DOCUMENT_CREATED, actor, input.patientId(), id);
        return details(header(input.patientId(), id, false), patient.beneficiary(), consultation);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, timeout = 10)
    public Details replaceDraft(UUID patientId, UUID id, Long expectedVersion, DraftInput input) {
        UUID actor = actor(true);
        var patient = patient(patientId, true);
        var consultation = consultation(patientId, header(patientId, id, false).consultationId(), true);
        var current = lockedDraft(patientId, id, expectedVersion);
        var draft = InsuranceValidation.draft(current.type(), current.purpose(), input);
        validateSources(patientId, consultation, draft);
        documents.updateDraft(current, draft.fields(), actor, nextInstant(current.updatedAt()));
        documents.replaceActs(id, draft.acts());
        audit.recordInsuranceDocument(AuditEventType.INSURANCE_DRAFT_UPDATED, actor, patientId, id);
        return details(header(patientId, id, false), patient.beneficiary(), consultation);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, timeout = 10)
    public Details finalizeDocument(UUID patientId, UUID id, FinalizeInput input) {
        UUID actor = actor(true);
        if (input == null) throw new InsuranceFailure(INVALID_INPUT);
        var patient = patient(patientId, true);
        var consultation = consultation(patientId, header(patientId, id, false).consultationId(), true);
        var current = lockedDraft(patientId, id, input.expectedVersion());
        checkReviewVersions(input, patient.beneficiary(), consultation);
        if (current.purpose().executed() && (consultation == null || !consultation.finalized())) {
            throw new InsuranceFailure(INVALID_CONSULTATION);
        }
        var draft = InsuranceValidation.draft(current.type(), current.purpose(),
                new DraftInput(current.fields(), documents.acts(id)));
        var insured = insured(current.type(), draft.fields().insured(), patient);
        InsuranceValidation.complete(current.type(), draft, insured, patient.beneficiary());
        var acts = new ArrayList<ConfirmedAct>();
        BigInteger total = BigInteger.ZERO;
        boolean allFeesKnown = true;
        for (var act : draft.acts()) {
            var confirmed = confirmAct(current, consultation, act);
            acts.add(confirmed);
            if (confirmed.feeMinor() == null) allFeesKnown = false;
            else total = total.add(BigInteger.valueOf(confirmed.feeMinor()));
        }
        var snapshot = new Snapshot(1, current.type(), current.templateVersion(), current.type().templateSha256(),
                current.purpose(), patient.beneficiary(), consultation, insured, draft.fields(), acts, allFeesKnown ? total : null);
        documents.finalizeDocument(current, snapshot, actor, nextInstant(current.updatedAt()));
        audit.recordInsuranceDocument(AuditEventType.INSURANCE_DOCUMENT_FINALIZED, actor, patientId, id);
        return details(header(patientId, id, false), patient.beneficiary(), consultation);
    }

    public Details get(UUID patientId, UUID id) {
        actor(false);
        var current = header(patientId, id, false);
        if (current.snapshot() != null) return details(current, current.snapshot().beneficiary(), current.snapshot().consultation());
        return details(current, patient(patientId, false).beneficiary(), consultation(patientId, current.consultationId(), false));
    }

    public Snapshot finalizedSnapshot(UUID patientId, UUID id) {
        actor(false);
        var current = header(patientId, id, false);
        if (current.lifecycle() != Lifecycle.FINALISE) {
            throw new InsurancePdfFailure(InsurancePdfFailure.Code.INSURANCE_PDF_NOT_FINALIZED);
        }
        var snapshot = current.snapshot();
        if (snapshot == null || snapshot.documentType() != current.type() || snapshot.templateVersion() != current.templateVersion()
                || snapshot.purpose() != current.purpose() || snapshot.beneficiary() == null
                || !patientId.equals(snapshot.beneficiary().patientId())) {
            throw new InsurancePdfFailure(InsurancePdfFailure.Code.INSURANCE_PDF_INTEGRITY);
        }
        return snapshot;
    }

    public List<HistoryEntry> history(UUID patientId, HistoryCursor cursor) {
        actor(false);
        if (patientId == null || (cursor != null && (cursor.createdAt() == null || cursor.documentId() == null))) {
            throw new InsuranceFailure(INVALID_INPUT);
        }
        if (!documents.patientExists(patientId)) throw new InsuranceFailure(NOT_FOUND);
        return documents.history(patientId, cursor, PAGE_SIZE + 1);
    }

    private ConfirmedAct confirmAct(InsuranceRepository.Header current, ConsultationSource consultation, ActInput act) {
        var fields = act.fields();
        if (!current.purpose().executed()) {
            InsuranceValidation.require(fields.plannedDescription());
            if (current.type() == DocumentType.FAR_DENTAIRE) InsuranceValidation.require(fields.quotedFeeMinor());
            return new ConfirmedAct(null, null, fields.plannedDate(), fields.plannedDescription(), fields.plannedTooth(),
                    fields.actCode(), fields.keyLetter(), fields.coefficient(), fields.keyValueMinor(),
                    fields.quotedFeeMinor() == null ? null : FeeSource.MANUAL_QUOTE, fields.quotedFeeMinor());
        }
        InsuranceValidation.require(act.treatmentId());
        var source = treatment(consultation, act.treatmentId());
        Long fee = price(current.patientId(), consultation, act);
        if (current.type() == DocumentType.FAR_DENTAIRE) InsuranceValidation.require(fee);
        return new ConfirmedAct(act.treatmentId(), act.chargeId(), source.date(), source.label(), source.tooth(),
                fields.actCode(), fields.keyLetter(), fields.coefficient(), fields.keyValueMinor(),
                fee == null ? null : FeeSource.V9_AGREED_PRICE, fee);
    }

    private void validateSources(UUID patientId, ConsultationSource consultation, DraftInput draft) {
        for (var act : draft.acts()) {
            if (act.treatmentId() != null) treatment(consultation, act.treatmentId());
            price(patientId, consultation, act);
        }
    }

    private InsuranceRepository.TreatmentSource treatment(ConsultationSource consultation, UUID id) {
        if (consultation == null) throw new InsuranceFailure(INVALID_CONSULTATION);
        return documents.treatment(consultation.consultationId(), id).orElseThrow(() -> new InsuranceFailure(INVALID_TREATMENT));
    }

    private Long price(UUID patientId, ConsultationSource consultation, ActInput act) {
        if (act.chargeId() == null) return null;
        if (consultation == null) throw new InsuranceFailure(INVALID_CONSULTATION);
        return documents.agreedPrice(patientId, consultation.consultationId(), act.treatmentId(), act.chargeId())
                .orElseThrow(() -> new InsuranceFailure(INVALID_CHARGE));
    }

    private static Insured insured(DocumentType type, InsuredInput input, InsuranceRepository.PatientSource patient) {
        if (input == null || input.relationship() == null) throw new InsuranceFailure(INCOMPLETE_DOCUMENT);
        if (input.relationship() == Relationship.LUI_MEME) {
            var beneficiary = patient.beneficiary();
            return new Insured(input.relationship(), InsuredSource.PATIENT, beneficiary.firstName(), beneficiary.lastName(),
                    beneficiary.cin(), patient.address(), type == DocumentType.CNSS_DENTAIRE ? null : patient.phone());
        }
        return new Insured(input.relationship(), InsuredSource.DOCUMENT_INPUT, input.firstName(), input.lastName(),
                input.cin(), input.address(), type == DocumentType.CNSS_DENTAIRE ? null : input.phone());
    }

    private static void checkReviewVersions(FinalizeInput input, Beneficiary patient, ConsultationSource consultation) {
        long expectedPatient = InsuranceValidation.version(input.expectedPatientVersion());
        if (expectedPatient != patient.version()) throw new InsuranceFailure(VERSION_CONFLICT);
        if (consultation == null) {
            if (input.expectedConsultationVersion() != null) throw new InsuranceFailure(INVALID_INPUT);
        } else if (InsuranceValidation.version(input.expectedConsultationVersion()) != consultation.version()) {
            throw new InsuranceFailure(VERSION_CONFLICT);
        }
    }

    private Details details(InsuranceRepository.Header header, Beneficiary beneficiary, ConsultationSource consultation) {
        var draft = header.snapshot() == null ? new DraftInput(header.fields(), documents.acts(header.id())) : null;
        return new Details(header.id(), header.patientId(), header.consultationId(), header.type(), header.templateVersion(),
                header.purpose(), header.lifecycle(), header.version(), header.createdAt(), header.updatedAt(), header.createdBy(),
                header.updatedBy(), header.finalizedAt(), header.finalizedBy(), beneficiary, consultation, draft, header.snapshot());
    }

    private InsuranceRepository.Header lockedDraft(UUID patientId, UUID id, Long version) {
        long expected = InsuranceValidation.version(version);
        var current = header(patientId, id, true);
        if (current.lifecycle() != Lifecycle.BROUILLON) throw new InsuranceFailure(READ_ONLY);
        if (current.version() != expected || current.version() == MAX_MINOR) throw new InsuranceFailure(VERSION_CONFLICT);
        return current;
    }

    private InsuranceRepository.Header header(UUID patientId, UUID id, boolean lock) {
        if (patientId == null || id == null) throw new InsuranceFailure(INVALID_INPUT);
        return documents.header(patientId, id, lock).orElseThrow(() -> new InsuranceFailure(NOT_FOUND));
    }

    private InsuranceRepository.PatientSource patient(UUID id, boolean lock) {
        if (id == null) throw new InsuranceFailure(INVALID_INPUT);
        var value = documents.patient(id, lock).orElseThrow(() -> new InsuranceFailure(NOT_FOUND));
        if (lock && !value.active()) throw new InsuranceFailure(ARCHIVED_PATIENT);
        return value;
    }

    private ConsultationSource consultation(UUID patientId, UUID id, boolean lock) {
        if (id == null) return null;
        return documents.consultation(patientId, id, lock).orElseThrow(() -> new InsuranceFailure(INVALID_CONSULTATION));
    }

    private UUID actor(boolean lock) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof AccountPrincipal principal)
                || principal.role() != Role.DENTIST || !documents.currentAccount(principal, lock)) {
            throw new AccessDeniedException("Accès refusé.");
        }
        return principal.id();
    }

    private Instant instant() { return clock.instant().truncatedTo(ChronoUnit.MICROS); }

    private Instant nextInstant(Instant previous) {
        var now = instant();
        return now.isAfter(previous) ? now : previous.plus(1, ChronoUnit.MICROS);
    }
}
