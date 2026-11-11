package ma.sijilmassa.prescription;

import java.io.*;
import java.lang.reflect.Type;
import java.util.Set;
import org.springframework.core.MethodParameter;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Resource-specific byte limit and scalar types; never logs or retains request bodies. */
@ControllerAdvice(assignableTypes = PrescriptionController.class)
public class PrescriptionRequestAdvice extends RequestBodyAdviceAdapter {
    static final int MAX_BYTES = 256 * 1024;
    private final JsonMapper json;
    public PrescriptionRequestAdvice(JsonMapper json) { this.json = json.rebuild().enable(tools.jackson.core.StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(tools.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build(); }
    @Override public boolean supports(MethodParameter parameter, Type type, Class<? extends HttpMessageConverter<?>> converter) {
        return parameter.getContainingClass() == PrescriptionController.class;
    }
    @Override public HttpInputMessage beforeBodyRead(HttpInputMessage input, MethodParameter parameter, Type type,
            Class<? extends HttpMessageConverter<?>> converter) throws IOException {
        byte[] bytes = input.getBody().readNBytes(MAX_BYTES + 1);
        if (bytes.length > MAX_BYTES) throw new PrescriptionFailure(PrescriptionFailure.Reason.PAYLOAD_TOO_LARGE);
        try { check(json.readTree(bytes)); }
        catch (PrescriptionFailure exception) { throw exception; }
        catch (RuntimeException exception) { throw PrescriptionValidation.invalid(); }
        return new HttpInputMessage() {
            public HttpHeaders getHeaders() { return input.getHeaders(); }
            public InputStream getBody() { return new ByteArrayInputStream(bytes); }
        };
    }
    private void check(JsonNode node) {
        if (node == null) throw PrescriptionValidation.invalid();
        if (node.isObject()) for (var property : node.properties()) {
            var value = property.getValue(); String key = property.getKey();
            if (key.equals("id") && value.isNull()) throw PrescriptionValidation.invalid();
            if (Set.of("id", "patientId", "consultationId").contains(key) && !value.isNull()) {
                if (!value.isString()) throw PrescriptionValidation.invalid();
                PrescriptionValidation.uuid(value.asString());
            }
            if ((key.equals("version") || key.equals("patientVersion")) && !value.isIntegralNumber()) throw PrescriptionValidation.invalid();
            if (Set.of("medicationName", "dosage", "frequency", "duration", "instructions", "generalInstructions", "issuedDate").contains(key)
                    && !value.isString()) throw PrescriptionValidation.invalid();
            check(value);
        }
        else if (node.isArray()) node.forEach(this::check);
    }
}
