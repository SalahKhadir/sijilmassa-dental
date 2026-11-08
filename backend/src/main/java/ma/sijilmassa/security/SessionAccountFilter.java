package ma.sijilmassa.security;

import java.io.IOException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import ma.sijilmassa.audit.AuditEventType;
import ma.sijilmassa.audit.SecurityAudit;
import ma.sijilmassa.common.api.ApiProblems;
import org.springframework.dao.DataAccessException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.CookieClearingLogoutHandler;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.web.filter.OncePerRequestFilter;

/** Recheck persisted account state before any authorization decision. */
public class SessionAccountFilter extends OncePerRequestFilter {
    private final UserAccountRepository users;
    private final SecurityAudit audit;
    private final ApiProblems problems;

    public SessionAccountFilter(UserAccountRepository users, SecurityAudit audit, ApiProblems problems) {
        this.users = users;
        this.audit = audit;
        this.problems = problems;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws IOException, ServletException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AccountPrincipal principal) {
            try {
                UserAccount current = users.findById(principal.id()).orElse(null);
                if (current == null || !current.isActive() || current.getRole() != principal.role()
                        || current.getSessionVersion() != principal.sessionVersion()
                        || !current.getUsername().equals(principal.username())) {
                    try {
                        // Known account only; no stale foreign key if an operator removed it externally.
                        if (current != null) {
                            audit.record(current.isActive() ? AuditEventType.SESSION_REVOKED : AuditEventType.ACCOUNT_DISABLED,
                                    principal.id(), principal.id());
                        }
                    } finally {
                        new SecurityContextLogoutHandler().logout(request, response, authentication);
                        new CookieClearingLogoutHandler("JSESSIONID").logout(request, response, authentication);
                    }
                    problems.write(401, request, response);
                    return;
                }
            } catch (DataAccessException unavailable) {
                problems.write(503, request, response);
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
