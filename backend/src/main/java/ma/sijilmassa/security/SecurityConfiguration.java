package ma.sijilmassa.security;

import java.util.List;
import jakarta.servlet.DispatcherType;
import ma.sijilmassa.audit.SecurityAudit;
import ma.sijilmassa.common.api.ApiPaths;
import ma.sijilmassa.common.api.ApiProblems;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.session.CompositeSessionAuthenticationStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;

@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class SecurityConfiguration {
    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    HttpSessionCsrfTokenRepository csrfTokenRepository() {
        return new HttpSessionCsrfTokenRepository();
    }

    @Bean
    SessionAuthenticationStrategy loginSessionStrategy(HttpSessionCsrfTokenRepository csrf) {
        return new CompositeSessionAuthenticationStrategy(List.of(
                new ChangeSessionIdAuthenticationStrategy(), new CsrfAuthenticationStrategy(csrf)));
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, ApiProblems problems,
            SecurityContextRepository contexts, HttpSessionCsrfTokenRepository csrf,
            UserAccountRepository users, SecurityAudit audit) throws Exception {
        return http
                .authorizeHttpRequests(authorize -> authorize
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers(HttpMethod.GET, "/actuator/health", ApiPaths.V1 + "/auth/csrf").permitAll()
                        .requestMatchers(HttpMethod.HEAD, "/actuator/health").permitAll()
                        .requestMatchers(HttpMethod.POST, ApiPaths.V1 + "/auth/login").permitAll()
                        .requestMatchers(HttpMethod.GET, ApiPaths.V1 + "/auth/me").authenticated()
                        .requestMatchers(HttpMethod.POST, ApiPaths.V1 + "/auth/logout").authenticated()
                        .requestMatchers(HttpMethod.POST, ApiPaths.V1 + "/patients/with-medical-record").hasRole("DENTIST")
                        .requestMatchers(HttpMethod.GET, ApiPaths.V1 + "/patients/*/medical-record").hasRole("DENTIST")
                        .requestMatchers(HttpMethod.PUT, ApiPaths.V1 + "/patients/*/medical-record").hasRole("DENTIST")
                        .requestMatchers(HttpMethod.GET, ApiPaths.V1 + "/patients", ApiPaths.V1 + "/patients/*").hasAnyRole("DENTIST", "RECEPTIONIST")
                        .requestMatchers(HttpMethod.POST, ApiPaths.V1 + "/patients").hasAnyRole("DENTIST", "RECEPTIONIST")
                        .requestMatchers(HttpMethod.PUT, ApiPaths.V1 + "/patients/*").hasAnyRole("DENTIST", "RECEPTIONIST")
                        .anyRequest().denyAll())
                .securityContext(context -> context.securityContextRepository(contexts).requireExplicitSave(true))
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .csrf(configuration -> configuration.csrfTokenRepository(csrf))
                .addFilterBefore(new SessionAccountFilter(users, audit, problems), AuthorizationFilter.class)
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, exception) -> problems.write(401, request, response))
                        .accessDeniedHandler((request, response, exception) -> problems.write(403, request, response)))
                .build();
    }
}
