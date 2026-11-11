package ma.sijilmassa.appointment;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;

public interface AppointmentRepository extends JpaRepository<Appointment, UUID> {
    java.util.Optional<Appointment> findByIdAndPatientId(UUID id, UUID patientId);
    @Query(value = """
        SELECT * FROM appointment WHERE tstzrange(start_at,end_at,'[)') && tstzrange(:from,:to,'[)')
        AND (CAST(:patientId AS uuid) IS NULL OR patient_id = :patientId) ORDER BY start_at,id
        """, countQuery = """
        SELECT count(*) FROM appointment WHERE tstzrange(start_at,end_at,'[)') && tstzrange(:from,:to,'[)')
        AND (CAST(:patientId AS uuid) IS NULL OR patient_id = :patientId)
        """, nativeQuery = true)
    Page<Appointment> calendar(Instant from, Instant to, UUID patientId, Pageable pageable);

    @Query(value = """
        SELECT EXISTS (SELECT 1 FROM appointment WHERE status IN ('EN_ATTENTE','CONFIRME','TERMINE')
        AND tstzrange(start_at,end_at,'[)') && tstzrange(:from,:to,'[)') AND (CAST(:excluded AS uuid) IS NULL OR id <> :excluded))
        """, nativeQuery = true)
    boolean overlaps(Instant from, Instant to, UUID excluded);
}
