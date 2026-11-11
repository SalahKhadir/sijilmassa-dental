package ma.sijilmassa.patient;

import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;

public interface PatientRepository extends JpaRepository<Patient, UUID>, JpaSpecificationExecutor<Patient> {
    /** Minimal administrative projection for internal document services; no clinical fields. */
    interface PrescriptionIdentity {
        UUID getId();
        String getReference();
        String getFirstName();
        String getLastName();
        Long getVersion();
        PatientValues.Status getStatus();
    }
    @Query("select p.id as id, p.reference as reference, p.firstName as firstName, p.lastName as lastName, p.version as version, p.status as status from Patient p where p.id=:id")
    Optional<PrescriptionIdentity> prescriptionIdentity(UUID id);
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select p from Patient p where p.id = :id")
    Optional<Patient> lockForMedicalUpdate(UUID id);
}
