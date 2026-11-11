package ma.sijilmassa.prescription;

public class PrescriptionFailure extends RuntimeException {
    public enum Reason {
        INVALID_INPUT(400), NOT_FOUND(404), VERSION_CONFLICT(409), READ_ONLY(409), PAYLOAD_TOO_LARGE(413), INCOMPLETE_PRESCRIPTION(400), PRACTITIONER_UNAVAILABLE(503), DOCUMENT_UNAVAILABLE(500);
        final int status;
        Reason(int status) { this.status = status; }
    }
    private final Reason reason;
    public PrescriptionFailure(Reason reason) { super("Opération d’ordonnance refusée."); this.reason = reason; }
    public Reason reason() { return reason; }
    public int status() { return reason.status; }
}
