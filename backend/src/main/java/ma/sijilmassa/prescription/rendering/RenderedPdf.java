package ma.sijilmassa.prescription.rendering;

public record RenderedPdf(byte[] bytes, String sha256, String rendererId, String templateSha256, String fontSha256) {
    public RenderedPdf { bytes = bytes.clone(); }
    @Override public byte[] bytes() { return bytes.clone(); }
    @Override public String toString() { return "Rendered PDF [bytes withheld]"; }
}
