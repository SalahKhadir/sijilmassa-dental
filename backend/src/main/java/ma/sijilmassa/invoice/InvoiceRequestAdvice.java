package ma.sijilmassa.invoice;

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

@ControllerAdvice(assignableTypes = InvoiceController.class)
public class InvoiceRequestAdvice extends RequestBodyAdviceAdapter {
    private static final int MAX_BYTES = 16 * 1024;
    private final StrictJsonBody body;

    public InvoiceRequestAdvice(JsonMapper json) {
        this.body = new StrictJsonBody(json, MAX_BYTES);
    }

    @Override
    public boolean supports(MethodParameter parameter, Type type, Class<? extends HttpMessageConverter<?>> converter) {
        return parameter.getContainingClass() == InvoiceController.class;
    }

    @Override
    public HttpInputMessage beforeBodyRead(HttpInputMessage input, MethodParameter parameter, Type type,
            Class<? extends HttpMessageConverter<?>> converter) throws IOException {
        return body.read(input, InvoiceRequestAdvice::validate, InvoiceHttpInput::invalid);
    }

    private static void validate(JsonNode body) {
        for (var field : body.properties()) {
            JsonNode value = field.getValue();
            switch (field.getKey()) {
                case "patientId" -> validateUuid(value);
                case "chargeIds" -> {
                    if (!value.isArray()) throw InvoiceHttpInput.invalid();
                    for (var id : value) validateUuid(id);
                }
                case "expectedVersion" -> {
                    if (!value.isIntegralNumber()) throw InvoiceHttpInput.invalid();
                }
                default -> throw InvoiceHttpInput.invalid();
            }
        }
        // StrictInput rejects properties from other invoice commands during DTO binding.
    }

    private static void validateUuid(JsonNode value) {
        if (!value.isString()) throw InvoiceHttpInput.invalid();
        InvoiceHttpInput.uuid(value.asString());
    }
}
