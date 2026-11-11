package ma.sijilmassa.prescription;

import java.util.UUID;
import ma.sijilmassa.prescription.rendering.*;
import ma.sijilmassa.security.RolePolicies;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@PreAuthorize(RolePolicies.CLINICAL)
public class PrescriptionFinalizationService {
    private final PrescriptionFinalizationTransactions transactions;
    private final LocalPrescriptionRenderer renderer;
    private final PrescriptionPdfValidator validator;
    public PrescriptionFinalizationService(PrescriptionFinalizationTransactions transactions, LocalPrescriptionRenderer renderer, PrescriptionPdfValidator validator) {
        this.transactions = transactions; this.renderer = renderer; this.validator = validator;
    }
    @Transactional(propagation = Propagation.NEVER)
    public PrescriptionDtos.Details finalizePrescription(UUID patientId, UUID id, Long version, Long patientVersion) {
        var prepared = transactions.prepare(patientId, id, version, patientVersion);
        var pdf = renderer.render(prepared.request());
        validator.validate(pdf.bytes(), prepared.maxPdfBytes());
        return transactions.commit(prepared, pdf);
    }
}
