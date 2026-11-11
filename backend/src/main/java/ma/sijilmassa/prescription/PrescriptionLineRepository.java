package ma.sijilmassa.prescription;

import java.util.List;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface PrescriptionLineRepository extends Repository<PrescriptionLine, UUID> {
    List<PrescriptionLine> findByPrescriptionIdOrderByPosition(UUID prescriptionId);
    <S extends PrescriptionLine> S save(S line);
    void delete(PrescriptionLine line);
}
