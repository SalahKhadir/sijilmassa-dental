package ma.sijilmassa.insurance;

import java.util.UUID;

import ma.sijilmassa.common.api.StrictHttpInput;
import org.springframework.util.MultiValueMap;

import static ma.sijilmassa.insurance.InsuranceModels.HistoryCursor;

final class InsuranceHttpInput {
    private InsuranceHttpInput() { }

    static UUID uuid(String value) {
        return StrictHttpInput.uuid(value, InsuranceHttpInput::invalid);
    }

    static void query(MultiValueMap<String, String> parameters, String... allowed) {
        StrictHttpInput.query(parameters, InsuranceHttpInput::invalid, allowed);
    }

    static HistoryCursor historyCursor(MultiValueMap<String, String> parameters) {
        String createdAt = parameters.getFirst("afterCreatedAt");
        String documentId = parameters.getFirst("afterDocumentId");
        if (createdAt == null && documentId == null) return null;
        if (createdAt == null || documentId == null) throw invalid();
        return new HistoryCursor(StrictHttpInput.instant(createdAt, InsuranceHttpInput::invalid), uuid(documentId));
    }

    static InsuranceFailure invalid() {
        return new InsuranceFailure(InsuranceFailure.Reason.INVALID_INPUT);
    }
}
