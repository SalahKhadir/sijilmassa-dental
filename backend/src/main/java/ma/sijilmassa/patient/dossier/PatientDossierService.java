package ma.sijilmassa.patient.dossier;

import java.util.UUID;

import ma.sijilmassa.security.RolePolicies;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PatientDossierService {
    private final DossierSnapshot snapshot;
    private final DossierPdfRenderer renderer;

    PatientDossierService(DossierSnapshot snapshot, DossierPdfRenderer renderer) {
        this.snapshot = snapshot;
        this.renderer = renderer;
    }

    @PreAuthorize(RolePolicies.CLINICAL)
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public byte[] generate(UUID patientId) {
        return renderer.render(snapshot.load(patientId));
    }
}
