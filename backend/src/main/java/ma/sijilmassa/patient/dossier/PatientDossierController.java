package ma.sijilmassa.patient.dossier;

import java.util.UUID;
import java.util.regex.Pattern;

import ma.sijilmassa.common.api.ApiPaths;
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

@RestController
public class PatientDossierController {
    private static final Pattern ID = Pattern.compile("[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}");
    private final PatientDossierService service;

    public PatientDossierController(PatientDossierService service) {
        this.service = service;
    }

    @GetMapping(ApiPaths.V1 + "/patients/{patientId}/dossier.pdf")
    @PreAuthorize(RolePolicies.CLINICAL)
    public ResponseEntity<byte[]> download(@PathVariable String patientId,
            @RequestParam MultiValueMap<String, String> parameters) {
        if (!parameters.isEmpty() || !ID.matcher(patientId).matches()) {
            throw new DossierFailure(DossierFailure.Reason.INVALID_REQUEST);
        }
        UUID id = UUID.fromString(patientId);
        byte[] pdf = service.generate(id);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename("dossier-" + id + ".pdf").build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(pdf.length)
                .body(pdf);
    }
}
