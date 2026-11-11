package ma.sijilmassa.finance;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import static ma.sijilmassa.finance.FinancialModels.*;

/** Internal parameterized SQL. All access is owned by the transactional, authorized service. */
@Repository
class FinancialRepository {
    record Source(long consultationVersion, String status, LocalDate date, String label, Instant removedAt) {
        @Override public String toString() { return "Financial treatment source [withheld]"; }
    }
    record Actor(ma.sijilmassa.security.Role role, boolean active, long sessionVersion) { }
    Optional<Actor> account(UUID id, boolean lock) {
        return jdbc.query("SELECT role,active,session_version FROM application_user WHERE id=?" + (lock ? " FOR SHARE" : ""),
                (rs, row) -> new Actor(ma.sijilmassa.security.Role.valueOf(rs.getString(1)), rs.getBoolean(2), rs.getLong(3)), id).stream().findFirst();
    }
    record Charge(UUID id, UUID consultationId, long version, Instant updatedAt) { }
    private final JdbcTemplate jdbc;
    FinancialRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    Optional<Source> lockSource(UUID patient, UUID consultation, UUID treatment) {
        var parent = jdbc.query("SELECT version,status FROM clinical_consultation WHERE id=? AND patient_id=? FOR UPDATE",
                (rs, row) -> new Object[]{rs.getLong(1), rs.getString(2)}, consultation, patient);
        if (parent.isEmpty()) return Optional.empty();
        var values = jdbc.query("SELECT treatment_date,description,removed_at FROM clinical_treatment WHERE id=? AND consultation_id=? FOR SHARE",
                (rs, row) -> new Source((Long) parent.getFirst()[0], (String) parent.getFirst()[1], rs.getObject(1, LocalDate.class), rs.getString(2), instant(rs, "removed_at")), treatment, consultation);
        return values.stream().findFirst();
    }
    boolean charged(UUID treatment) { return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM treatment_charge WHERE treatment_id=?)", Boolean.class, treatment)); }
    void insertCharge(UUID id, UUID patient, UUID consultation, UUID treatment, Source source, long price, Instant at, UUID actor) {
        jdbc.update("""
            INSERT INTO treatment_charge(id,patient_id,consultation_id,treatment_id,treatment_date,treatment_label,price_minor,currency,created_at,updated_at,created_by)
            VALUES (?,?,?,?,?,?,?,'MAD',?,?,?)
            """, id, patient, consultation, treatment, source.date(), source.label(), price, Timestamp.from(at), Timestamp.from(at), actor);
    }
    Optional<UUID> consultation(UUID patient, UUID id) {
        return jdbc.query("SELECT consultation_id FROM treatment_charge WHERE id=? AND patient_id=?", (rs, row) -> rs.getObject(1, UUID.class), id, patient).stream().findFirst();
    }
    void lockConsultation(UUID patient, UUID id) {
        jdbc.queryForObject("SELECT id FROM clinical_consultation WHERE id=? AND patient_id=? FOR SHARE", UUID.class, id, patient);
    }
    Optional<Charge> lockCharge(UUID patient, UUID id) {
        return jdbc.query("SELECT id,consultation_id,version,updated_at FROM treatment_charge WHERE id=? AND patient_id=? FOR UPDATE",
                (rs, row) -> new Charge(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getLong(3), instant(rs, "updated_at")), id, patient).stream().findFirst();
    }
    private static final String ROW_SQL = """
        SELECT c.id,c.version,c.treatment_date,c.treatment_label,c.currency,c.price_minor,COALESCE(p.received,0) AS received
        FROM treatment_charge c LEFT JOIN (
            SELECT charge_id,sum(amount_minor) AS received FROM treatment_payment
            WHERE charge_id IN (SELECT id FROM treatment_charge WHERE patient_id=?) GROUP BY charge_id
        ) p ON p.charge_id=c.id WHERE c.patient_id=?
        """;
    Optional<Row> row(UUID patient, UUID id) {
        return jdbc.query("""
            SELECT c.id,c.version,c.treatment_date,c.treatment_label,c.currency,c.price_minor,COALESCE(p.received,0) AS received
            FROM treatment_charge c LEFT JOIN (SELECT charge_id,sum(amount_minor) AS received FROM treatment_payment WHERE charge_id=? GROUP BY charge_id) p
            ON p.charge_id=c.id WHERE c.patient_id=? AND c.id=?
            """, FinancialRepository::row, id, patient, id).stream().findFirst();
    }
    List<Row> rows(UUID patient, Cursor after) {
        if (after == null) return jdbc.query(ROW_SQL + " ORDER BY c.treatment_date,c.id LIMIT 50", FinancialRepository::row, patient, patient);
        return jdbc.query(ROW_SQL + " AND (c.treatment_date,c.id)>(?,?) ORDER BY c.treatment_date,c.id LIMIT 50", FinancialRepository::row,
                patient, patient, after.date(), after.chargeId());
    }
    Totals totals(UUID patient) {
        return jdbc.queryForObject("""
            WITH charges AS (SELECT id,price_minor FROM treatment_charge WHERE patient_id=?),
            paid AS (SELECT COALESCE(sum(p.amount_minor),0) AS received FROM treatment_payment p JOIN charges c ON c.id=p.charge_id)
            SELECT COALESCE(sum(price_minor),0) AS charged,(SELECT received FROM paid) AS received FROM charges
            """, (rs, index) -> {
                var charged = rs.getBigDecimal("charged").toBigIntegerExact();
                var received = rs.getBigDecimal("received").toBigIntegerExact();
                return new Totals("MAD", charged, received, charged.subtract(received));
            }, patient);
    }
    Optional<Payment> operation(UUID charge, UUID operation) {
        return jdbc.query("SELECT * FROM treatment_payment WHERE charge_id=? AND operation_id=?", FinancialRepository::payment, charge, operation).stream().findFirst();
    }
    void insertPayment(Payment value) {
        jdbc.update("INSERT INTO treatment_payment(id,charge_id,operation_id,amount_minor,paid_at,method,recorded_at,recorded_by) VALUES (?,?,?,?,?,?,?,?)",
                value.id(), value.chargeId(), value.operationId(), value.amountMinor(), Timestamp.from(value.paidAt()), value.method().name(), Timestamp.from(value.recordedAt()), value.recordedBy());
    }
    List<Payment> payments(UUID charge, PaymentCursor after) {
        if (after == null) return jdbc.query("SELECT * FROM treatment_payment WHERE charge_id=? ORDER BY paid_at,id LIMIT 50", FinancialRepository::payment, charge);
        return jdbc.query("SELECT * FROM treatment_payment WHERE charge_id=? AND (paid_at,id)>(?,?) ORDER BY paid_at,id LIMIT 50", FinancialRepository::payment,
                charge, Timestamp.from(after.paidAt()), after.paymentId());
    }
    private static Row row(ResultSet rs, int index) throws SQLException {
        long price = rs.getLong("price_minor"), received = rs.getBigDecimal("received").longValueExact(), remaining = Math.subtractExact(price, received);
        return new Row(rs.getObject("id", UUID.class), rs.getLong("version"), rs.getObject("treatment_date", LocalDate.class), rs.getString("treatment_label"), rs.getString("currency"),
                price, received, remaining, remaining == 0 ? Settlement.SETTLED : received == 0 ? Settlement.DUE : Settlement.PARTIAL);
    }
    private static Payment payment(ResultSet rs, int index) throws SQLException {
        return new Payment(rs.getObject("id", UUID.class), rs.getObject("charge_id", UUID.class), rs.getLong("amount_minor"), instant(rs, "paid_at"),
                PaymentMethod.valueOf(rs.getString("method")), instant(rs, "recorded_at"), rs.getObject("recorded_by", UUID.class), rs.getObject("operation_id", UUID.class));
    }
    private static Instant instant(ResultSet rs, String field) throws SQLException { var value = rs.getTimestamp(field); return value == null ? null : value.toInstant(); }
}
