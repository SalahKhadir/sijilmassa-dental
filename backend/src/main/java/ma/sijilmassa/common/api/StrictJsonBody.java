package ma.sijilmassa.common.api;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.function.Consumer;
import java.util.function.Supplier;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpInputMessage;
import tools.jackson.core.JacksonException;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

public final class StrictJsonBody {
    private final JsonMapper json;
    private final int maxBytes;

    public StrictJsonBody(JsonMapper json, int maxBytes) {
        this.json = json.rebuild().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
        this.maxBytes = maxBytes;
    }

    public HttpInputMessage read(HttpInputMessage input, Consumer<JsonNode> validate,
            Supplier<? extends RuntimeException> invalid) throws IOException {
        byte[] bytes = input.getBody().readNBytes(maxBytes + 1);
        if (bytes.length > maxBytes) throw invalid.get();
        try {
            JsonNode body = json.readTree(bytes);
            if (body == null || !body.isObject()) throw invalid.get();
            validate.accept(body);
        } catch (JacksonException exception) {
            throw invalid.get();
        }
        return new HttpInputMessage() {
            @Override public HttpHeaders getHeaders() { return input.getHeaders(); }
            @Override public InputStream getBody() { return new ByteArrayInputStream(bytes); }
        };
    }
}
