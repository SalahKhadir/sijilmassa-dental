package ma.sijilmassa.invoice;

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
public class InvoicePdfController {
    private final InvoiceService invoices;
    private final InvoicePdfRenderer renderer;

    InvoicePdfController(InvoiceService invoices, InvoicePdfRenderer renderer) {
        this.invoices = invoices;
        this.renderer = renderer;
    }

    @GetMapping(ApiPaths.INVOICES + "/{invoiceId}/pdf")
    @PreAuthorize(RolePolicies.ADMINISTRATIVE)
    public ResponseEntity<byte[]> download(@PathVariable String invoiceId, @RequestParam String patientId,
            @RequestParam MultiValueMap<String, String> parameters) {
        InvoiceHttpInput.query(parameters, "patientId");
        var document = invoices.issuedDocument(InvoiceHttpInput.uuid(patientId), InvoiceHttpInput.uuid(invoiceId));
        byte[] pdf = renderer.render(document);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(document.filename()).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.APPLICATION_PDF).contentLength(pdf.length).body(pdf);
    }
}
