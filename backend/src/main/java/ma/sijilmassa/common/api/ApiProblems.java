package ma.sijilmassa.common.api;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
public class ApiProblems {
    private final JsonMapper mapper;

    public ApiProblems(JsonMapper mapper) {
        this.mapper = mapper;
    }

    public ProblemDetail create(int status, HttpServletRequest request) {
        HttpStatus knownStatus = HttpStatus.resolve(status);
        String title = knownStatus == null ? "Erreur HTTP" : knownStatus.getReasonPhrase();
        String detail = switch (status) {
            case 400 -> "La requête est invalide. Vérifiez les champs transmis.";
            case 401 -> "Authentification refusée ou session expirée.";
            case 403 -> "L’accès à cette ressource est refusé.";
            case 404 -> "La ressource demandée est introuvable.";
            case 405 -> "Cette méthode HTTP n’est pas autorisée.";
            case 409 -> "Le dossier a changé ou l’opération est en conflit. Rechargez-le avant de réessayer.";
            case 415 -> "Le format de la requête n’est pas pris en charge.";
            case 429 -> "Trop de tentatives. Réessayez dans une minute.";
            case 503 -> "Le service est temporairement indisponible.";
            default -> status >= 500 ? "Une erreur interne est survenue." : "La requête ne peut pas être traitée.";
        };
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(status), detail);
        problem.setType(URI.create("about:blank"));
        problem.setTitle(title);
        String id = RequestIdFilter.requestId(request);
        problem.setInstance(URI.create("urn:request:" + id));
        problem.setProperty("requestId", id);
        return problem;
    }

    public void write(int status, HttpServletRequest request, HttpServletResponse response) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        mapper.writeValue(response.getOutputStream(), create(status, request));
    }
}
