package ma.sijilmassa.prescription;

import java.io.IOException;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Includes authentication/CSRF errors without changing the security chain. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class PrescriptionPrivacyFilter extends OncePerRequestFilter {
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return !path.equals("/api/v1/prescriptions") && !path.startsWith("/api/v1/prescriptions/");
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Cache-Control", "private, no-store, max-age=0");
        response.addHeader("Vary", "Cookie");
        chain.doFilter(request, response);
    }
}
