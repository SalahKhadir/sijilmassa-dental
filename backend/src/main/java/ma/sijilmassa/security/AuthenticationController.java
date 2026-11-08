package ma.sijilmassa.security;

import java.io.IOException;
import java.util.List;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import ma.sijilmassa.audit.AuditEventType;
import ma.sijilmassa.audit.SecurityAudit;
import ma.sijilmassa.common.api.ApiPaths;
import ma.sijilmassa.common.api.ApiProblems;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.CookieClearingLogoutHandler;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@Profile("!bootstrap")
@RequestMapping(ApiPaths.V1 + "/auth")
public class AuthenticationController {
    public record LoginInput(@NotBlank @Size(max = 128) String identifier,
                             @NotBlank @Size(max = 72) String password) {
        @Override public String toString() { return "LoginInput[redacted]"; }
    }
    public record CsrfResponse(String headerName, String token) { }

    private final LocalAuthenticationService authentication;
    private final SecurityContextRepository contexts;
    private final SessionAuthenticationStrategy sessions;
    private final SecurityAudit audit;
    private final ApiProblems problems;

    public AuthenticationController(LocalAuthenticationService authentication, SecurityContextRepository contexts,
            SessionAuthenticationStrategy sessions, SecurityAudit audit, ApiProblems problems) {
        this.authentication = authentication;
        this.contexts = contexts;
        this.sessions = sessions;
        this.audit = audit;
        this.problems = problems;
    }

    @GetMapping("/csrf")
    public CsrfResponse csrf(CsrfToken csrf) {
        // Access materializes the deferred token and creates an anonymous session.
        return new CsrfResponse(csrf.getHeaderName(), csrf.getToken());
    }

    @PostMapping("/login")
    public AccountPrincipal.UserIdentity login(@Valid @RequestBody LoginInput input,
            HttpServletRequest request, HttpServletResponse response) throws IOException {
        var result = authentication.login(input.identifier(), input.password());
        if (result.principal() == null) {
            if (result.throttled()) { response.setHeader("Retry-After", "60"); }
            problems.write(result.throttled() ? 429 : 401, request, response);
            return null;
        }
        AccountPrincipal principal = result.principal();
        var token = UsernamePasswordAuthenticationToken.authenticated(principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + principal.role().name())));
        sessions.onAuthentication(token, request, response);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(token);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        return principal.identity();
    }

    @GetMapping("/me")
    public AccountPrincipal.UserIdentity me(Authentication authentication) {
        return ((AccountPrincipal) authentication.getPrincipal()).identity();
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(Authentication authentication, HttpServletRequest request, HttpServletResponse response) {
        AccountPrincipal principal = (AccountPrincipal) authentication.getPrincipal();
        try {
            audit.record(AuditEventType.LOGOUT, principal.id(), principal.id());
        } finally {
            new SecurityContextLogoutHandler().logout(request, response, authentication);
            new CookieClearingLogoutHandler("JSESSIONID").logout(request, response, authentication);
        }
    }
}
