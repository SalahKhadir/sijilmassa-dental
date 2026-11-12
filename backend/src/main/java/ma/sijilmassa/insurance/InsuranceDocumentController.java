package ma.sijilmassa.insurance;

import java.net.URI;

import jakarta.validation.Valid;
import ma.sijilmassa.common.api.ApiPaths;
import ma.sijilmassa.security.RolePolicies;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

import static ma.sijilmassa.common.api.ApiPaths.INSURANCE_DOCUMENTS;
import static ma.sijilmassa.insurance.InsuranceDtos.*;
import static ma.sijilmassa.insurance.InsuranceHttpInput.*;

@RestController
@PreAuthorize(RolePolicies.CLINICAL)
public class InsuranceDocumentController {
    private static final CacheControl PRIVATE = CacheControl.noStore().cachePrivate();
    private final InsuranceDocumentService service;

    public InsuranceDocumentController(InsuranceDocumentService service) {
        this.service = service;
    }

    @PostMapping(value = INSURANCE_DOCUMENTS, consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Detail> create(@RequestParam MultiValueMap<String, String> parameters,
            @Valid @RequestBody CreateDraft input) {
        query(parameters);
        var result = detail(service.createDraft(input.command()));
        var location = URI.create(INSURANCE_DOCUMENTS + "/" + result.documentId() + "?patientId=" + result.patientId());
        return ResponseEntity.created(location).cacheControl(PRIVATE).body(result);
    }

    @GetMapping(INSURANCE_DOCUMENTS + "/{documentId}")
    public ResponseEntity<Detail> get(@PathVariable String documentId, @RequestParam MultiValueMap<String, String> parameters) {
        query(parameters, "patientId");
        return privateResponse(detail(service.get(uuid(parameters.getFirst("patientId")), uuid(documentId))));
    }

    @PutMapping(value = INSURANCE_DOCUMENTS + "/{documentId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Detail> edit(@PathVariable String documentId, @RequestParam MultiValueMap<String, String> parameters,
            @Valid @RequestBody EditDraft input) {
        query(parameters, "patientId");
        return privateResponse(detail(service.replaceDraft(uuid(parameters.getFirst("patientId")), uuid(documentId),
                input.expectedVersion(), input.draft().command())));
    }

    @PostMapping(value = INSURANCE_DOCUMENTS + "/{documentId}/finalize", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Detail> finalizeDraft(@PathVariable String documentId,
            @RequestParam MultiValueMap<String, String> parameters, @Valid @RequestBody FinalizeDraft input) {
        query(parameters, "patientId");
        return privateResponse(detail(service.finalizeDocument(uuid(parameters.getFirst("patientId")), uuid(documentId), input.command())));
    }

    @GetMapping(ApiPaths.V1 + "/patients/{patientId}/insurance-documents")
    public ResponseEntity<HistoryPage> history(@PathVariable String patientId, @RequestParam MultiValueMap<String, String> parameters) {
        query(parameters, "afterCreatedAt", "afterDocumentId");
        return privateResponse(InsuranceDtos.history(service.history(uuid(patientId), historyCursor(parameters))));
    }

    private static <T> ResponseEntity<T> privateResponse(T body) {
        return ResponseEntity.ok().cacheControl(PRIVATE).body(body);
    }
}
