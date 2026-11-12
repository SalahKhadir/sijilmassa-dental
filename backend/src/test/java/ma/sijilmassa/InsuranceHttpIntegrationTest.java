package ma.sijilmassa;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import ma.sijilmassa.security.AccountBootstrap;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
@ExtendWith(OutputCaptureExtension.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.flyway.locations=classpath:db/migration,classpath:db/testmigration", "server.servlet.session.cookie.secure=false"})
@Import(PatientIntegrationTest.TestTime.class)
class InsuranceHttpIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");
    private static final String API = "/api/v1";
    private static final String DOCUMENTS = API + "/insurance-documents";
    private static final String PATIENTS = API + "/patients";
    private static final String CONSULTATIONS = API + "/consultations";
    private static final String CHARGES = API + "/financial/charges";
    private static final String CANARY = "SYNTHETIC-INSURANCE-CONFIDENTIAL";
    private static final String FORM_SECRET = "SYNTHETIC-HOLDER-REFERENCE";
    private static final String PASSWORD = "Synthetic-Insurance-HTTP-42";
    private static final String DATE = "2026-11-11";
    private static final long MAX_MINOR = 9_007_199_254_740_991L;

    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @LocalServerPort int port;
    @Autowired JsonMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired AccountBootstrap bootstrap;
    @Autowired PatientIntegrationTest.MovingClock clock;

    private Browser dentist;
    private Browser receptionist;
    private JsonNode patient;

    @BeforeEach void login() throws Exception {
        clock.advance(120);
        if (count("application_user") == 0) {
            bootstrap.initialize("insurance.dentist", PASSWORD, "insurance.reception", PASSWORD);
        }
        dentist = new Browser("insurance.dentist");
        receptionist = new Browser("insurance.reception");
        patient = newPatient();
    }

    @AfterEach void close() {
        if (dentist != null) dentist.close();
        if (receptionist != null) receptionist.close();
    }

    @ParameterizedTest
    @CsvSource({"CNSS_DENTAIRE,cnss,ENTENTE_PREALABLE", "CNOPS_DENTAIRE,cnops,ENTENTE_PREALABLE", "FAR_DENTAIRE,far,DEVIS"})
    void eachDentalFamilyCanBeCreatedReadAndFinalized(String family, String variant, String purpose) throws Exception {
        var response = dentist.send("POST", DOCUMENTS, quote(family, 1), true);
        var draft = expect(response, 201);
        assertThat(response.headers().firstValue("location")).contains(path(draft, "", patientId()));
        assertThat(draft.get("documentType").asString()).isEqualTo(family);
        assertThat(draft.get("purpose").asString()).isEqualTo(purpose);
        assertThat(draft.get("templateVersion").asInt()).isEqualTo(1);
        assertThat(draft.get("lifecycle").asString()).isEqualTo("BROUILLON");
        assertThat(draft.get("version").asLong()).isZero();
        assertThat(draft.get("snapshot").isNull()).isTrue();
        assertThat(draft.get("draft").get("fields").get(variant).isObject()).isTrue();
        assertThat(expect(dentist.get(path(draft, "", patientId())), 200)).isEqualTo(draft);

        var result = finalizeDraft(draft);
        assertThat(result.get("lifecycle").asString()).isEqualTo("FINALISE");
        assertThat(result.get("version").asLong()).isEqualTo(1);
        assertThat(result.get("draft").isNull()).isTrue();
        assertThat(result.get("finalizedAt").asString()).endsWith("Z");
        var snapshot = result.get("snapshot");
        assertThat(snapshot.get("schemaVersion").asInt()).isEqualTo(1);
        assertThat(snapshot.get("templateSha256").asString()).matches("[0-9a-f]{64}");
        assertThat(snapshot.get("insured").get("source").asString()).isEqualTo("PATIENT");
        assertThat(snapshot.get("knownCompleteFeeTotalMinor").asString()).isEqualTo("15001");
        assertThat(snapshot.get("acts").get(0).get("feeSource").asString()).isEqualTo("MANUAL_QUOTE");
        assertThat(snapshot.get("acts").get(0).get("date").isNull()).isTrue();
        assertThat(events(draft)).containsExactlyInAnyOrder("INSURANCE_DOCUMENT_CREATED", "INSURANCE_DOCUMENT_FINALIZED");
    }

    @ParameterizedTest
    @CsvSource({"CNSS_DENTAIRE,3", "CNOPS_DENTAIRE,9", "FAR_DENTAIRE,5"})
    void eachFamilyEnforcesItsOwnCapacityOnCreateAndEdit(String family, int maximum) throws Exception {
        var draft = create(quote(family, maximum));
        assertThat(draft.get("draft").get("acts").size()).isEqualTo(maximum);
        problem(dentist.send("POST", DOCUMENTS, quote(family, maximum + 1), true), 400);
        problem(dentist.send("PUT", path(draft, "", patientId()), edit(0, quote(family, maximum + 1)), true), 400);
        assertThat(expect(dentist.get(path(draft, "", patientId())), 200)).isEqualTo(draft);
    }

    @Test void receptionistAndAnonymousAreDeniedOnEveryRouteRegardlessOfExistence() throws Exception {
        var draft = create(quote("CNSS_DENTAIRE", 1));
        var body = quote("CNSS_DENTAIRE", 1);
        try (var anonymous = new Browser(null)) {
            for (var documentId : List.of(id(draft), UUID.randomUUID().toString())) {
                for (String owner : List.of(patientId(), UUID.randomUUID().toString())) {
                    String route = DOCUMENTS + "/" + documentId + "?patientId=" + owner;
                    String finish = DOCUMENTS + "/" + documentId + "/finalize?patientId=" + owner;
                    problem(receptionist.get(route), 403);
                    problem(receptionist.send("PUT", route, edit(0, body), true), 403);
                    problem(receptionist.send("POST", finish, review(draft), true), 403);
                    problem(receptionist.get(history(owner)), 403);
                    problem(anonymous.get(route), 401);
                    problem(anonymous.send("PUT", route, edit(0, body), true), 401);
                    problem(anonymous.send("POST", finish, review(draft), true), 401);
                    problem(anonymous.get(history(owner)), 401);
                }
            }
            problem(receptionist.send("POST", DOCUMENTS, body, true), 403);
            problem(anonymous.send("POST", DOCUMENTS, body, true), 401);
        }
        problem(dentist.send("DELETE", path(draft, "", patientId()), null, true), 403);
        problem(dentist.send("POST", path(draft, "/submit", patientId()), review(draft), true), 403);
        assertThat(events(draft)).containsExactly("INSURANCE_DOCUMENT_CREATED");
    }

    @Test void mutationsRequireValidCsrfAndRevokedSessionsAreRejected() throws Exception {
        var body = quote("CNSS_DENTAIRE", 1);
        var draft = create(body);
        problem(dentist.send("POST", DOCUMENTS, body, false), 403);
        problem(dentist.send("PUT", path(draft, "", patientId()), edit(0, body), false), 403);
        problem(dentist.send("POST", path(draft, "/finalize", patientId()), review(draft), false), 403);
        problem(dentist.raw("POST", path(draft, "/finalize", patientId()), json.writeValueAsString(review(draft)), "invalid-csrf"), 403);
        assertThat(expect(dentist.get(path(draft, "", patientId())), 200)).isEqualTo(draft);
        jdbc.update("UPDATE application_user SET session_version=session_version+1 WHERE role='DENTIST'");
        problem(dentist.get(path(draft, "", patientId())), 401);
    }

    @Test void strictJsonRejectsUnknownDuplicateMalformedAndOversizedPayloads() throws Exception {
        var input = quote("CNSS_DENTAIRE", 1);
        String valid = json.writeValueAsString(input);
        String nested = valid.replace("\"registrationNumber\":", "\"registrationNumber\":\"duplicate\",\"registrationNumber\":");
        String unknownNull = valid.replace("\"registrationNumber\":", "\"unexpected\":null,\"registrationNumber\":");
        String misplaced = valid.replace("\"registrationNumber\":", "\"expectedVersion\":0,\"registrationNumber\":");
        int before = count("insurance_document");
        for (String body : List.of("{}", "[]", "{", valid + "{}", valid + " ".repeat(128 * 1024), nested, unknownNull, misplaced,
                valid.replace("\"fields\":", "\"fields\":null,\"fields\":"),
                valid.replace("\"acts\":[", "\"acts\":[null,"))) {
            problem(dentist.raw("POST", DOCUMENTS, body, dentist.csrf), 400);
        }
        assertThat(count("insurance_document")).isEqualTo(before);
    }

    @Test void noScalarCoercionForIdentifiersDatesEnumsVersionsAndCentimes() throws Exception {
        String valid = json.writeValueAsString(quote("CNSS_DENTAIRE", 1));
        for (String body : List.of(valid.replace("\"templateVersion\":1", "\"templateVersion\":\"1\""),
                valid.replace("\"templateVersion\":1", "\"templateVersion\":1.0"),
                valid.replace("\"quotedFeeMinor\":15001", "\"quotedFeeMinor\":\"15001\""),
                valid.replace("\"quotedFeeMinor\":15001", "\"quotedFeeMinor\":1e2"),
                valid.replace("\"quotedFeeMinor\":15001", "\"quotedFeeMinor\":9007199254740992"),
                valid.replace("\"quotedFeeMinor\":15001", "\"quotedFeeMinor\":-1"),
                valid.replace("\"coefficient\":12.5", "\"coefficient\":\"12.5\""),
                valid.replace("\"registrationNumber\":\"" + FORM_SECRET + "\"", "\"registrationNumber\":123"),
                valid.replace("\"" + patientId() + "\"", "\"1-1-1-1-1\""),
                valid.replace("\"LUI_MEME\"", "0"), valid.replace("\"LUI_MEME\"", "\" LUI_MEME \""),
                valid.replace("\"plannedDescription\":", "\"plannedDate\":[2026,11,11],\"plannedDescription\":"),
                valid.replace("\"plannedDescription\":", "\"plannedDate\":\"0000-01-01\",\"plannedDescription\":"),
                valid.replace("\"plannedDescription\":", "\"plannedDate\":\"2026-02-30\",\"plannedDescription\":"))) {
            problem(dentist.raw("POST", DOCUMENTS, body, dentist.csrf), 400);
        }
        var draft = create(quote("CNSS_DENTAIRE", 1));
        problem(dentist.raw("POST", path(draft, "/finalize", patientId()), "{\"expectedVersion\":0,\"expectedPatientVersion\":\"0\"}", dentist.csrf), 400);
        problem(dentist.raw("PUT", path(draft, "", patientId()), json.writeValueAsString(edit(0, quote("CNSS_DENTAIRE", 1)))
                .replace("\"expectedVersion\":0", "\"expectedVersion\":0e0"), dentist.csrf), 400);
    }

    @Test void unsupportedFamiliesVersionsAndInsurerSpecificShapeAreRejected() throws Exception {
        code(dentist.send("POST", DOCUMENTS, quote("CNSS_DENTAIRE", 1).put("documentType", "CNSS_MALADIE"), true),
                400, "UNSUPPORTED_TEMPLATE");
        code(dentist.send("POST", DOCUMENTS, quote("CNSS_DENTAIRE", 1).put("templateVersion", 2), true),
                400, "UNSUPPORTED_TEMPLATE");
        var wrongSection = quote("CNSS_DENTAIRE", 1);
        ((ObjectNode) wrongSection.get("draft").get("fields")).putObject("cnops");
        code(dentist.send("POST", DOCUMENTS, wrongSection, true), 400, "INVALID_INPUT");
        var wrongDiagnosis = quote("CNOPS_DENTAIRE", 1);
        ((ObjectNode) wrongDiagnosis.get("draft").get("fields").get("cnops")).put("diagnosisCategory", "K02.1");
        code(dentist.send("POST", DOCUMENTS, wrongDiagnosis, true), 400, "INVALID_INPUT");
        var wrongMark = quote("FAR_DENTAIRE", 1);
        ((ObjectNode) wrongMark.get("draft").get("fields").get("far").get("marks").get(0)).put("tooth", "99");
        code(dentist.send("POST", DOCUMENTS, wrongMark, true), 400, "INVALID_INPUT");
    }

    @Test void documentAndConsultationOwnershipAreEnforced() throws Exception {
        String other = newPatient().get("id").asString();
        var body = quote("CNSS_DENTAIRE", 1);
        var document = create(body);
        code(dentist.get(path(document, "", other)), 404, "NOT_FOUND");
        code(dentist.send("PUT", path(document, "", other), edit(0, body), true), 404, "NOT_FOUND");
        code(dentist.send("POST", path(document, "/finalize", other), review(document), true), 404, "NOT_FOUND");
        code(dentist.get(DOCUMENTS + "/" + UUID.randomUUID() + "?patientId=" + other), 404, "NOT_FOUND");
        var foreign = consultation(other);
        code(dentist.send("POST", DOCUMENTS, body.put("consultationId", foreign.get("id").asString()), true), 409, "INVALID_CONSULTATION");
        code(dentist.send("POST", DOCUMENTS, body.put("consultationId", UUID.randomUUID().toString()), true), 409, "INVALID_CONSULTATION");
        code(dentist.send("POST", DOCUMENTS, body.put("patientId", UUID.randomUUID().toString()), true), 404, "NOT_FOUND");
    }

    @Test void referencedTreatmentAndChargeMustBelongToTheSameConsultationAndPatient() throws Exception {
        var own = withTreatment(patientId(), consultation(patientId()), "Soin fictif");
        String other = newPatient().get("id").asString();
        var foreign = withTreatment(other, consultation(other), "Autre soin fictif");
        var foreignCharge = charge(other, foreign, 10000L);
        code(dentist.send("POST", DOCUMENTS, execution(own, treatmentId(foreign), null), true), 400, "INVALID_TREATMENT");
        code(dentist.send("POST", DOCUMENTS, execution(own, treatmentId(own), foreignCharge.get("chargeId").asString()), true),
                400, "INVALID_CHARGE");
        var removed = clinicalPath(own, "/treatments/" + treatmentId(own) + "/removal", patientId());
        expect(dentist.send("PUT", removed, clinicalVersion(own), true), 200);
        code(dentist.send("POST", DOCUMENTS, execution(own, treatmentId(own), null), true), 400, "INVALID_TREATMENT");
    }

    @Test void editReplacesDraftOnceAndStaleVersionsReturnConflict() throws Exception {
        var draft = create(quote("CNSS_DENTAIRE", 1));
        var replacement = quote("CNSS_DENTAIRE", 2);
        ((ObjectNode) replacement.get("draft").get("fields").get("cnss")).put("registrationNumber", "SYNTHETIC-UPDATED");
        var edited = expect(dentist.send("PUT", path(draft, "", patientId()), edit(0, replacement), true), 200);
        assertThat(edited.get("version").asLong()).isEqualTo(1);
        assertThat(edited.get("draft").get("acts").size()).isEqualTo(2);
        assertThat(edited.get("draft").get("fields").get("cnss").get("registrationNumber").asString()).isEqualTo("SYNTHETIC-UPDATED");
        code(dentist.send("PUT", path(draft, "", patientId()), edit(0, replacement), true), 409, "VERSION_CONFLICT");
        code(dentist.send("POST", path(draft, "/finalize", patientId()), review(draft), true), 409, "VERSION_CONFLICT");
        assertThat(expect(dentist.get(path(draft, "", patientId())), 200)).isEqualTo(edited);
        assertThat(events(draft)).containsExactlyInAnyOrder("INSURANCE_DOCUMENT_CREATED", "INSURANCE_DRAFT_UPDATED");
    }

    @Test void missingFinalizationFieldsKeepPartialDraftEditable() throws Exception {
        var body = quote("FAR_DENTAIRE", 1);
        ((ObjectNode) body.get("draft").get("fields").get("far")).remove("accountNumber");
        var draft = create(body);
        code(dentist.send("POST", path(draft, "/finalize", patientId()), review(draft), true), 409, "INCOMPLETE_DOCUMENT");
        assertThat(expect(dentist.get(path(draft, "", patientId())), 200)).isEqualTo(draft);
        assertThat(events(draft)).containsExactly("INSURANCE_DOCUMENT_CREATED");
    }

    @Test void finalizedStateSupportsReadBasedRecoveryAndRejectsReplaysAndEdits() throws Exception {
        var draft = create(quote("CNSS_DENTAIRE", 1));
        try (var secondSession = new Browser("insurance.dentist"); var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> dentist.send("POST", path(draft, "/finalize", patientId()), review(draft), true));
            var second = pool.submit(() -> secondSession.send("POST", path(draft, "/finalize", patientId()), review(draft), true));
            var responses = List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS));
            assertThat(responses).extracting(HttpResponse::statusCode).containsExactlyInAnyOrder(200, 409);
            for (var response : responses) if (response.statusCode() == 409) code(response, 409, "READ_ONLY");
        }
        // Recover as a client that never saw the successful response.
        var recovered = expect(dentist.get(path(draft, "", patientId())), 200);
        assertThat(recovered.get("lifecycle").asString()).isEqualTo("FINALISE");
        assertThat(recovered.get("version").asLong()).isEqualTo(1);
        code(dentist.send("POST", path(draft, "/finalize", patientId()), review(draft), true), 409, "READ_ONLY");
        code(dentist.send("PUT", path(draft, "", patientId()), edit(1, quote("CNSS_DENTAIRE", 2)), true), 409, "READ_ONLY");
        assertThat(events(draft)).containsExactlyInAnyOrder("INSURANCE_DOCUMENT_CREATED", "INSURANCE_DOCUMENT_FINALIZED");
    }

    @ParameterizedTest
    @CsvSource({"CNSS_DENTAIRE,cnss,3,270", "CNOPS_DENTAIRE,cnops,9,0"})
    void dentistDownloadsThePinnedTwoPageForm(String family, String branch, int count, int rotation) throws Exception {
        var input = quote(family, count);
        ((ObjectNode) input.get("draft").get("fields").get(branch)).put("registrationNumber", "012345678");
        var finalized = finalizeDraft(create(input));
        var counts = financialAndClinicalCounts();
        var response = dentist.pdf(path(finalized, "/pdf", patientId()));
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type")).contains("application/pdf");
        assertThat(response.headers().firstValue("Content-Length")).contains(Integer.toString(response.body().length));
        assertThat(response.headers().firstValue("Content-Disposition")).contains("attachment; filename=\"formulaire-assurance-" + id(finalized) + ".pdf\"");
        assertThat(response.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store", "private");
        assertThat(response.headers().firstValue("X-Content-Type-Options")).contains("nosniff");
        try (var pdf = Loader.loadPDF(response.body())) {
            assertThat(pdf.getNumberOfPages()).isEqualTo(2);
            assertThat(pdf.getPage(0).getRotation()).isEqualTo(rotation);
            assertThat(new PDFTextStripper().getText(pdf)).contains("Assurance Patient fictif").doesNotContain(CANARY, "150,01");
        }
        assertThat(financialAndClinicalCounts()).isEqualTo(counts);
    }

    @Test void pdfAuthorizationAndScopePrecedeRendering() throws Exception {
        var draft = create(quote("CNSS_DENTAIRE", 1));
        String url = path(draft, "/pdf", patientId());
        String missing = DOCUMENTS + "/" + UUID.randomUUID() + "/pdf?patientId=" + patientId();
        try (var anonymous = new Browser(null)) {
            problem(anonymous.get(url), 401);
        }
        for (String target : List.of(url, missing)) problem(receptionist.get(target), 403);
        code(dentist.get(path(draft, "/pdf", newPatient().get("id").asString())), 404, "NOT_FOUND");
        code(dentist.get(missing), 404, "NOT_FOUND");
        problem(dentist.get(url + "&patientId=" + patientId()), 400);
        problem(dentist.get(url + "&extra=1"), 400);
        code(dentist.get(url), 409, "INSURANCE_PDF_NOT_FINALIZED");
    }

    @Test void unsupportedFarAndOverflowReturnProblemsWithoutPdfBytes() throws Exception {
        var far = finalizeDraft(create(quote("FAR_DENTAIRE", 1)));
        code(dentist.get(path(far, "/pdf", patientId())), 409, "INSURANCE_PDF_FAR_UNAVAILABLE");
        var overflow = finalizeDraft(create(quote("CNSS_DENTAIRE", 1)));
        var response = dentist.get(path(overflow, "/pdf", patientId()));
        code(response, 422, "INSURANCE_PDF_LAYOUT_OVERFLOW");
        assertThat(response.headers().firstValue("Content-Disposition")).isEmpty();
        assertThat(response.body()).doesNotContain("%PDF-");
    }

    @Test void executionRequiresCompletedConsultationAndPreservesExactV9Prices(CapturedOutput output) throws Exception {
        var source = withTreatment(patientId(), consultation(patientId()), "Soin fictif");
        var charge = charge(patientId(), source, MAX_MINOR);
        var input = execution(source, treatmentId(source), charge.get("chargeId").asString());
        ((ObjectNode) input.get("draft").get("fields").get("cnss")).put("registrationNumber", "012345678");
        ((ObjectNode) input.get("draft").get("acts").get(0).get("fields")).put("actCode", "F01");
        var draft = create(input);
        code(dentist.send("POST", path(draft, "/finalize", patientId()), review(draft), true), 409, "INVALID_CONSULTATION");
        expect(dentist.send("PUT", clinicalPath(source, "/finalization", patientId()), clinicalVersion(source), true), 200);
        code(dentist.send("POST", path(draft, "/finalize", patientId()), review(draft), true), 409, "VERSION_CONFLICT");
        var reread = expect(dentist.get(path(draft, "", patientId())), 200);
        code(dentist.send("POST", path(draft, "/finalize", patientId()), review(reread).put("expectedPatientVersion", 9), true),
                409, "VERSION_CONFLICT");
        var counts = financialAndClinicalCounts();
        var finalized = finalizeDraft(reread);
        assertThat(finalized.get("snapshot").get("acts").get(0).get("feeMinor").asLong()).isEqualTo(MAX_MINOR);
        assertThat(finalized.get("snapshot").get("acts").get(0).get("feeSource").asString()).isEqualTo("V9_AGREED_PRICE");
        assertThat(finalized.get("snapshot").get("knownCompleteFeeTotalMinor").asString()).isEqualTo(Long.toString(MAX_MINOR));
        assertThat(financialAndClinicalCounts()).isEqualTo(counts);
        assertThat(json.writeValueAsString(finalized)).doesNotContain(CANARY, "notes", "medicalCoverage", "diagnosis");
        assertThat(output.getAll()).doesNotContain(CANARY, FORM_SECRET);
        String pdfPath = path(finalized, "/pdf", patientId());
        String before = pdfText(dentist.pdf(pdfPath));
        assertThat(before).contains("0,13", "Assurance Patient fictif").doesNotContain(CANARY, "Soin fictif", "90071992547409");
        var payment = json.createObjectNode().put("expectedChargeVersion", 0).put("amountMinor", 1)
                .put("paidAt", DATE + "T10:00:00Z").put("method", "ESPECES").put("operationId", UUID.randomUUID().toString());
        expect(receptionist.send("POST", CHARGES + "/" + charge.get("chargeId").asString() + "/payments?patientId=" + patientId(), payment, true), 200);
        var rename = clinicalVersion(patient).put("status", "active");
        rename.set("identity", patient.get("identity").deepCopy());
        ((ObjectNode) rename.get("identity")).put("firstName", "Nouveau prénom fictif");
        expect(receptionist.send("PUT", PATIENTS + "/" + patientId(), rename, true), 200);
        var afterPayment = financialAndClinicalCounts();
        assertThat(pdfText(dentist.pdf(pdfPath))).isEqualTo(before);
        assertThat(financialAndClinicalCounts()).isEqualTo(afterPayment);
        assertThat(expect(dentist.get(path(draft, "", patientId())), 200)).isEqualTo(finalized);
        assertThat(output.getAll()).doesNotContain(CANARY, FORM_SECRET);
    }

    @Test void farReceiptKeepsTheAgreedPriceSeparateFromPaymentEvidence() throws Exception {
        var visit = withTreatment(patientId(), consultation(patientId()), "Soin FAR fictif");
        var agreed = charge(patientId(), visit, 0);
        var input = quote("FAR_DENTAIRE", 0).put("purpose", "RECUS").put("consultationId", visit.get("id").asString());
        var draftActs = ((ObjectNode) input.get("draft")).putArray("acts");
        draftActs.addObject().put("treatmentId", treatmentId(visit)).putObject("fields");
        expect(dentist.send("PUT", clinicalPath(visit, "/finalization", patientId()), clinicalVersion(visit), true), 200);
        var draft = create(input);
        code(dentist.send("POST", path(draft, "/finalize", patientId()), review(draft), true), 409, "INCOMPLETE_DOCUMENT");
        ((ObjectNode) draftActs.get(0)).put("chargeId", agreed.get("chargeId").asString());
        var revised = expect(dentist.send("PUT", path(draft, "", patientId()), edit(0, input), true), 200);
        var counts = financialAndClinicalCounts();
        var result = finalizeDraft(revised);
        assertThat(result.get("snapshot").get("acts").get(0).get("feeMinor").asLong()).isZero();
        assertThat(result.get("snapshot").get("knownCompleteFeeTotalMinor").asString()).isEqualTo("0");
        code(dentist.get(path(result, "/pdf", patientId())), 409, "INSURANCE_PDF_FAR_UNAVAILABLE");
        assertThat(json.writeValueAsString(result)).doesNotContain("receivedMinor", "reimbursement", "paymentEvidence");
        assertThat(financialAndClinicalCounts()).isEqualTo(counts);
        var history = expect(dentist.get(history(patientId())), 200).get("items").get(0);
        assertThat(history.get("consultationId").asString()).isEqualTo(visit.get("id").asString());
        assertThat(history.get("finalizedAt")).isEqualTo(result.get("finalizedAt"));
    }

    @Test void quoteTotalsBeyondJavaScriptIntegerPrecisionUseDecimalStrings() throws Exception {
        var input = quote("CNOPS_DENTAIRE", 2);
        for (var act : input.get("draft").get("acts")) {
            ((ObjectNode) act.get("fields")).put("quotedFeeMinor", MAX_MINOR);
        }
        var result = finalizeDraft(create(input));
        var total = result.get("snapshot").get("knownCompleteFeeTotalMinor");
        assertThat(total.isString()).isTrue();
        assertThat(total.asString()).isEqualTo("18014398509481982");
    }

    @Test void archivedPatientKeepsFinalizedDetailsAndHistoryButRejectsAllWrites() throws Exception {
        var finalDoc = finalizeDraft(create(quote("CNOPS_DENTAIRE", 1)));
        var draft = create(quote("FAR_DENTAIRE", 1));
        var archive = clinicalVersion(patient).put("status", "inactive");
        archive.set("identity", patient.get("identity"));
        expect(receptionist.send("PUT", PATIENTS + "/" + patientId(), archive, true), 200);
        assertThat(expect(dentist.get(path(finalDoc, "", patientId())), 200)).isEqualTo(finalDoc);
        assertThat(dentist.pdf(path(finalDoc, "/pdf", patientId())).statusCode()).isEqualTo(200);
        var entries = expect(dentist.get(history(patientId())), 200).get("items");
        assertThat(entries.valueStream().map(item -> item.get("documentId").asString())).containsExactlyInAnyOrder(id(finalDoc), id(draft));
        code(dentist.send("POST", DOCUMENTS, quote("FAR_DENTAIRE", 1), true), 409, "ARCHIVED_PATIENT");
        code(dentist.send("PUT", path(draft, "", patientId()), edit(0, quote("FAR_DENTAIRE", 1)), true), 409, "ARCHIVED_PATIENT");
        code(dentist.send("POST", path(draft, "/finalize", patientId()), review(draft), true), 409, "ARCHIVED_PATIENT");
    }

    @Test void historyIsScopedAndStableAtEqualTimestampsAndHasNoConfidentialFields() throws Exception {
        String other = newPatient().get("id").asString();
        create(quote("CNSS_DENTAIRE", 1).put("patientId", other));
        var ids = new ArrayList<String>();
        UUID actor = jdbc.queryForObject("SELECT id FROM application_user WHERE role = 'DENTIST'", UUID.class);
        for (int i = 0; i < 53; i++) {
            UUID id = UUID.randomUUID();
            ids.add(id.toString());
            jdbc.update("""
                    INSERT INTO insurance_document(id,patient_id,document_type,template_version,purpose,lifecycle,version,
                        form_data,created_at,updated_at,created_by,updated_by)
                    VALUES (?,?,'CNSS_DENTAIRE',1,'ENTENTE_PREALABLE','BROUILLON',0,'{"cnss":{}}'::jsonb,
                        TIMESTAMPTZ '2026-11-11 10:00:00.123456Z',TIMESTAMPTZ '2026-11-11 10:00:00.123456Z',?,?)
                    """, id, UUID.fromString(patientId()), actor, actor);
        }
        ids.sort(Comparator.reverseOrder());
        var first = expect(dentist.get(history(patientId())), 200);
        assertThat(first.get("items").size()).isEqualTo(50);
        var cursor = first.get("nextCursor");
        assertThat(cursor.get("afterCreatedAt").asString()).isEqualTo(DATE + "T10:00:00.123456Z");
        assertThat(cursor.get("afterDocumentId").asString()).isEqualTo(ids.get(49));
        var second = expect(dentist.get(history(patientId()) + "?afterCreatedAt=" + cursor.get("afterCreatedAt").asString()
                + "&afterDocumentId=" + cursor.get("afterDocumentId").asString()), 200);
        assertThat(second.get("items").size()).isEqualTo(3);
        assertThat(second.get("nextCursor").isNull()).isTrue();
        var actual = new ArrayList<String>();
        for (var page : List.of(first, second)) {
            for (var entry : page.get("items")) {
                assertThat(entry.properties().stream().map(Map.Entry::getKey)).containsExactlyInAnyOrder(
                        "documentId", "consultationId", "documentType", "templateVersion", "lifecycle", "createdAt", "finalizedAt");
                actual.add(entry.get("documentId").asString());
            }
        }
        assertThat(actual).containsExactlyElementsOf(ids);
        assertThat(expect(dentist.get(history(other)), 200).get("items").size()).isEqualTo(1);
        code(dentist.get(history(UUID.randomUUID().toString())), 404, "NOT_FOUND");
    }

    @Test void queriesRejectMissingDuplicateAndUnsupportedParameters() throws Exception {
        var draft = create(quote("CNSS_DENTAIRE", 1));
        for (String suffix : List.of("", "?patientId=1-1-1-1-1", "?patientId=" + patientId() + "&patientId=" + patientId(),
                "?patientId=" + patientId() + "&extra=1")) {
            problem(dentist.get(DOCUMENTS + "/" + id(draft) + suffix), 400);
        }
        for (String query : List.of("?afterDocumentId=" + id(draft), "?afterCreatedAt=" + DATE + "T00:00:00Z",
                "?afterCreatedAt=" + DATE + "T00:00:00.1234567Z&afterDocumentId=" + id(draft), "?limit=50")) {
            problem(dentist.get(history(patientId()) + query), 400);
        }
    }

    @Test void auditFailureRollsBackCreationEditAndFinalization(CapturedOutput output) throws Exception {
        var body = quote("CNSS_DENTAIRE", 1);
        var draft = create(body);
        int documents = count("insurance_document");
        int acts = count("insurance_act");
        jdbc.execute("""
                CREATE FUNCTION reject_insurance_http_audit() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF NEW.target_insurance_document_id IS NOT NULL THEN RAISE EXCEPTION 'Synthetic audit rejection'; END IF;
                    RETURN NEW;
                END $$;
                CREATE TRIGGER reject_insurance_http_audit BEFORE INSERT ON security_audit_event
                    FOR EACH ROW EXECUTE FUNCTION reject_insurance_http_audit();
                """);
        try {
            problem(dentist.send("POST", DOCUMENTS, body, true), 500);
            problem(dentist.send("PUT", path(draft, "", patientId()), edit(0, quote("CNSS_DENTAIRE", 2)), true), 500);
            problem(dentist.send("POST", path(draft, "/finalize", patientId()), review(draft), true), 500);
        } finally {
            jdbc.execute("DROP TRIGGER reject_insurance_http_audit ON security_audit_event; DROP FUNCTION reject_insurance_http_audit()");
        }
        assertThat(count("insurance_document")).isEqualTo(documents);
        assertThat(count("insurance_act")).isEqualTo(acts);
        assertThat(expect(dentist.get(path(draft, "", patientId())), 200)).isEqualTo(draft);
        assertThat(events(draft)).containsExactly("INSURANCE_DOCUMENT_CREATED");
        assertThat(output.getAll()).doesNotContain(FORM_SECRET, "Synthetic audit rejection");
    }

    private ObjectNode quote(String family, int lineCount) {
        var input = json.createObjectNode().put("patientId", patientId()).put("documentType", family).put("templateVersion", 1)
                .put("purpose", family.equals("FAR_DENTAIRE") ? "DEVIS" : "ENTENTE_PREALABLE");
        var draft = input.putObject("draft");
        var fields = draft.putObject("fields");
        fields.putObject("insured").put("relationship", "LUI_MEME");
        switch (family) {
            case "CNSS_DENTAIRE" -> fields.putObject("cnss").put("registrationNumber", FORM_SECRET).put("practitionerInp", "012345678")
                    .putArray("careTypes").add("SOINS");
            case "CNOPS_DENTAIRE" -> fields.putObject("cnops").put("registrationNumber", FORM_SECRET).put("affiliationNumber", "AFF-FICTIVE")
                    .put("practitionerInpe", "012345678").put("diagnosisCategory", "K02");
            case "FAR_DENTAIRE" -> {
                fields.put("attachmentCount", 0);
                fields.putObject("far").put("accountNumber", FORM_SECRET).put("rank", "Grade fictif").put("unit", "Unité fictive")
                        .put("practitionerInpe", "012345678").put("care", "SOINS").put("context", "MALADIE")
                        .put("prospectusCount", 0).put("insuredStatementDate", DATE)
                        .putArray("marks").addObject().put("tooth", "16").put("symbol", "CERCLE");
            }
            default -> throw new IllegalArgumentException();
        }
        var acts = draft.putArray("acts");
        for (int i = 0; i < lineCount; i++) acts.addObject().putObject("fields").put("plannedDescription", "Devis fictif")
                .put("plannedTooth", "16").put("coefficient", new java.math.BigDecimal("12.5")).put("quotedFeeMinor", 15001);
        return input;
    }

    private ObjectNode execution(JsonNode consultation, String treatmentId, String chargeId) {
        var body = quote("CNSS_DENTAIRE", 0).put("purpose", "EXECUTION").put("consultationId", consultation.get("id").asString());
        var act = ((ObjectNode) body.get("draft")).putArray("acts").addObject().put("treatmentId", treatmentId);
        if (chargeId != null) act.put("chargeId", chargeId);
        act.putObject("fields").put("actCode", "FICTIF").put("keyValueMinor", 13);
        return body;
    }

    private JsonNode newPatient() throws Exception {
        var input = json.createObjectNode().put("status", "active");
        input.putObject("identity").put("firstName", "Patient fictif").put("lastName", "Assurance").put("sex", "F")
                .put("dateOfBirth", "1990-05-04").put("address", "Adresse fictive").put("gsm", "0612345678")
                .put("landline", "").put("profession", "").put("cin", "FICTIF1").put("medicalCoverage", CANARY);
        return expect(receptionist.send("POST", PATIENTS, input, true), 201);
    }

    private JsonNode consultation(String owner) throws Exception {
        var body = json.createObjectNode().put("patientId", owner);
        body.putObject("content").putNull("appointmentId").put("consultationDate", DATE)
                .put("chiefComplaint", CANARY).put("clinicalObservations", CANARY).put("assessment", CANARY)
                .put("treatmentPlan", CANARY).put("notes", CANARY);
        return expect(dentist.send("POST", CONSULTATIONS, body, true), 201);
    }

    private JsonNode withTreatment(String owner, JsonNode visit, String label) throws Exception {
        var body = clinicalVersion(visit);
        body.putObject("content").put("treatmentDate", DATE).put("description", label).put("toothReference", "16").put("notes", CANARY);
        return expect(dentist.send("POST", clinicalPath(visit, "/treatments", owner), body, true), 200);
    }

    private JsonNode charge(String owner, JsonNode source, long price) throws Exception {
        var body = json.createObjectNode().put("patientId", owner).put("consultationId", source.get("id").asString())
                .put("treatmentId", treatmentId(source)).put("expectedConsultationVersion", source.get("version").asLong())
                .put("priceMinor", price);
        return expect(dentist.send("POST", CHARGES, body, true), 201);
    }

    private String patientId() { return patient.get("id").asString(); }
    private static String id(JsonNode document) { return document.get("documentId").asString(); }
    private static String treatmentId(JsonNode visit) { return visit.get("treatments").get(0).get("id").asString(); }
    private static String path(JsonNode document, String suffix, String owner) {
        return DOCUMENTS + "/" + id(document) + suffix + "?patientId=" + owner;
    }
    private static String history(String owner) { return PATIENTS + "/" + owner + "/insurance-documents"; }
    private static String clinicalPath(JsonNode visit, String suffix, String owner) {
        return CONSULTATIONS + "/" + visit.get("id").asString() + suffix + "?patientId=" + owner;
    }
    private ObjectNode clinicalVersion(JsonNode value) { return json.createObjectNode().put("version", value.get("version").asLong()); }
    private ObjectNode edit(long version, ObjectNode source) {
        var input = json.createObjectNode().put("expectedVersion", version);
        input.set("draft", source.get("draft"));
        return input;
    }
    private ObjectNode review(JsonNode draft) {
        var input = json.createObjectNode().put("expectedVersion", draft.get("version").asLong())
                .put("expectedPatientVersion", draft.get("beneficiary").get("version").asLong());
        if (!draft.get("consultation").isNull()) input.put("expectedConsultationVersion", draft.get("consultation").get("version").asLong());
        return input;
    }
    private JsonNode create(ObjectNode body) throws Exception { return expect(dentist.send("POST", DOCUMENTS, body, true), 201); }
    private JsonNode finalizeDraft(JsonNode draft) throws Exception {
        return expect(dentist.send("POST", path(draft, "/finalize", patientId()), review(draft), true), 200);
    }
    private int count(String table) { return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class); }
    private List<Integer> financialAndClinicalCounts() {
        return List.of("treatment_charge", "treatment_payment", "invoice", "clinical_consultation", "clinical_treatment", "prescription")
                .stream().map(this::count).toList();
    }
    private List<String> events(JsonNode draft) {
        return jdbc.queryForList("SELECT event_type FROM security_audit_event WHERE target_insurance_document_id = ?",
                String.class, UUID.fromString(id(draft)));
    }

    private static String pdfText(HttpResponse<byte[]> response) throws Exception {
        assertThat(response.statusCode()).isEqualTo(200);
        try (var pdf = Loader.loadPDF(response.body())) {
            var stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            return stripper.getText(pdf);
        }
    }

    private JsonNode expect(HttpResponse<String> response, int status) {
        assertThat(response.statusCode()).as("%s %s", response.request().method(), response.request().uri().getPath()).isEqualTo(status);
        assertThat(response.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store");
        return json.readTree(response.body());
    }

    private JsonNode problem(HttpResponse<String> response, int status) {
        var body = expect(response, status);
        assertThat(response.headers().firstValue("Content-Type").orElseThrow()).contains("application/problem+json");
        assertThat(body.get("type").asString()).isEqualTo("about:blank");
        assertThat(body.get("status").asInt()).isEqualTo(status);
        String requestId = response.headers().firstValue("X-Request-ID").orElseThrow();
        assertThat(body.get("requestId").asString()).isEqualTo(requestId);
        assertThat(body.get("instance").asString()).isEqualTo("urn:request:" + requestId);
        assertThat(response.body()).doesNotContain(FORM_SECRET, CANARY, PASSWORD, "insurance_act", "insurance_document",
                "Exception", "SELECT", "Synthetic audit rejection");
        return body;
    }

    private void code(HttpResponse<String> response, int status, String code) {
        assertThat(problem(response, status).get("code").asString()).isEqualTo(code);
    }

    private class Browser implements AutoCloseable {
        private final HttpClient client = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();
        private final String csrf;

        Browser(String username) throws Exception {
            String token = expect(get(API + "/auth/csrf"), 200).get("token").asString();
            if (username != null) {
                expect(raw("POST", API + "/auth/login", json.writeValueAsString(Map.of("identifier", username, "password", PASSWORD)), token), 200);
                token = expect(get(API + "/auth/csrf"), 200).get("token").asString();
            }
            csrf = token;
        }

        HttpResponse<byte[]> pdf(String path) throws Exception {
            var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).timeout(Duration.ofSeconds(20)).GET();
            return client.send(request.build(), HttpResponse.BodyHandlers.ofByteArray());
        }

        HttpResponse<String> get(String path) throws Exception { return raw("GET", path, null, null); }

        HttpResponse<String> send(String method, String path, ObjectNode input, boolean withCsrf) throws Exception {
            return raw(method, path, input == null ? null : json.writeValueAsString(input), withCsrf ? csrf : null);
        }

        HttpResponse<String> raw(String method, String path, String body, String token) throws Exception {
            var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).timeout(Duration.ofSeconds(15));
            if (token != null) request.header("X-CSRF-TOKEN", token);
            if (body != null) request.header("Content-Type", "application/json");
            request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
            return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
        }

        @Override public void close() { client.close(); }
    }
}
