package ma.sijilmassa.prescription.rendering;

/** Safe categories only: never retain a worker message, process command, or clinical input. */
public final class RenderingFailure extends RuntimeException {
    public enum Code { INVALID_INPUT, LAYOUT_OVERFLOW, UNSUPPORTED_CHARACTER, UNAVAILABLE, UNTRUSTED_WORKER, BUSY, TIMEOUT, INVALID_OUTPUT, PDF_TOO_LARGE }
    private final Code code;
    public RenderingFailure(Code code) { super("Le rendu de l’ordonnance ne peut pas être effectué."); this.code = code; }
    public Code code() { return code; }
}
