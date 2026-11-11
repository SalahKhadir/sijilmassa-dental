package ma.sijilmassa.finance;

import java.math.BigInteger;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Detached collection projections only; no clinical notes, entities or medical history. */
public final class FinancialModels {
    private FinancialModels() { }
    public static final long MAX_MINOR = 9_007_199_254_740_991L;
    public enum PaymentMethod { ESPECES, CARTE, VIREMENT, CHEQUE, AUTRE }
    public enum Settlement { DUE, PARTIAL, SETTLED }
    public record PaymentInput(Long amountMinor, Instant paidAt, PaymentMethod method, UUID operationId) {
        @Override public String toString() { return "Financial payment command [withheld]"; }
    }
    public record Row(UUID chargeId, long version, LocalDate date, String treatmentLabel, String currency,
            long priceMinor, long receivedMinor, long remainingMinor, Settlement settlement) {
        @Override public String toString() { return "Treatment financial row [withheld]"; }
    }
    /** BigInteger totals prevent overflow when many individually safe charges are summed. */
    public record Totals(String currency, BigInteger chargesMinor, BigInteger receivedMinor, BigInteger outstandingMinor) {
        @Override public String toString() { return "Patient financial totals [withheld]"; }
    }
    public record Cursor(LocalDate date, UUID chargeId) { }
    public record Summary(List<Row> items, Cursor nextCursor, Totals totals) {
        public Summary { items = List.copyOf(items); }
        @Override public String toString() { return "Patient financial summary [withheld]"; }
    }
    public record Payment(UUID id, UUID chargeId, long amountMinor, Instant paidAt, PaymentMethod method,
            Instant recordedAt, UUID recordedBy, UUID operationId) {
        @Override public String toString() { return "Recorded treatment payment [withheld]"; }
    }
    public record PaymentCursor(Instant paidAt, UUID paymentId) { }
    public record PaymentPage(List<Payment> items, PaymentCursor nextCursor) {
        public PaymentPage { items = List.copyOf(items); }
        @Override public String toString() { return "Treatment payment history [withheld]"; }
    }
    public record Receipt(Payment payment, Row charge) {
        @Override public String toString() { return "Treatment payment receipt [withheld]"; }
    }
}
