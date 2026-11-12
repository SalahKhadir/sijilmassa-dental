package ma.sijilmassa.patient.dossier;

public final class DossierFailure extends RuntimeException {
    public enum Reason { INVALID_REQUEST, DOSSIER_LIMIT, UNSUPPORTED_TEXT, DOSSIER_RENDER_FAILED }
    private final Reason reason;

    DossierFailure(Reason reason) {
        super("Impossible de préparer le dossier PDF.");
        this.reason = reason;
    }

    public Reason reason() { return reason; }

    public int status() {
        return switch (reason) {
            case INVALID_REQUEST -> 400;
            case DOSSIER_LIMIT -> 413;
            case UNSUPPORTED_TEXT -> 422;
            case DOSSIER_RENDER_FAILED -> 500;
        };
    }
}
