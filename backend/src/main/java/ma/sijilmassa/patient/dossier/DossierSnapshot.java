package ma.sijilmassa.patient.dossier;

import java.util.UUID;

import ma.sijilmassa.finance.FinancialModels.DossierLedger;
import ma.sijilmassa.finance.TreatmentFinancialService;
import ma.sijilmassa.patient.PatientDtos.Identity;
import ma.sijilmassa.patient.PatientDtos.MedicalContent;
import ma.sijilmassa.patient.PatientService;
import ma.sijilmassa.security.RolePolicies;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
class DossierSnapshot {
    record Data(Identity identity, MedicalContent medical, DossierLedger ledger) {
        @Override public String toString() { return "Patient dossier snapshot [withheld]"; }
    }

    private final PatientService patients;
    private final TreatmentFinancialService financial;

    DossierSnapshot(PatientService patients, TreatmentFinancialService financial) {
        this.patients = patients;
        this.financial = financial;
    }

    @PreAuthorize(RolePolicies.CLINICAL)
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ, propagation = Propagation.REQUIRES_NEW, timeout = 10)
    public Data load(UUID patientId) {
        var identity = patients.get(patientId).identity();
        var medical = patients.getMedical(patientId).record();
        var ledger = financial.dossierLedger(patientId).orElseThrow(() -> new DossierFailure(DossierFailure.Reason.DOSSIER_LIMIT));
        return new Data(identity, medical, ledger);
    }
}
