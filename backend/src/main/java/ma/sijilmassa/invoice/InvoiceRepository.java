package ma.sijilmassa.invoice;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;

import ma.sijilmassa.security.AccountPrincipal;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import static ma.sijilmassa.invoice.InvoiceModels.*;

@Repository
class InvoiceRepository {
    record Header(UUID id, UUID patientId, Lifecycle lifecycle, long version, PatientIdentity patient,
            Instant createdAt, Instant updatedAt, String number, LocalDate issuedDate, Instant issuedAt, UUID issuedBy) { }
    record Candidate(UUID chargeId, UUID reservedBy) { }
    private record Selection(UUID chargeId, int position) { }

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;

    InvoiceRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        this.named = new NamedParameterJdbcTemplate(jdbc);
    }

    boolean currentAccount(AccountPrincipal principal, boolean lock) {
        return !jdbc.query("""
                SELECT id FROM application_user WHERE id = ? AND active AND role = ? AND session_version = ?
                """ + (lock ? " FOR SHARE" : ""),
                (rs, row) -> rs.getObject(1, UUID.class), principal.id(), principal.role().name(), principal.sessionVersion()).isEmpty();
    }

    Optional<Boolean> patientActive(UUID patientId, boolean lock) {
        return jdbc.query("SELECT status = 'ACTIVE' FROM patient WHERE id = ?" + (lock ? " FOR SHARE" : ""),
                (rs, row) -> rs.getBoolean(1), patientId).stream().findFirst();
    }

    Optional<Header> header(UUID patientId, UUID invoiceId, boolean lock) {
        return jdbc.query("""
                SELECT i.*, COALESCE(i.issued_patient_reference, p.reference) AS patient_reference,
                       COALESCE(i.issued_first_name, p.first_name) AS patient_first_name,
                       COALESCE(i.issued_last_name, p.last_name) AS patient_last_name
                FROM invoice i JOIN patient p ON p.id = i.patient_id
                WHERE i.id = ? AND i.patient_id = ?
                """ + (lock ? " FOR UPDATE OF i" : ""), InvoiceRepository::header, invoiceId, patientId).stream().findFirst();
    }

    private static Header header(ResultSet rs, int row) throws SQLException {
        var issued = rs.getTimestamp("issued_at");
        return new Header(rs.getObject("id", UUID.class), rs.getObject("patient_id", UUID.class),
                Lifecycle.valueOf(rs.getString("lifecycle")), rs.getLong("version"),
                new PatientIdentity(rs.getString("patient_reference"), rs.getString("patient_first_name"), rs.getString("patient_last_name")),
                rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(), rs.getString("invoice_number"),
                rs.getObject("issued_date", LocalDate.class), issued == null ? null : issued.toInstant(), rs.getObject("issued_by", UUID.class));
    }

    record DocumentHeader(Lifecycle lifecycle, String number, LocalDate date, String firstName, String lastName) { }

    Optional<DocumentHeader> documentHeader(UUID patientId, UUID invoiceId) {
        return jdbc.query("""
                SELECT lifecycle, invoice_number, issued_date, issued_first_name, issued_last_name
                FROM invoice WHERE id = ? AND patient_id = ?
                """, (rs, row) -> new DocumentHeader(Lifecycle.valueOf(rs.getString("lifecycle")),
                rs.getString("invoice_number"), rs.getObject("issued_date", LocalDate.class),
                rs.getString("issued_first_name"), rs.getString("issued_last_name")), invoiceId, patientId).stream().findFirst();
    }

    List<InvoiceDocument.Line> documentLines(UUID invoiceId) {
        return jdbc.query("""
                SELECT issued_treatment_date, issued_tooth_reference, issued_treatment_label, issued_price_minor, issued_received_minor
                FROM invoice_line WHERE invoice_id = ? ORDER BY line_position LIMIT ?
                """, (rs, row) -> new InvoiceDocument.Line(rs.getObject("issued_treatment_date", LocalDate.class),
                rs.getString("issued_tooth_reference"), rs.getString("issued_treatment_label"),
                rs.getObject("issued_price_minor", Long.class), rs.getObject("issued_received_minor", Long.class)),
                invoiceId, InvoiceDocument.MAX_LINES + 1);
    }

    List<UUID> chargeIds(UUID invoiceId) {
        return jdbc.query("SELECT charge_id FROM invoice_line WHERE invoice_id = ?",
                (rs, row) -> rs.getObject(1, UUID.class), invoiceId);
    }

    List<Line> lines(UUID invoiceId) {
        return jdbc.query("""
                SELECT l.charge_id, COALESCE(l.issued_treatment_date, c.treatment_date) AS treatment_date,
                       COALESCE(l.issued_treatment_label, c.treatment_label) AS treatment_label,
                       COALESCE(l.issued_price_minor, c.price_minor) AS price_minor, l.issued_received_minor, l.issued_tooth_reference,
                       COALESCE((SELECT sum(p.amount_minor) FROM treatment_payment p WHERE p.charge_id = c.id), 0) AS current_received
                FROM invoice_line l JOIN treatment_charge c ON c.id = l.charge_id
                WHERE l.invoice_id = ? ORDER BY l.line_position
                """, (rs, row) -> {
            long price = rs.getLong("price_minor");
            long received = rs.getBigDecimal("current_received").longValueExact();
            return new Line(rs.getObject("charge_id", UUID.class), rs.getObject("treatment_date", LocalDate.class),
                    rs.getString("treatment_label"), price, rs.getObject("issued_received_minor", Long.class),
                    rs.getString("issued_tooth_reference"), received, Math.subtractExact(price, received));
        }, invoiceId);
    }

    List<HistoryEntry> history(UUID patientId, HistoryCursor cursor, int limit) {
        String seek = cursor == null ? "" : " AND (created_at, id) < (:createdAt, :invoiceId)";
        var parameters = new MapSqlParameterSource("patientId", patientId).addValue("limit", limit);
        if (cursor != null) {
            parameters.addValue("createdAt", Timestamp.from(cursor.createdAt())).addValue("invoiceId", cursor.invoiceId());
        }
        return named.query("""
                WITH page AS MATERIALIZED (
                    SELECT id, lifecycle, created_at, invoice_number, issued_date, issued_at
                    FROM invoice WHERE patient_id = :patientId
                """ + seek + "\n" + """
                    ORDER BY created_at DESC, id DESC LIMIT :limit
                )
                SELECT page.*, balance.total, balance.received
                FROM page CROSS JOIN LATERAL (
                    SELECT COALESCE(sum(COALESCE(l.issued_price_minor, c.price_minor)), 0) AS total,
                           COALESCE(sum((SELECT sum(p.amount_minor) FROM treatment_payment p WHERE p.charge_id = c.id)), 0) AS received
                    FROM invoice_line l JOIN treatment_charge c ON c.id = l.charge_id
                    WHERE l.invoice_id = page.id
                ) balance
                ORDER BY page.created_at DESC, page.id DESC
                """, parameters, (rs, row) -> {
            var total = rs.getBigDecimal("total").toBigIntegerExact();
            var received = rs.getBigDecimal("received").toBigIntegerExact();
            var issuedAt = rs.getTimestamp("issued_at");
            return new HistoryEntry(rs.getObject("id", UUID.class), Lifecycle.valueOf(rs.getString("lifecycle")),
                    rs.getTimestamp("created_at").toInstant(), rs.getString("invoice_number"),
                    rs.getObject("issued_date", LocalDate.class), issuedAt == null ? null : issuedAt.toInstant(),
                    new Balance(total, received, total.subtract(received)));
        });
    }

    List<EligibleCharge> eligibleCharges(UUID patientId, ChargeCursor cursor, int limit) {
        String seek = cursor == null ? "" : " AND (c.treatment_date, c.id) > (:treatmentDate, :chargeId)";
        var parameters = new MapSqlParameterSource("patientId", patientId).addValue("limit", limit);
        if (cursor != null) {
            parameters.addValue("treatmentDate", cursor.treatmentDate()).addValue("chargeId", cursor.chargeId());
        }
        return named.query("""
                SELECT c.id, c.treatment_date, c.treatment_label, c.price_minor
                FROM treatment_charge c
                WHERE c.patient_id = :patientId
                  AND NOT EXISTS (SELECT 1 FROM invoice_line l WHERE l.charge_id = c.id)
                """ + seek + "\n" + """
                ORDER BY c.treatment_date, c.id LIMIT :limit
                """, parameters, (rs, row) -> new EligibleCharge(rs.getObject("id", UUID.class),
                rs.getObject("treatment_date", LocalDate.class), rs.getString("treatment_label"), rs.getLong("price_minor")));
    }

    List<Candidate> candidates(UUID patientId, List<UUID> chargeIds) {
        if (chargeIds.isEmpty()) return List.of();
        return named.query("""
                SELECT c.id, l.invoice_id FROM treatment_charge c LEFT JOIN invoice_line l ON l.charge_id = c.id
                WHERE c.patient_id = :patientId AND c.id IN (:chargeIds)
                """, Map.of("patientId", patientId, "chargeIds", chargeIds),
                (rs, row) -> new Candidate(rs.getObject("id", UUID.class), rs.getObject("invoice_id", UUID.class)));
    }

    void insertDraft(UUID id, UUID patientId, UUID actor, Instant now) {
        jdbc.update("""
                INSERT INTO invoice(id, patient_id, lifecycle, version, created_at, created_by, updated_at)
                VALUES (?, ?, 'BROUILLON', 0, ?, ?, ?)
                """, id, patientId, Timestamp.from(now), actor, Timestamp.from(now));
    }

    void replaceLines(UUID invoiceId, List<UUID> charges) {
        jdbc.update("DELETE FROM invoice_line WHERE invoice_id = ?", invoiceId);
        // Acquire concurrent unique-key reservations in a consistent order while preserving the requested positions.
        var ordered = IntStream.range(0, charges.size()).mapToObj(i -> new Selection(charges.get(i), i + 1))
                .sorted(Comparator.comparing(Selection::chargeId))
                .map(line -> new Object[]{invoiceId, line.chargeId(), line.position()}).toList();
        jdbc.batchUpdate("INSERT INTO invoice_line(invoice_id, charge_id, line_position) VALUES (?, ?, ?)", ordered);
    }

    void advanceDraft(UUID invoiceId, Instant now) {
        jdbc.update("UPDATE invoice SET version = version + 1, updated_at = ? WHERE id = ?", Timestamp.from(now), invoiceId);
    }

    void issue(UUID invoiceId, UUID actor, Instant now) {
        jdbc.update("""
                UPDATE invoice SET lifecycle = 'EMISE', version = version + 1, updated_at = ?, issued_at = ?, issued_by = ?
                WHERE id = ?
                """, Timestamp.from(now), Timestamp.from(now), actor, invoiceId);
    }
}
