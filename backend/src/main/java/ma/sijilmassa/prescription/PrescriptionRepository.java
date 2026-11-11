package ma.sijilmassa.prescription;

import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.Repository;

interface PrescriptionRepository extends Repository<Prescription, UUID> {
    <S extends Prescription> S save(S value);
    Optional<Prescription> findByIdAndPatientId(UUID id, UUID patientId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Prescription p where p.id=:id and p.patientId=:patientId")
    Optional<Prescription> lockForUpdate(UUID id, UUID patientId);
}
