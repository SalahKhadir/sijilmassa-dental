package ma.sijilmassa.prescription;

import java.nio.file.*;
import java.security.*;
import java.util.*;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import ma.sijilmassa.patient.PatientDtos.StrictInput;
import ma.sijilmassa.prescription.rendering.LocalPrescriptionRenderer;

/** One server-managed, explicitly approved profile, frozen until restart. No identity is accepted over HTTP. */
@Component
public class PractitionerProfiles {
    @Component @ConfigurationProperties(prefix = "prescription.practitioner")
    public static class Settings {
        private Path file;
        private String sha256;
        public Path getFile() { return file; }
        public void setFile(Path value) { file = value; }
        public String getSha256() { return sha256; }
        public void setSha256(String value) { sha256 = value; }
    }
    public record Profile(int schemaVersion, String profileId, String revision, UUID dentistUserId,
            boolean approved, String templateSha256, String displayNameFr, String displayNameAr,
            String professionalTitleFr, String professionalTitleAr, String qualificationsFr, String qualificationsAr,
            String addressFr, String addressAr, List<String> phones, String inpe) implements StrictInput {
        public Profile { if (phones != null) phones = List.copyOf(phones); }
        @Override public String toString() { return "Practitioner profile [withheld]"; }
    }
    private final Profile profile;
    public PractitionerProfiles(Settings settings, JsonMapper json) {
        Profile loaded = null;
        try {
            if (settings.getFile() != null && settings.getFile().isAbsolute() && settings.getSha256() != null
                    && settings.getSha256().matches("[0-9a-f]{64}")) {
                byte[] bytes;
                try (var in = Files.newInputStream(settings.getFile())) { bytes = in.readNBytes(16385); }
                if (bytes.length > 16384 || !digest(bytes).equals(settings.getSha256())) throw new IllegalArgumentException();
                loaded = json.rebuild().enable(tools.jackson.core.StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                        .enable(tools.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build().readValue(bytes, Profile.class);
                if (loaded.schemaVersion() != 1 || !loaded.approved() || loaded.dentistUserId() == null
                        || !LocalPrescriptionRenderer.TEMPLATE.equals(loaded.templateSha256())) throw new IllegalArgumentException();
                for (String value : List.of(loaded.profileId(), loaded.revision(), loaded.displayNameFr(), loaded.displayNameAr(),
                        loaded.professionalTitleFr(), loaded.professionalTitleAr(), loaded.qualificationsFr(), loaded.qualificationsAr(), loaded.addressFr(), loaded.addressAr()))
                    if (value == null || value.isBlank() || value.length() > 1000 || value.indexOf('\0') >= 0) throw new IllegalArgumentException();
                if (loaded.phones() == null || loaded.phones().isEmpty() || loaded.phones().size() > 4
                        || loaded.phones().stream().anyMatch(p -> p == null || p.isBlank() || p.length() > 40)) throw new IllegalArgumentException();
                if (loaded.inpe() != null && (loaded.inpe().isBlank() || loaded.inpe().length() > 64)) throw new IllegalArgumentException();
            }
        } catch (Exception ignored) { loaded = null; } // Fail closed without logging content, paths or parsing diagnostics.
        profile = loaded;
    }
    public Profile require(UUID actor) {
        if (profile == null || !profile.dentistUserId().equals(actor)) throw new PrescriptionFailure(PrescriptionFailure.Reason.PRACTITIONER_UNAVAILABLE);
        return profile;
    }
    static String digest(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
}
