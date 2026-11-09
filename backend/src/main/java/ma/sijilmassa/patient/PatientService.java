package ma.sijilmassa.patient;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Locale;
import java.util.UUID;
import jakarta.persistence.criteria.Predicate;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import ma.sijilmassa.audit.AuditEventType;
import ma.sijilmassa.audit.SecurityAudit;
import ma.sijilmassa.security.AccountPrincipal;
import ma.sijilmassa.security.RolePolicies;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import static ma.sijilmassa.patient.PatientValues.*;
import ma.sijilmassa.patient.PatientDtos.*;

@Service
@Validated
@Transactional(readOnly = true)
public class PatientService {
    private final PatientRepository patients;
    private final MedicalRecordRepository medicalRecords;
    private final JdbcTemplate jdbc;
    private final SecurityAudit audit;
    private final Clock clock;

    public PatientService(PatientRepository patients, MedicalRecordRepository medicalRecords,
            JdbcTemplate jdbc, SecurityAudit audit, Clock clock) {
        this.patients = patients; this.medicalRecords = medicalRecords;
        this.jdbc = jdbc; this.audit = audit; this.clock = clock;
    }

    @PreAuthorize(RolePolicies.ADMINISTRATIVE)
    @Transactional
    public AdministrativeDetails create(@NotNull @Valid AdministrativeCreate input) {
        return createRecords(input, MedicalContent.unanswered()).patient();
    }

    @PreAuthorize(RolePolicies.CLINICAL)
    @Transactional
    public ClinicalCreated createWithMedical(@NotNull @Valid ClinicalCreate input) {
        return createRecords(input.patient(), input.medicalRecord());
    }

    private ClinicalCreated createRecords(AdministrativeCreate input, MedicalContent medical) {
        validateBirthDate(input.identity());
        Long sequence = jdbc.queryForObject("SELECT nextval('patient_reference_seq')", Long.class);
        Patient patient = new Patient(String.format(Locale.ROOT, "PAT-%06d", sequence), input, clock.instant());
        patients.saveAndFlush(patient); // FK ordering is explicit; no schema generation.
        PatientMedicalRecord record = new PatientMedicalRecord(patient.id, medical, clock.instant());
        medicalRecords.saveAndFlush(record);
        audit.recordPatient(AuditEventType.PATIENT_CREATED, actor(), patient.id);
        return new ClinicalCreated(patient.details(), record.details());
    }

    @PreAuthorize(RolePolicies.ADMINISTRATIVE)
    public AdministrativeDetails get(UUID id) { return patient(id).details(); }

    @PreAuthorize(RolePolicies.ADMINISTRATIVE)
    public DirectoryPage list(String query, String status, String order, int page, int size) {
        if (query == null || query.length() > 160 || page < 1 || page > 100000 || size < 1 || size > 50
                || !java.util.Set.of("active", "inactive", "all").contains(status)) throw new PatientFailure(400);
        Sort sorting = switch (order) {
            case "name" -> Sort.by("lastName", "firstName", "id");
            case "newest" -> Sort.by(Sort.Order.desc("createdAt"), Sort.Order.asc("id"));
            case "oldest" -> Sort.by("createdAt", "id");
            default -> throw new PatientFailure(400);
        };
        String normalized = Patient.normalize(query);
        Specification<Patient> criteria = (root, ignored, builder) -> {
            var rules = new ArrayList<Predicate>();
            if (!status.equals("all")) rules.add(builder.equal(root.get("status"), Status.from(status)));
            if (!normalized.isEmpty()) {
                if (normalized.matches("[+0-9\\s().-]+") && normalized.matches(".*[0-9].*")) {
                    String digits = normalized.replaceAll("[^0-9]", "");
                    rules.add(builder.or(builder.like(root.get("gsmDigits"), "%" + digits + "%"),
                            builder.like(root.get("landlineDigits"), "%" + digits + "%")));
                } else {
                    for (String word : normalized.split(" ")) {
                        String pattern = "%" + word.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
                        rules.add(builder.or(builder.like(root.get("searchName"), pattern, '!'),
                                builder.like(builder.lower(root.get("reference")), pattern, '!'),
                                builder.like(root.get("gsmDigits"), pattern, '!'),
                                builder.like(root.get("landlineDigits"), pattern, '!')));
                    }
                }
            }
            return builder.and(rules.toArray(Predicate[]::new));
        };
        var result = patients.findAll(criteria, PageRequest.of(page - 1, size, sorting));
        return new DirectoryPage(result.getContent().stream().map(Patient::directoryEntry).toList(),
                result.getTotalElements(), page, size, Math.max(1L, (result.getTotalElements() + size - 1) / size));
    }

    @PreAuthorize(RolePolicies.ADMINISTRATIVE)
    @Transactional
    public AdministrativeDetails update(UUID id, @NotNull @Valid AdministrativeUpdate input) {
        validateBirthDate(input.identity());
        Patient patient = patient(id);
        if (!patient.version.equals(input.version())) throw new PatientFailure(409);
        Status old = patient.status;
        patient.update(input.identity(), input.status(), clock.instant());
        patients.flush(); // @Version also detects two writes that both read the same version.
        UUID actor = actor();
        audit.recordPatient(AuditEventType.PATIENT_ADMIN_UPDATED, actor, id);
        if (old != patient.status) audit.recordPatient(patient.status == Status.INACTIVE
                ? AuditEventType.PATIENT_ARCHIVED : AuditEventType.PATIENT_RESTORED, actor, id);
        return patient.details();
    }

    @PreAuthorize(RolePolicies.CLINICAL)
    public MedicalDetails getMedical(UUID id) {
        patient(id); // Consistent 404; never fabricate a missing clinical record.
        return medical(id).details();
    }

    @PreAuthorize(RolePolicies.CLINICAL)
    @Transactional
    public MedicalDetails updateMedical(UUID id, @NotNull @Valid MedicalUpdate input) {
        // A shared parent-row lock serializes this check with administrative archive writes.
        Patient patient = patients.lockForMedicalUpdate(id).orElseThrow(() -> new PatientFailure(404));
        if (patient.status != Status.ACTIVE) throw new PatientFailure(409);
        PatientMedicalRecord record = medical(id);
        if (!record.version.equals(input.version())) throw new PatientFailure(409);
        record.update(input.record(), clock.instant());
        medicalRecords.flush();
        audit.recordPatient(AuditEventType.PATIENT_MEDICAL_UPDATED, actor(), id);
        return record.details();
    }

    private Patient patient(UUID id) { return patients.findById(id).orElseThrow(() -> new PatientFailure(404)); }
    private PatientMedicalRecord medical(UUID id) {
        return medicalRecords.findById(id).orElseThrow(() -> new PatientFailure(404));
    }
    private void validateBirthDate(Identity identity) {
        LocalDate birth = identity.dateOfBirth();
        if (birth != null && (birth.getYear() < 1 || birth.getYear() > 9999
                || birth.isAfter(LocalDate.now(clock.withZone(ZoneId.of("Africa/Casablanca")))))) throw new PatientFailure(400);
    }
    private UUID actor() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AccountPrincipal principal)) {
            throw new AccessDeniedException("Accès refusé.");
        }
        return principal.id();
    }
}
