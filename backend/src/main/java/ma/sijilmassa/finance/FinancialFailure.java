package ma.sijilmassa.finance;

/** No SQL, input value or clinical content is retained in domain failures. */
public final class FinancialFailure extends RuntimeException {
    public enum Reason { INVALID_INPUT, NOT_FOUND, ARCHIVED_PATIENT, INELIGIBLE_TREATMENT, CONSULTATION_FINALIZED,
        DUPLICATE_CHARGE, VERSION_CONFLICT, OVERPAYMENT, OPERATION_CONFLICT, STORAGE_FAILURE }
    private final Reason reason;
    public FinancialFailure(Reason reason) { super("L’opération financière n’a pas pu être confirmée."); this.reason = reason; }
    public Reason reason() { return reason; }
}
