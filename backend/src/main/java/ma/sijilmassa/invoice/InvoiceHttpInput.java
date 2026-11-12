package ma.sijilmassa.invoice;

import java.util.UUID;

import ma.sijilmassa.common.api.StrictHttpInput;
import org.springframework.util.MultiValueMap;

import static ma.sijilmassa.invoice.InvoiceModels.ChargeCursor;
import static ma.sijilmassa.invoice.InvoiceModels.HistoryCursor;

final class InvoiceHttpInput {
    private InvoiceHttpInput() { }

    static UUID uuid(String value) {
        return StrictHttpInput.uuid(value, InvoiceHttpInput::invalid);
    }

    static void query(MultiValueMap<String, String> parameters, String... allowedKeys) {
        StrictHttpInput.query(parameters, InvoiceHttpInput::invalid, allowedKeys);
    }

    static HistoryCursor historyCursor(MultiValueMap<String, String> parameters) {
        String createdAt = parameters.getFirst("afterCreatedAt");
        String id = parameters.getFirst("afterInvoiceId");
        if (createdAt == null && id == null) return null;
        if (createdAt == null || id == null) throw invalid();
        return new HistoryCursor(StrictHttpInput.instant(createdAt, InvoiceHttpInput::invalid), uuid(id));
    }

    static ChargeCursor chargeCursor(MultiValueMap<String, String> parameters) {
        String date = parameters.getFirst("afterDate");
        String id = parameters.getFirst("afterChargeId");
        if (date == null && id == null) return null;
        if (date == null || id == null) throw invalid();
        var treatmentDate = StrictHttpInput.date(date, InvoiceHttpInput::invalid);
        if (treatmentDate.getYear() < 1) throw invalid();
        return new ChargeCursor(treatmentDate, uuid(id));
    }

    static InvoiceFailure invalid() {
        return new InvoiceFailure(InvoiceFailure.Reason.INVALID_INPUT);
    }
}
