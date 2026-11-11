package ma.sijilmassa.prescription;

import java.net.URI;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;
import jakarta.validation.Valid;
import ma.sijilmassa.security.RolePolicies;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import static ma.sijilmassa.prescription.PrescriptionDtos.*;
import static ma.sijilmassa.prescription.PrescriptionValidation.*;

@RestController
@RequestMapping("/api/v1/prescriptions")
@PreAuthorize(RolePolicies.CLINICAL)
public class PrescriptionController {
    private final PrescriptionService service;
    private final PrescriptionFinalizationService finalization;
    private final PrescriptionPdfService pdfs;
    public PrescriptionController(PrescriptionService service, PrescriptionFinalizationService finalization, PrescriptionPdfService pdfs) {
        this.service = service; this.finalization = finalization; this.pdfs = pdfs;
    }
    @PostMapping
    public ResponseEntity<Details> create(@RequestParam MultiValueMap<String, String> query, @Valid @RequestBody Create input) {
        query(query, Set.of());
        var result = service.create(input.patientId(), input.content());
        return ResponseEntity.created(URI.create("/api/v1/prescriptions/" + result.id() + "?patientId=" + result.patientId()))
                .body(result);
    }
    @GetMapping
    public ResponseEntity<HistoryPage> history(@RequestParam MultiValueMap<String, String> query) {
        query(query, Set.of("patientId", "status", "archive", "consultationId", "beforeDate", "beforeId"));
        if (query.containsKey("beforeDate") != query.containsKey("beforeId")) throw invalid();
        Cursor cursor = null;
        if (query.containsKey("beforeDate")) {
            try {
                String date = query.getFirst("beforeDate");
                if (!date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw invalid();
                cursor = new Cursor(LocalDate.parse(date), uuid(query.getFirst("beforeId")));
            } catch (java.time.DateTimeException exception) { throw invalid(); }
        }
        return ResponseEntity.ok(service.history(uuid(query.getFirst("patientId")), query.getFirst("status"),
                query.containsKey("archive") ? query.getFirst("archive") : "active",
                query.containsKey("consultationId") ? uuid(query.getFirst("consultationId")) : null, cursor));
    }
    @GetMapping("/{id}")
    public ResponseEntity<Details> get(@PathVariable String id, @RequestParam MultiValueMap<String, String> query) {
        return ResponseEntity.ok(service.get(scope(query), uuid(id)));
    }
    @PutMapping("/{id}")
    public ResponseEntity<Details> update(@PathVariable String id, @RequestParam MultiValueMap<String, String> query,
            @Valid @RequestBody Update input) {
        return ResponseEntity.ok(service.update(scope(query), uuid(id), input.version(), input.content()));
    }
    @PutMapping("/{id}/archival")
    public ResponseEntity<Details> archive(@PathVariable String id, @RequestParam MultiValueMap<String, String> query,
            @Valid @RequestBody ExpectedVersion input) {
        return ResponseEntity.ok(service.archive(scope(query), uuid(id), input.version()));
    }
    @PutMapping("/{id}/finalization")
    public ResponseEntity<Details> finalizePrescription(@PathVariable String id, @RequestParam MultiValueMap<String, String> query,
            @Valid @RequestBody Finalize input) {
        return ResponseEntity.ok(finalization.finalizePrescription(scope(query), uuid(id), input.version(), input.patientVersion()));
    }
    @GetMapping("/{id}/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable String id, @RequestParam MultiValueMap<String, String> query) {
        query(query, Set.of("patientId", "version", "disposition"));
        String version = query.getFirst("version"), disposition = query.getFirst("disposition");
        if (version == null || !version.matches("0|[1-9][0-9]{0,15}")
                || (disposition != null && !Set.of("inline", "attachment").contains(disposition))) throw invalid();
        UUID documentId = uuid(id);
        var pdf = pdfs.get(uuid(query.getFirst("patientId")), documentId, Long.parseLong(version));
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).contentLength(pdf.size())
                .header(HttpHeaders.CONTENT_DISPOSITION, (disposition == null ? "inline" : disposition) + "; filename=\"ordonnance-" + documentId + ".pdf\"")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0").header("X-Content-Type-Options", "nosniff").body(pdf.bytes());
    }
    private static UUID scope(MultiValueMap<String, String> query) { query(query, Set.of("patientId")); return uuid(query.getFirst("patientId")); }
    private static void query(MultiValueMap<String, String> query, Set<String> allowed) {
        if (query.entrySet().stream().anyMatch(e -> !allowed.contains(e.getKey()) || e.getValue().size() != 1 || e.getValue().getFirst().isEmpty())) throw invalid();
    }
}
