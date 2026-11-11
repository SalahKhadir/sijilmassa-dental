package ma.sijilmassa.prescription.rendering;

import java.util.UUID;
import ma.sijilmassa.prescription.*;
import ma.sijilmassa.security.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** Internal read-only orchestration. No controller, write operation, audit, PDF persistence, or automatic retry. */
@Service
@PreAuthorize(RolePolicies.CLINICAL)
public class PrescriptionRenderingService {
    private final PrescriptionService prescriptions;
    private final LocalPrescriptionRenderer renderer;
    private final UserAccountRepository users;
    public PrescriptionRenderingService(PrescriptionService prescriptions, LocalPrescriptionRenderer renderer, UserAccountRepository users) {
        this.prescriptions = prescriptions; this.renderer = renderer; this.users = users;
    }
    @Transactional(propagation = Propagation.NEVER)
    public RenderedPdf renderDraft(UUID patientId, UUID id, long version, long patientVersion) {
        UUID actor = authorizedActor();
        var initial = prescriptions.get(patientId, id);
        check(initial, version, patientVersion);
        var pdf = renderer.render(RenderingRequest.from(initial, RenderingRequest.Mode.DRAFT));
        if (!actor.equals(authorizedActor())) throw new AccessDeniedException("Accès refusé.");
        check(prescriptions.get(patientId, id), version, patientVersion);
        return pdf;
    }
    private void check(PrescriptionDtos.Details value, long version, long patientVersion) {
        if (value.version() != version || value.patient().version() != patientVersion)
            throw new PrescriptionFailure(PrescriptionFailure.Reason.VERSION_CONFLICT);
        if (value.status() != Prescription.Status.BROUILLON || value.archivedAt() != null || !value.patient().status().equals("active"))
            throw new PrescriptionFailure(PrescriptionFailure.Reason.READ_ONLY);
    }
    private UUID authorizedActor() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AccountPrincipal principal)) throw new AccessDeniedException("Accès refusé.");
        var account = users.findById(principal.id()).orElseThrow(() -> new AccessDeniedException("Accès refusé."));
        if (!account.isActive() || account.getRole() != Role.DENTIST || account.getSessionVersion() != principal.sessionVersion())
            throw new AccessDeniedException("Accès refusé.");
        return account.getId();
    }
}
