package ma.sijilmassa;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import ma.sijilmassa.finance.TreatmentFinancialService;
import ma.sijilmassa.security.AccountBootstrap;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.util.AopTestUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(OutputCaptureExtension.class)
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.flyway.locations=classpath:db/migration,classpath:db/testmigration", "server.servlet.session.cookie.secure=false"})
@Import(FinancialHttpIntegrationTest.TimeConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class FinancialHttpIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");

    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    private static final String BASE = "/api/v1/financial";
    private static final String CHARGES = BASE + "/charges";
    private static final String CONSULTATIONS = "/api/v1/consultations";
    private static final String PATIENTS = "/api/v1/patients";
    private static final String PASSWORD = "Synthetic-Financial-HTTP-42";
    private static final String CANARY = "CONFIDENTIAL-SYNTHETIC-FINANCIAL-HTTP-CANARY";
    private static final String PAID_AT = "2026-11-11T09:00:01.123456Z";

    @LocalServerPort int port;
    @Autowired JsonMapper json;
    @Autowired JdbcTemplate jdbc;
    @MockitoSpyBean TreatmentFinancialService financial;
    @Autowired AccountBootstrap bootstrap;
    @Autowired PatientIntegrationTest.MovingClock clock;
    private Browser dentist;
    private Browser reception;
    private JsonNode patient;

    @BeforeEach void setup() throws Exception {
        clock.advance(120);
        if (jdbc.queryForObject("SELECT count(*) FROM application_user", Integer.class) == 0) {
            bootstrap.initialize("finance.dentist", PASSWORD, "finance.reception", PASSWORD);
        }
        dentist = new Browser("finance.dentist");
        reception = new Browser("finance.reception");
        patient = patient();
    }

    @AfterEach void close() {
        if (dentist != null) dentist.close();
        if (reception != null) reception.close();
    }

    @Test void dentistCreatesAndBothRolesCanReadCharge() throws Exception {
        var response = dentist.send("POST", CHARGES, chargeInput(source("2026-11-10", "Soin synthétique"), 30000), true);
        var charge = expect(response, 201);
        assertThat(response.headers().firstValue("location")).contains(chargePath(charge, ""));
        assertFields(charge, "chargeId", "version", "date", "treatmentLabel", "currency", "priceMinor", "receivedMinor", "remainingMinor", "settlement");
        assertThat(charge.get("currency").asString()).isEqualTo("MAD");
        assertThat(charge.get("version").asLong()).isZero();
        assertThat(charge.get("remainingMinor").asLong()).isEqualTo(30000);
        assertThat(charge.get("settlement").asString()).isEqualTo("DUE");
        assertThat(expect(dentist.get(chargePath(charge, "")), 200)).isEqualTo(charge);
        assertThat(expect(reception.get(chargePath(charge, "")), 200)).isEqualTo(charge);
    }

    @Test void receptionistCannotCreateChargeOrUseUnsupportedMethods() throws Exception {
        var input = chargeInput(source("2026-11-10", "Soin"), 100);
        problem(reception.send("POST", CHARGES, input, true), 403);
        var charge = expect(dentist.send("POST", CHARGES, input, true), 201);
        problem(dentist.send("DELETE", chargePath(charge, ""), null, true), 403);
        problem(dentist.send("POST", chargePath(charge, "/refund"), payment(0, 1), true), 403);
    }

    @Test void anonymousAndRevokedSessionsCannotAccessFinancialRoutes() throws Exception {
        var input = chargeInput(source("2026-11-10", "Soin"), 100);
        var charge = expect(dentist.send("POST", CHARGES, input, true), 201);
        try (var anonymous = new Browser(null)) {
            for (String path : List.of(chargePath(charge, ""), chargePath(charge, "/payments"), patientPath("/summary"), patientPath("/verso"))) {
                problem(anonymous.get(path), 401);
            }
            problem(anonymous.send("POST", CHARGES, input, true), 401);
            problem(anonymous.send("POST", chargePath(charge, "/payments"), payment(0, 1), true), 401);
        }
        jdbc.update("UPDATE application_user SET session_version=session_version+1 WHERE username='finance.reception'");
        problem(reception.get(patientPath("/summary")), 401);
    }

    @Test void bothWritesRequireValidCsrf() throws Exception {
        var input = chargeInput(source("2026-11-10", "Soin"), 100);
        problem(dentist.send("POST", CHARGES, input, false), 403);
        var charge = expect(dentist.send("POST", CHARGES, input, true), 201);
        String route = chargePath(charge, "/payments");
        problem(reception.send("POST", route, payment(0, 1), false), 403);
        problem(reception.raw("POST", route, json.writeValueAsString(payment(0, 1)), "invalid-csrf"), 403);
        assertThat(expect(reception.get(route), 200).get("items").size()).isZero();
    }

    @Test void strictPriceAndAmountValidationPreservesExplicitZeroPrice() throws Exception {
        var source = source("2026-11-10", "Soin");
        for (long price : List.of(-1L, 9007199254740992L)) {
            problem(dentist.send("POST", CHARGES, chargeInput(source, price), true), 400);
        }
        var zero = expect(dentist.send("POST", CHARGES, chargeInput(source, 0), true), 201);
        assertThat(zero.get("settlement").asString()).isEqualTo("SETTLED");
        var charge = charge("2026-11-10", "Autre soin", 100);
        String path = chargePath(charge, "/payments");
        for (var input : List.of(payment(0, 0), payment(0, -1), payment(0, 9007199254740992L),
                payment(0, 1).put("amountMinor", 1.5), payment(0, 1).put("amountMinor", "1"),
                payment(0, 1).put("amountMinor", true), payment(0, 1).put("amountMinor", 1.0))) {
            problem(reception.send("POST", path, input, true), 400);
        }
        assertThat(expect(reception.get(path), 200).get("items").size()).isZero();
    }

    @Test void rejectsMalformedAndNoncanonicalUuids() throws Exception {
        var source = source("2026-11-10", "Soin");
        for (String id : List.of("invalide", "1-1-1-1-1", "AAAAAAAAAAAAAAAAAAAAAA==")) {
            problem(dentist.send("POST", CHARGES, chargeInput(source, 100).put("treatmentId", id), true), 400);
        }
        var charge = expect(dentist.send("POST", CHARGES, chargeInput(source, 100), true), 201);
        problem(reception.get(CHARGES + "/1-1-1-1-1?patientId=" + patientId()), 400);
        problem(reception.get(CHARGES + "/" + charge.get("chargeId").asString() + "?patientId=1-1-1-1-1"), 400);
        problem(reception.send("POST", chargePath(charge, "/payments"), payment(0, 1).put("operationId", "1-1-1-1-1"), true), 400);
    }

    @Test void bothExpectedVersionsAndReplayKeyAreRequired() throws Exception {
        var input = chargeInput(source("2026-11-10", "Soin"), 100);
        var missing = input.deepCopy();
        missing.remove("expectedConsultationVersion");
        problem(dentist.send("POST", CHARGES, missing, true), 400);
        var charge = expect(dentist.send("POST", CHARGES, input, true), 201);
        for (String field : List.of("expectedChargeVersion", "operationId")) {
            var payment = payment(0, 1);
            payment.remove(field);
            problem(reception.send("POST", chargePath(charge, "/payments"), payment, true), 400);
        }
        problem(reception.send("POST", chargePath(charge, "/payments"), payment(0, 1).put("expectedChargeVersion", "0"), true), 400);
    }

    @Test void rejectsUnknownDuplicateTrailingAndOversizedJson() throws Exception {
        var charge = charge("2026-11-10", "Soin", 100);
        String path = chargePath(charge, "/payments");
        var valid = json.writeValueAsString(payment(0, 1));
        for (String body : List.of(valid + " {}", "{\"amountMinor\":1," + valid.substring(1), "[{}]", "{",
                json.writeValueAsString(payment(0, 1).put("notes", CANARY)),
                json.writeValueAsString(payment(0, 1).put("priceMinor", 10)),
                " ".repeat(4096) + valid)) {
            problem(reception.raw("POST", path, body, reception.csrf), 400);
        }
    }

    @Test void rejectsUnsafeTimestampAndMethodRepresentations() throws Exception {
        var charge = charge("2026-11-10", "Soin", 100);
        String path = chargePath(charge, "/payments");
        for (var input : List.of(payment(0, 1).put("paidAt", 1700000000),
                payment(0, 1).put("paidAt", "2026-11-11T09:00:01.1234567Z"),
                payment(0, 1).put("paidAt", "2026-11-11T10:00:00+01:00"),
                payment(0, 1).put("paidAt", "2026-11-11T24:00:00Z"),
                payment(0, 1).put("paidAt", "2026-11-11T23:59:60Z"),
                payment(0, 1).put("paidAt", "0000-01-01T00:00:00Z"),
                payment(0, 1).put("method", 0), payment(0, 1).put("method", " ESPECES "))) {
            problem(reception.send("POST", path, input, true), 400);
        }
    }

    @Test void bothRolesRecordPartialPaymentsAndFinalizedClinicalDataIsPreserved() throws Exception {
        var source = source("2026-11-10", "Soin");
        var charge = expect(dentist.send("POST", CHARGES, chargeInput(source, 30000), true), 201);
        var finalized = expect(dentist.send("PUT", consultationPath(source, "/finalization"), version(source), true), 200);
        var first = pay(dentist, charge, payment(0, 10000));
        assertThat(first.get("charge").get("version").asLong()).isEqualTo(1);
        assertThat(first.get("charge").get("settlement").asString()).isEqualTo("PARTIAL");
        assertThat(first.get("charge").get("remainingMinor").asLong()).isEqualTo(20000);
        assertFields(first.get("payment"), "id", "amountMinor", "paidAt", "method", "recordedAt");
        assertThat(first.get("payment").get("paidAt").asString()).isEqualTo(PAID_AT);
        var second = pay(reception, charge, payment(1, 20000));
        assertThat(second.get("charge").get("version").asLong()).isEqualTo(2);
        assertThat(second.get("charge").get("receivedMinor").asLong()).isEqualTo(30000);
        assertThat(second.get("charge").get("remainingMinor").asLong()).isZero();
        assertThat(second.get("charge").get("settlement").asString()).isEqualTo("SETTLED");
        var items = expect(reception.get(chargePath(charge, "/payments")), 200).get("items");
        assertThat(items.valueStream().toList()).containsExactlyInAnyOrder(first.get("payment"), second.get("payment"));
        assertThat(expect(dentist.get(consultationPath(source, "")), 200)).isEqualTo(finalized);
    }

    @Test void rejectsOverpaymentAndStaleChargeVersionWithoutRecordingEither() throws Exception {
        var charge = charge("2026-11-10", "Soin", 100);
        pay(dentist, charge, payment(0, 20));
        String path = chargePath(charge, "/payments");
        conflict(reception.send("POST", path, payment(1, 81), true), "OVERPAYMENT");
        conflict(reception.send("POST", path, payment(0, 10), true), "VERSION_CONFLICT");
        assertThat(expect(reception.get(path), 200).get("items").size()).isEqualTo(1);
        assertThat(expect(reception.get(chargePath(charge, "")), 200).get("remainingMinor").asLong()).isEqualTo(80);
    }

    @Test void replayReturnsOriginalPaymentAndCurrentChargeAndRejectsChangedPayload() throws Exception {
        var charge = charge("2026-11-10", "Soin", 100);
        var input = payment(0, 20);
        var first = pay(dentist, charge, input);
        var second = pay(reception, charge, payment(1, 10));
        var replay = pay(reception, charge, input);
        assertThat(replay.get("payment")).isEqualTo(first.get("payment"));
        assertThat(replay.get("charge")).isEqualTo(second.get("charge"));
        String path = chargePath(charge, "/payments");
        conflict(reception.send("POST", path, input.deepCopy().put("amountMinor", 21), true), "OPERATION_CONFLICT");
        conflict(reception.send("POST", path, input.deepCopy().put("method", "CARTE"), true), "OPERATION_CONFLICT");
        assertThat(expect(reception.get(path), 200).get("items").size()).isEqualTo(2);
        assertThat(paymentAuditCount(charge)).isEqualTo(2);
    }

    @Test void concurrentDistinctOperationsWithSameVersionYieldOnePayment() throws Exception {
        var charge = charge("2026-11-10", "Soin", 100);
        String path = chargePath(charge, "/payments");
        var responses = parallel(() -> dentist.send("POST", path, payment(0, 60), true),
                () -> reception.send("POST", path, payment(0, 60), true));
        assertThat(responses.stream().map(HttpResponse::statusCode)).containsExactlyInAnyOrder(200, 409);
        conflict(responses.stream().filter(r -> r.statusCode() == 409).findFirst().orElseThrow(), "VERSION_CONFLICT");
        assertThat(expect(reception.get(path), 200).get("items").size()).isEqualTo(1);
        assertThat(paymentAuditCount(charge)).isEqualTo(1);
    }

    @Test void concurrentIdenticalOperationsReturnTheSameReceipt() throws Exception {
        var charge = charge("2026-11-10", "Soin", 100);
        String path = chargePath(charge, "/payments");
        var input = payment(0, 60);
        var responses = parallel(() -> dentist.send("POST", path, input, true), () -> reception.send("POST", path, input, true));
        assertThat(expect(responses.get(0), 200)).isEqualTo(expect(responses.get(1), 200));
        assertThat(expect(reception.get(path), 200).get("items").size()).isEqualTo(1);
        assertThat(paymentAuditCount(charge)).isEqualTo(1);
    }

    @Test void archivePreservesReadsAndRejectsBothWritesAndReplay() throws Exception {
        var charge = charge("2026-11-10", "Soin", 100);
        var input = payment(0, 1);
        pay(reception, charge, input);
        var unpriced = chargeInput(source("2026-11-10", "Soin sans prix"), 20);
        var archive = version(patient).put("status", "inactive");
        archive.set("identity", patient.get("identity"));
        expect(reception.send("PUT", PATIENTS + "/" + patientId(), archive, true), 200);
        for (String path : List.of(chargePath(charge, ""), chargePath(charge, "/payments"), patientPath("/summary"), patientPath("/verso"))) {
            expect(reception.get(path), 200);
        }
        conflict(dentist.send("POST", CHARGES, unpriced, true), "ARCHIVED_PATIENT");
        conflict(reception.send("POST", chargePath(charge, "/payments"), payment(1, 1), true), "ARCHIVED_PATIENT");
        conflict(reception.send("POST", chargePath(charge, "/payments"), input, true), "ARCHIVED_PATIENT");
    }

    @Test void missingAndForeignResourcesUseTheSame404() throws Exception {
        var source = source("2026-11-10", "Soin");
        var input = chargeInput(source, 100);
        var charge = expect(dentist.send("POST", CHARGES, input, true), 201);
        String otherPatient = patient().get("id").asString();
        problem(dentist.send("POST", CHARGES, input.deepCopy().put("patientId", otherPatient), true), 404);
        problem(dentist.send("POST", CHARGES, input.deepCopy().put("treatmentId", UUID.randomUUID().toString()), true), 404);
        problem(dentist.send("POST", CHARGES, input.deepCopy().put("consultationId", UUID.randomUUID().toString()), true), 404);
        String id = charge.get("chargeId").asString();
        problem(reception.get(CHARGES + "/" + id + "?patientId=" + otherPatient), 404);
        problem(reception.get(CHARGES + "/" + UUID.randomUUID() + "?patientId=" + patientId()), 404);
        String foreignPayments = CHARGES + "/" + id + "/payments?patientId=" + otherPatient;
        problem(reception.get(foreignPayments), 404);
        problem(reception.send("POST", foreignPayments, payment(0, 1), true), 404);
        problem(reception.get(BASE + "/patients/" + UUID.randomUUID() + "/summary"), 404);
    }

    @Test void duplicateStaleFinalizedAndRemovedTreatmentsUseDomainConflicts() throws Exception {
        var source = source("2026-11-10", "Soin");
        var input = chargeInput(source, 100);
        conflict(dentist.send("POST", CHARGES, input.deepCopy().put("expectedConsultationVersion", 0), true), "VERSION_CONFLICT");
        expect(dentist.send("POST", CHARGES, input, true), 201);
        conflict(dentist.send("POST", CHARGES, input, true), "DUPLICATE_CHARGE");

        var finalizable = source("2026-11-10", "Soin à clôturer");
        var finalSource = expect(dentist.send("PUT", consultationPath(finalizable, "/finalization"), version(finalizable), true), 200);
        conflict(dentist.send("POST", CHARGES, chargeInput(finalSource, 100), true), "CONSULTATION_FINALIZED");

        var removable = source("2026-11-10", "Soin à retirer");
        var removedInput = chargeInput(removable, 100);
        String removal = "/treatments/" + removedInput.get("treatmentId").asString() + "/removal";
        var removed = expect(dentist.send("PUT", consultationPath(removable, removal), version(removable), true), 200);
        removedInput.put("expectedConsultationVersion", removed.get("version").asLong());
        conflict(dentist.send("POST", CHARGES, removedInput, true), "INELIGIBLE_TREATMENT");
    }

    @Test void summaryAndVersoReportExactTotalsAndOnlyCollectionFields() throws Exception {
        var third = charge("2026-11-12", "Soin C", 40000);
        var first = charge("2026-11-10", "Soin A", 30000);
        var second = charge("2026-11-11", "Soin B", 50000);
        source("2026-11-09", "Soin sans prix");
        pay(reception, first, payment(0, 8000));
        pay(reception, first, payment(1, 12000));
        pay(dentist, second, payment(0, 50000));

        var summaryResponse = reception.get(patientPath("/summary"));
        var summary = expect(summaryResponse, 200);
        var versoResponse = reception.get(patientPath("/verso"));
        var verso = expect(versoResponse, 200);
        assertThat(summary.get("items").valueStream().map(row -> row.get("chargeId")).toList())
                .containsExactly(first.get("chargeId"), second.get("chargeId"), third.get("chargeId"));
        assertThat(verso.get("totals")).isEqualTo(summary.get("totals"));
        assertThat(summary.get("totals")).isEqualTo(json.readTree(
                "{\"currency\":\"MAD\",\"chargesMinor\":\"120000\",\"receivedMinor\":\"70000\",\"outstandingMinor\":\"50000\"}"));
        var rows = verso.get("items");
        assertThat(rows.size()).isEqualTo(3);
        for (var row : rows) assertFields(row, "date", "treatmentLabel", "priceMinor", "receivedMinor", "remainingMinor");
        assertThat(rows.valueStream().map(row -> row.get("date").asString()).toList()).containsExactly("2026-11-10", "2026-11-11", "2026-11-12");
        assertThat(rows.valueStream().map(row -> row.get("treatmentLabel").asString()).toList()).containsExactly("Soin A", "Soin B", "Soin C");
        assertThat(rows.valueStream().map(row -> row.get("priceMinor").asLong()).toList()).containsExactly(30000L, 50000L, 40000L);
        assertThat(rows.valueStream().map(row -> row.get("receivedMinor").asLong()).toList()).containsExactly(20000L, 50000L, 0L);
        assertThat(rows.valueStream().map(row -> row.get("remainingMinor").asLong()).toList()).containsExactly(10000L, 0L, 40000L);
        for (var response : List.of(summaryResponse, versoResponse, reception.get(chargePath(first, "")), reception.get(chargePath(first, "/payments")))) {
            assertThat(response.body()).doesNotContain(CANARY, "chiefComplaint", "assessment", "notes", "toothReference",
                    "consultationId", "treatmentId", "prescription", "recordedBy", "operationId");
        }
        problem(reception.get(CONSULTATIONS + "?patientId=" + patientId()), 403);
        problem(reception.get("/api/v1/prescriptions?patientId=" + patientId()), 403);
    }

    @Test void totalsBeyondJavascriptSafeIntegerRemainExactStrings() throws Exception {
        long maximum = 9007199254740991L;
        var first = charge("2026-11-10", "Soin A", maximum);
        var second = charge("2026-11-10", "Soin B", maximum);
        pay(reception, first, payment(0, maximum));
        pay(reception, second, payment(0, maximum - 1));
        var totals = expect(reception.get(patientPath("/summary")), 200).get("totals");
        assertThat(totals).isEqualTo(json.readTree(
                "{\"currency\":\"MAD\",\"chargesMinor\":\"18014398509481982\",\"receivedMinor\":\"18014398509481981\",\"outstandingMinor\":\"1\"}"));
    }

    @Test void paymentHistoryUsesExclusiveBoundedCursorForSameTimestamp() throws Exception {
        var charge = charge("2026-11-10", "Soin", 100);
        for (int i = 0; i < 51; i++) pay(reception, charge, payment(i, 1));
        String path = chargePath(charge, "/payments");
        var first = expect(reception.get(path), 200);
        assertThat(first.get("items").size()).isEqualTo(50);
        var cursor = first.get("nextCursor");
        var last = first.get("items").get(49);
        assertThat(cursor.get("paymentId")).isEqualTo(last.get("id"));
        assertThat(cursor.get("paidAt")).isEqualTo(last.get("paidAt"));
        var second = expect(reception.get(path + "&afterPaidAt=" + cursor.get("paidAt").asString()
                + "&afterPaymentId=" + cursor.get("paymentId").asString()), 200);
        assertThat(second.get("items").size()).isEqualTo(1);
        assertThat(first.get("items").valueStream().toList()).doesNotContain(second.get("items").get(0));
        assertThat(second.get("nextCursor").isNull()).isTrue();
    }

    @Test void summaryAndVersoUseBoundedPagesWithUnpagedTotals() throws Exception {
        createChargesForPagination(51);
        for (String suffix : List.of("/summary", "/verso")) {
            String path = patientPath(suffix);
            var first = expect(reception.get(path), 200);
            assertThat(first.get("items").size()).isEqualTo(50);
            var cursor = first.get("nextCursor");
            var second = expect(reception.get(path + "?afterDate=" + cursor.get("date").asString()
                    + "&afterChargeId=" + cursor.get("chargeId").asString()), 200);
            assertThat(second.get("items").size()).isEqualTo(1);
            assertThat(first.get("items").valueStream().toList()).doesNotContain(second.get("items").get(0));
            assertThat(second.get("nextCursor").isNull()).isTrue();
            assertThat(second.get("totals")).isEqualTo(first.get("totals"));
            assertThat(first.get("totals").get("chargesMinor").asString()).isEqualTo("510");
        }
    }

    @Test void rejectsAmbiguousQueriesAndIncompleteCursors() throws Exception {
        var charge = charge("2026-11-10", "Soin", 100);
        problem(reception.get(chargePath(charge, "") + "&patientId=" + patientId()), 400);
        problem(reception.get(chargePath(charge, "/payments") + "&limit=1000"), 400);
        problem(reception.get(chargePath(charge, "/payments") + "&afterPaidAt=" + PAID_AT), 400);
        problem(reception.get(chargePath(charge, "/payments") + "&afterPaidAt=&afterPaymentId=" + UUID.randomUUID()), 400);
        problem(reception.get(patientPath("/verso") + "?afterChargeId=" + UUID.randomUUID()), 400);
        problem(reception.get(patientPath("/summary") + "?afterDate=2026-02-30&afterChargeId=" + UUID.randomUUID()), 400);
    }

    @Test void storageFailureReturnsSafe500AndRollsBackPaymentAndVersion() throws Exception {
        var charge = charge("2026-11-10", "Soin", 100);
        jdbc.execute("""
                CREATE FUNCTION reject_http_finance_audit() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF NEW.target_payment_id IS NOT NULL THEN
                        RAISE EXCEPTION 'CONFIDENTIAL-SYNTHETIC-FINANCIAL-HTTP-CANARY';
                    END IF;
                    RETURN NEW;
                END $$
                """);
        jdbc.execute("CREATE TRIGGER reject_http_finance_audit BEFORE INSERT ON security_audit_event FOR EACH ROW EXECUTE FUNCTION reject_http_finance_audit()");
        try {
            problem(reception.send("POST", chargePath(charge, "/payments"), payment(0, 20), true), 500);
            assertThat(expect(reception.get(chargePath(charge, "")), 200)).isEqualTo(charge);
            assertThat(expect(reception.get(chargePath(charge, "/payments")), 200).get("items").size()).isZero();
        } finally {
            jdbc.execute("DROP TRIGGER reject_http_finance_audit ON security_audit_event");
            jdbc.execute("DROP FUNCTION reject_http_finance_audit()");
        }
    }

    @Test void consultationPricingMapsActiveTreatmentsByUuidIncludingAnExplicitZeroPrice() throws Exception {
        var first = source("2026-11-10", "Même libellé");
        var record = addTreatment(first, "2026-11-10", "Même libellé");
        String priced = first.get("treatments").get(0).get("id").asString();
        String unpriced = record.get("treatments").valueStream().map(t -> t.get("id").asString())
                .filter(id -> !id.equals(priced)).findFirst().orElseThrow();
        var removable = addTreatment(record, "2026-11-10", "Soin retiré");
        String removed = removable.get("treatments").valueStream().filter(t -> t.get("content").get("description").asString().equals("Soin retiré"))
                .findFirst().orElseThrow().get("id").asString();
        var current = expect(dentist.send("PUT", consultationPath(removable, "/treatments/" + removed + "/removal"),
                version(removable), true), 200);
        var input = chargeInput(current, 0).put("treatmentId", priced);
        var charge = expect(dentist.send("POST", CHARGES, input, true), 201);
        var response = dentist.get(pricingPath(current));
        var pricing = expect(response, 200);
        assertFields(pricing, "patientId", "consultationId", "consultationVersion", "items");
        assertThat(pricing.get("patientId").asString()).isEqualTo(patientId());
        assertThat(pricing.get("consultationId")).isEqualTo(current.get("id"));
        assertThat(pricing.get("consultationVersion")).isEqualTo(current.get("version"));
        assertThat(pricing.get("items").valueStream().toList()).containsExactlyInAnyOrder(
                json.createObjectNode().put("treatmentId", priced).put("state", "PRICED")
                        .put("chargeId", charge.get("chargeId").asString()).put("priceMinor", 0),
                json.createObjectNode().put("treatmentId", unpriced).put("state", "UNPRICED")
                        .putNull("chargeId").putNull("priceMinor"));
        assertThat(response.body()).doesNotContain(CANARY, "Même libellé", "toothReference", "notes", "prescription");
        conflict(dentist.send("POST", CHARGES, input, true), "DUPLICATE_CHARGE");
        var collection = expect(reception.get(patientPath("/summary")), 200);
        assertThat(collection.get("items").size()).isEqualTo(1);
        assertThat(collection.toString()).doesNotContain(priced, unpriced, "treatmentId", CANARY);
    }

    @Test void pricingRemainsReadableAfterFinalizationAndPatientArchive() throws Exception {
        var source = source("2026-11-10", "Soin synthétique");
        var charge = expect(dentist.send("POST", CHARGES, chargeInput(source, 30000), true), 201);
        var finalized = expect(dentist.send("PUT", consultationPath(source, "/finalization"), version(source), true), 200);
        var beforeArchive = expect(dentist.get(pricingPath(finalized)), 200);
        assertThat(beforeArchive.get("consultationVersion")).isEqualTo(finalized.get("version"));
        assertThat(beforeArchive.get("items").get(0).get("chargeId")).isEqualTo(charge.get("chargeId"));

        var archive = version(patient).put("status", "inactive");
        archive.set("identity", patient.get("identity"));
        expect(reception.send("PUT", PATIENTS + "/" + patientId(), archive, true), 200);
        assertThat(expect(dentist.get(pricingPath(finalized)), 200)).isEqualTo(beforeArchive);
        conflict(dentist.send("POST", CHARGES, chargeInput(finalized, 30000), true), "ARCHIVED_PATIENT");
    }

    @Test void pricingRequiresDentistAndValidConsultationScope() throws Exception {
        var empty = consultation("2026-11-10");
        String path = pricingPath(empty);
        assertThat(expect(dentist.get(path), 200).get("items").size()).isZero();
        problem(reception.get(path), 403);
        try (var anonymous = new Browser(null)) {
            problem(anonymous.get(path), 401);
        }
        problem(dentist.get(path + "&patientId=" + patientId()), 400);
        problem(dentist.get(BASE + "/consultations/not-a-uuid/pricing?patientId=" + patientId()), 400);
        String foreign = patient().get("id").asString();
        problem(dentist.get(path.replace(patientId(), foreign)), 404);
        problem(dentist.get(BASE + "/consultations/" + UUID.randomUUID() + "/pricing?patientId=" + patientId()), 404);
    }

    @Test void pricingReadFailureDoesNotReturnAnEmptyOrPartialProjection() throws Exception {
        var source = source("2026-11-10", "Soin synthétique");
        jdbc.execute("ALTER TABLE treatment_charge RENAME COLUMN price_minor TO price_minor_test");
        try {
            problem(dentist.get(pricingPath(source)), 500);
        } finally {
            jdbc.execute("ALTER TABLE treatment_charge RENAME COLUMN price_minor_test TO price_minor");
        }
        assertThat(expect(dentist.get(pricingPath(source)), 200).get("items").size()).isEqualTo(1);
    }

    private String pricingPath(JsonNode consultation) {
        return BASE + "/consultations/" + consultation.get("id").asString() + "/pricing?patientId=" + patientId();
    }

    @Test void dossierDownloadIsDentistOnlyAndScopedToAnExistingPatient() throws Exception {
        String route = PATIENTS + "/" + patientId() + "/dossier.pdf";
        problem(reception.get(route), 403);
        try (var anonymous = new Browser(null)) {
            problem(anonymous.get(route), 401);
        }
        problem(dentist.get(PATIENTS + "/" + UUID.randomUUID() + "/dossier.pdf"), 404);
        problem(dentist.get(PATIENTS + "/1-1-1-1-1/dossier.pdf"), 400);
        problem(dentist.get(route + "?disposition=inline"), 400);
    }

    @Test void archivedDossierDownloadsPersistedPatientAndFinancialDataWithNoPayloadLogging(CapturedOutput output) throws Exception {
        var charge = charge("2026-11-10", "Détartrage synthétique", 30000);
        pay(reception, charge, payment(0, 10001));
        pay(reception, charge, payment(1, 5000));
        var paid = charge("2026-11-10", "Détartrage synthétique", 50000);
        pay(dentist, paid, payment(0, 50000));
        String path = PATIENTS + "/" + patientId();
        var medical = expect(dentist.get(path + "/medical-record"), 200);
        var medicalInput = version(medical);
        var content = medical.get("record").<ObjectNode>deepCopy();
        ((ObjectNode) content.get("healthQuestionnaire")).put("additionalInformation", CANARY)
                .put("underMedicalTreatment", "yes").put("pregnant", "no");
        medicalInput.set("record", content);
        expect(dentist.send("PUT", path + "/medical-record", medicalInput, true), 200);
        var identity = (ObjectNode) patient.get("identity").deepCopy();
        identity.put("firstName", "Éléonore").put("address", "Résidence synthétique").put("medicalCoverage", "Mutuelle fictive");
        var archive = version(patient).put("status", "inactive");
        archive.set("identity", identity);
        expect(reception.send("PUT", path, archive, true), 200);

        var response = dentist.pdf(path + "/dossier.pdf");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("content-type")).contains("application/pdf");
        assertThat(response.headers().firstValue("content-disposition")).contains("attachment; filename=\"dossier-" + patientId() + ".pdf\"");
        assertThat(response.headers().firstValue("content-length")).contains(Integer.toString(response.body().length));
        assertThat(response.headers().firstValue("cache-control").orElseThrow()).contains("private", "no-store");
        try (var pdf = Loader.loadPDF(response.body())) {
            assertThat(pdf.getNumberOfPages()).isEqualTo(2);
            assertThat(pdf.getPage(0).getCropBox().getHeight()).isCloseTo(595.5f, org.assertj.core.api.Assertions.within(.01f));
        }
        var text = pdfText(response);
        assertThat(text).contains("Finance Éléonore", "Résidence synthétique", "Mutuelle fictive", CANARY,
                "150,01", "149,99", "650,01", "TOTAL DES SOINS", "800,00");
        assertThat(text.split("Détartrage synthétique", -1)).hasSize(3);
        assertThat(output.getAll()).doesNotContain(CANARY, "Éléonore", "Résidence synthétique", PASSWORD);
    }

    @Test void dossierSnapshotStaysConsistentWhenPaymentCommitsDuringTheRead() throws Exception {
        var charge = charge("2026-11-10", "Soin instantané synthétique", 10001);
        UUID owner = UUID.fromString(patientId());
        var entered = new CountDownLatch(1);
        var committed = new CountDownLatch(1);
        TreatmentFinancialService target = AopTestUtils.getUltimateTargetObject(financial);
        org.mockito.Mockito.doAnswer(call -> {
            entered.countDown();
            assertThat(committed.await(8, TimeUnit.SECONDS)).isTrue();
            return call.callRealMethod();
        }).when(target).dossierLedger(owner);

        String path = PATIENTS + "/" + owner + "/dossier.pdf";
        try (var executor = Executors.newSingleThreadExecutor()) {
            var before = executor.submit(() -> dentist.pdf(path));
            try {
                assertThat(entered.await(8, TimeUnit.SECONDS)).isTrue();
                pay(reception, charge, payment(0, 3725));
            } finally {
                committed.countDown();
            }
            var original = pdfText(before.get(12, TimeUnit.SECONDS));
            assertThat(original).contains("100,01", "0,00").doesNotContain("37,25", "62,76");
            assertThat(pdfText(dentist.pdf(path))).contains("100,01", "37,25", "62,76");
        }
    }

    @Test void dossierOverflowsOntoRepeatedFinancialPagesWithCompleteTotals() throws Exception {
        var record = consultation("2026-11-10");
        for (int index = 0; index < 36; index++) {
            String label = "Traitement synthétique " + index;
            record = addTreatment(record, "2026-11-10", label);
            String treatment = record.get("treatments").valueStream()
                    .filter(item -> item.get("content").get("description").asString().equals(label))
                    .findFirst().orElseThrow().get("id").asString();
            expect(dentist.send("POST", CHARGES, chargeInput(record, 10001).put("treatmentId", treatment), true), 201);
        }
        var response = dentist.pdf(PATIENTS + "/" + patientId() + "/dossier.pdf");
        var text = pdfText(response);
        assertThat(text).contains("Traitement synthétique 0", "Traitement synthétique 35", "3 600,36", "RESTE À PAYER");
        try (var pdf = Loader.loadPDF(response.body())) {
            assertThat(pdf.getNumberOfPages()).isEqualTo(3);
            for (var page : pdf.getPages()) assertThat(page.getCropBox().getWidth()).isCloseTo(419.25f, org.assertj.core.api.Assertions.within(.01f));
        }
    }

    @Nested
    class InvoiceHttp {
        private static final String INVOICES = "/api/v1/invoices";

        @Test void dentistCreatesDraftWithLocationAndReceptionistCanReadIt() throws Exception {
            String chargeId = chargeId(charge("2026-11-10", "Soin synthétique", 12550));
            var response = dentist.send("POST", INVOICES, selection(chargeId).put("patientId", patientId()), true);
            var draft = expect(response, 201);
            assertThat(response.headers().firstValue("Location")).contains(invoicePath(draft, ""));
            assertThat(draft.get("lifecycle").asString()).isEqualTo("BROUILLON");
            assertThat(draft.get("version").asLong()).isZero();
            assertThat(draft.get("issuanceSnapshot").isNull()).isTrue();
            assertThat(current(draft).get("settlement").isNull()).isTrue();
            assertThat(current(draft).get("balance").get("totalMinor").asString()).isEqualTo("12550");
            assertThat(draft.get("draft").get("lines").get(0).get("chargeId").asString()).isEqualTo(chargeId);
            assertThat(expect(reception.get(invoicePath(draft, "")), 200)).isEqualTo(draft);
        }

        @Test void receptionistCreatesAndEditsDraftAndRemovedChargeBecomesAvailable() throws Exception {
            String first = chargeId(charge("2026-11-10", "Soin A", 100));
            String second = chargeId(charge("2026-11-11", "Soin B", 250));
            assertThat(eligibleIds()).containsExactly(first, second);
            var draft = create(reception, first);
            assertThat(eligibleIds()).containsExactly(second);
            conflict(reception.send("POST", INVOICES, selection(first).put("patientId", patientId()), true), "CHARGE_RESERVED");
            var edit = expect(reception.send("PUT", invoicePath(draft, ""), selection(second).put("expectedVersion", 0), true), 200);
            assertThat(edit.get("version").asLong()).isEqualTo(1);
            assertThat(edit.get("draft").get("lines").get(0).get("chargeId").asString()).isEqualTo(second);
            assertThat(eligibleIds()).containsExactly(first);
            conflict(dentist.send("PUT", invoicePath(draft, ""), selection(first).put("expectedVersion", 0), true), "VERSION_CONFLICT");
            assertThat(expect(dentist.get(invoicePath(draft, "")), 200)).isEqualTo(edit);
            create(dentist, first);
            assertThat(eligibleIds()).isEmpty();
        }

        @Test void requiresSessionAndCsrfAndDeniesUnlistedMethodsAndRoutes() throws Exception {
            var draft = create(dentist);
            try (var anonymous = new Browser(null)) {
                for (String path : List.of(invoicePath(draft, ""), patientInvoices(), eligiblePath())) {
                    problem(anonymous.get(path), 401);
                }
                problem(anonymous.send("POST", INVOICES, selection().put("patientId", patientId()), true), 401);
                problem(anonymous.send("PUT", invoicePath(draft, ""), selection().put("expectedVersion", 0), true), 401);
                problem(anonymous.send("POST", invoicePath(draft, "/issue"), command(0), true), 401);
            }
            problem(dentist.send("POST", INVOICES, selection().put("patientId", patientId()), false), 403);
            problem(reception.send("PUT", invoicePath(draft, ""), selection().put("expectedVersion", 0), false), 403);
            problem(reception.raw("POST", invoicePath(draft, "/issue"), "{\"expectedVersion\":0}", "incorrect"), 403);
            problem(reception.send("DELETE", invoicePath(draft, ""), null, true), 403);
            problem(reception.get(INVOICES), 403);
            problem(reception.get(invoicePath(draft, "/issue")), 403);
            assertThat(problem(reception.get(invoicePath(draft, "/pdf")), 409).get("code").asString()).isEqualTo("INVOICE_NOT_ISSUED");
        }

        @Test void strictRequestShapesRejectCoercionUntrustedValuesAndOversizedBodies() throws Exception {
            String valid = selection().put("patientId", patientId()).toString();
            for (String invalid : List.of("", "null", "[]", "{", "{}", valid + " {}", valid + " ".repeat(16384),
                    valid.replace("[]", "null"), valid.replace("[]", "[null]"), valid.replace("[]", "\"[]\""),
                    valid.replace("[]", "[\"1-1-1-1-1\"]"), valid.replace("[]", "[42]"),
                    valid.replace(patientId(), "1-1-1-1-1"),
                    valid.replace("[]", "[" + ("\"" + patientId() + "\",").repeat(250) + "\"" + patientId() + "\"]"),
                    valid.replace("[]", "[],\"chargeIds\":[]"), valid.replace("[]", "[],\"invoiceNumber\":\"2038-001\""),
                    valid.replace("[]", "[],\"expectedVersion\":0"), valid.replace("[]", "[],\"totalMinor\":12"),
                    valid.replace("[]", "[],\"priceMinor\":12"))) {
                problem(reception.raw("POST", INVOICES, invalid, reception.csrf), 400);
            }
            var draft = create(dentist);
            for (String invalid : List.of("{}", "{\"expectedVersion\":\"0\"}", "{\"expectedVersion\":0.0}",
                    "{\"expectedVersion\":-1}", "{\"expectedVersion\":9007199254740992}", "{\"expectedVersion\":null}",
                    "{\"expectedVersion\":0,\"chargeIds\":[]}", "{\"expectedVersion\":0,\"operationId\":\"secret\"}")) {
                problem(reception.raw("POST", invoicePath(draft, "/issue"), invalid, reception.csrf), 400);
            }
            problem(reception.send("PUT", invoicePath(draft, ""), selection(), true), 400);
            problem(reception.send("PUT", invoicePath(draft, ""), command(0), true), 400);
            problem(reception.get(INVOICES + "/1-1-1-1-1?patientId=" + patientId()), 400);
            problem(reception.get(INVOICES + "/" + draft.get("invoiceId").asString()), 400);
            problem(reception.get(invoicePath(draft, "") + "&patientId=" + patientId()), 400);
            conflict(reception.send("POST", invoicePath(draft, "/issue"), command(0), true), "EMPTY_DRAFT");
        }

        @Test void validatesPatientScopeAndDuplicateChargeSelections() throws Exception {
            String owned = chargeId(charge("2026-11-10", "Soin", 100));
            var draft = create(dentist);
            String foreignPatient = patient().get("id").asString();
            problem(reception.send("POST", INVOICES, selection(owned, owned).put("patientId", patientId()), true), 400);
            problem(reception.send("POST", INVOICES, selection(owned).put("patientId", foreignPatient), true), 404);
            problem(reception.send("POST", INVOICES, selection(UUID.randomUUID().toString()).put("patientId", patientId()), true), 404);
            problem(reception.send("POST", INVOICES, selection().put("patientId", UUID.randomUUID().toString()), true), 404);
            var foreign = invoicePath(draft, "").replace(patientId(), foreignPatient);
            problem(reception.get(foreign), 404);
            problem(reception.send("PUT", foreign, selection().put("expectedVersion", 0), true), 404);
            problem(reception.send("POST", invoicePath(draft, "/issue").replace(patientId(), foreignPatient), command(0), true), 404);
            problem(reception.get(PATIENTS + "/" + UUID.randomUUID() + "/invoices"), 404);
            problem(reception.get(PATIENTS + "/" + UUID.randomUUID() + "/invoice-eligible-charges"), 404);
            assertThat(expect(reception.get(PATIENTS + "/" + foreignPatient + "/invoices"), 200).get("items")).isEmpty();
            assertThat(eligibleIds()).containsExactly(owned);
        }

        @Test void issuanceFreezesIdentityAndPaymentSnapshotWhileV9PaymentsUpdateLiveBalance() throws Exception {
            var charged = charge("2026-11-10", "Soin synthétique", 12345);
            var draft = create(reception, chargeId(charged));
            pay(reception, charged, payment(0, 2345));
            conflict(dentist.send("POST", invoicePath(draft, "/issue"), command(1), true), "VERSION_CONFLICT");
            var issued = issue(reception, draft);
            var snapshot = issued.get("issuanceSnapshot");
            assertThat(issued.get("lifecycle").asString()).isEqualTo("EMISE");
            assertThat(issued.get("version").asLong()).isEqualTo(1);
            assertThat(issued.get("draft").isNull()).isTrue();
            assertThat(snapshot.get("invoiceNumber").asString()).matches("[0-9]{4}-[0-9]{3,}");
            assertThat(snapshot.get("billingIdentity").get("lastName").asString()).isEqualTo("Finance");
            assertThat(snapshot.get("lines").get(0).get("receivedAtIssueMinor").asLong()).isEqualTo(2345);
            assertThat(snapshot.get("balanceAtIssue").get("totalMinor").asString()).isEqualTo("12345");
            assertThat(snapshot.get("balanceAtIssue").get("receivedMinor").asString()).isEqualTo("2345");
            assertThat(snapshot.get("balanceAtIssue").get("remainingMinor").asString()).isEqualTo("10000");
            assertThat(current(issued).get("settlement").asString()).isEqualTo("PARTIAL");

            var rename = version(patient).put("status", "active");
            rename.set("identity", patient.get("identity").deepCopy());
            ((ObjectNode) rename.get("identity")).put("lastName", "Identité modifiée");
            expect(reception.send("PUT", PATIENTS + "/" + patientId(), rename, true), 200);
            pay(reception, charged, payment(1, 10000));
            var reloaded = expect(reception.get(invoicePath(draft, "")), 200);
            assertThat(reloaded.get("issuanceSnapshot")).isEqualTo(snapshot);
            assertThat(current(reloaded).get("balance").get("receivedMinor").asString()).isEqualTo("12345");
            assertThat(current(reloaded).get("balance").get("remainingMinor").asString()).isEqualTo("0");
            assertThat(current(reloaded).get("settlement").asString()).isEqualTo("SETTLED");
            assertThat(reloaded.get("version")).isEqualTo(issued.get("version"));
            var item = expect(reception.get(patientInvoices()), 200).get("items").get(0);
            assertThat(item.get("invoiceNumber")).isEqualTo(snapshot.get("invoiceNumber"));
            assertThat(item.get("issueDate")).isEqualTo(snapshot.get("issueDate"));
            assertThat(item.get("issuedAt")).isEqualTo(snapshot.get("issuedAt"));
            assertThat(item.get("createdAt")).isEqualTo(draft.get("createdAt"));
            assertThat(current(item)).isEqualTo(current(reloaded));
            assertThat(expect(reception.get(chargePath(charged, "/payments")), 200).get("items").size()).isEqualTo(2);

            conflict(dentist.send("PUT", invoicePath(draft, ""), selection().put("expectedVersion", 1), true), "INVOICE_ISSUED");
            conflict(reception.send("POST", invoicePath(draft, "/issue"), command(0), true), "INVOICE_ISSUED");
            conflict(reception.send("POST", INVOICES, selection(chargeId(charged)).put("patientId", patientId()), true), "CHARGE_RESERVED");
            assertThat(eligibleIds()).isEmpty();
            assertThat(invoiceAudit(draft)).containsExactlyInAnyOrder("INVOICE_CREATED", "INVOICE_ISSUED");
        }

        @Test void concurrentIssuanceOfSameDraftHasOneWinnerAndOneAuditEvent() throws Exception {
            var draft = create(dentist, chargeId(charge("2026-11-10", "Soin", 100)));
            String path = invoicePath(draft, "/issue");
            var responses = parallel(() -> dentist.send("POST", path, command(0), true),
                    () -> reception.send("POST", path, command(0), true));
            assertThat(responses.stream().map(HttpResponse::statusCode)).containsExactlyInAnyOrder(200, 409);
            var issued = expect(withStatus(responses, 200), 200);
            conflict(withStatus(responses, 409), "INVOICE_ISSUED");
            assertThat(expect(reception.get(invoicePath(draft, "")), 200)).isEqualTo(issued);
            assertThat(current(issued).get("settlement").asString()).isEqualTo("DUE");
            assertThat(invoiceAudit(draft)).containsExactlyInAnyOrder("INVOICE_CREATED", "INVOICE_ISSUED");
        }

        @Test void concurrentDistinctInvoicesReceiveDistinctNumbers() throws Exception {
            var a = create(dentist, chargeId(charge("2026-11-10", "Soin A", 100)));
            var b = create(reception, chargeId(charge("2026-11-10", "Soin B", 200)));
            var responses = parallel(() -> dentist.send("POST", invoicePath(a, "/issue"), command(0), true),
                    () -> reception.send("POST", invoicePath(b, "/issue"), command(0), true));
            var numbers = responses.stream().map(response -> expect(response, 200).get("issuanceSnapshot").get("invoiceNumber").asString()).toList();
            assertThat(numbers).doesNotHaveDuplicates().allMatch(number -> number.matches("[0-9]{4}-[0-9]{3,}"));
        }

        @Test void concurrentDraftsCompetingForOneChargeLeaveOneInvoice() throws Exception {
            String id = chargeId(charge("2026-11-10", "Soin", 100));
            var body = selection(id).put("patientId", patientId());
            var results = parallel(() -> dentist.send("POST", INVOICES, body, true),
                    () -> reception.send("POST", INVOICES, body, true));
            assertThat(results.stream().map(HttpResponse::statusCode)).containsExactlyInAnyOrder(201, 409);
            conflict(withStatus(results, 409), "CHARGE_RESERVED");
            assertThat(expect(reception.get(patientInvoices()), 200).get("items").size()).isEqualTo(1);
        }

        @Test void exactAmountsBeyondJavaScriptSafeIntegerStayStringsInDetailsAndHistory() throws Exception {
            long maximum = 9007199254740991L;
            var a = charge("2026-11-10", "Soin A", maximum);
            var b = charge("2026-11-11", "Soin B", maximum);
            pay(reception, a, payment(0, maximum));
            pay(dentist, b, payment(0, maximum));
            var issued = issue(dentist, create(reception, chargeId(a), chargeId(b)));
            var balance = issued.get("issuanceSnapshot").get("balanceAtIssue");
            assertThat(balance.get("totalMinor").isString()).isTrue();
            assertThat(balance.get("receivedMinor").isString()).isTrue();
            assertThat(balance.get("totalMinor").asString()).isEqualTo("18014398509481982");
            assertThat(balance.get("receivedMinor").asString()).isEqualTo("18014398509481982");
            assertThat(balance.get("remainingMinor").asString()).isEqualTo("0");
            assertThat(current(expect(reception.get(patientInvoices()), 200).get("items").get(0)).get("balance")).isEqualTo(balance);
        }

        @Test void historyUsesExclusiveBoundedCursorAcrossIdenticalTimestamps() throws Exception {
            for (int i = 0; i < 51; i++) create(reception);
            String path = patientInvoices();
            var first = expect(reception.get(path), 200);
            var cursor = first.get("nextCursor");
            assertThat(first.get("items").size()).isEqualTo(50);
            var second = expect(reception.get(path + "?afterCreatedAt=" + cursor.get("afterCreatedAt").asString()
                    + "&afterInvoiceId=" + cursor.get("afterInvoiceId").asString()), 200);
            assertThat(second.get("items").size()).isEqualTo(1);
            assertThat(first.get("items").valueStream().toList()).doesNotContain(second.get("items").get(0));
            assertThat(first.get("items").valueStream().map(row -> row.get("createdAt")).distinct().toList())
                    .containsExactly(second.get("items").get(0).get("createdAt"));
            assertThat(second.get("nextCursor").isNull()).isTrue();
            assertThat(second.get("items").get(0).get("invoiceNumber").isNull()).isTrue();
            for (String invalid : List.of("?limit=500", "?afterInvoiceId=" + patientId(),
                    "?afterCreatedAt=2026-01-01T00:00:00.1234567Z&afterInvoiceId=" + patientId(),
                    "?afterCreatedAt=2026-02-30T00:00:00Z&afterInvoiceId=" + patientId(),
                    "?afterCreatedAt=2026-01-01T00:00:00Z&afterInvoiceId=1-1-1-1-1")) {
                problem(reception.get(path + invalid), 400);
            }
        }

        @Test void eligibleChargeCursorUsesTreatmentDateAndIdAndNeverReturnsReservedCharges() throws Exception {
            createChargesForPagination(52);
            var first = expect(reception.get(eligiblePath()), 200);
            assertThat(first.get("items").size()).isEqualTo(50);
            String reserved = first.get("items").get(0).get("chargeId").asString();
            create(dentist, reserved);
            var cursor = first.get("nextCursor");
            var second = expect(reception.get(eligiblePath() + "?afterDate=" + cursor.get("afterDate").asString()
                    + "&afterChargeId=" + cursor.get("afterChargeId").asString()), 200);
            assertThat(second.get("items").size()).isEqualTo(2);
            assertThat(second.get("items").valueStream().toList()).doesNotContainAnyElementsOf(first.get("items").valueStream().toList());
            assertThat(second.get("nextCursor").isNull()).isTrue();
            assertThat(eligibleIds()).doesNotContain(reserved);
            problem(reception.get(eligiblePath() + "?afterDate=2026-11-10"), 400);
            problem(reception.get(eligiblePath() + "?afterDate=2026-02-30&afterChargeId=" + reserved), 400);
        }

        @Test void archivedPatientKeepsReadsButCannotSelectOrMutate() throws Exception {
            var draft = create(dentist, chargeId(charge("2026-11-10", "Soin A", 100)));
            charge("2026-11-11", "Soin B", 200);
            var archive = version(patient).put("status", "inactive");
            archive.set("identity", patient.get("identity"));
            expect(reception.send("PUT", PATIENTS + "/" + patientId(), archive, true), 200);
            assertThat(expect(reception.get(invoicePath(draft, "")), 200)).isEqualTo(draft);
            assertThat(expect(dentist.get(patientInvoices()), 200).get("items").size()).isEqualTo(1);
            assertThat(eligibleIds()).isEmpty();
            conflict(reception.send("POST", INVOICES, selection().put("patientId", patientId()), true), "ARCHIVED_PATIENT");
            conflict(reception.send("PUT", invoicePath(draft, ""), selection().put("expectedVersion", 0), true), "ARCHIVED_PATIENT");
            conflict(dentist.send("POST", invoicePath(draft, "/issue"), command(0), true), "ARCHIVED_PATIENT");
        }

        @Test void receptionistReceivesOnlyBillingProjectionsAndRemainsBlockedFromClinicalRoutes() throws Exception {
            var source = source("2026-11-10", "Soin visible");
            String treatmentId = source.get("treatments").get(0).get("id").asString();
            var charge = expect(dentist.send("POST", CHARGES, chargeInput(source, 0), true), 201);
            var eligible = expect(reception.get(eligiblePath()), 200).get("items").get(0);
            var draft = create(reception, chargeId(charge));
            var issued = issue(reception, draft);
            assertThat(current(issued).get("settlement").asString()).isEqualTo("SETTLED");
            assertFields(eligible, "chargeId", "treatmentDate", "treatmentLabel", "priceMinor");
            assertFields(draft.get("draft"), "billingIdentity", "lines");
            assertFields(issued.get("issuanceSnapshot"), "invoiceNumber", "issueDate", "issuedAt", "billingIdentity", "lines", "balanceAtIssue");
            assertFields(issued.get("issuanceSnapshot").get("billingIdentity"), "reference", "firstName", "lastName");
            assertFields(issued.get("issuanceSnapshot").get("lines").get(0),
                    "chargeId", "treatmentDate", "treatmentLabel", "priceMinor", "receivedAtIssueMinor", "toothReference");
            assertThat(issued.get("issuanceSnapshot").get("lines").get(0).get("toothReference").asString()).isEqualTo("16");
            assertThat(draft.get("draft").get("lines").get(0).has("toothReference")).isFalse();
            var history = expect(reception.get(patientInvoices()), 200);
            assertFields(history.get("items").get(0), "invoiceId", "invoiceNumber", "createdAt", "issueDate", "issuedAt",
                    "lifecycle", "currentFinancialState");
            for (var body : List.of(eligible, draft, issued, history)) {
                assertThat(body.toString()).doesNotContain(CANARY, treatmentId, source.get("id").asString(),
                        "clinicalObservations", "diagnoses", "allergies", "questionnaire", "prescriptions", "issuedBy");
            }
            problem(reception.get(consultationPath(source, "")), 403);
            problem(reception.get(PATIENTS + "/" + patientId() + "/medical-record"), 403);
            problem(reception.get("/api/v1/prescriptions?patientId=" + patientId()), 403);
        }

        @Test void officialInvoiceDownloadUsesOnlyFrozenBillingFieldsForBothRoles() throws Exception {
            var clinical = source("2026-11-10", "Révision synthétique");
            var charge = expect(dentist.send("POST", CHARGES, chargeInput(clinical, 12345), true), 201);
            pay(reception, charge, payment(0, 2345));
            var draft = create(reception, chargeId(charge));
            var issued = issue(reception, draft);
            String path = invoicePath(draft, "/pdf");
            String number = issued.get("issuanceSnapshot").get("invoiceNumber").asString();
            var initial = dentist.pdf(path);
            String original = pdfText(initial);
            assertThat(initial.headers().firstValue("content-type")).contains("application/pdf");
            assertThat(initial.headers().firstValue("cache-control").orElseThrow()).contains("no-store", "private");
            assertThat(initial.headers().firstValue("x-content-type-options")).contains("nosniff");
            assertThat(initial.headers().firstValueAsLong("content-length")).hasValue(initial.body().length);
            assertThat(initial.headers().firstValue("content-disposition")).contains("attachment; filename=\"facture-" + number + ".pdf\"");
            assertThat(original).contains("FACTURE Nº : " + number, "Patient synthétique Finance", "Révision synthétique",
                    "10/11/2026", "16", "123,45 DH", "23,45 DH", "100,00 DH", "cent vingt-trois dirhams et quarante-cinq centimes")
                    .doesNotContain(CANARY, patient.get("reference").asString(), clinical.get("id").asString());
            assertThat(pdfText(reception.pdf(path))).isEqualTo(original);

            var rename = version(patient).put("status", "active");
            rename.set("identity", patient.get("identity").deepCopy());
            ((ObjectNode) rename.get("identity")).put("lastName", "Nom mis à jour");
            expect(reception.send("PUT", PATIENTS + "/" + patientId(), rename, true), 200);
            var treatment = clinical.get("treatments").get(0);
            var edit = version(clinical);
            edit.set("content", treatment.get("content").deepCopy());
            ((ObjectNode) edit.get("content")).put("toothReference", "48");
            expect(dentist.send("PUT", consultationPath(clinical, "/treatments/" + treatment.get("id").asString()), edit, true), 200);
            pay(reception, charge, payment(1, 10000));
            var reprinted = reception.pdf(path);
            assertThat(pdfText(reprinted)).isEqualTo(original);
            assertThat(reprinted.body()).isEqualTo(initial.body());
            assertThat(current(expect(reception.get(invoicePath(draft, "")), 200)).get("balance").get("remainingMinor").asString())
                    .isEqualTo("0");
            var archived = version(expect(reception.get(PATIENTS + "/" + patientId()), 200)).put("status", "inactive");
            archived.set("identity", rename.get("identity"));
            expect(reception.send("PUT", PATIENTS + "/" + patientId(), archived, true), 200);
            assertThat(pdfText(reception.pdf(path))).isEqualTo(original);
        }

        @Test void invoicePdfEnforcesScopeAndReturnsOnlySafeProblemsForDraftAndOverflow() throws Exception {
            var draft = create(reception, chargeId(charge("2026-11-10", "Soin synthétique ".repeat(48), 100)));
            String path = invoicePath(draft, "/pdf");
            try (var anonymous = new Browser(null)) {
                problem(anonymous.get(path), 401);
            }
            problem(reception.get(path.replace(patientId(), patient().get("id").asString())), 404);
            problem(dentist.get(INVOICES + "/" + UUID.randomUUID() + "/pdf?patientId=" + patientId()), 404);
            problem(dentist.get(path + "&disposition=inline"), 400);
            problem(dentist.get(path + "&patientId=" + patientId()), 400);
            problem(dentist.get(path.split("\\?")[0]), 400);
            problem(dentist.send("POST", path, null, true), 403);
            assertThat(problem(reception.get(path), 409).get("code").asString()).isEqualTo("INVOICE_NOT_ISSUED");
            issue(dentist, draft);
            var error = reception.get(path);
            assertThat(problem(error, 422).get("code").asString()).isEqualTo("INVOICE_PDF_LAYOUT_OVERFLOW");
            assertThat(error.headers().firstValue("content-disposition")).isEmpty();
            assertThat(error.body()).doesNotContain("%PDF", "Soin synthétique");
        }

        @Test void incompleteToothSnapshotCaptureRollsBackIssuanceAndItsNumber() throws Exception {
            var draft = create(reception, chargeId(charge("2026-11-10", "Soin synthétique", 100)));
            var numbers = jdbc.queryForList("SELECT * FROM invoice_number_sequence ORDER BY invoice_year");
            jdbc.execute("""
                    CREATE FUNCTION skip_invoice_snapshot_test() RETURNS trigger LANGUAGE plpgsql AS $$
                    BEGIN RETURN NULL; END $$;
                    CREATE TRIGGER zz_skip_invoice_snapshot_test BEFORE UPDATE ON invoice_line
                        FOR EACH ROW EXECUTE FUNCTION skip_invoice_snapshot_test();
                    """);
            try {
                var response = reception.send("POST", invoicePath(draft, "/issue"), command(0), true);
                problem(response, 500);
                assertThat(response.body()).doesNotContain("Invoice line snapshot unavailable", "invoice_line");
                assertThat(expect(reception.get(invoicePath(draft, "")), 200)).isEqualTo(draft);
                assertThat(invoiceAudit(draft)).containsExactly("INVOICE_CREATED");
                assertThat(jdbc.queryForList("SELECT * FROM invoice_number_sequence ORDER BY invoice_year")).isEqualTo(numbers);
            } finally {
                jdbc.execute("DROP TRIGGER zz_skip_invoice_snapshot_test ON invoice_line; DROP FUNCTION skip_invoice_snapshot_test()");
            }
            var issued = issue(reception, draft);
            assertThat(issued.get("issuanceSnapshot").get("lines").get(0).get("toothReference").asString()).isEqualTo("16");
        }

        @Test void auditStorageFailureReturnsSanitized500AndRollsBackAllMutationsAndNumber() throws Exception {
            String a = chargeId(charge("2026-11-10", "Soin A", 100));
            String b = chargeId(charge("2026-11-11", "Soin B", 200));
            var draft = create(dentist, a);
            var numbers = jdbc.queryForList("SELECT * FROM invoice_number_sequence ORDER BY invoice_year");
            jdbc.execute("""
                    CREATE FUNCTION reject_invoice_http_audit() RETURNS trigger LANGUAGE plpgsql AS $$
                    BEGIN
                        IF NEW.target_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Synthetic audit rejection'; END IF;
                        RETURN NEW;
                    END $$;
                    CREATE TRIGGER reject_invoice_http_audit BEFORE INSERT ON security_audit_event
                        FOR EACH ROW EXECUTE FUNCTION reject_invoice_http_audit();
                    """);
            try {
                for (var response : List.of(
                        reception.send("POST", INVOICES, selection(b).put("patientId", patientId()), true),
                        reception.send("PUT", invoicePath(draft, ""), selection(b).put("expectedVersion", 0), true),
                        reception.send("POST", invoicePath(draft, "/issue"), command(0), true))) {
                    problem(response, 500);
                    assertThat(response.body()).doesNotContain("Synthetic audit rejection", "invoice_number_sequence", "security_audit_event");
                }
                assertThat(expect(reception.get(invoicePath(draft, "")), 200)).isEqualTo(draft);
                assertThat(expect(reception.get(patientInvoices()), 200).get("items").size()).isEqualTo(1);
                assertThat(eligibleIds()).containsExactly(b);
                assertThat(invoiceAudit(draft)).containsExactly("INVOICE_CREATED");
                assertThat(jdbc.queryForList("SELECT * FROM invoice_number_sequence ORDER BY invoice_year")).isEqualTo(numbers);
            } finally {
                jdbc.execute("DROP TRIGGER reject_invoice_http_audit ON security_audit_event; DROP FUNCTION reject_invoice_http_audit()");
            }
            issue(reception, draft);
        }

        private JsonNode create(Browser actor, String... ids) throws Exception {
            return expect(actor.send("POST", INVOICES, selection(ids).put("patientId", patientId()), true), 201);
        }

        private JsonNode issue(Browser actor, JsonNode draft) throws Exception {
            return expect(actor.send("POST", invoicePath(draft, "/issue"), command(draft.get("version").asLong()), true), 200);
        }

        private ObjectNode selection(String... ids) {
            var body = json.createObjectNode();
            var charges = body.putArray("chargeIds");
            for (String id : ids) charges.add(id);
            return body;
        }

        private ObjectNode command(long version) { return json.createObjectNode().put("expectedVersion", version); }
        private String invoicePath(JsonNode draft, String suffix) {
            return INVOICES + "/" + draft.get("invoiceId").asString() + suffix + "?patientId=" + patientId();
        }
        private String patientInvoices() { return PATIENTS + "/" + patientId() + "/invoices"; }
        private String eligiblePath() { return PATIENTS + "/" + patientId() + "/invoice-eligible-charges"; }
        private List<String> eligibleIds() throws Exception {
            return expect(reception.get(eligiblePath()), 200).get("items").valueStream().map(this::chargeId).toList();
        }
        private String chargeId(JsonNode node) { return node.get("chargeId").asString(); }
        private JsonNode current(JsonNode node) { return node.get("currentFinancialState"); }
        private HttpResponse<String> withStatus(List<HttpResponse<String>> responses, int status) {
            return responses.stream().filter(response -> response.statusCode() == status).findFirst().orElseThrow();
        }
        private List<String> invoiceAudit(JsonNode draft) {
            return jdbc.queryForList("SELECT event_type FROM security_audit_event WHERE target_invoice_id = ?",
                    String.class, UUID.fromString(draft.get("invoiceId").asString()));
        }
    }

    private void createChargesForPagination(int count) throws Exception {
        var consultation = consultation("2026-11-10");
        for (int i = 0; i < count; i++) {
            if (i > 0 && i % 50 == 0) consultation = consultation("2026-11-10");
            consultation = addTreatment(consultation, "2026-11-10", "Soin synthétique " + i);
            String label = "Soin synthétique " + i;
            var treatment = consultation.get("treatments").valueStream()
                    .filter(t -> t.get("content").get("description").asString().equals(label)).findFirst().orElseThrow();
            var input = chargeInput(consultation, 10).put("treatmentId", treatment.get("id").asString());
            expect(dentist.send("POST", CHARGES, input, true), 201);
        }
    }

    private static String pdfText(HttpResponse<byte[]> response) throws Exception {
        assertThat(response.statusCode()).isEqualTo(200);
        try (var pdf = Loader.loadPDF(response.body())) {
            return new PDFTextStripper().getText(pdf);
        }
    }

    private JsonNode patient() throws Exception {
        var identity = json.createObjectNode().put("firstName", "Patient synthétique").put("lastName", "Finance")
                .put("sex", "unanswered").putNull("dateOfBirth");
        for (String field : List.of("address", "gsm", "landline", "profession", "cin", "medicalCoverage")) identity.put(field, "");
        var input = json.createObjectNode().put("status", "active");
        input.set("identity", identity);
        return expect(reception.send("POST", PATIENTS, input, true), 201);
    }

    private JsonNode consultation(String date) throws Exception {
        var content = json.createObjectNode().putNull("appointmentId").put("consultationDate", date)
                .put("chiefComplaint", CANARY).put("clinicalObservations", CANARY).put("assessment", CANARY)
                .put("treatmentPlan", CANARY).put("notes", CANARY);
        var input = json.createObjectNode().put("patientId", patientId());
        input.set("content", content);
        return expect(dentist.send("POST", CONSULTATIONS, input, true), 201);
    }

    private JsonNode addTreatment(JsonNode consultation, String date, String label) throws Exception {
        var treatment = json.createObjectNode().put("treatmentDate", date).put("description", label)
                .put("toothReference", "16").put("notes", CANARY);
        var mutation = version(consultation);
        mutation.set("content", treatment);
        return expect(dentist.send("POST", consultationPath(consultation, "/treatments"), mutation, true), 200);
    }

    private JsonNode source(String date, String label) throws Exception {
        return addTreatment(consultation(date), date, label);
    }

    private ObjectNode chargeInput(JsonNode source, long price) {
        return json.createObjectNode().put("patientId", patientId()).put("consultationId", source.get("id").asString())
                .put("treatmentId", source.get("treatments").get(0).get("id").asString())
                .put("expectedConsultationVersion", source.get("version").asLong()).put("priceMinor", price);
    }

    private JsonNode charge(String date, String label, long price) throws Exception {
        return expect(dentist.send("POST", CHARGES, chargeInput(source(date, label), price), true), 201);
    }

    private ObjectNode payment(long version, long amount) {
        return json.createObjectNode().put("expectedChargeVersion", version).put("amountMinor", amount)
                .put("paidAt", PAID_AT).put("method", "ESPECES").put("operationId", UUID.randomUUID().toString());
    }

    private JsonNode pay(Browser actor, JsonNode charge, ObjectNode input) throws Exception {
        return expect(actor.send("POST", chargePath(charge, "/payments"), input, true), 200);
    }

    private String patientId() { return patient.get("id").asString(); }
    private String patientPath(String suffix) { return BASE + "/patients/" + patientId() + suffix; }
    private String chargePath(JsonNode charge, String suffix) {
        return CHARGES + "/" + charge.get("chargeId").asString() + suffix + "?patientId=" + patientId();
    }
    private String consultationPath(JsonNode consultation, String suffix) {
        return CONSULTATIONS + "/" + consultation.get("id").asString() + suffix + "?patientId=" + patientId();
    }
    private ObjectNode version(JsonNode entity) { return json.createObjectNode().put("version", entity.get("version").asLong()); }

    private int paymentAuditCount(JsonNode charge) {
        return jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE target_charge_id=? AND target_payment_id IS NOT NULL",
                Integer.class, UUID.fromString(charge.get("chargeId").asString()));
    }

    private JsonNode expect(HttpResponse<String> response, int status) {
        assertThat(response.statusCode()).as("HTTP status for %s", response.request().method()).isEqualTo(status);
        assertThat(response.headers().firstValue("cache-control").orElseThrow()).contains("no-store");
        return json.readTree(response.body());
    }

    private JsonNode problem(HttpResponse<String> response, int status) {
        var body = expect(response, status);
        assertThat(response.headers().firstValue("content-type").orElseThrow()).contains("application/problem+json");
        assertThat(body.get("status").asInt()).isEqualTo(status);
        assertThat(body.get("type").asString()).isEqualTo("about:blank");
        assertThat(body.get("instance").asString()).isEqualTo("urn:request:" + body.get("requestId").asString());
        assertThat(response.headers().firstValue("X-Request-ID")).contains(body.get("requestId").asString());
        assertThat(response.body()).doesNotContain(CANARY, PASSWORD, PAID_AT, "treatment_payment", "clinical_treatment", "Exception", "SELECT", "constraint");
        return body;
    }

    private void conflict(HttpResponse<String> response, String code) {
        assertThat(problem(response, 409).get("code").asString()).isEqualTo(code);
    }

    private static void assertFields(JsonNode body, String... fields) {
        assertThat(body.properties().stream().map(Map.Entry::getKey)).containsExactlyInAnyOrder(fields);
    }

    private static List<HttpResponse<String>> parallel(Callable<HttpResponse<String>> first, Callable<HttpResponse<String>> second) throws Exception {
        var barrier = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var left = executor.submit(() -> { barrier.await(10, TimeUnit.SECONDS); return first.call(); });
            var right = executor.submit(() -> { barrier.await(10, TimeUnit.SECONDS); return second.call(); });
            return List.of(left.get(25, TimeUnit.SECONDS), right.get(25, TimeUnit.SECONDS));
        }
    }

    private class Browser implements AutoCloseable {
        private final HttpClient client = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();
        private final String csrf;

        Browser(String username) throws Exception {
            String token = expect(get("/api/v1/auth/csrf"), 200).get("token").asString();
            if (username != null) {
                String body = json.writeValueAsString(Map.of("identifier", username, "password", PASSWORD));
                expect(raw("POST", "/api/v1/auth/login", body, token), 200);
            }
            csrf = expect(get("/api/v1/auth/csrf"), 200).get("token").asString();
        }

        HttpResponse<byte[]> pdf(String path) throws Exception {
            var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                    .timeout(Duration.ofSeconds(20)).GET().build();
            return client.send(request, HttpResponse.BodyHandlers.ofByteArray());
        }

        HttpResponse<String> get(String path) throws Exception { return raw("GET", path, "", null); }

        HttpResponse<String> send(String method, String path, JsonNode body, boolean token) throws Exception {
            return raw(method, path, body == null ? "" : json.writeValueAsString(body), token ? csrf : null);
        }

        HttpResponse<String> raw(String method, String path, String body, String token) throws Exception {
            var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).timeout(Duration.ofSeconds(20));
            if (token != null) request.header("X-CSRF-TOKEN", token);
            if (method.equals("GET")) request.GET();
            else request.header("Content-Type", "application/json").method(method, HttpRequest.BodyPublishers.ofString(body));
            return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
        }

        @Override public void close() { client.close(); }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class TimeConfiguration {
        @Bean @Primary PatientIntegrationTest.MovingClock financialHttpClock() {
            return new PatientIntegrationTest.MovingClock();
        }
    }
}
