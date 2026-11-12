package ma.sijilmassa.insurance;

public final class InsurancePdfFailure extends RuntimeException {
    public enum Code {
        INSURANCE_PDF_NOT_FINALIZED(409),
        INSURANCE_PDF_FAR_UNAVAILABLE(409),
        INSURANCE_PDF_TEMPLATE_UNSUPPORTED(409),
        INSURANCE_PDF_LAYOUT_OVERFLOW(422),
        INSURANCE_PDF_UNSUPPORTED_TEXT(422),
        INSURANCE_PDF_INTEGRITY(500),
        INSURANCE_PDF_RENDER_FAILED(500),
        INSURANCE_PDF_BUSY(503);

        private final int status;
        Code(int status) { this.status = status; }
    }

    private final Code code;

    InsurancePdfFailure(Code code) {
        super("Le formulaire PDF n’a pas pu être préparé.");
        this.code = code;
    }

    public Code code() { return code; }
    public int status() { return code.status; }
}
