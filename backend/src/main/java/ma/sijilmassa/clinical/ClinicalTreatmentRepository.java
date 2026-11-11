package ma.sijilmassa.clinical;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Reads remain scoped to both patient and consultation; callers must authorize the dentist. */
@Transactional(readOnly = true)
public interface ClinicalTreatmentRepository extends Repository<ClinicalTreatment, UUID> {
    @Transactional <S extends ClinicalTreatment> S save(S treatment);
    Optional<ClinicalTreatment> findByIdAndConsultation_IdAndConsultation_Patient_Id(UUID id, UUID consultationId, UUID patientId);
    List<ClinicalTreatment> findTop50ByConsultation_IdAndConsultation_Patient_IdOrderByTreatmentDateAscIdAsc(UUID consultationId, UUID patientId);

    @Query(value = """
        SELECT t.* FROM clinical_treatment t JOIN clinical_consultation c ON c.id = t.consultation_id
        WHERE t.consultation_id = :consultationId AND c.patient_id = :patientId
        AND (t.treatment_date, t.id) > (:afterDate, :afterId)
        ORDER BY t.treatment_date, t.id LIMIT 50
        """, nativeQuery = true)
    List<ClinicalTreatment> treatmentsAfter(UUID consultationId, UUID patientId, LocalDate afterDate, UUID afterId);

    @Query(value = """
        SELECT * FROM clinical_treatment WHERE consultation_id = :consultationId AND removed_at IS NULL
        ORDER BY treatment_date, id LIMIT 51
        """, nativeQuery = true)
    List<ClinicalTreatment> activeForConsultation(UUID consultationId);

    @Query(value = """
        SELECT * FROM clinical_treatment WHERE consultation_id = :consultationId AND removed_at IS NOT NULL
        AND (CAST(:afterDate AS date) IS NULL OR (treatment_date, id) > (:afterDate, :afterId))
        ORDER BY treatment_date, id LIMIT 50
        """, nativeQuery = true)
    List<ClinicalTreatment> removedAfter(UUID consultationId, LocalDate afterDate, UUID afterId);
}
