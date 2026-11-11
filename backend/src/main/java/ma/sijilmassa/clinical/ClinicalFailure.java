package ma.sijilmassa.clinical;

/** Stable application categories; no HTTP mapping or clinical values in exceptions. */
public final class ClinicalFailure extends RuntimeException {
    public enum Reason {
        PATIENT_NOT_FOUND, CONSULTATION_NOT_FOUND, TREATMENT_NOT_FOUND, ARCHIVED_PATIENT, INVALID_STATE,
        INVALID_INPUT, INVALID_TREATMENT, CONCURRENCY_CONFLICT, INVALID_APPOINTMENT, DUPLICATE_APPOINTMENT
    }
    private final Reason reason;
    public ClinicalFailure(Reason reason) { super("Opération clinique refusée."); this.reason = reason; }
    public Reason reason() { return reason; }
}
