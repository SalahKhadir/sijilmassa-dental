package ma.sijilmassa.insurance;

import ma.sijilmassa.security.RolePolicies;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static ma.sijilmassa.common.api.ApiPaths.INSURANCE_DOCUMENTS;
import static ma.sijilmassa.insurance.InsuranceHttpInput.query;
import static ma.sijilmassa.insurance.InsuranceHttpInput.uuid;

@RestController
@PreAuthorize(RolePolicies.CLINICAL)
public class InsurancePdfController {
    private final InsuranceDocumentService service;
    private final InsurancePdfRenderer renderer;

    InsurancePdfController(InsuranceDocumentService service, InsurancePdfRenderer renderer) {
        this.service = service;
        this.renderer = renderer;
    }

    @GetMapping(INSURANCE_DOCUMENTS + "/{documentId}/pdf")
    public ResponseEntity<byte[]> download(@PathVariable String documentId, @RequestParam MultiValueMap<String, String> parameters) {
        query(parameters, "patientId");
        var id = uuid(documentId);
        var snapshot = service.finalizedSnapshot(uuid(parameters.getFirst("patientId")), id);
        byte[] pdf = renderer.render(snapshot);
        String filename = "formulaire-assurance-" + id + ".pdf";
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(filename).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.APPLICATION_PDF).contentLength(pdf.length).body(pdf);
    }
}
