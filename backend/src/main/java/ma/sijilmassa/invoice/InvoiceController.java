package ma.sijilmassa.invoice;

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

import static ma.sijilmassa.common.api.ApiPaths.INVOICES;
import static ma.sijilmassa.invoice.InvoiceDtos.*;
import static ma.sijilmassa.invoice.InvoiceHttpInput.*;

@RestController
@PreAuthorize(RolePolicies.ADMINISTRATIVE)
public class InvoiceController {
    private static final CacheControl PRIVATE = CacheControl.noStore().cachePrivate();
    private final InvoiceService service;

    public InvoiceController(InvoiceService service) {
        this.service = service;
    }

    @PostMapping(value = INVOICES, consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Detail> create(@RequestParam MultiValueMap<String, String> parameters,
            @Valid @RequestBody CreateDraft input) {
        query(parameters);
        var result = detail(service.createDraft(input.patientId(), input.chargeIds()));
        var location = URI.create(INVOICES + "/" + result.invoiceId() + "?patientId=" + result.patientId());
        return ResponseEntity.created(location).cacheControl(PRIVATE).body(result);
    }

    @GetMapping(INVOICES + "/{invoiceId}")
    public ResponseEntity<Detail> get(@PathVariable String invoiceId, @RequestParam String patientId,
            @RequestParam MultiValueMap<String, String> parameters) {
        query(parameters, "patientId");
        return privateResponse(detail(service.get(uuid(patientId), uuid(invoiceId))));
    }

    @PutMapping(value = INVOICES + "/{invoiceId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Detail> edit(@PathVariable String invoiceId, @RequestParam String patientId,
            @RequestParam MultiValueMap<String, String> parameters, @Valid @RequestBody EditDraft input) {
        query(parameters, "patientId");
        return privateResponse(detail(service.replaceDraftCharges(uuid(patientId), uuid(invoiceId),
                input.expectedVersion(), input.chargeIds())));
    }

    @PostMapping(value = INVOICES + "/{invoiceId}/issue", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Detail> issue(@PathVariable String invoiceId, @RequestParam String patientId,
            @RequestParam MultiValueMap<String, String> parameters, @Valid @RequestBody Issue input) {
        query(parameters, "patientId");
        return privateResponse(detail(service.issue(uuid(patientId), uuid(invoiceId), input.expectedVersion())));
    }

    @GetMapping(ApiPaths.V1 + "/patients/{patientId}/invoices")
    public ResponseEntity<HistoryPage> history(@PathVariable String patientId, @RequestParam MultiValueMap<String, String> parameters) {
        query(parameters, "afterCreatedAt", "afterInvoiceId");
        return privateResponse(InvoiceDtos.history(service.history(uuid(patientId), historyCursor(parameters))));
    }

    @GetMapping(ApiPaths.V1 + "/patients/{patientId}/invoice-eligible-charges")
    public ResponseEntity<EligibleChargePage> eligibleCharges(@PathVariable String patientId,
            @RequestParam MultiValueMap<String, String> parameters) {
        query(parameters, "afterDate", "afterChargeId");
        return privateResponse(InvoiceDtos.eligibleCharges(service.eligibleCharges(uuid(patientId), chargeCursor(parameters))));
    }

    private static <T> ResponseEntity<T> privateResponse(T body) {
        return ResponseEntity.ok().cacheControl(PRIVATE).body(body);
    }
}
