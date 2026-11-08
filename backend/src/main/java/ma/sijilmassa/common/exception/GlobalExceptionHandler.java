package ma.sijilmassa.common.exception;

import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import ma.sijilmassa.common.api.ApiProblems;
import ma.sijilmassa.common.api.RequestIdFilter;
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

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleUnexpected(Exception exception, HttpServletRequest request) {
        logger.error("Erreur interne, requestId=" + RequestIdFilter.requestId(request));
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problems.create(500, request));
    }
}
