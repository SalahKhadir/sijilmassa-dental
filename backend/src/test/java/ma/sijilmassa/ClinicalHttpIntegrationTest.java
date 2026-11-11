package ma.sijilmassa;

import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import ma.sijilmassa.security.AccountBootstrap;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.system.*;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.flyway.locations=classpath:db/migration,classpath:db/testmigration", "server.servlet.session.cookie.secure=false"})
@Import(ClinicalHttpIntegrationTest.TimeConfiguration.class)
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@ExtendWith(OutputCaptureExtension.class)
class ClinicalHttpIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }
    static final String BASE = "/api/v1/consultations", PASSWORD = "Synthetic-Clinical-HTTP-42";
    static final String CANARY = "CONFIDENTIAL-SYNTHETIC-CLINICAL-HTTP-CANARY";
    @LocalServerPort int port;
    @Autowired JsonMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired AccountBootstrap bootstrap;
    @Autowired PatientIntegrationTest.MovingClock clock;
    Browser dentist, reception;
    JsonNode patient;

    @BeforeEach void setup() throws Exception {
        clock.advance(120);
        if (jdbc.queryForObject("SELECT count(*) FROM application_user", Integer.class) == 0)
            bootstrap.initialize("httpclinical.dentist", PASSWORD, "httpclinical.reception", PASSWORD);
        dentist = new Browser("httpclinical.dentist"); reception = new Browser("httpclinical.reception");
        ObjectNode identity = json.createObjectNode().put("firstName", "Clinique synthétique").put("lastName", "HTTP").put("sex", "unanswered").putNull("dateOfBirth");
        for (String field : List.of("address", "gsm", "landline", "profession", "cin", "medicalCoverage")) identity.put(field, "");
        ObjectNode input = json.createObjectNode().put("status", "active"); input.set("identity", identity);
        patient = expect(reception.send("POST", "/api/v1/patients", input, true), 201);
    }
    @AfterEach void close() { if (dentist != null) dentist.close(); if (reception != null) reception.close(); }
    ObjectNode content() {
        return json.createObjectNode().putNull("appointmentId").put("consultationDate", "2026-11-10")
                .put("chiefComplaint", "Motif synthétique").put("clinicalObservations", CANARY).put("assessment", "").put("treatmentPlan", "").put("notes", CANARY);
    }
    ObjectNode createInput() {
        ObjectNode input = json.createObjectNode().put("patientId", patient.get("id").asString()); input.set("content", content()); return input;
    }
    ObjectNode treatment() { return json.createObjectNode().put("treatmentDate", "2026-11-10").put("description", CANARY).put("toothReference", "16, 17").put("notes", CANARY); }
    ObjectNode mutation(JsonNode c, ObjectNode content) {
        ObjectNode input = version(c); input.set("content", content); return input;
    }
    ObjectNode version(JsonNode c) { return json.createObjectNode().put("version", c.get("version").asLong()); }
    String route(JsonNode c, String suffix) { return BASE + "/" + c.get("id").asString() + suffix + "?patientId=" + c.get("patientId").asString(); }
    JsonNode create() throws Exception { return expect(dentist.send("POST", BASE, createInput(), true), 201); }
    JsonNode add(JsonNode c) throws Exception { return expect(dentist.send("POST", route(c, "/treatments"), mutation(c, treatment()), true), 200); }
    JsonNode node(HttpResponse<String> response) { return json.readTree(response.body()); }
    JsonNode expect(HttpResponse<String> response, int status) {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(response.headers().firstValue("cache-control").orElseThrow()).contains("no-store");
        return node(response);
    }
    void problem(HttpResponse<String> response, int status) {
        JsonNode body = expect(response, status);
        assertThat(response.headers().firstValue("content-type").orElseThrow()).contains("application/problem+json");
        assertThat(body.get("status").asInt()).isEqualTo(status);
        assertThat(body.get("type").asString()).isEqualTo("about:blank");
        assertThat(body.get("instance").asString()).isEqualTo("urn:request:" + body.get("requestId").asString());
        assertThat(response.headers().firstValue("X-Request-ID").orElseThrow()).isEqualTo(body.get("requestId").asString());
        assertThat(response.body()).doesNotContain(CANARY, "clinical_consultation", "clinical_treatment", "Exception", "SELECT", "constraint", PASSWORD);
    }
    String history() { return BASE + "?patientId=" + patient.get("id").asString(); }
    int audit(JsonNode c) { return jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE target_consultation_id=?", Integer.class, UUID.fromString(c.get("id").asString())); }
    JsonNode appointment() throws Exception {
        var input = json.createObjectNode().put("patientId", patient.get("id").asString()).put("startAt", "2027-01-10T09:00Z").put("endAt", "2027-01-10T09:30Z").put("type", "CONSULTATION");
        // Each test uses a separate synthetic patient; nonblocking appointments avoid unrelated scheduling collisions.
        var a = expect(reception.send("POST", "/api/v1/appointments", input, true), 201);
        return expect(reception.send("PUT", "/api/v1/appointments/" + a.get("id").asString() + "/status", version(a).put("status", "ANNULE"), true), 200);
    }

    @Test void anonymousRequestsAreRejectedAcrossAllClinicalRoutes() throws Exception {
        var c = add(create());
        try (var anonymous = new Browser(null)) { deniedRoutes(anonymous, c, 401); }
    }
    @Test void receptionistCannotAccessDetailsHistoryOrAnyMutation() throws Exception { deniedRoutes(reception, add(create()), 403); }
    void deniedRoutes(Browser browser, JsonNode c, int status) throws Exception {
        String treatment = "/treatments/" + c.get("treatments").get(0).get("id").asString();
        for (String path : List.of(history(), route(c, ""), route(c, "/treatments/removed"))) problem(browser.get(path), status);
        problem(browser.send("POST", BASE, createInput(), true), status);
        problem(browser.send("PUT", route(c, ""), mutation(c, content()), true), status);
        problem(browser.send("POST", route(c, "/treatments"), mutation(c, treatment()), true), status);
        problem(browser.send("PUT", route(c, treatment), mutation(c, treatment()), true), status);
        problem(browser.send("PUT", route(c, treatment + "/removal"), version(c), true), status);
        problem(browser.send("PUT", route(c, "/finalization"), version(c), true), status);
        assertThat(expect(dentist.get(route(c, "")), 200).get("version").asLong()).isEqualTo(c.get("version").asLong());
    }

    @Test void dentistCreatesAndReloadsAnExplicitClinicalProjection() throws Exception {
        var response = dentist.send("POST", BASE, createInput(), true);
        var c = expect(response, 201);
        assertThat(response.headers().firstValue("location").orElseThrow()).isEqualTo(route(c, ""));
        assertThat(c.properties().stream().map(Map.Entry::getKey)).containsExactlyInAnyOrder("id", "patientId", "version", "status", "content", "treatments", "createdAt", "updatedAt");
        assertThat(c.get("status").asString()).isEqualTo("BROUILLON");
        assertThat(c.get("version").asLong()).isZero();
        assertThat(c.get("treatments").size()).isZero();
        assertThat(c.get("content").get("consultationDate").asString()).isEqualTo("2026-11-10");
        assertThat(expect(dentist.get(route(c, "")), 200)).isEqualTo(c);
        assertThat(response.body()).doesNotContain("Clinique synthétique", "medicalHistory", "password", "hibernate", "patient_medical_record");
    }

    @Test void draftUpdatePreservesOwnershipAndAdvancesParentVersion() throws Exception {
        var c = create();
        var updated = expect(dentist.send("PUT", route(c, ""), mutation(c, content().put("chiefComplaint", "Motif corrigé")), true), 200);
        assertThat(updated.get("version").asLong()).isEqualTo(1);
        assertThat(updated.get("createdAt")).isEqualTo(c.get("createdAt"));
        assertThat(updated.get("content").get("chiefComplaint").asString()).isEqualTo("Motif corrigé");
        problem(dentist.send("PUT", route(updated, ""), mutation(updated, content()).put("patientId", UUID.randomUUID().toString()), true), 400);
    }

    @Test void multipleTreatmentsAreCreatedAndModifiedWithStableIdsAndParentVersions() throws Exception {
        var first = add(create());
        var c = add(first);
        String id = first.get("treatments").get(0).get("id").asString();
        var changed = expect(dentist.send("PUT", route(c, "/treatments/" + id), mutation(c, treatment().put("description", "Soin corrigé")), true), 200);
        assertThat(changed.get("treatments").size()).isEqualTo(2);
        assertThat(changed.get("version").asLong()).isEqualTo(3);
        var edited = changed.get("treatments").valueStream().filter(t -> t.get("id").asString().equals(id)).findFirst().orElseThrow();
        assertThat(edited.get("version").asLong()).isEqualTo(1);
        assertThat(edited.get("content").get("description").asString()).isEqualTo("Soin corrigé");
        assertThat(audit(changed)).isEqualTo(4);
    }

    @Test void logicalRemovalExcludesActiveContentAndUsesAnExplicitHistoryRepresentation() throws Exception {
        var c = add(create()); String id = c.get("treatments").get(0).get("id").asString();
        var removed = expect(dentist.send("PUT", route(c, "/treatments/" + id + "/removal"), version(c), true), 200);
        assertThat(removed.get("treatments").size()).isZero();
        assertThat(expect(dentist.get(route(c, "")), 200).get("treatments").size()).isZero();
        var history = expect(dentist.get(route(c, "/treatments/removed")), 200);
        assertThat(history.get("items").size()).isEqualTo(1);
        assertThat(history.get("items").get(0).get("removedAt").isNull()).isFalse();
        assertThat(history.get("items").get(0).get("treatment").get("content").get("description").asString()).isEqualTo(CANARY);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM clinical_treatment WHERE id=? AND removed_at IS NOT NULL", Integer.class, UUID.fromString(id))).isEqualTo(1);
        problem(dentist.send("PUT", route(c, "/treatments/" + id), mutation(removed, treatment()), true), 409);
        problem(dentist.send("PUT", route(c, "/treatments/" + id + "/removal"), version(removed), true), 409);
    }

    @Test void finalizationAfterRemovalIncludesOnlyActiveTreatments() throws Exception {
        var c = add(create()); String id = c.get("treatments").get(0).get("id").asString();
        c = expect(dentist.send("PUT", route(c, "/treatments/" + id + "/removal"), version(c), true), 200);
        c = add(c);
        var done = expect(dentist.send("PUT", route(c, "/finalization"), version(c), true), 200);
        assertThat(done.get("status").asString()).isEqualTo("TERMINEE");
        assertThat(done.get("treatments").size()).isEqualTo(1);
        assertThat(expect(dentist.get(route(c, "/treatments/removed")), 200).get("items").size()).isEqualTo(1);
    }

    @Test void finalizedConsultationsAndTreatmentsCannotBeMutated() throws Exception {
        var c = add(create()); String treatment = "/treatments/" + c.get("treatments").get(0).get("id").asString();
        var done = expect(dentist.send("PUT", route(c, "/finalization"), version(c), true), 200);
        problem(dentist.send("PUT", route(c, ""), mutation(done, content()), true), 409);
        problem(dentist.send("POST", route(c, "/treatments"), mutation(done, treatment()), true), 409);
        problem(dentist.send("PUT", route(c, treatment), mutation(done, treatment()), true), 409);
        problem(dentist.send("PUT", route(c, treatment + "/removal"), version(done), true), 409);
        problem(dentist.send("PUT", route(c, "/finalization"), version(done), true), 409);
        assertThat(expect(dentist.get(route(c, "")), 200)).isEqualTo(done);
        assertThat(audit(c)).isEqualTo(3);
    }

    @Test void archivedPatientHistoryRemainsReadableWhileAllWritesConflict() throws Exception {
        var c = add(create()); String treatment = "/treatments/" + c.get("treatments").get(0).get("id").asString();
        var input = json.createObjectNode().put("version", patient.get("version").asLong()).put("status", "inactive"); input.set("identity", patient.get("identity"));
        expect(reception.send("PUT", "/api/v1/patients/" + patient.get("id").asString(), input, true), 200);
        problem(dentist.send("POST", BASE, createInput(), true), 409);
        problem(dentist.send("PUT", route(c, ""), mutation(c, content()), true), 409);
        problem(dentist.send("POST", route(c, "/treatments"), mutation(c, treatment()), true), 409);
        problem(dentist.send("PUT", route(c, treatment), mutation(c, treatment()), true), 409);
        problem(dentist.send("PUT", route(c, treatment + "/removal"), version(c), true), 409);
        problem(dentist.send("PUT", route(c, "/finalization"), version(c), true), 409);
        expect(dentist.get(route(c, "")), 200); expect(dentist.get(history()), 200); expect(dentist.get(route(c, "/treatments/removed")), 200);
    }

    @Test void crossPatientAppointmentsAreRejectedAndDuplicateAssociationsConflict() throws Exception {
        var a = appointment(); var input = createInput(); ((ObjectNode) input.get("content")).put("appointmentId", a.get("id").asString());
        var c = expect(dentist.send("POST", BASE, input, true), 201);
        problem(dentist.send("POST", BASE, input, true), 409);
        var otherIdentity = patient.get("identity").deepCopy(); var otherInput = json.createObjectNode().put("status", "active"); otherInput.set("identity", otherIdentity);
        var other = expect(reception.send("POST", "/api/v1/patients", otherInput, true), 201);
        problem(dentist.send("POST", BASE, input.deepCopy().put("patientId", other.get("id").asString()), true), 400);
        var bad = createInput(); ((ObjectNode) bad.get("content")).put("appointmentId", UUID.randomUUID().toString());
        problem(dentist.send("POST", BASE, bad, true), 400);
        assertThat(expect(reception.get("/api/v1/appointments/" + a.get("id").asString()), 200).get("status").asString()).isEqualTo("ANNULE");
        assertThat(audit(c)).isEqualTo(1);
    }

    @Test void missingPatientsConsultationsTreatmentsAndForeignPatientScopesReturn404() throws Exception {
        problem(dentist.send("POST", BASE, createInput().put("patientId", UUID.randomUUID().toString()), true), 404);
        var c = create();
        problem(dentist.get(BASE + "/" + UUID.randomUUID() + "?patientId=" + patient.get("id").asString()), 404);
        problem(dentist.get(history().replace(patient.get("id").asString(), UUID.randomUUID().toString())), 404);
        String missing = "/treatments/" + UUID.randomUUID();
        problem(dentist.send("PUT", route(c, missing), mutation(c, treatment()), true), 404);
        problem(dentist.send("PUT", route(c, missing + "/removal"), version(c), true), 404);
        var otherInput = json.createObjectNode().put("status", "active"); otherInput.set("identity", patient.get("identity"));
        var other = expect(reception.send("POST", "/api/v1/patients", otherInput, true), 201);
        problem(dentist.get(route(c, "").replace(patient.get("id").asString(), other.get("id").asString())), 404);
    }

    @Test void malformedIdentifiersAndUnsupportedMethodsAreRejected() throws Exception {
        var c = create();
        problem(dentist.get(BASE + "/not-a-uuid?patientId=" + patient.get("id").asString()), 400);
        problem(dentist.get(BASE + "/" + c.get("id").asString() + "?patientId=demo-patient"), 400);
        problem(dentist.send("POST", BASE, createInput().put("patientId", "demo-patient"), true), 400);
        problem(dentist.send("PUT", route(c, "/treatments/not-a-uuid"), mutation(c, treatment()), true), 400);
        problem(dentist.send("DELETE", route(c, ""), version(c), true), 403);
        problem(dentist.send("PATCH", route(c, ""), mutation(c, content()), true), 403);
        problem(dentist.send("POST", route(c, "/reopening"), version(c), true), 403);
    }

    @Test void invalidDraftBodiesAndUnknownFieldsHaveSafe400Responses() throws Exception {
        var inputs = new ArrayList<ObjectNode>();
        inputs.add(createInput().put("status", "TERMINEE")); inputs.add(createInput().putNull("patientId"));
        for (ObjectNode body : List.of(content().put("chiefComplaint", " "), content().put("chiefComplaint", "x".repeat(501)),
                content().put("notes", "x".repeat(5001)), content().putNull("clinicalObservations"),
                content().put("consultationDate", "2026-02-30"), content().put("consultationDate", "2026-11-10T10:00:00Z"),
                content().put("consultationDate", "0000-01-01"), content().put("unexpected", CANARY))) {
            ObjectNode input = createInput(); input.set("content", body); inputs.add(input);
        }
        for (ObjectNode input : inputs) problem(dentist.send("POST", BASE, input, true), 400);
        problem(dentist.raw("POST", BASE, "{\"patientId\":", dentist.csrf, "application/json"), 400);
        problem(dentist.raw("POST", BASE, CANARY, dentist.csrf, "text/plain"), 415);
        assertThat(expect(dentist.get(history()), 200).get("items").size()).isZero();
    }

    @Test void invalidTreatmentsAre400RatherThan404AndNeverPartiallyPersist() throws Exception {
        var c = create();
        for (ObjectNode body : List.of(treatment().put("description", " "), treatment().put("description", "x".repeat(1001)),
                treatment().put("notes", "x".repeat(2001)), treatment().put("toothReference", "<script>"),
                treatment().put("toothReference", "x".repeat(51)), treatment().put("treatmentDate", "2026-02-30"),
                treatment().put("description", "\0" + CANARY), treatment().put("removedAt", "2026-11-10T10:00Z")))
            problem(dentist.send("POST", route(c, "/treatments"), mutation(c, body), true), 400);
        assertThat(expect(dentist.get(route(c, "")), 200).get("treatments").size()).isZero();
        assertThat(audit(c)).isEqualTo(1);
    }

    @Test void expectedVersionsAreMandatoryNonnegativeIntegralAndWithinLongRange() throws Exception {
        var c = create();
        for (ObjectNode input : List.of(json.createObjectNode(), json.createObjectNode().putNull("version"),
                version(c).put("version", -1), version(c).put("version", 0.5))) {
            problem(dentist.send("PUT", route(c, "/finalization"), input, true), 400);
        }
        problem(dentist.raw("PUT", route(c, "/finalization"), "{\"version\":9223372036854775808}", dentist.csrf, "application/json"), 400);
        problem(dentist.send("PUT", route(c, ""), json.createObjectNode().set("content", content()), true), 400);
        problem(dentist.send("POST", route(c, "/treatments"), json.createObjectNode().set("content", treatment()), true), 400);
    }

    @Test void staleVersionsConflictForEveryMutationAndDoNotReplay() throws Exception {
        var c = add(create()); String treatment = "/treatments/" + c.get("treatments").get(0).get("id").asString();
        var current = expect(dentist.send("PUT", route(c, ""), mutation(c, content()), true), 200);
        problem(dentist.send("PUT", route(c, ""), mutation(c, content()), true), 409);
        problem(dentist.send("POST", route(c, "/treatments"), mutation(c, treatment()), true), 409);
        problem(dentist.send("PUT", route(c, treatment), mutation(c, treatment()), true), 409);
        problem(dentist.send("PUT", route(c, treatment + "/removal"), version(c), true), 409);
        problem(dentist.send("PUT", route(c, "/finalization"), version(c), true), 409);
        assertThat(expect(dentist.get(route(c, "")), 200)).isEqualTo(current);
        assertThat(audit(c)).isEqualTo(3);
    }

    @Test void simultaneousTreatmentRequestsHaveOneWinnerAtTheAggregateBoundary() throws Exception {
        var c = create();
        try (var otherDentist = new Browser("httpclinical.dentist")) {
            parallel(() -> dentist.send("POST", route(c, "/treatments"), mutation(c, treatment()), true),
                    () -> otherDentist.send("POST", route(c, "/treatments"), mutation(c, treatment()), true));
        }
        var current = expect(dentist.get(route(c, "")), 200);
        assertThat(current.get("version").asLong()).isEqualTo(1);
        assertThat(current.get("treatments").size()).isEqualTo(1);
        assertThat(audit(c)).isEqualTo(2);
    }

    @Test void finalizationAndTreatmentCreationCannotBothUseTheSameVersion() throws Exception {
        var c = create();
        try (var otherDentist = new Browser("httpclinical.dentist")) {
            parallel(() -> dentist.send("PUT", route(c, "/finalization"), version(c), true),
                    () -> otherDentist.send("POST", route(c, "/treatments"), mutation(c, treatment()), true));
        }
        var current = expect(dentist.get(route(c, "")), 200);
        assertThat(current.get("version").asLong()).isEqualTo(1);
        assertThat(current.get("treatments").size()).isEqualTo(current.get("status").asString().equals("TERMINEE") ? 0 : 1);
        assertThat(audit(c)).isEqualTo(2);
    }

    @Test void csrfIsRequiredForEveryMutationWhileReadsWorkWithoutIt() throws Exception {
        var c = add(create()); String treatment = "/treatments/" + c.get("treatments").get(0).get("id").asString();
        problem(dentist.send("POST", BASE, createInput(), false), 403);
        problem(dentist.send("PUT", route(c, ""), mutation(c, content()), false), 403);
        problem(dentist.send("POST", route(c, "/treatments"), mutation(c, treatment()), false), 403);
        problem(dentist.send("PUT", route(c, treatment), mutation(c, treatment()), false), 403);
        problem(dentist.send("PUT", route(c, treatment + "/removal"), version(c), false), 403);
        problem(dentist.send("PUT", route(c, "/finalization"), version(c), false), 403);
        problem(dentist.raw("PUT", route(c, "/finalization"), json.writeValueAsString(version(c)), "wrong-token", "application/json"), 403);
        expect(dentist.get(route(c, "")), 200);
        assertThat(audit(c)).isEqualTo(2);
    }

    @Test void historyUsesBoundedKeysetPagesAndRejectsUnboundedOrAmbiguousQueries() throws Exception {
        for (int i = 0; i < 53; i++) create();
        var first = expect(dentist.get(history()), 200);
        assertThat(first.get("items").size()).isEqualTo(50);
        var cursor = first.get("nextCursor");
        var next = expect(dentist.get(history() + "&beforeDate=" + cursor.get("date").asString() + "&beforeId=" + cursor.get("id").asString()), 200);
        assertThat(next.get("items").size()).isEqualTo(3);
        assertThat(next.get("nextCursor").isNull()).isTrue();
        Set<String> ids = new HashSet<>(); first.get("items").forEach(c -> assertThat(ids.add(c.get("id").asString())).isTrue());
        next.get("items").forEach(c -> assertThat(ids.add(c.get("id").asString())).isTrue());
        for (String query : List.of("&pageSize=0", "&pageSize=51", "&page=0", "&beforeDate=2026-11-10", "&beforeId=" + UUID.randomUUID(),
                "&beforeDate=bad&beforeId=" + UUID.randomUUID(), "&beforeDate=&beforeId=", "&patientId=" + patient.get("id").asString(), "&notes=" + CANARY))
            problem(dentist.get(history() + query), 400);
        problem(dentist.get(BASE), 400);
        assertThat(first.toString()).doesNotContain(CANARY, "clinicalObservations", "treatments");
    }

    @Test void removedHistoryIsSeparatelyBoundedAndDoesNotAppearInDetails() throws Exception {
        var c = create(); UUID consultation = UUID.fromString(c.get("id").asString());
        for (int i = 0; i < 51; i++) jdbc.update("""
            INSERT INTO clinical_treatment(id,consultation_id,treatment_date,description,tooth_reference,notes,created_at,updated_at,removed_at)
            VALUES (?,?,'2026-11-10','Soin retiré synthétique','16','',now(),now(),now())
            """, UUID.randomUUID(), consultation);
        var first = expect(dentist.get(route(c, "/treatments/removed")), 200);
        assertThat(first.get("items").size()).isEqualTo(50);
        var cursor = first.get("nextCursor");
        var next = expect(dentist.get(route(c, "/treatments/removed") + "&afterDate=" + cursor.get("date").asString() + "&afterId=" + cursor.get("id").asString()), 200);
        assertThat(next.get("items").size()).isEqualTo(1);
        assertThat(next.get("nextCursor").isNull()).isTrue();
        assertThat(expect(dentist.get(route(c, "")), 200).get("treatments").size()).isZero();
        problem(dentist.get(route(c, "/treatments/removed") + "&afterDate=2026-11-10"), 400);
    }

    @Test void queryAllowlistPreventsHiddenReassignmentOrClinicalDataInUrls() throws Exception {
        var c = create();
        problem(dentist.get(route(c, "") + "&extra=" + CANARY), 400);
        problem(dentist.send("PUT", route(c, "") + "&patientId=" + UUID.randomUUID(), mutation(c, content()), true), 400);
        problem(dentist.send("POST", BASE + "?notes=" + CANARY, createInput(), true), 400);
    }

    @Test void existingAdministrativeEndpointsDoNotExposeClinicalPayloads() throws Exception {
        var a = appointment(); var input = createInput(); ((ObjectNode) input.get("content")).put("appointmentId", a.get("id").asString());
        expect(dentist.send("POST", BASE, input, true), 201);
        for (String route : List.of("/api/v1/patients/" + patient.get("id").asString(), "/api/v1/patients", "/api/v1/appointments/" + a.get("id").asString(),
                "/api/v1/appointments?from=2027-01-10T00:00Z&to=2027-01-11T00:00Z")) {
            var r = reception.get(route); expect(r, 200);
            assertThat(r.body()).doesNotContain(CANARY, "clinicalObservations", "assessment", "treatmentPlan", "target_consultation_id");
        }
    }

    @Test void unexpectedAuditFailureReturnsSafe500AndRollsBackClinicalWrites(CapturedOutput output) throws Exception {
        var c = add(create());
        jdbc.execute("CREATE FUNCTION reject_http_clinical_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_consultation_id IS NOT NULL THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER reject_http_clinical_audit BEFORE INSERT ON security_audit_event FOR EACH ROW EXECUTE FUNCTION reject_http_clinical_audit()");
        try {
            problem(dentist.send("POST", BASE, createInput(), true), 500);
            problem(dentist.send("PUT", route(c, ""), mutation(c, content().put("notes", "Uncommitted " + CANARY)), true), 500);
            problem(dentist.send("POST", route(c, "/treatments"), mutation(c, treatment()), true), 500);
            problem(dentist.send("PUT", route(c, "/finalization"), version(c), true), 500);
            assertThat(expect(dentist.get(route(c, "")), 200)).isEqualTo(c);
            assertThat(audit(c)).isEqualTo(2);
            assertThat(expect(dentist.get(history()), 200).get("items").size()).isEqualTo(1);
        } finally {
            jdbc.execute("DROP TRIGGER reject_http_clinical_audit ON security_audit_event"); jdbc.execute("DROP FUNCTION reject_http_clinical_audit()");
        }
        assertThat(output.getAll()).doesNotContain(CANARY, PASSWORD, "Uncommitted", "Motif synthétique");
    }

    @Test void revokedSessionsCannotReadClinicalDetails() throws Exception {
        var c = create();
        jdbc.update("UPDATE application_user SET session_version=session_version+1 WHERE username='httpclinical.dentist'");
        problem(dentist.get(route(c, "")), 401);
    }

    private void parallel(Callable<HttpResponse<String>> first, Callable<HttpResponse<String>> second) throws Exception {
        var barrier = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var a = executor.submit(() -> { barrier.await(10, TimeUnit.SECONDS); return first.call(); });
            var b = executor.submit(() -> { barrier.await(10, TimeUnit.SECONDS); return second.call(); });
            var responses = List.of(a.get(25, TimeUnit.SECONDS), b.get(25, TimeUnit.SECONDS));
            assertThat(responses.stream().map(HttpResponse::statusCode)).containsExactlyInAnyOrder(200, 409);
            responses.stream().filter(r -> r.statusCode() == 409).forEach(r -> problem(r, 409));
        }
    }
    class Browser implements AutoCloseable {
        final HttpClient client = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();
        final String csrf;
        Browser(String username) throws Exception {
            String token = node(get("/api/v1/auth/csrf")).get("token").asString();
            if (username != null) {
                String body = json.writeValueAsString(Map.of("identifier", username, "password", PASSWORD));
                assertThat(raw("POST", "/api/v1/auth/login", body, token, "application/json").statusCode()).isEqualTo(200);
            }
            csrf = node(get("/api/v1/auth/csrf")).get("token").asString();
        }
        HttpResponse<String> get(String path) throws Exception { return raw("GET", path, "", null, "application/json"); }
        HttpResponse<String> send(String method, String path, JsonNode body, boolean token) throws Exception {
            return raw(method, path, body == null ? "" : json.writeValueAsString(body), token ? csrf : null, "application/json");
        }
        HttpResponse<String> raw(String method, String path, String body, String token, String type) throws Exception {
            var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).timeout(Duration.ofSeconds(20));
            if (token != null) builder.header("X-CSRF-TOKEN", token);
            if (method.equals("GET")) builder.GET();
            else builder.header("Content-Type", type).method(method, HttpRequest.BodyPublishers.ofString(body));
            return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        }
        @Override public void close() { client.close(); }
    }
    @TestConfiguration(proxyBeanMethods = false)
    static class TimeConfiguration {
        @Bean @Primary PatientIntegrationTest.MovingClock clinicalHttpClock() { return new PatientIntegrationTest.MovingClock(); }
    }
}
