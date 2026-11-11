package ma.sijilmassa.appointment;
public final class AppointmentFailure extends RuntimeException {
    private final int status;
    public AppointmentFailure(int status) { super("Opération de rendez-vous refusée."); this.status = status; }
    public int status() { return status; }
}
