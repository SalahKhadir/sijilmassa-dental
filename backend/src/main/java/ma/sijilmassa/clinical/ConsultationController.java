package ma.sijilmassa.clinical;

import java.net.URI;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;
import jakarta.validation.Valid;
import ma.sijilmassa.common.api.ApiPaths;
import ma.sijilmassa.security.RolePolicies;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import static ma.sijilmassa.clinical.ConsultationDtos.*;

@RestController
@RequestMapping(ApiPaths.V1 + "/consultations")
@PreAuthorize(RolePolicies.CLINICAL)
public class ConsultationController {
    private final ConsultationService service;
    public ConsultationController(ConsultationService service) { this.service = service; }

    @PostMapping
    public ResponseEntity<Details> create(@RequestParam MultiValueMap<String, String> parameters, @Valid @RequestBody Create input) {
        query(parameters, Set.of());
        var result = ConsultationDtos.response(service.create(input.patientId(), input.content().command()));
        return ResponseEntity.created(URI.create(ApiPaths.V1 + "/consultations/" + result.id() + "?patientId=" + result.patientId()))
                .cacheControl(CacheControl.noStore().cachePrivate()).body(result);
    }
    @GetMapping
    public ResponseEntity<HistoryPage> history(@RequestParam MultiValueMap<String, String> parameters, @RequestParam UUID patientId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate beforeDate,
            @RequestParam(required = false) UUID beforeId) {
        query(parameters, Set.of("patientId", "beforeDate", "beforeId"));
        return privateResponse(ConsultationDtos.response(service.history(patientId, cursor(beforeDate, beforeId,
                parameters.containsKey("beforeDate") || parameters.containsKey("beforeId")))));
    }
    @GetMapping("/{id}")
    public ResponseEntity<Details> get(@PathVariable UUID id, @RequestParam UUID patientId, @RequestParam MultiValueMap<String, String> parameters) {
        scope(parameters);
        return privateResponse(ConsultationDtos.response(service.get(patientId, id)));
    }
    @PutMapping("/{id}")
    public ResponseEntity<Details> update(@PathVariable UUID id, @RequestParam UUID patientId,
            @RequestParam MultiValueMap<String, String> parameters, @Valid @RequestBody Update input) {
        scope(parameters);
        return privateResponse(ConsultationDtos.response(service.update(patientId, id, input.version(), input.content().command())));
    }
    @PostMapping("/{id}/treatments")
    public ResponseEntity<Details> add(@PathVariable UUID id, @RequestParam UUID patientId,
            @RequestParam MultiValueMap<String, String> parameters, @Valid @RequestBody TreatmentMutation input) {
        scope(parameters);
        return privateResponse(ConsultationDtos.response(service.addTreatment(patientId, id, input.version(), input.content().command())));
    }
    @PutMapping("/{id}/treatments/{treatmentId}")
    public ResponseEntity<Details> edit(@PathVariable UUID id, @PathVariable UUID treatmentId, @RequestParam UUID patientId,
            @RequestParam MultiValueMap<String, String> parameters, @Valid @RequestBody TreatmentMutation input) {
        scope(parameters);
        return privateResponse(ConsultationDtos.response(service.editTreatment(patientId, id, treatmentId, input.version(), input.content().command())));
    }
    @PutMapping("/{id}/treatments/{treatmentId}/removal")
    public ResponseEntity<Details> remove(@PathVariable UUID id, @PathVariable UUID treatmentId, @RequestParam UUID patientId,
            @RequestParam MultiValueMap<String, String> parameters, @Valid @RequestBody ExpectedVersion input) {
        scope(parameters);
        return privateResponse(ConsultationDtos.response(service.removeTreatment(patientId, id, treatmentId, input.version())));
    }
    @PutMapping("/{id}/finalization")
    public ResponseEntity<Details> finalizeConsultation(@PathVariable UUID id, @RequestParam UUID patientId,
            @RequestParam MultiValueMap<String, String> parameters, @Valid @RequestBody ExpectedVersion input) {
        scope(parameters);
        return privateResponse(ConsultationDtos.response(service.finalizeConsultation(patientId, id, input.version())));
    }
    @GetMapping("/{id}/treatments/removed")
    public ResponseEntity<RemovedPage> removed(@PathVariable UUID id, @RequestParam UUID patientId,
            @RequestParam MultiValueMap<String, String> parameters,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate afterDate,
            @RequestParam(required = false) UUID afterId) {
        query(parameters, Set.of("patientId", "afterDate", "afterId"));
        return privateResponse(ConsultationDtos.removed(service.removedTreatments(patientId, id, cursor(afterDate, afterId,
                parameters.containsKey("afterDate") || parameters.containsKey("afterId")))));
    }
    private static ClinicalModels.Cursor cursor(LocalDate date, UUID id, boolean supplied) {
        if (!supplied) return null;
        if (date == null || id == null) throw new ClinicalFailure(ClinicalFailure.Reason.INVALID_INPUT);
        return new ClinicalModels.Cursor(date, id);
    }
    private static void scope(MultiValueMap<String, String> parameters) { query(parameters, Set.of("patientId")); }
    private static void query(MultiValueMap<String, String> parameters, Set<String> allowed) {
        if (parameters.entrySet().stream().anyMatch(e -> !allowed.contains(e.getKey()) || e.getValue().size() != 1))
            throw new ClinicalFailure(ClinicalFailure.Reason.INVALID_INPUT);
    }
    private static <T> ResponseEntity<T> privateResponse(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(body);
    }
}
