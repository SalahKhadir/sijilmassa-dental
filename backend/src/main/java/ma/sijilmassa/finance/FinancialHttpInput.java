package ma.sijilmassa.finance;

import java.time.Instant;
import java.util.UUID;

import ma.sijilmassa.common.api.StrictHttpInput;
import org.springframework.util.MultiValueMap;

final class FinancialHttpInput {
    private FinancialHttpInput() { }

    static UUID uuid(String value) {
        return StrictHttpInput.uuid(value, FinancialHttpInput::invalid);
    }

    static Instant instant(String value) {
        return StrictHttpInput.instant(value, FinancialHttpInput::invalid);
    }

    static void query(MultiValueMap<String, String> parameters, String... allowedKeys) {
        StrictHttpInput.query(parameters, FinancialHttpInput::invalid, allowedKeys);
    }

    static FinancialModels.Cursor chargeCursor(MultiValueMap<String, String> parameters) {
        String date = parameters.getFirst("afterDate");
        String id = parameters.getFirst("afterChargeId");
        if (date == null && id == null) return null;
        if (date == null || id == null) throw invalid();
        return new FinancialModels.Cursor(StrictHttpInput.date(date, FinancialHttpInput::invalid), uuid(id));
    }

    static FinancialModels.PaymentCursor paymentCursor(MultiValueMap<String, String> parameters) {
        String paidAt = parameters.getFirst("afterPaidAt");
        String id = parameters.getFirst("afterPaymentId");
        if (paidAt == null && id == null) return null;
        if (paidAt == null || id == null) throw invalid();
        return new FinancialModels.PaymentCursor(instant(paidAt), uuid(id));
    }

    static FinancialFailure invalid() {
        return new FinancialFailure(FinancialFailure.Reason.INVALID_INPUT);
    }
}
