package ma.sijilmassa.prescription;

import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

/** Explicit bytea binding avoids PostgreSQL OID/LOB ambiguity. Metadata queries never read PDF bytes. */
@Repository
public class PrescriptionDocumentRepository {
    public record Metadata(PrescriptionSnapshot snapshot, String sha256, int bytes) {
        @Override public String toString() { return "Document metadata [withheld]"; }
    }
    public record StoredPdf(byte[] bytes, String sha256, int size) {
        public StoredPdf { bytes = bytes.clone(); }
        @Override public byte[] bytes() { return bytes.clone(); }
        @Override public String toString() { return "Stored PDF [withheld]"; }
    }
    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    public PrescriptionDocumentRepository(JdbcTemplate jdbc, JsonMapper json) { this.jdbc = jdbc; this.json = json; }
    public void insert(PrescriptionSnapshot snapshot, byte[] bytes, String sha256) {
        try {
            jdbc.update("INSERT INTO prescription_document(prescription_id,snapshot,pdf_bytes,pdf_sha256,pdf_size,finalized_at,finalized_by) VALUES (?,CAST(? AS jsonb),?,?,?,?,?)",
                    snapshot.prescription().id(), json.writeValueAsString(snapshot), bytes, sha256, bytes.length, java.sql.Timestamp.from(snapshot.finalizedAt()), snapshot.finalizedBy());
        } catch (RuntimeException exception) { throw unavailable(); }
    }
    public Metadata metadata(UUID patientId, UUID id) {
        try {
            var result = jdbc.query("SELECT d.snapshot::text,d.pdf_sha256,d.pdf_size FROM prescription_document d JOIN prescription p ON p.id=d.prescription_id WHERE p.id=? AND p.patient_id=? AND p.status='FINALISEE'",
                    (rs, row) -> new Metadata(json.readValue(rs.getString(1), PrescriptionSnapshot.class), rs.getString(2), rs.getInt(3)), id, patientId);
            if (result.size() != 1 || result.getFirst().snapshot().schemaVersion() != 1) throw unavailable();
            return result.getFirst();
        } catch (RuntimeException exception) { throw unavailable(); }
    }
    public StoredPdf pdf(UUID patientId, UUID id) {
        try {
            var values = jdbc.query("SELECT d.pdf_bytes,d.pdf_sha256,d.pdf_size FROM prescription_document d JOIN prescription p ON p.id=d.prescription_id WHERE p.id=? AND p.patient_id=? AND p.status='FINALISEE'",
                    (rs, row) -> new StoredPdf(rs.getBytes(1), rs.getString(2), rs.getInt(3)), id, patientId);
            if (values.size() != 1) throw unavailable();
            var value = values.getFirst(); byte[] bytes = value.bytes();
            if (bytes.length < 1 || bytes.length > 2097152 || bytes.length != value.size() || !PractitionerProfiles.digest(bytes).equals(value.sha256())) throw unavailable();
            return value;
        } catch (RuntimeException exception) { throw unavailable(); }
    }
    static PrescriptionFailure unavailable() { return new PrescriptionFailure(PrescriptionFailure.Reason.DOCUMENT_UNAVAILABLE); }
}
