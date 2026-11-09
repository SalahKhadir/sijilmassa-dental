package ma.sijilmassa.patient;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MedicalRecordRepository extends JpaRepository<PatientMedicalRecord, UUID> { }
