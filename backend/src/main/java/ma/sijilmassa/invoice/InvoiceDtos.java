package ma.sijilmassa.invoice;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import ma.sijilmassa.patient.PatientDtos.StrictInput;

import static ma.sijilmassa.finance.FinancialModels.MAX_MINOR;
import static ma.sijilmassa.invoice.InvoiceModels.*;
import static ma.sijilmassa.invoice.InvoiceService.MAX_LINES;
import static ma.sijilmassa.invoice.InvoiceService.PAGE_SIZE;

public final class InvoiceDtos {
    private InvoiceDtos() { }

    public record CreateDraft(@NotNull UUID patientId, @NotNull @Size(max = MAX_LINES) List<@NotNull UUID> chargeIds)
            implements StrictInput { }

    public record EditDraft(@NotNull @PositiveOrZero @Max(MAX_MINOR) Long expectedVersion,
            @NotNull @Size(max = MAX_LINES) List<@NotNull UUID> chargeIds) implements StrictInput { }

    public record Issue(@NotNull @PositiveOrZero @Max(MAX_MINOR) Long expectedVersion) implements StrictInput { }

    public record Amounts(String totalMinor, String receivedMinor, String remainingMinor) { }

    public record CurrentFinancialState(Amounts balance, Settlement settlement) { }

    public record DraftLine(UUID chargeId, LocalDate treatmentDate, String treatmentLabel, long priceMinor) { }

    public record IssuedLine(UUID chargeId, LocalDate treatmentDate, String treatmentLabel, long priceMinor,
            long receivedAtIssueMinor, String toothReference) { }

    public record Draft(PatientIdentity billingIdentity, List<DraftLine> lines) { }

    public record IssuanceSnapshot(String invoiceNumber, LocalDate issueDate, Instant issuedAt,
            PatientIdentity billingIdentity, List<IssuedLine> lines, Amounts balanceAtIssue) { }

    public record Detail(UUID invoiceId, UUID patientId, Lifecycle lifecycle, long version, String currency,
            Instant createdAt, Instant updatedAt, Draft draft, IssuanceSnapshot issuanceSnapshot,
            CurrentFinancialState currentFinancialState) { }

    public record HistoryItem(UUID invoiceId, String invoiceNumber, Instant createdAt, LocalDate issueDate,
            Instant issuedAt, Lifecycle lifecycle, CurrentFinancialState currentFinancialState) { }

    public record HistoryNext(Instant afterCreatedAt, UUID afterInvoiceId) { }

    public record HistoryPage(String currency, List<HistoryItem> items, HistoryNext nextCursor) { }

    public record ChargeNext(LocalDate afterDate, UUID afterChargeId) { }

    public record EligibleChargePage(String currency, List<DraftLine> items, ChargeNext nextCursor) { }

    static Detail detail(Details result) {
        Draft draft = null;
        IssuanceSnapshot snapshot = null;
        var issuance = result.issuance();
        if (issuance == null) {
            draft = new Draft(result.patient(), result.lines().stream().map(line -> new DraftLine(line.chargeId(),
                    line.treatmentDate(), line.treatmentLabel(), line.priceMinor())).toList());
        } else {
            var lines = result.lines().stream().map(line -> new IssuedLine(line.chargeId(), line.treatmentDate(),
                    line.treatmentLabel(), line.priceMinor(), line.receivedAtIssueMinor(), line.issuedToothReference())).toList();
            snapshot = new IssuanceSnapshot(issuance.number(), issuance.date(), issuance.issuedAt(), result.patient(),
                    lines, amounts(issuance.balanceAtIssue()));
        }
        return new Detail(result.id(), result.patientId(), result.lifecycle(), result.version(), result.currency(),
                result.createdAt(), result.updatedAt(), draft, snapshot,
                new CurrentFinancialState(amounts(result.currentBalance()), result.settlement()));
    }

    static HistoryPage history(List<HistoryEntry> rows) {
        var entries = rows.stream().limit(PAGE_SIZE).map(row -> new HistoryItem(row.id(), row.number(),
                row.createdAt(), row.issuedDate(), row.issuedAt(), row.lifecycle(),
                new CurrentFinancialState(amounts(row.currentBalance()), settlement(row.lifecycle(), row.currentBalance())))).toList();
        var last = rows.size() > PAGE_SIZE ? rows.get(PAGE_SIZE - 1) : null;
        return new HistoryPage("MAD", entries, last == null ? null : new HistoryNext(last.createdAt(), last.id()));
    }

    static EligibleChargePage eligibleCharges(List<EligibleCharge> rows) {
        var entries = rows.stream().limit(PAGE_SIZE).map(row -> new DraftLine(row.chargeId(),
                row.treatmentDate(), row.treatmentLabel(), row.priceMinor())).toList();
        var last = rows.size() > PAGE_SIZE ? rows.get(PAGE_SIZE - 1) : null;
        return new EligibleChargePage("MAD", entries,
                last == null ? null : new ChargeNext(last.treatmentDate(), last.chargeId()));
    }

    private static Amounts amounts(Balance balance) {
        return new Amounts(balance.totalMinor().toString(), balance.receivedMinor().toString(),
                balance.remainingMinor().toString());
    }
}
