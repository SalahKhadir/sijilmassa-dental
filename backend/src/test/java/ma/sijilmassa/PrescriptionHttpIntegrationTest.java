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
@Import(PrescriptionHttpIntegrationTest.TimeConfiguration.class)
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@ExtendWith(OutputCaptureExtension.class)
class PrescriptionHttpIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl); r.add("spring.datasource.username", POSTGRES::getUsername); r.add("spring.datasource.password", POSTGRES::getPassword);
    }
    static final String BASE = "/api/v1/prescriptions", PASSWORD = "Synthetic-Prescription-HTTP-42", CANARY = "SYNTHETIC-RX-CONFIDENTIAL";
    @LocalServerPort int port;
    @Autowired JsonMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired AccountBootstrap bootstrap;
    @Autowired PatientIntegrationTest.MovingClock clock;
    @Autowired ma.sijilmassa.prescription.PrescriptionService service;
    Browser dentist, reception;
    JsonNode patient;
    @BeforeEach void setup() throws Exception {
        clock.advance(120);
        if (jdbc.queryForObject("SELECT count(*) FROM application_user", Integer.class) == 0)
            bootstrap.initialize("rx.dentist", PASSWORD, "rx.reception", PASSWORD);
        dentist = new Browser("rx.dentist"); reception = new Browser("rx.reception"); patient = patient();
    }
    @AfterEach void close() { if (dentist != null) dentist.close(); if (reception != null) reception.close(); }
    JsonNode patient() throws Exception {
        var identity = json.createObjectNode().put("firstName", "Ordonnance").put("lastName", "Synthétique").put("sex", "unanswered").putNull("dateOfBirth");
        for (String key : List.of("address", "gsm", "landline", "profession", "cin", "medicalCoverage")) identity.put(key, "");
        var input = json.createObjectNode().put("status", "active"); input.set("identity", identity);
        return expect(reception.send("POST", "/api/v1/patients", input, true), 201);
    }
    ObjectNode line(String name) { return json.createObjectNode().put("medicationName", name).put("dosage", "").put("frequency", "").put("duration", "").put("instructions", ""); }
    ObjectNode content() {
        var content = json.createObjectNode().putNull("consultationId").put("issuedDate", "2026-11-10").put("generalInstructions", CANARY);
        content.putArray("medications"); return content;
    }
    ObjectNode input() { var input = json.createObjectNode().put("patientId", patient.get("id").asString()); input.set("content", content()); return input; }
    ObjectNode version(JsonNode p) { return json.createObjectNode().put("version", p.get("version").asLong()); }
    ObjectNode update(JsonNode p, JsonNode c) { var input = version(p); input.set("content", c); return input; }
    JsonNode create() throws Exception { return expect(dentist.send("POST", BASE, input(), true), 201); }
    String route(JsonNode p, String suffix) { return BASE + "/" + p.get("id").asString() + suffix + "?patientId=" + p.get("patientId").asString(); }
    String history() { return BASE + "?patientId=" + patient.get("id").asString(); }
    JsonNode node(HttpResponse<String> r) { return json.readTree(r.body()); }
    JsonNode expect(HttpResponse<String> r, int status) {
        assertThat(r.statusCode()).isEqualTo(status);
        assertThat(r.headers().firstValue("cache-control").orElseThrow()).contains("no-store");
        return node(r);
    }
    void problem(HttpResponse<String> r, int status) {
        var p = expect(r, status);
        assertThat(r.headers().firstValue("content-type").orElseThrow()).contains("application/problem+json");
        assertThat(p.get("status").asInt()).isEqualTo(status);
        assertThat(p.get("instance").asString()).isEqualTo("urn:request:" + p.get("requestId").asString());
        assertThat(r.headers().firstValue("x-request-id").orElseThrow()).isEqualTo(p.get("requestId").asString());
        assertThat(r.headers().allValues("vary").toString()).contains("Cookie");
        assertThat(r.body()).doesNotContain(CANARY, PASSWORD, "prescription_line", "Exception", "SELECT", "constraint");
    }
    int audits(JsonNode p) { return jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE target_prescription_id=?", Integer.class, UUID.fromString(p.get("id").asString())); }
    @Test void draftCreationAndReloadExposeOnlyTheApprovedProjection() throws Exception {
        var r = dentist.send("POST", BASE, input(), true); var p = expect(r, 201);
        assertThat(r.headers().firstValue("location").orElseThrow()).isEqualTo(route(p, ""));
        assertThat(p.get("version").asLong()).isZero(); assertThat(p.get("status").asString()).isEqualTo("BROUILLON");
        assertThat(p.get("document").isNull()).isTrue(); assertThat(p.get("finalizedAt").isNull()).isTrue();
        assertThat(expect(dentist.get(route(p, "")), 200)).isEqualTo(p);
        assertThat(p.get("patient").properties().stream().map(Map.Entry::getKey)).containsExactlyInAnyOrder("id", "reference", "firstName", "lastName", "displayName", "version", "status");
        assertThat(r.body()).doesNotContain("medicalHistory", "cin", "password", "target_prescription_id");
        assertThat(audits(p)).isEqualTo(1);
    }
    @Test void patientHistoryStartsEmptyAndDoesNotExposeAnotherPatient() throws Exception {
        assertThat(expect(dentist.get(history()), 200).get("items").size()).isZero();
        var p = create(); var other = patient();
        assertThat(expect(dentist.get(BASE + "?patientId=" + other.get("id").asString()), 200).get("items").size()).isZero();
        assertThat(expect(dentist.get(history()), 200).get("items").get(0).get("id")).isEqualTo(p.get("id"));
        assertThat(expect(dentist.get(history()), 200).toString()).doesNotContain(CANARY, "medications", "patient");
    }
    @Test void aggregateReplacementPreservesIdsAndOrdersRemovesAndAddsLines() throws Exception {
        var p = create(); var c = content(); c.withArray("medications").add(line("Alpha")).add(line("Beta"));
        p = expect(dentist.send("PUT", route(p, ""), update(p, c), true), 200);
        var first = p.get("content").get("medications").get(0); var second = p.get("content").get("medications").get(1);
        var reordered = content(); reordered.withArray("medications").add(second).add(first);
        var changed = expect(dentist.send("PUT", route(p, ""), update(p, reordered), true), 200);
        assertThat(changed.get("version").asLong()).isEqualTo(2);
        assertThat(changed.get("content").get("medications").get(0).get("id")).isEqualTo(second.get("id"));
        var reduced = content(); reduced.withArray("medications").add(second).add(line("Nouveau"));
        var last = expect(dentist.send("PUT", route(p, ""), update(changed, reduced), true), 200);
        assertThat(last.get("content").get("medications").get(1).get("id")).isNotEqualTo(first.get("id"));
        assertThat(audits(p)).isEqualTo(4);
        var invalid = content(); invalid.withArray("medications").add(first);
        problem(dentist.send("PUT", route(p, ""), update(last, invalid), true), 400);
        assertThat(expect(dentist.get(route(p, "")), 200)).isEqualTo(last);
    }
    @Test void duplicateAndForeignLineIdsAreRejectedAtomically() throws Exception {
        var a = input(); ((ObjectNode) a.get("content")).withArray("medications").add(line(CANARY));
        var p = expect(dentist.send("POST", BASE, a, true), 201);
        var foreign = p.get("content").get("medications").get(0); var other = create();
        var c = content(); c.withArray("medications").add(foreign);
        problem(dentist.send("PUT", route(other, ""), update(other, c), true), 400);
        c.withArray("medications").add(foreign);
        problem(dentist.send("PUT", route(p, ""), update(p, c), true), 400);
        assertThat(audits(p)).isEqualTo(1); assertThat(audits(other)).isEqualTo(1);
    }
    @Test void identicalUpdatesStillAdvanceVersionAndTimestampOnce() throws Exception {
        var p = create(); var changed = expect(dentist.send("PUT", route(p, ""), update(p, p.get("content")), true), 200);
        assertThat(changed.get("version").asLong()).isEqualTo(1);
        assertThat(changed.get("createdAt")).isEqualTo(p.get("createdAt"));
        assertThat(java.time.Instant.parse(changed.get("updatedAt").asString())).isAfter(java.time.Instant.parse(p.get("updatedAt").asString()));
        problem(dentist.send("PUT", route(p, ""), update(p, content()), true), 409);
    }
    @Test void auditAndProvenanceUseTheAuthenticatedDentistWithoutClinicalContent() throws Exception {
        var p = create(); var updated = expect(dentist.send("PUT", route(p, ""), update(p, content()), true), 200);
        expect(dentist.send("PUT", route(p, "/archival"), version(updated), true), 200);
        var id = UUID.fromString(p.get("id").asString());
        var actor = jdbc.queryForObject("SELECT id FROM application_user WHERE username='rx.dentist'", UUID.class);
        assertThat(jdbc.queryForList("SELECT event_type FROM security_audit_event WHERE target_prescription_id=? ORDER BY occurred_at,id", String.class, id))
                .containsExactlyInAnyOrder("PRESCRIPTION_CREATED", "PRESCRIPTION_DRAFT_UPDATED", "PRESCRIPTION_ARCHIVED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE target_prescription_id=? AND actor_user_id=? AND subject_user_id IS NULL AND target_patient_id IS NULL AND target_appointment_id IS NULL AND target_consultation_id IS NULL", Integer.class, id, actor)).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM prescription WHERE id=? AND created_by=? AND updated_by=? AND archived_by=?", Integer.class, id, actor, actor, actor)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT string_agg(row_to_json(e)::text,'') FROM security_audit_event e WHERE target_prescription_id=?", String.class, id)).doesNotContain(CANARY, "Ordonnance", "Synthétique");
    }
    @Test void archiveIsAuditedIrreversibleAndHistoryRemainsReadable() throws Exception {
        var p = create(); var archived = expect(dentist.send("PUT", route(p, "/archival"), version(p), true), 200);
        assertThat(archived.get("version").asLong()).isEqualTo(1); assertThat(archived.get("archivedAt").isNull()).isFalse();
        assertThat(expect(dentist.get(history()), 200).get("items").size()).isZero();
        assertThat(expect(dentist.get(history() + "&archive=archived"), 200).get("items").size()).isEqualTo(1);
        assertThat(expect(dentist.get(history() + "&archive=all"), 200).get("items").size()).isEqualTo(1);
        problem(dentist.send("PUT", route(p, ""), update(archived, content()), true), 409);
        problem(dentist.send("PUT", route(p, "/archival"), version(archived), true), 409);
        assertThat(expect(dentist.get(route(p, "")), 200)).isEqualTo(archived); assertThat(audits(p)).isEqualTo(2);
    }
    @Test void archivedPatientRejectsAllWritesButRetainsHistoryAndDetails() throws Exception {
        var p = create(); var input = version(patient).put("status", "inactive"); input.set("identity", patient.get("identity"));
        var archived = expect(reception.send("PUT", "/api/v1/patients/" + patient.get("id").asString(), input, true), 200);
        problem(dentist.send("POST", BASE, input(), true), 409);
        problem(dentist.send("PUT", route(p, ""), update(p, content()), true), 409);
        problem(dentist.send("PUT", route(p, "/archival"), version(p), true), 409);
        assertThat(expect(dentist.get(route(p, "")), 200).get("patient").get("status").asString()).isEqualTo("inactive");
        assertThat(expect(dentist.get(history()), 200).get("items").size()).isEqualTo(1);
        var restore = version(archived).put("status", "active"); restore.set("identity", patient.get("identity"));
        expect(reception.send("PUT", "/api/v1/patients/" + patient.get("id").asString(), restore, true), 200);
        expect(dentist.send("PUT", route(p, ""), update(p, content()), true), 200);
    }
    @Test void ownershipAndMissingPatientsAreCheckedOnEveryOperation() throws Exception {
        var p = create(); var other = patient(); String wrong = "?patientId=" + other.get("id").asString();
        problem(dentist.get(BASE + "/" + p.get("id").asString() + wrong), 404);
        problem(dentist.send("PUT", BASE + "/" + p.get("id").asString() + wrong, update(p, content()), true), 404);
        problem(dentist.send("PUT", BASE + "/" + p.get("id").asString() + "/archival" + wrong, version(p), true), 404);
        var archive = version(other).put("status", "inactive"); archive.set("identity", other.get("identity"));
        expect(reception.send("PUT", "/api/v1/patients/" + other.get("id").asString(), archive, true), 200);
        problem(dentist.get(BASE + "/" + p.get("id").asString() + wrong), 404);
        problem(dentist.send("PUT", BASE + "/" + p.get("id").asString() + wrong, update(p, content()), true), 404);
        problem(dentist.send("PUT", BASE + "/" + p.get("id").asString() + "/archival" + wrong, version(p), true), 404);
        problem(dentist.send("POST", BASE, input().put("patientId", UUID.randomUUID().toString()), true), 404);
        problem(dentist.get(BASE + "?patientId=" + UUID.randomUUID()), 404);
    }
    void denied(Browser b, JsonNode p, int status) throws Exception {
        problem(b.get(history()), status); problem(b.get(route(p, "")), status);
        problem(b.send("POST", BASE, input(), true), status);
        problem(b.send("PUT", route(p, ""), update(p, content()), true), status);
        problem(b.send("PUT", route(p, "/archival"), version(p), true), status);
    }
    @Test void receptionistCannotAccessAnyPrescriptionOperation() throws Exception { denied(reception, create(), 403); }
    @Test void serviceBoundaryDeniesReceptionistEvenWithoutTheController() {
        var context = org.springframework.security.core.context.SecurityContextHolder.getContext();
        context.setAuthentication(org.springframework.security.authentication.UsernamePasswordAuthenticationToken.authenticated(
                new ma.sijilmassa.security.AccountPrincipal(UUID.randomUUID(), "synthetic", ma.sijilmassa.security.Role.RECEPTIONIST, 0), null,
                List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_RECEPTIONIST"))));
        try {
            assertThatThrownBy(() -> service.get(UUID.randomUUID(), UUID.randomUUID())).isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
            assertThatThrownBy(() -> service.create(UUID.randomUUID(), null)).isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
            assertThatThrownBy(() -> service.update(UUID.randomUUID(), UUID.randomUUID(), 0L, null)).isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
            assertThatThrownBy(() -> service.archive(UUID.randomUUID(), UUID.randomUUID(), 0L)).isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
            assertThatThrownBy(() -> service.history(UUID.randomUUID(), null, "all", null, null)).isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
        } finally { org.springframework.security.core.context.SecurityContextHolder.clearContext(); }
    }
    @Test void anonymousRequestsAreRejected() throws Exception { try (var b = new Browser(null)) { denied(b, create(), 401); } }
    @Test void revokedSessionCannotReadOrMutate() throws Exception {
        var p = create(); jdbc.update("UPDATE application_user SET session_version=session_version+1 WHERE username='rx.dentist'");
        problem(dentist.get(route(p, "")), 401);
        // Revocation invalidates the old CSRF session too; use a fresh anonymous token to test auth, not stale CSRF.
        dentist.csrf = node(dentist.get("/api/v1/auth/csrf")).get("token").asString();
        denied(dentist, p, 401);
    }
    @Test void csrfProtectsEveryMutation() throws Exception {
        var p = create(); problem(dentist.send("POST", BASE, input(), false), 403);
        problem(dentist.send("PUT", route(p, ""), update(p, content()), false), 403);
        problem(dentist.send("PUT", route(p, "/archival"), version(p), false), 403);
        problem(dentist.raw("PUT", route(p, "/archival"), json.writeValueAsString(version(p)), "wrong", "application/json"), 403);
        assertThat(audits(p)).isEqualTo(1);
    }
    @Test void invalidPayloadsAndUnsupportedLifecycleAreRejected() throws Exception {
        var p = create();
        for (ObjectNode invalid : List.of(input().put("status", "FINALISEE"), input().put("patientId", "patient-demo-001"), input().put("patientId", "1-1-1-1-1"), input().putNull("content")))
            problem(dentist.send("POST", BASE, invalid, true), 400);
        for (String bad : List.of("", "{}", "{", "null", "[]")) problem(dentist.raw("POST", BASE, bad, dentist.csrf, "application/json"), 400);
        for (String value : List.of("-1", "0.5", "9007199254740992", "\"0\"", "null"))
            problem(dentist.raw("PUT", route(p, "/archival"), "{\"version\":" + value + "}", dentist.csrf, "application/json"), 400);
        problem(dentist.send("PUT", route(p, ""), update(p, content()).put("patientId", UUID.randomUUID().toString()), true), 400);
        assertThat(audits(p)).isEqualTo(1);
    }
    @Test void contentRequiresExplicitFieldsAndValidTextAndDate() throws Exception {
        for (String field : List.of("consultationId", "issuedDate", "medications", "generalInstructions")) {
            var c = content(); c.remove(field); var input = input(); input.set("content", c);
            problem(dentist.send("POST", BASE, input, true), 400);
        }
        for (String date : List.of("2026-02-30", "0000-01-01", "10000-01-01", "2026-1-1")) {
            var input = input(); ((ObjectNode) input.get("content")).put("issuedDate", date);
            problem(dentist.send("POST", BASE, input, true), 400);
        }
        for (String value : List.of(CANARY + "\0", CANARY + "\u0001", "x".repeat(2001))) {
            var input = input(); ((ObjectNode) input.get("content")).put("generalInstructions", value);
            problem(dentist.send("POST", BASE, input, true), 400);
        }
        var input = input(); ((ObjectNode) input.get("content")).withArray("medications").add(line(CANARY).putNull("id"));
        problem(dentist.send("POST", BASE, input, true), 400);
    }
    @Test void requestSizeIsBoundedBeforeBindingAndMultibyteDraftsWork() throws Exception {
        problem(dentist.raw("POST", BASE, " ".repeat(256 * 1024 + 1), dentist.csrf, "application/json"), 413);
        var input = input(); var array = ((ObjectNode) input.get("content")).withArray("medications");
        for (int i = 0; i < 20; i++) array.add(line("é".repeat(200)).put("instructions", "é".repeat(1500)));
        assertThat(json.writeValueAsString(input).getBytes(java.nio.charset.StandardCharsets.UTF_8).length).isGreaterThan(65536);
        expect(dentist.send("POST", BASE, input, true), 201);
        array.add(line("extra")); problem(dentist.send("POST", BASE, input, true), 400);
    }
    @Test void consultationLinksAllowCompletedAndMultiplePrescriptionsWithoutChangingClinicalData() throws Exception {
        var c = json.createObjectNode().putNull("appointmentId").put("consultationDate", "2026-11-10").put("chiefComplaint", "Synthétique")
                .put("clinicalObservations", "").put("assessment", "").put("treatmentPlan", "").put("notes", "");
        var create = json.createObjectNode().put("patientId", patient.get("id").asString()); create.set("content", c);
        var consultation = expect(dentist.send("POST", "/api/v1/consultations", create, true), 201);
        var input = input(); ((ObjectNode) input.get("content")).put("consultationId", consultation.get("id").asString());
        expect(dentist.send("POST", BASE, input, true), 201);
        String path = "/api/v1/consultations/" + consultation.get("id").asString() + "?patientId=" + patient.get("id").asString();
        var done = expect(dentist.send("PUT", path.replace("?", "/finalization?"), version(consultation), true), 200);
        expect(dentist.send("POST", BASE, input, true), 201);
        assertThat(expect(dentist.get(path), 200)).isEqualTo(done);
        assertThat(expect(dentist.get(history() + "&consultationId=" + consultation.get("id").asString()), 200).get("items").size()).isEqualTo(2);
        problem(dentist.send("POST", BASE, input.deepCopy().put("patientId", patient().get("id").asString()), true), 400);
        ((ObjectNode) input.get("content")).put("consultationId", UUID.randomUUID().toString());
        problem(dentist.send("POST", BASE, input, true), 400);
    }
    @Test void historyIsKeysetBoundedAndSortedByPostgresUuidOrder() throws Exception {
        for (int i = 0; i < 51; i++) create();
        var first = expect(dentist.get(history()), 200); var cursor = first.get("nextCursor");
        assertThat(first.get("items").size()).isEqualTo(50);
        var second = expect(dentist.get(history() + "&beforeDate=" + cursor.get("date").asString() + "&beforeId=" + cursor.get("id").asString()), 200);
        assertThat(second.get("items").size()).isEqualTo(1); assertThat(second.get("nextCursor").isNull()).isTrue();
        var ids = new ArrayList<String>(); first.get("items").forEach(p -> ids.add(p.get("id").asString())); second.get("items").forEach(p -> ids.add(p.get("id").asString()));
        assertThat(ids).doesNotHaveDuplicates().isSortedAccordingTo(Comparator.reverseOrder());
        assertThat(expect(dentist.get(history() + "&status=FINALISEE"), 200).get("items").size()).isZero();
    }
    @Test void ambiguousAndUnboundedQueryParametersAreRejected() throws Exception {
        var p = create();
        for (String query : List.of("&pageSize=1", "&beforeDate=2026-11-10", "&beforeId=" + UUID.randomUUID(), "&archive=", "&status=UNKNOWN", "&archive=unknown", "&patientId=" + patient.get("id").asString(), "&consultationId=" + UUID.randomUUID()))
            problem(dentist.get(history() + query), 400);
        problem(dentist.get(BASE), 400); problem(dentist.get(route(p, "") + "&extra=1"), 400);
        problem(dentist.send("POST", BASE + "?extra=1", input(), true), 400);
    }
    @Test void draftPdfCorrectionAndRestoreRemainUnavailable() throws Exception {
        var p = create();
        for (String suffix : List.of("/restoration", "/correction"))
            problem(dentist.send("PUT", route(p, suffix), version(p), true), 403);
        problem(dentist.get(route(p, "/pdf") + "&version=0"), 409);
        problem(reception.get(route(p, "/pdf")), 403);
        assertThat(audits(p)).isEqualTo(1);
    }
    @Test void concurrentUpdatesHaveOneWinnerAndNoLostLines() throws Exception {
        var p = create(); var c = content(); c.withArray("medications").add(line("Concurrent"));
        try (var other = new Browser("rx.dentist"); var pool = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            var a = pool.submit(() -> { gate.await(); return dentist.send("PUT", route(p, ""), update(p, c), true); });
            var b = pool.submit(() -> { gate.await(); return other.send("PUT", route(p, ""), update(p, c), true); });
            gate.countDown(); assertThat(List.of(a.get(20, TimeUnit.SECONDS).statusCode(), b.get(20, TimeUnit.SECONDS).statusCode())).containsExactlyInAnyOrder(200, 409);
        }
        var result = expect(dentist.get(route(p, "")), 200);
        assertThat(result.get("version").asLong()).isEqualTo(1); assertThat(result.get("content").get("medications").size()).isEqualTo(1);
        assertThat(audits(p)).isEqualTo(2);
    }
    @Test void concurrentArchiveAndEditHaveOneWinner() throws Exception {
        var p = create();
        try (var other = new Browser("rx.dentist"); var pool = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            var a = pool.submit(() -> { gate.await(); return dentist.send("PUT", route(p, ""), update(p, content()), true); });
            var b = pool.submit(() -> { gate.await(); return other.send("PUT", route(p, "/archival"), version(p), true); });
            gate.countDown(); assertThat(List.of(a.get(20, TimeUnit.SECONDS).statusCode(), b.get(20, TimeUnit.SECONDS).statusCode())).containsExactlyInAnyOrder(200, 409);
        }
        assertThat(expect(dentist.get(route(p, "")), 200).get("version").asLong()).isEqualTo(1); assertThat(audits(p)).isEqualTo(2);
    }
    @Test void auditFailureRollsBackCreationReplacementAndArchival(CapturedOutput output) throws Exception {
        var p = create(); int before = jdbc.queryForObject("SELECT count(*) FROM prescription", Integer.class);
        jdbc.execute("CREATE FUNCTION reject_rx_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_prescription_id IS NOT NULL THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER reject_rx_audit BEFORE INSERT ON security_audit_event FOR EACH ROW EXECUTE FUNCTION reject_rx_audit()");
        try {
            problem(dentist.send("POST", BASE, input(), true), 500);
            var c = content(); c.withArray("medications").add(line(CANARY));
            problem(dentist.send("PUT", route(p, ""), update(p, c), true), 500);
            problem(dentist.send("PUT", route(p, "/archival"), version(p), true), 500);
            assertThat(expect(dentist.get(route(p, "")), 200)).isEqualTo(p);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM prescription", Integer.class)).isEqualTo(before); assertThat(audits(p)).isEqualTo(1);
            assertThat(output.getAll()).doesNotContain(CANARY, PASSWORD);
        } finally { jdbc.execute("DROP TRIGGER reject_rx_audit ON security_audit_event"); jdbc.execute("DROP FUNCTION reject_rx_audit()"); }
    }

    class Browser implements AutoCloseable {
        final HttpClient client = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();
        String csrf;
        Browser(String username) throws Exception {
            String token = node(get("/api/v1/auth/csrf")).get("token").asString();
            if (username != null) assertThat(raw("POST", "/api/v1/auth/login", json.writeValueAsString(Map.of("identifier", username, "password", PASSWORD)), token, "application/json").statusCode()).isEqualTo(200);
            csrf = node(get("/api/v1/auth/csrf")).get("token").asString();
        }
        HttpResponse<String> get(String path) throws Exception { return raw("GET", path, "", null, "application/json"); }
        HttpResponse<String> send(String method, String path, JsonNode body, boolean token) throws Exception { return raw(method, path, json.writeValueAsString(body), token ? csrf : null, "application/json"); }
        HttpResponse<String> raw(String method, String path, String body, String token, String type) throws Exception {
            var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).timeout(Duration.ofSeconds(20));
            if (token != null) builder.header("X-CSRF-TOKEN", token);
            if (method.equals("GET")) builder.GET(); else builder.header("Content-Type", type).method(method, HttpRequest.BodyPublishers.ofString(body));
            return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        }
        public void close() { client.close(); }
    }
    @TestConfiguration(proxyBeanMethods = false)
    static class TimeConfiguration { @Bean @Primary PatientIntegrationTest.MovingClock prescriptionClock() { return new PatientIntegrationTest.MovingClock(); } }
}
