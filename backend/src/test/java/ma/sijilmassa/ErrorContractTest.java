package ma.sijilmassa;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.RequestDispatcher;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import ma.sijilmassa.common.api.ApiPaths;
import ma.sijilmassa.common.api.ApiProblems;
import ma.sijilmassa.common.api.RequestIdFilter;
import ma.sijilmassa.common.exception.GlobalExceptionHandler;
import ma.sijilmassa.common.exception.SafeErrorController;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.*;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = ErrorContractTest.ProbeController.class,
        properties = "spring.autoconfigure.exclude=org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration")
@Import({ErrorContractTest.ProbeController.class, ErrorContractTest.ProbeSecurity.class,
        ApiProblems.class, RequestIdFilter.class, GlobalExceptionHandler.class, SafeErrorController.class})
class ErrorContractTest {
    @Autowired MockMvc mvc;

    // Test-only endpoints and allowlist: no production API is opened.
    @TestConfiguration(proxyBeanMethods = false)
    static class ProbeSecurity {
        @Bean
        SecurityFilterChain probeChain(HttpSecurity http) throws Exception {
            return http.authorizeHttpRequests(auth -> auth.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                    .requestMatchers(ApiPaths.V1 + "/_test/**")
                    .permitAll().anyRequest().denyAll()).build();
        }
    }

    @org.springframework.boot.test.context.TestComponent
    @RestController
    @RequestMapping(ApiPaths.V1 + "/_test")
    static class ProbeController {
        record Input(@NotBlank String name) { }

        @PostMapping("/validate")
        void validate(@Valid @RequestBody Input input) { }

        @GetMapping("/failure")
        void failure() {
            throw new IllegalStateException("jdbc:postgresql://private-host secret-patient");
        }
    }

    @Test
    void validationReturnsFieldNamesWithoutValues() throws Exception {
        mvc.perform(post(ApiPaths.V1 + "/_test/validate").with(csrf())
                        .contentType("application/json").content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.errors[0].field").value("name"))
                .andExpect(jsonPath("$.errors[0].message").value("Valeur invalide."))
                .andExpect(jsonPath("$.errors[0].rejectedValue").doesNotExist());
    }

    @Test
    void malformedJsonAndUnsupportedMethodsUseSameContract() throws Exception {
        mvc.perform(post(ApiPaths.V1 + "/_test/validate").with(csrf())
                        .contentType("application/json").content("secret-patient"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("secret-patient"))));
        mvc.perform(get(ApiPaths.V1 + "/_test/validate"))
                .andExpect(status().isMethodNotAllowed()).andExpect(jsonPath("$.status").value(405));
    }

    @Test
    void containerErrorDispatchIsSanitized() throws Exception {
        mvc.perform(get("/error").with(request -> {
                    request.setDispatcherType(DispatcherType.ERROR);
                    return request;
                })
                        .requestAttr(RequestDispatcher.ERROR_STATUS_CODE, 500)
                        .requestAttr(RequestDispatcher.ERROR_MESSAGE, "secret-patient"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.status").value(500))
                .andExpect(jsonPath("$.requestId").isNotEmpty())
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("secret-patient"))));
    }

    @Test
    void unexpectedFailureIsSanitizedAndCorrelated() throws Exception {
        mvc.perform(get(ApiPaths.V1 + "/_test/failure"))
                .andExpect(status().isInternalServerError())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.detail").value("Une erreur interne est survenue."))
                .andExpect(result -> org.assertj.core.api.Assertions.assertThat(result.getResponse().getContentAsString())
                        .contains(result.getResponse().getHeader(RequestIdFilter.HEADER))
                        .doesNotContain("private-host", "secret-patient", "IllegalStateException"));
    }
}
