package ma.sijilmassa.finance;

import java.io.IOException;
import java.lang.reflect.Type;

import ma.sijilmassa.common.api.StrictJsonBody;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@ControllerAdvice(assignableTypes = FinancialController.class)
public class FinancialRequestAdvice extends RequestBodyAdviceAdapter {
    private static final int MAX_BYTES = 4096;
    private final StrictJsonBody body;

    public FinancialRequestAdvice(JsonMapper json) {
        this.body = new StrictJsonBody(json, MAX_BYTES);
    }

    @Override
    public boolean supports(MethodParameter parameter, Type type, Class<? extends HttpMessageConverter<?>> converter) {
        return parameter.getContainingClass() == FinancialController.class;
    }

    @Override
    public HttpInputMessage beforeBodyRead(HttpInputMessage input, MethodParameter parameter, Type type,
            Class<? extends HttpMessageConverter<?>> converter) throws IOException {
        return body.read(input, FinancialRequestAdvice::validate, FinancialHttpInput::invalid);
    }

    private static void validate(JsonNode body) {
        for (var field : body.properties()) {
            JsonNode value = field.getValue();
            switch (field.getKey()) {
                case "patientId", "consultationId", "treatmentId", "operationId" -> {
                    if (!value.isString()) throw FinancialHttpInput.invalid();
                    FinancialHttpInput.uuid(value.asString());
                }
                case "amountMinor", "priceMinor", "expectedConsultationVersion", "expectedChargeVersion" -> {
                    if (!value.isIntegralNumber()) throw FinancialHttpInput.invalid();
                }
                case "paidAt" -> {
                    if (!value.isString()) throw FinancialHttpInput.invalid();
                    FinancialHttpInput.instant(value.asString());
                }
                case "method" -> {
                    if (!value.isString()) throw FinancialHttpInput.invalid();
                    try {
                        FinancialModels.PaymentMethod.valueOf(value.asString());
                    } catch (IllegalArgumentException exception) {
                        throw FinancialHttpInput.invalid();
                    }
                }
                default -> throw FinancialHttpInput.invalid();
            }
        }
        // The DTO's StrictInput also rejects fields that belong to a different financial command.
    }
}
