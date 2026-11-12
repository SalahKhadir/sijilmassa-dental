package ma.sijilmassa.finance;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import ma.sijilmassa.patient.PatientDtos.StrictInput;

import static ma.sijilmassa.finance.FinancialModels.MAX_MINOR;

public final class FinancialDtos {
    private FinancialDtos() { }

    public record CreateCharge(@NotNull UUID patientId, @NotNull UUID consultationId, @NotNull UUID treatmentId,
            @NotNull @PositiveOrZero @Max(MAX_MINOR) Long expectedConsultationVersion,
            @NotNull @PositiveOrZero @Max(MAX_MINOR) Long priceMinor) implements StrictInput { }

    public record RecordPayment(@NotNull @PositiveOrZero @Max(MAX_MINOR) Long expectedChargeVersion,
            @NotNull @Positive @Max(MAX_MINOR) Long amountMinor, @NotNull Instant paidAt,
            @NotNull FinancialModels.PaymentMethod method, @NotNull UUID operationId) implements StrictInput {
        FinancialModels.PaymentInput command() {
            return new FinancialModels.PaymentInput(amountMinor, paidAt, method, operationId);
        }

        @Override public String toString() { return "Financial payment request [withheld]"; }
    }

    public enum PricingState { PRICED, UNPRICED }
    public record TreatmentPricing(UUID treatmentId, PricingState state, UUID chargeId, Long priceMinor) { }
    public record ConsultationPricing(UUID patientId, UUID consultationId, long consultationVersion, List<TreatmentPricing> items) { }

    static ConsultationPricing consultationPricing(FinancialModels.ConsultationPricing pricing) {
        var items = pricing.items().stream().map(item -> new TreatmentPricing(item.treatmentId(),
                item.chargeId() == null ? PricingState.UNPRICED : PricingState.PRICED, item.chargeId(), item.priceMinor())).toList();
        return new ConsultationPricing(pricing.patientId(), pricing.consultationId(), pricing.consultationVersion(), items);
    }

    public record Charge(UUID chargeId, long version, LocalDate date, String treatmentLabel, String currency,
            long priceMinor, long receivedMinor, long remainingMinor, FinancialModels.Settlement settlement) { }
    public record Payment(UUID id, long amountMinor, Instant paidAt, FinancialModels.PaymentMethod method, Instant recordedAt) { }
    public record Receipt(Payment payment, Charge charge) { }
    public record ChargeCursor(LocalDate date, UUID chargeId) { }
    public record PaymentCursor(Instant paidAt, UUID paymentId) { }
    public record PaymentPage(List<Payment> items, PaymentCursor nextCursor) { }
    public record Totals(String currency, String chargesMinor, String receivedMinor, String outstandingMinor) { }
    public record Summary(List<Charge> items, ChargeCursor nextCursor, Totals totals) { }
    public record VersoRow(LocalDate date, String treatmentLabel, long priceMinor, long receivedMinor, long remainingMinor) { }
    public record VersoPage(List<VersoRow> items, ChargeCursor nextCursor, Totals totals) { }

    static Charge charge(FinancialModels.Row row) {
        return new Charge(row.chargeId(), row.version(), row.date(), row.treatmentLabel(), row.currency(),
                row.priceMinor(), row.receivedMinor(), row.remainingMinor(), row.settlement());
    }

    static Receipt receipt(FinancialModels.Receipt receipt) {
        return new Receipt(payment(receipt.payment()), charge(receipt.charge()));
    }

    static PaymentPage payments(FinancialModels.PaymentPage page) {
        var cursor = page.nextCursor();
        return new PaymentPage(page.items().stream().map(FinancialDtos::payment).toList(),
                cursor == null ? null : new PaymentCursor(cursor.paidAt(), cursor.paymentId()));
    }

    static Summary summary(FinancialModels.Summary summary) {
        return new Summary(summary.items().stream().map(FinancialDtos::charge).toList(),
                cursor(summary.nextCursor()), totals(summary.totals()));
    }

    static VersoPage verso(FinancialModels.Summary summary) {
        var items = summary.items().stream().map(row -> new VersoRow(row.date(), row.treatmentLabel(),
                row.priceMinor(), row.receivedMinor(), row.remainingMinor())).toList();
        return new VersoPage(items, cursor(summary.nextCursor()), totals(summary.totals()));
    }

    private static Payment payment(FinancialModels.Payment payment) {
        return new Payment(payment.id(), payment.amountMinor(), payment.paidAt(), payment.method(), payment.recordedAt());
    }

    private static ChargeCursor cursor(FinancialModels.Cursor cursor) {
        return cursor == null ? null : new ChargeCursor(cursor.date(), cursor.chargeId());
    }

    private static Totals totals(FinancialModels.Totals totals) {
        return new Totals(totals.currency(), totals.chargesMinor().toString(), totals.receivedMinor().toString(),
                totals.outstandingMinor().toString());
    }
}
