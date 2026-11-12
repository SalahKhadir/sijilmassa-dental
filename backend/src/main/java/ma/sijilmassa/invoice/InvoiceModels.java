package ma.sijilmassa.invoice;

import java.math.BigInteger;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class InvoiceModels {
    private InvoiceModels() { }

    public enum Lifecycle { BROUILLON, EMISE }
    public enum Settlement { DUE, PARTIAL, SETTLED }

    public record PatientIdentity(String reference, String firstName, String lastName) {
        @Override public String toString() { return "Invoice patient identity [withheld]"; }
    }

    /** The date, label and price come from the charge in drafts and the persisted line snapshot after issue. */
    public record Line(UUID chargeId, LocalDate treatmentDate, String treatmentLabel, long priceMinor,
            Long receivedAtIssueMinor, String issuedToothReference, long currentReceivedMinor, long currentRemainingMinor) {
        @Override public String toString() { return "Invoice line [withheld]"; }
    }

    public record Balance(BigInteger totalMinor, BigInteger receivedMinor, BigInteger remainingMinor) { }

    record HistoryCursor(Instant createdAt, UUID invoiceId) { }

    record ChargeCursor(LocalDate treatmentDate, UUID chargeId) { }

    record HistoryEntry(UUID id, Lifecycle lifecycle, Instant createdAt, String number, LocalDate issuedDate,
            Instant issuedAt, Balance currentBalance) { }

    record EligibleCharge(UUID chargeId, LocalDate treatmentDate, String treatmentLabel, long priceMinor) { }

    static Settlement settlement(Lifecycle lifecycle, Balance balance) {
        if (lifecycle == Lifecycle.BROUILLON) return null;
        if (balance.remainingMinor().signum() == 0) return Settlement.SETTLED;
        return balance.receivedMinor().signum() == 0 ? Settlement.DUE : Settlement.PARTIAL;
    }

    public record Issuance(String number, LocalDate date, Instant issuedAt, UUID issuedBy, Balance balanceAtIssue) { }

    public record Details(UUID id, UUID patientId, Lifecycle lifecycle, long version, PatientIdentity patient,
            String currency, Instant createdAt, Instant updatedAt, List<Line> lines, Balance currentBalance,
            Settlement settlement, Issuance issuance) {
        public Details { lines = List.copyOf(lines); }
        @Override public String toString() { return "Invoice details [withheld]"; }
    }
}
