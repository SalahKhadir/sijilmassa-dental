package ma.sijilmassa.insurance;

import java.io.IOException;
import java.lang.reflect.Type;
import java.util.Set;
import java.util.regex.Pattern;

import ma.sijilmassa.common.api.StrictHttpInput;
import ma.sijilmassa.common.api.StrictJsonBody;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static ma.sijilmassa.insurance.InsuranceHttpInput.invalid;

@ControllerAdvice(assignableTypes = InsuranceDocumentController.class)
public class InsuranceRequestAdvice extends RequestBodyAdviceAdapter {
    private static final int MAX_BYTES = 128 * 1024;
    private static final Pattern ENUM_TOKEN = Pattern.compile("[A-Z_]+");
    private static final Set<String> DOCUMENT_TYPES = Set.of(
            InsuranceModels.DocumentType.CNSS_DENTAIRE.name(), InsuranceModels.DocumentType.CNOPS_DENTAIRE.name(),
            InsuranceModels.DocumentType.FAR_DENTAIRE.name());
    private final StrictJsonBody body;

    public InsuranceRequestAdvice(JsonMapper json) {
        this.body = new StrictJsonBody(json, MAX_BYTES);
    }

    @Override
    public boolean supports(MethodParameter parameter, Type type, Class<? extends HttpMessageConverter<?>> converter) {
        return parameter.getContainingClass() == InsuranceDocumentController.class;
    }

    @Override
    public HttpInputMessage beforeBodyRead(HttpInputMessage input, MethodParameter parameter, Type type,
            Class<? extends HttpMessageConverter<?>> converter) throws IOException {
        return body.read(input, value -> object(value, 0), InsuranceHttpInput::invalid);
    }

    // Check tokens before binding. StrictInput enforces which names are legal in each nested DTO.
    private static void object(JsonNode node, int depth) {
        require(node.isObject() && depth < 5);
        for (var field : node.properties()) {
            JsonNode value = field.getValue();
            if (value.isNull()) continue; // Bean Validation and the service check required values.
            switch (field.getKey()) {
                case "draft", "fields", "insured", "cnss", "cnops", "far", "dentistDeclaration" -> object(value, depth + 1);
                case "acts", "marks" -> {
                    require(value.isArray());
                    for (var item : value) object(item, depth + 1);
                }
                case "patientId", "consultationId", "treatmentId", "chargeId" -> {
                    require(value.isString());
                    InsuranceHttpInput.uuid(value.asString());
                }
                case "date", "plannedDate", "accidentDate", "insuredStatementDate" -> {
                    require(value.isString());
                    require(StrictHttpInput.date(value.asString(), InsuranceHttpInput::invalid).getYear() > 0);
                }
                case "templateVersion", "expectedVersion", "expectedPatientVersion", "expectedConsultationVersion",
                     "attachmentCount", "prospectusCount", "keyValueMinor", "quotedFeeMinor" -> require(value.isIntegralNumber());
                case "coefficient" -> require(value.isNumber());
                case "documentType" -> {
                    require(value.isString());
                    if (!DOCUMENT_TYPES.contains(value.asString())) {
                        throw new InsuranceFailure(InsuranceFailure.Reason.UNSUPPORTED_TEMPLATE);
                    }
                }
                case "purpose", "relationship", "care", "context", "symbol" -> enumToken(value);
                case "careTypes" -> {
                    require(value.isArray());
                    for (var item : value) enumToken(item);
                }
                case "confirmedTeeth" -> {
                    require(value.isArray());
                    for (var item : value) require(item.isString());
                }
                case "firstName", "lastName", "cin", "address", "phone", "place", "registrationNumber", "affiliationNumber",
                     "practitionerInp", "practitionerInpe", "priorAuthorizationNumber", "accidentCauses", "diagnosisCategory",
                     "accountNumber", "rank", "unit", "tooth", "plannedDescription", "plannedTooth", "actCode", "keyLetter" ->
                        require(value.isString());
                default -> throw invalid();
            }
        }
    }

    private static void enumToken(JsonNode value) {
        require(value.isString() && ENUM_TOKEN.matcher(value.asString()).matches());
    }

    private static void require(boolean valid) {
        if (!valid) throw invalid();
    }
}
