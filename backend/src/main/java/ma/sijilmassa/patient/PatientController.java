package ma.sijilmassa.patient;

import java.net.URI;
import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import ma.sijilmassa.common.api.ApiPaths;
import ma.sijilmassa.security.RolePolicies;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import ma.sijilmassa.patient.PatientDtos.*;

@RestController
@RequestMapping(ApiPaths.V1 + "/patients")
public class PatientController {
    private final PatientService service;
    public PatientController(PatientService service) { this.service = service; }

    @GetMapping
    @PreAuthorize(RolePolicies.ADMINISTRATIVE)
    public ResponseEntity<DirectoryPage> list(@RequestParam org.springframework.util.MultiValueMap<String, String> parameters,
            @RequestParam(defaultValue = "") @Size(max = 160) String q,
            @RequestParam(defaultValue = "active") String status, @RequestParam(defaultValue = "name") String sort,
            @RequestParam(defaultValue = "1") @Min(1) @Max(100000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(50) int pageSize) {
        var allowed = java.util.Set.of("q", "status", "sort", "page", "pageSize");
        if (parameters.entrySet().stream().anyMatch(entry -> !allowed.contains(entry.getKey()) || entry.getValue().size() != 1)) {
            throw new PatientFailure(400);
        }
        return privateResponse(service.list(q, status, sort, page, pageSize));
    }
    @GetMapping("/{id}")
    @PreAuthorize(RolePolicies.ADMINISTRATIVE)
    public ResponseEntity<AdministrativeDetails> get(@PathVariable UUID id) { return privateResponse(service.get(id)); }

    @PostMapping
    @PreAuthorize(RolePolicies.ADMINISTRATIVE)
    public ResponseEntity<AdministrativeDetails> create(@Valid @RequestBody AdministrativeCreate input) {
        var result = service.create(input);
        return ResponseEntity.created(URI.create(ApiPaths.V1 + "/patients/" + result.id()))
                .cacheControl(CacheControl.noStore().cachePrivate()).body(result);
    }
    @PutMapping("/{id}")
    @PreAuthorize(RolePolicies.ADMINISTRATIVE)
    public ResponseEntity<AdministrativeDetails> update(@PathVariable UUID id, @Valid @RequestBody AdministrativeUpdate input) {
        return privateResponse(service.update(id, input));
    }
    @PostMapping("/with-medical-record")
    @PreAuthorize(RolePolicies.CLINICAL)
    public ResponseEntity<ClinicalCreated> createClinical(@Valid @RequestBody ClinicalCreate input) {
        var result = service.createWithMedical(input);
        return ResponseEntity.created(URI.create(ApiPaths.V1 + "/patients/" + result.patient().id()))
                .cacheControl(CacheControl.noStore().cachePrivate()).body(result);
    }
    @GetMapping("/{id}/medical-record")
    @PreAuthorize(RolePolicies.CLINICAL)
    public ResponseEntity<MedicalDetails> medical(@PathVariable UUID id) { return privateResponse(service.getMedical(id)); }
    @PutMapping("/{id}/medical-record")
    @PreAuthorize(RolePolicies.CLINICAL)
    public ResponseEntity<MedicalDetails> updateMedical(@PathVariable UUID id, @Valid @RequestBody MedicalUpdate input) {
        return privateResponse(service.updateMedical(id, input));
    }
    private <T> ResponseEntity<T> privateResponse(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(body);
    }
}
