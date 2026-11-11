package ma.sijilmassa.prescription;

import java.time.Instant;
import java.util.UUID;
import ma.sijilmassa.prescription.rendering.RenderingRequest;

/** Stable, explicit schema. Contains only the captured render inputs and approved provenance. */
public record PrescriptionSnapshot(int schemaVersion, RenderingRequest.Record prescription, RenderingRequest.Patient patient,
        PractitionerProfiles.Profile practitioner, Instant capturedAt, Instant finalizedAt, UUID finalizedBy, Generation generation) {
    public record Generation(String rendererId, String workerManifestSha256, String templateId, String templateSha256,
            String fontSha256, String pdfLibVersion, String fontkitVersion, String locale, String timeZone,
            String renderMode, int maxPdfBytes, double width, double height, double cropX, double cropY, int rotation) { }
    @Override public String toString() { return "Prescription snapshot [content withheld]"; }
}
