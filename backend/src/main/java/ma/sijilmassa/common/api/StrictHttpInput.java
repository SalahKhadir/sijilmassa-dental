package ma.sijilmassa.common.api;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.regex.Pattern;

import org.springframework.util.MultiValueMap;

public final class StrictHttpInput {
    private static final Pattern UUID_TEXT = Pattern.compile("[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}");
    private static final Pattern DATE = Pattern.compile("[0-9]{4}-[0-9]{2}-[0-9]{2}");
    private static final Pattern UTC_INSTANT =
            Pattern.compile("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]{1,6})?Z");

    private StrictHttpInput() { }

    public static UUID uuid(String value, Supplier<? extends RuntimeException> invalid) {
        if (value == null || !UUID_TEXT.matcher(value).matches()) throw invalid.get();
        return UUID.fromString(value);
    }

    public static Instant instant(String value, Supplier<? extends RuntimeException> invalid) {
        if (!UTC_INSTANT.matcher(value).matches()) throw invalid.get();
        try {
            var timestamp = OffsetDateTime.parse(value);
            if (timestamp.getYear() < 1) throw invalid.get();
            return timestamp.toInstant();
        } catch (DateTimeParseException exception) {
            throw invalid.get();
        }
    }

    public static LocalDate date(String value, Supplier<? extends RuntimeException> invalid) {
        if (!DATE.matcher(value).matches()) throw invalid.get();
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException exception) {
            throw invalid.get();
        }
    }

    public static void query(MultiValueMap<String, String> parameters, Supplier<? extends RuntimeException> invalid,
            String... allowedKeys) {
        var allowed = Set.of(allowedKeys);
        if (parameters.entrySet().stream().anyMatch(entry -> !allowed.contains(entry.getKey()) || entry.getValue().size() != 1)) {
            throw invalid.get();
        }
    }
}
