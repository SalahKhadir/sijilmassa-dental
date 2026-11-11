package ma.sijilmassa.clinical;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import org.springframework.data.repository.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Internal persistence access, not an authorization boundary. History uses fixed 50-row keyset pages. */
@Transactional(readOnly = true)
public interface ConsultationRepository extends Repository<Consultation, UUID> {
    @Transactional <S extends Consultation> S save(S consultation);
    Optional<Consultation> findByIdAndPatient_Id(UUID id, UUID patientId);
    boolean existsByIdAndPatient_Id(UUID id, UUID patientId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Consultation c where c.id = :id and c.patient.id = :patientId")
    Optional<Consultation> lockForUpdate(UUID id, UUID patientId);
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select c from Consultation c where c.id = :id and c.patient.id = :patientId")
    Optional<Consultation> lockForPrescription(UUID id, UUID patientId);
    boolean existsByAppointment_IdAndIdNot(UUID appointmentId, UUID excludedId);
    List<Consultation> findTop50ByPatient_IdOrderByConsultationDateDescIdDesc(UUID patientId);

    @Query(value = """
        SELECT * FROM clinical_consultation WHERE patient_id = :patientId
        AND (consultation_date, id) < (:beforeDate, :beforeId)
        ORDER BY consultation_date DESC, id DESC LIMIT 50
        """, nativeQuery = true)
    List<Consultation> historyBefore(UUID patientId, LocalDate beforeDate, UUID beforeId);
}
