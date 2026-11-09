package ma.sijilmassa.patient;

/** Status only: no patient values or medical details in exception messages. */
public class PatientFailure extends RuntimeException {
    private final int status;
    PatientFailure(int status) { super("Opération patient refusée."); this.status = status; }
    public int status() { return status; }
}
