package ma.sijilmassa.prescription;

import java.util.UUID;
import ma.sijilmassa.security.RolePolicies;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@PreAuthorize(RolePolicies.CLINICAL)
public class PrescriptionPdfService {
    private final PrescriptionService prescriptions;
    private final PrescriptionDocumentRepository documents;
    public PrescriptionPdfService(PrescriptionService prescriptions, PrescriptionDocumentRepository documents) { this.prescriptions = prescriptions; this.documents = documents; }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PrescriptionDocumentRepository.StoredPdf get(UUID patientId, UUID id, long version) {
        PrescriptionValidation.version(version);
        var p = prescriptions.get(patientId, id);
        if (p.version() != version) throw new PrescriptionFailure(PrescriptionFailure.Reason.VERSION_CONFLICT);
        if (p.status() != Prescription.Status.FINALISEE) throw new PrescriptionFailure(PrescriptionFailure.Reason.READ_ONLY);
        return documents.pdf(patientId, id);
    }
}
