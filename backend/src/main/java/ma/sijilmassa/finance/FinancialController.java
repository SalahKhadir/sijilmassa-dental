package ma.sijilmassa.finance;

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

import static ma.sijilmassa.finance.FinancialDtos.*;
import static ma.sijilmassa.finance.FinancialHttpInput.*;

@RestController
@RequestMapping(ApiPaths.FINANCIAL)
@PreAuthorize(RolePolicies.ADMINISTRATIVE)
public class FinancialController {
    private final TreatmentFinancialService service;

    public FinancialController(TreatmentFinancialService service) {
        this.service = service;
    }

    @PostMapping(value = "/charges", consumes = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize(RolePolicies.CLINICAL)
    public ResponseEntity<Charge> create(@RequestParam MultiValueMap<String, String> parameters,
            @Valid @RequestBody CreateCharge input) {
        query(parameters);
        var result = charge(service.createCharge(input.patientId(), input.consultationId(), input.treatmentId(),
                input.expectedConsultationVersion(), input.priceMinor()));
        var location = URI.create(ApiPaths.FINANCIAL + "/charges/" + result.chargeId() + "?patientId=" + input.patientId());
        return ResponseEntity.created(location).cacheControl(CacheControl.noStore().cachePrivate()).body(result);
    }

    @GetMapping("/consultations/{consultationId}/pricing")
    @PreAuthorize(RolePolicies.CLINICAL)
    public ResponseEntity<ConsultationPricing> pricing(@PathVariable String consultationId, @RequestParam String patientId,
            @RequestParam MultiValueMap<String, String> parameters) {
        query(parameters, "patientId");
        return privateResponse(consultationPricing(service.consultationPricing(uuid(patientId), uuid(consultationId))));
    }

    @GetMapping("/charges/{chargeId}")
    public ResponseEntity<Charge> get(@PathVariable String chargeId, @RequestParam String patientId,
            @RequestParam MultiValueMap<String, String> parameters) {
        query(parameters, "patientId");
        return privateResponse(charge(service.getCharge(uuid(patientId), uuid(chargeId))));
    }

    @GetMapping("/charges/{chargeId}/payments")
    public ResponseEntity<PaymentPage> history(@PathVariable String chargeId, @RequestParam String patientId,
            @RequestParam MultiValueMap<String, String> parameters) {
        query(parameters, "patientId", "afterPaidAt", "afterPaymentId");
        return privateResponse(payments(service.payments(uuid(patientId), uuid(chargeId), paymentCursor(parameters))));
    }

    @PostMapping(value = "/charges/{chargeId}/payments", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Receipt> record(@PathVariable String chargeId, @RequestParam String patientId,
            @RequestParam MultiValueMap<String, String> parameters, @Valid @RequestBody RecordPayment input) {
        query(parameters, "patientId");
        return privateResponse(receipt(service.recordPayment(uuid(patientId), uuid(chargeId),
                input.expectedChargeVersion(), input.command())));
    }

    @GetMapping("/patients/{patientId}/summary")
    public ResponseEntity<Summary> summary(@PathVariable String patientId, @RequestParam MultiValueMap<String, String> parameters) {
        query(parameters, "afterDate", "afterChargeId");
        return privateResponse(FinancialDtos.summary(service.summary(uuid(patientId), chargeCursor(parameters))));
    }

    @GetMapping("/patients/{patientId}/verso")
    public ResponseEntity<VersoPage> verso(@PathVariable String patientId, @RequestParam MultiValueMap<String, String> parameters) {
        query(parameters, "afterDate", "afterChargeId");
        return privateResponse(FinancialDtos.verso(service.summary(uuid(patientId), chargeCursor(parameters))));
    }

    private static <T> ResponseEntity<T> privateResponse(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(body);
    }
}
