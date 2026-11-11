package ma.sijilmassa.prescription.rendering;

import java.nio.file.Files;
import java.util.*;
import ma.sijilmassa.patient.*;
import ma.sijilmassa.prescription.*;
import ma.sijilmassa.security.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
@SpringBootTest(properties = "spring.flyway.locations=classpath:db/migration,classpath:db/testmigration")
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@ExtendWith(OutputCaptureExtension.class)
class PrescriptionRenderingIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) throws Exception {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl); r.add("spring.datasource.username", POSTGRES::getUsername); r.add("spring.datasource.password", POSTGRES::getPassword);
        r.add("prescription.rendering.enabled", () -> "true"); r.add("prescription.rendering.node-executable", () -> RenderingFixtures.node().toString());
        r.add("prescription.rendering.worker-directory", () -> RenderingFixtures.WORKER.toString()); r.add("prescription.rendering.modules-directory", () -> RenderingFixtures.MODULES.toString());
        String hash = LocalPrescriptionRenderer.digest(Files.readAllBytes(RenderingFixtures.WORKER.resolve("manifest.json")));
        r.add("prescription.rendering.manifest-sha256", () -> hash);
    }
    @Autowired AccountBootstrap bootstrap;
    @Autowired UserAccountRepository users;
    @Autowired PatientService patients;
    @Autowired PrescriptionService prescriptions;
    @Autowired PrescriptionRenderingService service;
    @Autowired JdbcTemplate jdbc;
    PrescriptionDtos.Details draft;
    static final String CANARY = "SYNTHETIC-RENDERING-PRIVATE-CONTENT";
    @BeforeEach void setup() {
        if (users.count() == 0) bootstrap.initialize("render.dentist", "Synthetic-Rendering-42", "render.reception", "Synthetic-Rendering-42");
        authenticate("render.dentist");
        var patient = patients.create(new PatientDtos.AdministrativeCreate(new PatientDtos.Identity("Patient", "Synthétique", PatientValues.Sex.UNANSWERED, null, "", "", "", "", "", ""), PatientValues.Status.ACTIVE));
        draft = prescriptions.create(patient.id(), new PrescriptionDtos.DraftContent(null, java.time.LocalDate.of(2026, 11, 10),
                List.of(new PrescriptionDtos.LineInput(null, "Produit fictif", "", "", "", "")), CANARY));
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    void authenticate(String username) {
        var account = users.findByUsername(username).orElseThrow();
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(account.principal(), null,
                List.of(new SimpleGrantedAuthority("ROLE_" + account.getRole().name()))));
    }
    Map<String, Object> snapshot() {
        return Map.of("prescription", jdbc.queryForMap("SELECT * FROM prescription WHERE id=?", draft.id()),
                "lines", jdbc.queryForList("SELECT * FROM prescription_line WHERE prescription_id=? ORDER BY position", draft.id()),
                "audit", jdbc.queryForList("SELECT * FROM security_audit_event WHERE target_prescription_id=? ORDER BY occurred_at,id", draft.id()));
    }
    @Test void successfulRealWorkerRenderingCannotMutatePersistenceOrEmitFinalizationAudit(CapturedOutput logs) {
        var before = snapshot();
        var result = service.renderDraft(draft.patientId(), draft.id(), draft.version(), draft.patient().version());
        assertThat(result.bytes().length).isGreaterThan(1000);
        assertThat(before.equals(snapshot())).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM prescription_document", Integer.class)).isZero();
        assertThat(logs.getAll()).doesNotContain(CANARY);
    }
    @Test void overflowAndUnsupportedArabicRemainSideEffectFree(CapturedOutput logs) {
        for (String value : List.of("دواء", "Instruction synthétique longue. ".repeat(50))) {
            draft = prescriptions.update(draft.patientId(), draft.id(), draft.version(), new PrescriptionDtos.DraftContent(null, draft.content().issuedDate(), List.of(), value));
            var before = snapshot();
            assertThatThrownBy(() -> service.renderDraft(draft.patientId(), draft.id(), draft.version(), draft.patient().version())).isInstanceOf(RenderingFailure.class);
            assertThat(before.equals(snapshot())).isTrue();
        }
        assertThat(logs.getAll()).doesNotContain(CANARY, "دواء", "Instruction synthétique longue.");
    }
    @Test void receptionistAndArchivedDraftAreDeniedByTheServiceWithoutMutation() {
        var before = snapshot(); authenticate("render.reception");
        assertThatThrownBy(() -> service.renderDraft(draft.patientId(), draft.id(), draft.version(), draft.patient().version())).isInstanceOf(AccessDeniedException.class);
        authenticate("render.dentist"); assertThat(before.equals(snapshot())).isTrue();
        draft = prescriptions.archive(draft.patientId(), draft.id(), draft.version()); before = snapshot();
        assertThatThrownBy(() -> service.renderDraft(draft.patientId(), draft.id(), draft.version(), draft.patient().version())).isInstanceOf(PrescriptionFailure.class);
        assertThat(before.equals(snapshot())).isTrue();
    }
    @Test void patientArchiveAndWrongPatientScopeCannotRender() {
        var current = patients.get(draft.patientId());
        patients.update(current.id(), new PatientDtos.AdministrativeUpdate(current.version(), current.identity(), PatientValues.Status.INACTIVE));
        var before = snapshot();
        assertThatThrownBy(() -> service.renderDraft(draft.patientId(), draft.id(), draft.version(), draft.patient().version())).isInstanceOf(PrescriptionFailure.class);
        assertThatThrownBy(() -> service.renderDraft(UUID.randomUUID(), draft.id(), draft.version(), draft.patient().version())).isInstanceOf(PrescriptionFailure.class);
        assertThat(before.equals(snapshot())).isTrue();
    }
}
