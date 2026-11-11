package ma.sijilmassa.appointment;

import java.net.URI;
import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.validation.Valid;
import ma.sijilmassa.security.RolePolicies;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import static ma.sijilmassa.appointment.AppointmentDtos.*;

@RestController
@RequestMapping("/api/v1/appointments")
@PreAuthorize(RolePolicies.ADMINISTRATIVE)
public class AppointmentController {
    private final AppointmentService service;
    public AppointmentController(AppointmentService service) { this.service = service; }
    @GetMapping
    public ResponseEntity<CalendarPage> list(@RequestParam MultiValueMap<String,String> parameters,
            @RequestParam OffsetDateTime from, @RequestParam OffsetDateTime to, @RequestParam(required = false) UUID patientId,
            @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "50") int pageSize) {
        var allowed = java.util.Set.of("from","to","patientId","page","pageSize");
        if (parameters.entrySet().stream().anyMatch(e -> !allowed.contains(e.getKey()) || e.getValue().size() != 1)) throw new AppointmentFailure(400);
        return privateResponse(service.list(from,to,patientId,page,pageSize));
    }
    @GetMapping("/{id}") public ResponseEntity<Details> get(@PathVariable UUID id) { return privateResponse(service.get(id)); }
    @PostMapping public ResponseEntity<Details> create(@Valid @RequestBody Create input) {
        var result = service.create(input);
        return ResponseEntity.created(URI.create("/api/v1/appointments/"+result.id())).cacheControl(CacheControl.noStore().cachePrivate()).body(result);
    }
    @PutMapping("/{id}") public ResponseEntity<Details> update(@PathVariable UUID id, @Valid @RequestBody Update input) {
        return privateResponse(service.update(id,input));
    }
    @PutMapping("/{id}/status") public ResponseEntity<Details> status(@PathVariable UUID id, @Valid @RequestBody StatusUpdate input) {
        return privateResponse(service.status(id,input));
    }
    private <T> ResponseEntity<T> privateResponse(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(body); }
}
