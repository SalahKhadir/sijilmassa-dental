package ma.sijilmassa.invoice;

public final class InvoicePdfFailure extends RuntimeException {
    public enum Code {
        INVOICE_NOT_ISSUED(409),
        INVOICE_PDF_LAYOUT_OVERFLOW(422),
        INVOICE_PDF_UNSUPPORTED_TEXT(422),
        INVOICE_PDF_INTEGRITY(500),
        INVOICE_PDF_RENDER_FAILED(500),
        INVOICE_PDF_BUSY(503);

        private final int status;
        Code(int status) { this.status = status; }
    }

    private final Code code;

    InvoicePdfFailure(Code code) {
        super("Le PDF de la facture n’a pas pu être préparé.");
        this.code = code;
    }

    public Code code() { return code; }
    public int status() { return code.status; }
}
