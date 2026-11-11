package ma.sijilmassa.prescription;

import java.time.*;
import java.util.*;
import jakarta.persistence.EntityManager;
import ma.sijilmassa.audit.*;
import ma.sijilmassa.patient.PatientRepository;
import ma.sijilmassa.clinical.ConsultationRepository;
import ma.sijilmassa.security.*;
import ma.sijilmassa.prescription.rendering.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static ma.sijilmassa.prescription.PrescriptionFailure.Reason.*;

@Service
@PreAuthorize(RolePolicies.CLINICAL)
public class PrescriptionFinalizationTransactions {
    public record Prepared(RenderingRequest request, PractitionerProfiles.Profile practitioner, UUID actor, long sessionVersion,
            Instant capturedAt, String manifestSha256, int maxPdfBytes) {
        @Override public String toString() { return "Prepared prescription [withheld]"; }
    }
    private final PrescriptionService service;
    private final PrescriptionRepository prescriptions;
    private final PatientRepository patients;
    private final ConsultationRepository consultations;
    private final UserAccountRepository users;
    private final PractitionerProfiles profiles;
    private final RenderingProperties rendering;
    private final PrescriptionDocumentRepository documents;
    private final SecurityAudit audit;
    private final EntityManager em;
    private final Clock clock;
    public PrescriptionFinalizationTransactions(PrescriptionService service, PrescriptionRepository prescriptions, PatientRepository patients,
            ConsultationRepository consultations, UserAccountRepository users, PractitionerProfiles profiles, RenderingProperties rendering,
            PrescriptionDocumentRepository documents, SecurityAudit audit, EntityManager em, Clock clock) {
        this.service = service; this.prescriptions = prescriptions; this.patients = patients; this.consultations = consultations; this.users = users;
        this.profiles = profiles; this.rendering = rendering; this.documents = documents; this.audit = audit; this.em = em; this.clock = clock;
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ, timeout = 5)
    public Prepared prepare(UUID patientId, UUID id, Long version, Long patientVersion) {
        PrescriptionValidation.version(version); PrescriptionValidation.version(patientVersion);
        var actor = principal(); var account = users.findById(actor.id()).orElseThrow(() -> denied()); authorize(account, actor);
        var details = service.get(patientId, id); check(details, version, patientVersion);
        if (details.content().medications().isEmpty() || details.content().medications().stream().anyMatch(l ->
                List.of(l.medicationName(), l.dosage(), l.frequency(), l.duration()).stream().anyMatch(PrescriptionFinalizationTransactions::blank)))
            throw new PrescriptionFailure(INCOMPLETE_PRESCRIPTION);
        var profile = profiles.require(actor.id());
        return new Prepared(RenderingRequest.from(details, RenderingRequest.Mode.FINAL_LAYOUT_CHECK), profile, actor.id(), actor.sessionVersion(),
                clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MICROS), rendering.getManifestSha256(), rendering.getMaxPdfBytes());
    }
    @Transactional(timeout = 10)
    public PrescriptionDtos.Details commit(Prepared prepared, RenderedPdf pdf) {
        var principal = principal();
        if (!principal.id().equals(prepared.actor()) || principal.sessionVersion() != prepared.sessionVersion()) throw denied();
        var account = users.lockForPrescriptionFinalization(principal.id()).orElseThrow(() -> denied()); authorize(account, principal);
        var source = prepared.request().record(); var identity = prepared.request().patient();
        var patient = patients.lockForMedicalUpdate(source.patientId()).orElseThrow(() -> new PrescriptionFailure(NOT_FOUND));
        if (source.consultationId() != null && consultations.lockForPrescription(source.consultationId(), source.patientId()).isEmpty()) throw new PrescriptionFailure(INVALID_INPUT);
        var prescription = prescriptions.lockForUpdate(source.id(), source.patientId()).orElseThrow(() -> new PrescriptionFailure(NOT_FOUND));
        var current = service.get(source.patientId(), source.id()); check(current, source.version(), identity.version());
        var currentRequest = RenderingRequest.from(current, RenderingRequest.Mode.FINAL_LAYOUT_CHECK);
        if (!source.equals(currentRequest.record()) || !identity.equals(currentRequest.patient())
                || !profiles.require(principal.id()).equals(prepared.practitioner())
                || !Objects.equals(rendering.getManifestSha256(), prepared.manifestSha256()) || rendering.getMaxPdfBytes() != prepared.maxPdfBytes())
            throw new PrescriptionFailure(VERSION_CONFLICT);
        if (!patient.isActive()) throw new PrescriptionFailure(READ_ONLY);
        if (!pdf.templateSha256().equals(prepared.practitioner().templateSha256()) || !pdf.sha256().equals(PractitionerProfiles.digest(pdf.bytes())))
            throw PrescriptionDocumentRepository.unavailable();
        Instant now = clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        Instant finalizedAt = now.isAfter(prescription.updatedAt) ? now : prescription.updatedAt.plusNanos(1000);
        var generation = new PrescriptionSnapshot.Generation(pdf.rendererId(), prepared.manifestSha256(), "ordonnance-a5-v1", pdf.templateSha256(),
                pdf.fontSha256(), "1.17.1", "1.1.1", "fr-MA", "Africa/Casablanca", "FINAL_LAYOUT_CHECK", prepared.maxPdfBytes(), 419.25, 595.499986, 0, 8.580014, 0);
        var snapshot = new PrescriptionSnapshot(1, source, identity, prepared.practitioner(), prepared.capturedAt(), finalizedAt, principal.id(), generation);
        documents.insert(snapshot, pdf.bytes(), pdf.sha256());
        prescription.status = Prescription.Status.FINALISEE; prescription.finalizedAt = finalizedAt; prescription.finalizedBy = principal.id();
        prescription.updatedAt = finalizedAt; prescription.updatedBy = principal.id();
        try { em.flush(); audit.recordPrescription(AuditEventType.PRESCRIPTION_FINALIZED, principal.id(), prescription.id); em.flush(); }
        catch (RuntimeException exception) { throw PrescriptionDocumentRepository.unavailable(); }
        return service.get(source.patientId(), source.id());
    }
    private static void check(PrescriptionDtos.Details value, long version, long patientVersion) {
        if (value.version() != version || value.patient().version() != patientVersion) throw new PrescriptionFailure(VERSION_CONFLICT);
        if (value.status() != Prescription.Status.BROUILLON || value.archivedAt() != null || !value.patient().status().equals("active") || version == PrescriptionDtos.MAX_VERSION)
            throw new PrescriptionFailure(READ_ONLY);
    }
    private static boolean blank(String text) { return text.codePoints().allMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c) || c == 0xfeff); }
    private static AccountPrincipal principal() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof AccountPrincipal value) || value.role() != Role.DENTIST) throw denied(); return value;
    }
    private static void authorize(UserAccount user, AccountPrincipal principal) {
        if (!user.isActive() || user.getRole() != Role.DENTIST || user.getSessionVersion() != principal.sessionVersion()) throw denied();
    }
    private static AccessDeniedException denied() { return new AccessDeniedException("Accès refusé."); }
}
