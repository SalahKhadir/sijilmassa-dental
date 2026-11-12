package ma.sijilmassa.common.exception;

import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import ma.sijilmassa.common.api.ApiProblems;
import ma.sijilmassa.common.api.RequestIdFilter;
import ma.sijilmassa.finance.FinancialFailure;
import ma.sijilmassa.insurance.InsuranceFailure;
import ma.sijilmassa.insurance.InsurancePdfFailure;
import ma.sijilmassa.invoice.InvoiceFailure;
import ma.sijilmassa.invoice.InvoicePdfFailure;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.jspecify.annotations.Nullable;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {
    private final ApiProblems problems;

    public GlobalExceptionHandler(ApiProblems problems) {
        this.problems = problems;
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception exception, @Nullable Object body,
            HttpHeaders headers, HttpStatusCode status, WebRequest webRequest) {
        HttpServletRequest request = ((ServletWebRequest) webRequest).getRequest();
        ProblemDetail problem = problems.create(status.value(), request);
        if (exception instanceof MethodArgumentNotValidException validation) {
            // Field names are DTO metadata; never echo rejected values or interpolated messages.
            List<Map<String, String>> errors = validation.getBindingResult().getFieldErrors().stream()
                    .map(error -> Map.of("field", error.getField(), "message", "Valeur invalide."))
                    .distinct().toList();
            problem.setProperty("errors", errors);
        }
        HttpHeaders safeHeaders = new HttpHeaders();
        safeHeaders.putAll(headers);
        safeHeaders.setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        return new ResponseEntity<>(problem, safeHeaders, status);
    }

    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    public ResponseEntity<ProblemDetail> handleDenied(HttpServletRequest request) {
        return ResponseEntity.status(403).contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problems.create(403, request));
    }

    @ExceptionHandler(ma.sijilmassa.appointment.AppointmentFailure.class)
    public ResponseEntity<ProblemDetail> handleAppointment(ma.sijilmassa.appointment.AppointmentFailure failure, HttpServletRequest request) {
        return safe(failure.status(), request);
    }
    @ExceptionHandler(ma.sijilmassa.patient.dossier.DossierFailure.class)
    public ResponseEntity<ProblemDetail> handleDossier(ma.sijilmassa.patient.dossier.DossierFailure failure, HttpServletRequest request) {
        var problem = problems.create(failure.status(), request);
        problem.setProperty("code", failure.reason().name());
        return ResponseEntity.status(failure.status()).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }

    @ExceptionHandler(InvoicePdfFailure.class)
    public ResponseEntity<ProblemDetail> handleInvoicePdf(InvoicePdfFailure failure, HttpServletRequest request) {
        var problem = problems.create(failure.status(), request);
        problem.setProperty("code", failure.code().name());
        return ResponseEntity.status(failure.status()).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }

    @ExceptionHandler(ma.sijilmassa.patient.PatientFailure.class)
    public ResponseEntity<ProblemDetail> handlePatient(ma.sijilmassa.patient.PatientFailure failure, HttpServletRequest request) {
        return safe(failure.status(), request);
    }

    @ExceptionHandler(ma.sijilmassa.clinical.ClinicalFailure.class)
    public ResponseEntity<ProblemDetail> handleClinical(ma.sijilmassa.clinical.ClinicalFailure failure, HttpServletRequest request) {
        int status = switch (failure.reason()) {
            case PATIENT_NOT_FOUND, CONSULTATION_NOT_FOUND, TREATMENT_NOT_FOUND -> 404;
            case INVALID_INPUT, INVALID_TREATMENT, INVALID_APPOINTMENT -> 400;
            case ARCHIVED_PATIENT, INVALID_STATE, CONCURRENCY_CONFLICT, DUPLICATE_APPOINTMENT -> 409;
        };
        return safe(status, request);
    }

    @ExceptionHandler(FinancialFailure.class)
    public ResponseEntity<ProblemDetail> handleFinancial(FinancialFailure failure, HttpServletRequest request) {
        int status = switch (failure.reason()) {
            case INVALID_INPUT -> 400;
            case NOT_FOUND -> 404;
            case ARCHIVED_PATIENT, INELIGIBLE_TREATMENT, CONSULTATION_FINALIZED, DUPLICATE_CHARGE,
                    VERSION_CONFLICT, OVERPAYMENT, OPERATION_CONFLICT -> 409;
            case STORAGE_FAILURE -> 500;
        };
        var problem = problems.create(status, request);
        if (status == 409) problem.setProperty("code", failure.reason().name());
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }

    @ExceptionHandler(InvoiceFailure.class)
    public ResponseEntity<ProblemDetail> handleInvoice(InvoiceFailure failure, HttpServletRequest request) {
        int status = switch (failure.reason()) {
            case INVALID_INPUT, INVALID_SELECTION, INVALID_VERSION -> 400;
            case NOT_FOUND, CHARGE_NOT_FOUND -> 404;
            case ARCHIVED_PATIENT, CHARGE_RESERVED, VERSION_CONFLICT, INVOICE_ISSUED, EMPTY_DRAFT -> 409;
        };
        var problem = problems.create(status, request);
        if (status == 409) problem.setProperty("code", failure.reason().name());
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }

    @ExceptionHandler(InsurancePdfFailure.class)
    public ResponseEntity<ProblemDetail> handleInsurancePdf(InsurancePdfFailure failure, HttpServletRequest request) {
        var problem = problems.create(failure.status(), request);
        problem.setProperty("code", failure.code().name());
        return ResponseEntity.status(failure.status()).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }

    @ExceptionHandler(InsuranceFailure.class)
    public ResponseEntity<ProblemDetail> handleInsurance(InsuranceFailure failure, HttpServletRequest request) {
        int status = switch (failure.reason()) {
            case INVALID_INPUT, UNSUPPORTED_TEMPLATE, INVALID_TREATMENT, INVALID_CHARGE -> 400;
            case NOT_FOUND -> 404;
            case INVALID_CONSULTATION, ARCHIVED_PATIENT, VERSION_CONFLICT, READ_ONLY, INCOMPLETE_DOCUMENT -> 409;
            case STORAGE_FAILURE -> 500;
        };
        var problem = problems.create(status, request);
        problem.setProperty("code", failure.reason().name());
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }

    @ExceptionHandler(ma.sijilmassa.prescription.PrescriptionFailure.class)
    public ResponseEntity<ProblemDetail> handlePrescription(ma.sijilmassa.prescription.PrescriptionFailure failure, HttpServletRequest request) {
        var problem = problems.create(failure.status(), request);
        if (failure.status() != 404 && failure.status() != 413) problem.setProperty("code", failure.reason().name());
        return ResponseEntity.status(failure.status()).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }

    @ExceptionHandler(ma.sijilmassa.prescription.rendering.RenderingFailure.class)
    public ResponseEntity<ProblemDetail> handleRendering(ma.sijilmassa.prescription.rendering.RenderingFailure failure, HttpServletRequest request) {
        int status = switch (failure.code()) {
            case INVALID_INPUT, LAYOUT_OVERFLOW, UNSUPPORTED_CHARACTER -> 400;
            case INVALID_OUTPUT -> 500;
            default -> 503;
        };
        String code = switch (failure.code()) {
            case INVALID_INPUT -> "INVALID_INPUT";
            case LAYOUT_OVERFLOW -> "PDF_LAYOUT_OVERFLOW";
            case UNSUPPORTED_CHARACTER -> "PDF_UNSUPPORTED_CHARACTER";
            case INVALID_OUTPUT -> "DOCUMENT_UNAVAILABLE";
            default -> "RENDERER_UNAVAILABLE";
        };
        var problem = problems.create(status, request); problem.setProperty("code", code);
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }

    @ExceptionHandler({org.springframework.orm.ObjectOptimisticLockingFailureException.class,
            org.springframework.dao.DataIntegrityViolationException.class,
            org.springframework.dao.PessimisticLockingFailureException.class})
    public ResponseEntity<ProblemDetail> handleConflict(HttpServletRequest request) { return safe(409, request); }

    @ExceptionHandler(jakarta.validation.ConstraintViolationException.class)
    public ResponseEntity<ProblemDetail> handleInvalid(HttpServletRequest request) { return safe(400, request); }

    private ResponseEntity<ProblemDetail> safe(int status, HttpServletRequest request) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problems.create(status, request));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleUnexpected(Exception exception, HttpServletRequest request) {
        logger.error("Erreur interne, requestId=" + RequestIdFilter.requestId(request));
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problems.create(500, request));
    }
}
