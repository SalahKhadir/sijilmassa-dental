package ma.sijilmassa.invoice;

/** Typed refusals without patient, charge or database payloads. */
public final class InvoiceFailure extends RuntimeException {
    public enum Reason {
        INVALID_INPUT, INVALID_SELECTION, INVALID_VERSION, NOT_FOUND, ARCHIVED_PATIENT,
        CHARGE_NOT_FOUND, CHARGE_RESERVED, VERSION_CONFLICT, INVOICE_ISSUED, EMPTY_DRAFT
    }

    private final Reason reason;

    InvoiceFailure(Reason reason) {
        super("L’opération sur la facture a été refusée.");
        this.reason = reason;
    }

    public Reason reason() { return reason; }
}
