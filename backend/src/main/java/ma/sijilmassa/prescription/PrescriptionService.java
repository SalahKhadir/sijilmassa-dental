package ma.sijilmassa.prescription;

import java.time.Clock;
import java.time.Instant;
import java.util.*;
import jakarta.persistence.EntityManager;
import ma.sijilmassa.audit.*;
import ma.sijilmassa.clinical.ConsultationRepository;
import ma.sijilmassa.patient.*;
import ma.sijilmassa.security.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static ma.sijilmassa.prescription.PrescriptionDtos.*;
import static ma.sijilmassa.prescription.PrescriptionFailure.Reason.*;
import static ma.sijilmassa.prescription.PrescriptionValidation.*;

@Service
@PreAuthorize(RolePolicies.CLINICAL)
@Transactional(readOnly = true)
public class PrescriptionService {
    private final PrescriptionRepository prescriptions;
    private final PrescriptionLineRepository lines;
    private final PatientRepository patients;
    private final ConsultationRepository consultations;
    private final SecurityAudit audit;
    private final EntityManager em;
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final PrescriptionDocumentRepository documents;

    public PrescriptionService(PrescriptionRepository prescriptions, PrescriptionLineRepository lines,
            PatientRepository patients, ConsultationRepository consultations, SecurityAudit audit,
            EntityManager em, JdbcTemplate jdbc, Clock clock, PrescriptionDocumentRepository documents) {
        this.documents = documents;
        this.prescriptions = prescriptions; this.lines = lines; this.patients = patients;
        this.consultations = consultations; this.audit = audit; this.em = em; this.jdbc = jdbc; this.clock = clock;
    }

    @Transactional
    public Details create(UUID patientId, DraftContent content) {
        UUID actor = actor();
        content(content); activePatient(patientId); consultation(patientId, content.consultationId());
        if (content.medications().stream().anyMatch(l -> l.id() != null)) throw invalid();
        var prescription = new Prescription(patientId, actor, clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MICROS));
        apply(prescription, content);
        prescriptions.save(prescription);
        em.flush(); // Parent exists before child inserts; no cascades.
        replaceLines(prescription, content.medications());
        em.flush();
        audit.recordPrescription(AuditEventType.PRESCRIPTION_CREATED, actor, prescription.id);
        em.flush();
        return details(prescription);
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ, readOnly = true)
    public Details get(UUID patientId, UUID id) {
        patient(patientId);
        return details(prescriptions.findByIdAndPatientId(id, patientId).orElseThrow(() -> new PrescriptionFailure(NOT_FOUND)));
    }

    @Transactional
    public Details update(UUID patientId, UUID id, Long version, DraftContent content) {
        content(content);
        var p = editable(patientId, id, version);
        consultation(patientId, content.consultationId());
        replaceLines(p, content.medications());
        apply(p, content);
        return finish(p, AuditEventType.PRESCRIPTION_DRAFT_UPDATED);
    }

    @Transactional
    public Details archive(UUID patientId, UUID id, Long version) {
        var p = editable(patientId, id, version);
        p.archivedAt = advance(p.updatedAt); p.archivedBy = actor();
        return finish(p, AuditEventType.PRESCRIPTION_ARCHIVED);
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ, readOnly = true)
    public HistoryPage history(UUID patientId, String status, String archive, UUID consultationId, Cursor before) {
        patient(patientId);
        if (status != null && !Set.of("BROUILLON", "FINALISEE").contains(status)) throw invalid();
        if (archive == null || !Set.of("active", "archived", "all").contains(archive)) throw invalid();
        if (before != null && (!date(before.date()) || before.id() == null)) throw invalid();
        consultation(patientId, consultationId);
        var sql = new StringBuilder("SELECT id,issued_date,status,version,consultation_id,finalized_at,archived_at FROM prescription WHERE patient_id=?");
        List<Object> args = new ArrayList<>(); args.add(patientId);
        if (status != null) { sql.append(" AND status=?"); args.add(status); }
        if (!archive.equals("all")) sql.append(archive.equals("archived") ? " AND archived_at IS NOT NULL" : " AND archived_at IS NULL");
        if (consultationId != null) { sql.append(" AND consultation_id=?"); args.add(consultationId); }
        if (before != null) { sql.append(" AND (issued_date,id)<(?,?)"); args.add(before.date()); args.add(before.id()); }
        sql.append(" ORDER BY issued_date DESC,id DESC LIMIT 50");
        var items = jdbc.query(sql.toString(), (rs, row) -> new Summary(rs.getObject("id", UUID.class),
                rs.getObject("issued_date", java.time.LocalDate.class), Prescription.Status.valueOf(rs.getString("status")),
                rs.getLong("version"), rs.getObject("consultation_id", UUID.class),
                rs.getTimestamp("finalized_at") == null ? null : rs.getTimestamp("finalized_at").toInstant(),
                rs.getTimestamp("archived_at") == null ? null : rs.getTimestamp("archived_at").toInstant()), args.toArray());
        var last = items.isEmpty() ? null : items.getLast();
        return new HistoryPage(items, items.size() == 50 ? new Cursor(last.issuedDate(), last.id()) : null);
    }

    private Prescription editable(UUID patientId, UUID id, Long expectedVersion) {
        version(expectedVersion);
        var patient = lockedPatient(patientId);
        var p = prescriptions.lockForUpdate(id, patientId).orElseThrow(() -> new PrescriptionFailure(NOT_FOUND));
        if (!patient.isActive()) throw new PrescriptionFailure(READ_ONLY);
        if (!Objects.equals(p.version, expectedVersion)) throw new PrescriptionFailure(VERSION_CONFLICT);
        if (p.status != Prescription.Status.BROUILLON || p.archivedAt != null || p.version == MAX_VERSION) throw new PrescriptionFailure(READ_ONLY);
        return p;
    }
    private void activePatient(UUID id) {
        if (!lockedPatient(id).isActive()) throw new PrescriptionFailure(READ_ONLY);
    }
    private Patient lockedPatient(UUID id) {
        if (id == null) throw new PrescriptionFailure(NOT_FOUND);
        return patients.lockForMedicalUpdate(id).orElseThrow(() -> new PrescriptionFailure(NOT_FOUND));
    }
    private PatientRepository.PrescriptionIdentity patient(UUID id) {
        if (id == null) throw new PrescriptionFailure(NOT_FOUND);
        return patients.prescriptionIdentity(id).orElseThrow(() -> new PrescriptionFailure(NOT_FOUND));
    }
    private void consultation(UUID patientId, UUID id) {
        if (id != null && !consultations.existsByIdAndPatient_Id(id, patientId)) throw invalid();
    }
    private void replaceLines(Prescription p, List<LineInput> input) {
        var current = lines.findByPrescriptionIdOrderByPosition(p.id);
        Map<UUID, PrescriptionLine> owned = new HashMap<>(); current.forEach(l -> owned.put(l.id, l));
        Set<UUID> retained = new HashSet<>();
        for (var l : input) if (l.id() != null && (!owned.containsKey(l.id()) || !retained.add(l.id()))) throw invalid();
        for (var l : current) if (!retained.contains(l.id)) lines.delete(l);
        for (int i = 0; i < input.size(); i++) {
            var c = input.get(i); var l = c.id() == null ? new PrescriptionLine(p.id) : owned.get(c.id());
            l.position = i; l.medicationName = text(c.medicationName(), 200); l.dosage = text(c.dosage(), 300);
            l.frequency = text(c.frequency(), 200); l.duration = text(c.duration(), 200); l.instructions = text(c.instructions(), 1500);
            lines.save(l);
        }
    }
    private void apply(Prescription p, DraftContent c) {
        p.consultationId = c.consultationId(); p.issuedDate = c.issuedDate(); p.generalInstructions = text(c.generalInstructions(), 2000);
    }
    private Details finish(Prescription p, AuditEventType type) {
        p.updatedBy = actor(); p.updatedAt = advance(p.updatedAt);
        em.flush(); audit.recordPrescription(type, p.updatedBy, p.id); em.flush();
        return details(p);
    }
    private Details details(Prescription p) {
        var identity = patient(p.patientId);
        var display = new PatientDisplay(identity.getId(), identity.getReference(), identity.getFirstName(), identity.getLastName(),
                identity.getFirstName() + " " + identity.getLastName(), identity.getVersion(),
                identity.getStatus() == PatientValues.Status.ACTIVE ? "active" : "inactive");
        var content = new StoredContent(p.consultationId, p.issuedDate, lines.findByPrescriptionIdOrderByPosition(p.id).stream()
                .map(l -> new Line(l.id, l.medicationName, l.dosage, l.frequency, l.duration, l.instructions)).toList(), p.generalInstructions);
        Document document = null;
        if (p.status == Prescription.Status.FINALISEE) {
            var stored = documents.metadata(p.patientId, p.id); var snapshot = stored.snapshot(); var patient = snapshot.patient();
            document = new Document(snapshot.schemaVersion(), snapshot.capturedAt(),
                    new SnapshotPatient(patient.firstName(), patient.lastName(), patient.displayName(), patient.reference()),
                    snapshot.practitioner().displayNameFr(), snapshot.generation().templateId(), snapshot.generation().templateSha256(),
                    snapshot.generation().rendererId(), stored.sha256(), stored.bytes());
        }
        return new Details(p.id, p.patientId, p.version, p.status, content, display, p.createdAt, p.updatedAt, p.finalizedAt, p.archivedAt, document);
    }
    private Instant advance(Instant previous) {
        var now = clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        return now.isAfter(previous) ? now : previous.plusNanos(1000);
    }
    private UUID actor() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof AccountPrincipal principal) || principal.role() != Role.DENTIST)
            throw new AccessDeniedException("Accès refusé.");
        return principal.id();
    }
}
