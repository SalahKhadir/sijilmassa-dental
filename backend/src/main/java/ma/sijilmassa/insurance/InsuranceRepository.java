package ma.sijilmassa.insurance;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import ma.sijilmassa.security.AccountPrincipal;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.cfg.EnumFeature;
import tools.jackson.databind.json.JsonMapper;

import static ma.sijilmassa.insurance.InsuranceFailure.Reason.STORAGE_FAILURE;
import static ma.sijilmassa.insurance.InsuranceModels.*;

@Repository
class InsuranceRepository {
    record Header(UUID id, UUID patientId, UUID consultationId, DocumentType type, int templateVersion, Purpose purpose,
            Lifecycle lifecycle, long version, Fields fields, Snapshot snapshot, Instant createdAt, Instant updatedAt,
            UUID createdBy, UUID updatedBy, Instant finalizedAt, UUID finalizedBy) { }
    record PatientSource(Beneficiary beneficiary, boolean active, String address, String phone) {
        @Override public String toString() { return "Insurance patient source [withheld]"; }
    }
    record TreatmentSource(LocalDate date, String label, String tooth) {
        @Override public String toString() { return "Insurance treatment source [withheld]"; }
    }

    private final JdbcTemplate jdbc;
    private final JsonMapper json;

    InsuranceRepository(JdbcTemplate jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json.rebuild().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .enable(EnumFeature.FAIL_ON_NUMBERS_FOR_ENUMS)
                .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT).build();
    }

    boolean currentAccount(AccountPrincipal principal, boolean lock) {
        return !jdbc.query("""
                SELECT id FROM application_user WHERE id = ? AND active AND role = 'DENTIST' AND session_version = ?
                """ + (lock ? " FOR SHARE" : ""), (rs, row) -> rs.getObject(1, UUID.class),
                principal.id(), principal.sessionVersion()).isEmpty();
    }

    Optional<PatientSource> patient(UUID patientId, boolean lock) {
        return jdbc.query("""
                SELECT version, status, first_name, last_name, cin, date_of_birth, sex, address, gsm
                FROM patient WHERE id = ?
                """ + (lock ? " FOR SHARE" : ""), (rs, row) -> new PatientSource(
                    new Beneficiary(patientId, rs.getLong("version"), rs.getString("first_name"), rs.getString("last_name"),
                        absentIfBlank(rs.getString("cin")), rs.getObject("date_of_birth", LocalDate.class),
                        "UNANSWERED".equals(rs.getString("sex")) ? null : rs.getString("sex")),
                    "ACTIVE".equals(rs.getString("status")), absentIfBlank(rs.getString("address")),
                    absentIfBlank(rs.getString("gsm"))), patientId).stream().findFirst();
    }

    boolean patientExists(UUID patientId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM patient WHERE id = ?)",
                Boolean.class, patientId));
    }

    List<HistoryEntry> history(UUID patientId, HistoryCursor cursor, int limit) {
        String seek = cursor == null ? "" : " AND (created_at, id) < (?, ?)";
        Object[] arguments = cursor == null ? new Object[] { patientId, limit }
                : new Object[] { patientId, Timestamp.from(cursor.createdAt()), cursor.documentId(), limit };
        return jdbc.query("""
                SELECT id, consultation_id, document_type, template_version, lifecycle, created_at, finalized_at
                FROM insurance_document WHERE patient_id = ?
                """ + seek + " ORDER BY created_at DESC, id DESC LIMIT ?", (rs, row) -> {
            var finalizedAt = rs.getTimestamp("finalized_at");
            return new HistoryEntry(rs.getObject("id", UUID.class), rs.getObject("consultation_id", UUID.class),
                    DocumentType.valueOf(rs.getString("document_type")), rs.getInt("template_version"),
                    Lifecycle.valueOf(rs.getString("lifecycle")), rs.getTimestamp("created_at").toInstant(),
                    finalizedAt == null ? null : finalizedAt.toInstant());
        }, arguments);
    }

    Optional<ConsultationSource> consultation(UUID patientId, UUID consultationId, boolean lock) {
        return jdbc.query("""
                SELECT version, consultation_date, status FROM clinical_consultation WHERE id = ? AND patient_id = ?
                """ + (lock ? " FOR SHARE" : ""), (rs, row) -> new ConsultationSource(consultationId, rs.getLong("version"),
                    rs.getObject("consultation_date", LocalDate.class), "TERMINEE".equals(rs.getString("status"))),
                consultationId, patientId).stream().findFirst();
    }

    Optional<TreatmentSource> treatment(UUID consultationId, UUID treatmentId) {
        return jdbc.query("""
                SELECT treatment_date, description, tooth_reference FROM clinical_treatment
                WHERE id = ? AND consultation_id = ? AND removed_at IS NULL FOR SHARE
                """, (rs, row) -> new TreatmentSource(rs.getObject("treatment_date", LocalDate.class),
                    rs.getString("description"), absentIfBlank(rs.getString("tooth_reference"))),
                treatmentId, consultationId).stream().findFirst();
    }

    Optional<Long> agreedPrice(UUID patientId, UUID consultationId, UUID treatmentId, UUID chargeId) {
        // V9 protects the price and source identity. Payment versions are immaterial here.
        return jdbc.query("""
                SELECT price_minor FROM treatment_charge
                WHERE id = ? AND patient_id = ? AND consultation_id = ? AND treatment_id = ? AND currency = 'MAD'
                """, (rs, row) -> rs.getLong(1), chargeId, patientId, consultationId, treatmentId).stream().findFirst();
    }

    void insert(UUID id, CreateInput input, Fields fields, UUID actor, Instant at) {
        jdbc.update("""
                INSERT INTO insurance_document (id, patient_id, consultation_id, document_type, template_version, purpose,
                    lifecycle, version, form_data, created_at, updated_at, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, 'BROUILLON', 0, ?::jsonb, ?, ?, ?, ?)
                """, id, input.patientId(), input.consultationId(), input.documentType().name(), input.templateVersion(),
                input.purpose().name(), write(fields), Timestamp.from(at), Timestamp.from(at), actor, actor);
    }

    void updateDraft(Header current, Fields fields, UUID actor, Instant at) {
        requireChanged(jdbc.update("""
                UPDATE insurance_document SET form_data = ?::jsonb, version = version + 1, updated_at = ?, updated_by = ?
                WHERE id = ? AND patient_id = ? AND version = ? AND lifecycle = 'BROUILLON'
                """, write(fields), Timestamp.from(at), actor, current.id(), current.patientId(), current.version()));
    }

    void finalizeDocument(Header current, Snapshot snapshot, UUID actor, Instant at) {
        requireChanged(jdbc.update("""
                UPDATE insurance_document SET lifecycle = 'FINALISE', final_snapshot = ?::jsonb, version = version + 1,
                    updated_at = ?, updated_by = ?, finalized_at = ?, finalized_by = ?
                WHERE id = ? AND patient_id = ? AND version = ? AND lifecycle = 'BROUILLON'
                """, write(snapshot), Timestamp.from(at), actor, Timestamp.from(at), actor, current.id(), current.patientId(), current.version()));
    }

    void replaceActs(UUID id, List<ActInput> acts) {
        jdbc.update("DELETE FROM insurance_act WHERE document_id = ?", id);
        int position = 1;
        for (var act : acts) {
            jdbc.update("""
                    INSERT INTO insurance_act (document_id, line_position, treatment_id, charge_id, act_data)
                    VALUES (?, ?, ?, ?, ?::jsonb)
                    """, id, position++, act.treatmentId(), act.chargeId(), write(act.fields()));
        }
    }

    Optional<Header> header(UUID patientId, UUID id, boolean lock) {
        return jdbc.query("SELECT * FROM insurance_document WHERE id = ? AND patient_id = ?" + (lock ? " FOR UPDATE" : ""),
                this::header, id, patientId).stream().findFirst();
    }

    private Header header(ResultSet rs, int row) throws SQLException {
        var finalizedAt = rs.getTimestamp("finalized_at");
        String snapshot = rs.getString("final_snapshot");
        return new Header(rs.getObject("id", UUID.class), rs.getObject("patient_id", UUID.class),
                rs.getObject("consultation_id", UUID.class), DocumentType.valueOf(rs.getString("document_type")),
                rs.getInt("template_version"), Purpose.valueOf(rs.getString("purpose")), Lifecycle.valueOf(rs.getString("lifecycle")),
                rs.getLong("version"), read(rs.getString("form_data"), Fields.class),
                snapshot == null ? null : read(snapshot, Snapshot.class), rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(), rs.getObject("created_by", UUID.class),
                rs.getObject("updated_by", UUID.class), finalizedAt == null ? null : finalizedAt.toInstant(),
                rs.getObject("finalized_by", UUID.class));
    }

    List<ActInput> acts(UUID id) {
        return jdbc.query("""
                SELECT treatment_id, charge_id, act_data FROM insurance_act WHERE document_id = ? ORDER BY line_position
                """, (rs, row) -> new ActInput(rs.getObject("treatment_id", UUID.class), rs.getObject("charge_id", UUID.class),
                    read(rs.getString("act_data"), ActFields.class)), id);
    }

    private static String absentIfBlank(String value) { return value == null || value.isBlank() ? null : value; }

    private <T> T read(String value, Class<T> type) {
        try { return json.readValue(value, type); }
        catch (JacksonException exception) { throw new InsuranceFailure(STORAGE_FAILURE); }
    }

    private String write(Object value) {
        try { return json.writeValueAsString(value); }
        catch (JacksonException exception) { throw new InsuranceFailure(STORAGE_FAILURE); }
    }

    private static void requireChanged(int count) {
        if (count != 1) throw new InsuranceFailure(STORAGE_FAILURE);
    }
}
