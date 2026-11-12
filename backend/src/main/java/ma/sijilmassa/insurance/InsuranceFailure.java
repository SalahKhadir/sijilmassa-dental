package ma.sijilmassa.insurance;

public final class InsuranceFailure extends RuntimeException {
    public enum Reason {
        INVALID_INPUT, UNSUPPORTED_TEMPLATE, NOT_FOUND, ARCHIVED_PATIENT, INVALID_CONSULTATION,
        INVALID_TREATMENT, INVALID_CHARGE, VERSION_CONFLICT, READ_ONLY, INCOMPLETE_DOCUMENT, STORAGE_FAILURE
    }

    private final Reason reason;

    InsuranceFailure(Reason reason) {
        super("L’opération sur le document d’assurance n’a pas abouti.");
        this.reason = reason;
    }

    public Reason reason() { return reason; }
}
