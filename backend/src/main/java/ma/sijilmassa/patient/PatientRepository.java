package ma.sijilmassa.patient;

import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;

public interface PatientRepository extends JpaRepository<Patient, UUID>, JpaSpecificationExecutor<Patient> {
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select p from Patient p where p.id = :id")
    Optional<Patient> lockForMedicalUpdate(UUID id);
}
