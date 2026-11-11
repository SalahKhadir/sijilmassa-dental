package ma.sijilmassa.appointment;

import java.time.*;
import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import ma.sijilmassa.audit.*;
import ma.sijilmassa.patient.PatientRepository;
import ma.sijilmassa.security.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import static ma.sijilmassa.appointment.AppointmentDtos.*;

@Service
@Validated
@Transactional(readOnly = true)
public class AppointmentService {
    public static final ZoneId CLINIC_ZONE = ZoneId.of("Africa/Casablanca");
    private final AppointmentRepository appointments;
    private final PatientRepository patients;
    private final SecurityAudit audit;
    private final Clock clock;
    public AppointmentService(AppointmentRepository appointments, PatientRepository patients, SecurityAudit audit, Clock clock) {
        this.appointments = appointments; this.patients = patients; this.audit = audit; this.clock = clock;
    }
    @PreAuthorize(RolePolicies.ADMINISTRATIVE)
    public Details get(UUID id) { return existing(id).details(); }

    @PreAuthorize(RolePolicies.ADMINISTRATIVE)
    public CalendarPage list(OffsetDateTime from, OffsetDateTime to, UUID patientId, int page, int pageSize) {
        if (from == null || to == null || !from.isBefore(to) || Duration.between(from,to).compareTo(Duration.ofDays(43)) > 0
                || from.getYear() < 1 || to.getYear() > 9999 || page < 1 || page > 100000 || pageSize < 1 || pageSize > 100) {
            throw new AppointmentFailure(400);
        }
        var result = appointments.calendar(from.toInstant(), to.toInstant(), patientId, PageRequest.of(page - 1,pageSize));
        return new CalendarPage(result.getContent().stream().map(Appointment::details).toList(), result.getTotalElements(),
                page, pageSize, Math.max(1, (result.getTotalElements() + pageSize - 1) / pageSize));
    }
    @PreAuthorize(RolePolicies.ADMINISTRATIVE)
    @Transactional
    public Details create(@NotNull @Valid Create input) {
        validateTimes(input.startAt(), input.endAt());
        activePatient(input.patientId());
        available(input.startAt().toInstant(),input.endAt().toInstant(),null);
        Appointment appointment = appointments.saveAndFlush(new Appointment(input, clock.instant()));
        audit.recordAppointment(AuditEventType.APPOINTMENT_CREATED, actor(), appointment.id);
        return appointment.details();
    }
    @PreAuthorize(RolePolicies.ADMINISTRATIVE)
    @Transactional
    public Details update(UUID id, @NotNull @Valid Update input) {
        validateTimes(input.startAt(),input.endAt());
        Appointment appointment = existing(id);
        expected(appointment,input.version());
        if (appointment.status == Status.TERMINE) throw new AppointmentFailure(409);
        activePatient(input.patientId());
        if (appointment.status.occupiesSlot()) available(input.startAt().toInstant(),input.endAt().toInstant(),id);
        boolean rescheduled = !appointment.startAt.equals(input.startAt().toInstant()) || !appointment.endAt.equals(input.endAt().toInstant());
        appointment.patientId = input.patientId(); appointment.startAt = input.startAt().toInstant();
        appointment.endAt = input.endAt().toInstant(); appointment.type = input.type(); appointment.touch(clock.instant());
        appointments.flush();
        audit.recordAppointment(AuditEventType.APPOINTMENT_UPDATED,actor(),id);
        if (rescheduled) audit.recordAppointment(AuditEventType.APPOINTMENT_RESCHEDULED,actor(),id);
        return appointment.details();
    }
    @PreAuthorize(RolePolicies.ADMINISTRATIVE)
    @Transactional
    public Details status(UUID id, @NotNull @Valid StatusUpdate input) {
        if (input.status() == Status.TERMINE && !dentist()) throw new AccessDeniedException("Accès refusé.");
        Appointment appointment = existing(id);
        expected(appointment,input.version());
        if (appointment.status == input.status()) return appointment.details(); // version checked, no write/audit.
        if (appointment.status == Status.TERMINE) throw new AppointmentFailure(409);
        if (input.status().occupiesSlot()) {
            activePatient(appointment.patientId);
            available(appointment.startAt, appointment.endAt,id);
        }
        appointment.status = input.status(); appointment.touch(clock.instant());
        appointments.flush();
        audit.recordAppointment(input.status() == Status.ANNULE ? AuditEventType.APPOINTMENT_CANCELLED
                : AuditEventType.APPOINTMENT_STATUS_CHANGED,actor(),id);
        return appointment.details();
    }
    private void activePatient(UUID id) {
        // Share lock coordinates booking/reactivation/rescheduling with the patient's archive update.
        var patient = patients.lockForMedicalUpdate(id).orElseThrow(() -> new AppointmentFailure(404));
        if (!patient.isActive()) throw new AppointmentFailure(409);
    }
    private Appointment existing(UUID id) { return appointments.findById(id).orElseThrow(() -> new AppointmentFailure(404)); }
    private void expected(Appointment appointment, Long version) {
        if (!appointment.version.equals(version)) throw new AppointmentFailure(409);
    }
    private void available(Instant start,Instant end,UUID excluded) {
        if (appointments.overlaps(start,end,excluded)) throw new AppointmentFailure(409);
    }
    static void validateTimes(OffsetDateTime start,OffsetDateTime end) {
        if (start == null || end == null || start.getYear() < 1 || end.getYear() > 9999 || !start.isBefore(end)) throw new AppointmentFailure(400);
        Instant first = start.toInstant(), last = end.toInstant();
        long seconds = Duration.between(first,last).getSeconds();
        if (seconds < 1800 || seconds > 10800 || first.getNano() != 0 || last.getNano() != 0
                || first.getEpochSecond() % 60 != 0 || last.getEpochSecond() % 60 != 0) throw new AppointmentFailure(400);
        var localStart = first.atZone(CLINIC_ZONE); var localEnd = last.atZone(CLINIC_ZONE);
        if (localStart.getYear() < 1 || localEnd.getYear() > 9999 || !(localStart.toLocalDate().equals(localEnd.toLocalDate())
                || (localStart.toLocalDate().plusDays(1).equals(localEnd.toLocalDate()) && localEnd.toLocalTime().equals(LocalTime.MIDNIGHT)))) {
            throw new AppointmentFailure(400);
        }
    }
    private boolean dentist() {
        return SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_DENTIST"));
    }
    private UUID actor() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AccountPrincipal principal)) throw new AccessDeniedException("Accès refusé.");
        return principal.id();
    }
}
