package ma.sijilmassa;

import jakarta.persistence.EntityManagerFactory;
import javax.sql.DataSource;
import ma.sijilmassa.testmodel.ValidationProbe;
import org.flywaydb.core.Flyway;
import org.hibernate.cfg.Configuration;
import org.hibernate.tool.schema.spi.SchemaManagementException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Testcontainers
@SpringBootTest(properties = "spring.flyway.locations=classpath:db/migration,classpath:db/testmigration")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PostgresFoundationTest {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired DataSource dataSource;
    @Autowired Flyway flyway;
    @Autowired EntityManagerFactory entityManagerFactory;
    @Autowired Environment environment;
    @Autowired MockMvc mvc;

    @Test
    void postgresMigrationsAndJpaValidationSucceed() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        assertThat(jdbc.queryForObject("select version()", String.class)).contains("PostgreSQL 17");
        assertThat(jdbc.queryForObject("show timezone", String.class)).isEqualTo("UTC");
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(flyway.info().applied()).extracting(info -> info.getVersion().getVersion()).contains("1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "900");
        assertThat(flyway.info().pending()).isEmpty();
        assertThat(entityManagerFactory.isOpen()).isTrue();
        assertThat(environment.getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");
        assertThat(jdbc.queryForObject("select count(*) from validation_probe", Integer.class)).isZero();
    }

    @Test
    void healthIsPublicButContainsNoDatabaseDetails() throws Exception {
        mvc.perform(get("/actuator/health"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.components").doesNotExist())
                .andExpect(jsonPath("$.details").doesNotExist());
        mvc.perform(get("/actuator/env")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/patients")).andExpect(status().isUnauthorized());
    }

    @Test
    void hibernateRejectsSchemaDriftWithoutRepairingIt() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("alter table validation_probe rename column marker to missing_marker");
        try {
            Configuration configuration = new Configuration().addAnnotatedClass(ValidationProbe.class);
            configuration.setProperty("hibernate.connection.url", POSTGRES.getJdbcUrl());
            configuration.setProperty("hibernate.connection.username", POSTGRES.getUsername());
            configuration.setProperty("hibernate.connection.password", POSTGRES.getPassword());
            configuration.setProperty("hibernate.hbm2ddl.auto", "validate");
            assertThatThrownBy(() -> {
                try (var factory = configuration.buildSessionFactory()) {
                    fail("Schema validation must fail on a missing column");
                }
            }).isInstanceOf(SchemaManagementException.class).hasMessageContaining("marker");
            assertThat(jdbc.queryForObject("select count(*) from information_schema.columns where table_name = 'validation_probe' and column_name = 'marker'", Integer.class)).isZero();
        } finally {
            jdbc.execute("alter table validation_probe rename column missing_marker to marker");
        }
    }
}
