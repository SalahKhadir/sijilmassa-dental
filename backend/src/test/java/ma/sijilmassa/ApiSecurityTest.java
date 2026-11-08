package ma.sijilmassa;

import ma.sijilmassa.common.api.ApiProblems;
import ma.sijilmassa.common.api.RequestIdFilter;
import ma.sijilmassa.security.SecurityConfiguration;
import ma.sijilmassa.security.UserAccountRepository;
import ma.sijilmassa.audit.SecurityAudit;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import ma.sijilmassa.common.exception.SafeErrorController;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = SafeErrorController.class, properties = "spring.autoconfigure.exclude=org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration")
@Import({SecurityConfiguration.class, ApiProblems.class, RequestIdFilter.class})
class ApiSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean UserAccountRepository users;
    @MockitoBean SecurityAudit audit;

    @Test
    void anonymousApiIsDeniedWithProblemDetails() throws Exception {
        mvc.perform(get("/api/v1/patients").header("X-Request-ID", "untrusted-patient-name"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.type").value("about:blank"))
                .andExpect(jsonPath("$.requestId").isNotEmpty())
                .andExpect(result -> {
                    String id = result.getResponse().getHeader(RequestIdFilter.HEADER);
                    org.assertj.core.api.Assertions.assertThat(id).isNotEqualTo("untrusted-patient-name");
                    org.assertj.core.api.Assertions.assertThat(result.getResponse().getContentAsString())
                            .contains(id).doesNotContain("untrusted-patient-name", "stackTrace", "exception");
                });
    }

    @Test
    @WithMockUser(roles = "DENTIST")
    void evenAuthenticatedUsersHaveNoApiAccess() throws Exception {
        mvc.perform(get("/api/v1/patients")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/patients").with(csrf())).andExpect(status().isForbidden());
    }

    @Test
    void csrfRemainsEnabled() throws Exception {
        mvc.perform(post("/api/v1/patients"))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    void infrastructureAndLoginAreNotPublic() throws Exception {
        for (String path : new String[]{"/actuator", "/actuator/env", "/actuator/configprops",
                "/actuator/heapdump", "/actuator/health/db", "/login", "/error", "/unknown"}) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
        }
        mvc.perform(options("/api/v1/patients").header("Origin", "https://example.invalid")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
}
