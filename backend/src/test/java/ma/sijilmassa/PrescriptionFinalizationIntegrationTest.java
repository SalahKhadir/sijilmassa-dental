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
@Import(PrescriptionFinalizationIntegrationTest.TimeConfiguration.class)
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@ExtendWith(OutputCaptureExtension.class)
class PrescriptionFinalizationIntegrationTest {
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
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean ma.sijilmassa.prescription.rendering.LocalPrescriptionRenderer renderer;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean ma.sijilmassa.prescription.PractitionerProfiles profiles;
    static final UUID DENTIST_ID = UUID.fromString("40000000-0000-4000-8000-000000000001");
    static final java.nio.file.Path PROFILE;
    static {
        try {
            PROFILE = java.nio.file.Files.createTempFile("synthetic-practitioner-", ".json");
            java.nio.file.Files.write(PROFILE, JsonMapper.builder().findAndAddModules().build().writeValueAsBytes(profile()));
            PROFILE.toFile().deleteOnExit();
        } catch (Exception e) { throw new ExceptionInInitializerError(e); }
    }
    static ma.sijilmassa.prescription.PractitionerProfiles.Profile profile() {
        return new ma.sijilmassa.prescription.PractitionerProfiles.Profile(1,"template-practitioner","test-revision",DENTIST_ID,true,
                ma.sijilmassa.prescription.rendering.LocalPrescriptionRenderer.TEMPLATE,
                "Dr Kaoutar Samghouli","الدكتورة كوثر السمغولي","Chirurgien-dentiste","طبيبة جراحة الأسنان",
                "Diplôme figurant sur le modèle approuvé","المؤهل المطبوع على النموذج المعتمد",
                "Adresse figurant sur le modèle approuvé","العنوان المطبوع على النموذج المعتمد",List.of("Numéro du modèle approuvé"),null);
    }
    static String digest(byte[] value) throws Exception { return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(value)); }
    @DynamicPropertySource static void rendererConfiguration(DynamicPropertyRegistry r) throws Exception {
        var worker=java.nio.file.Path.of("../frontend/.prescription-renderer").toAbsolutePath().normalize();
        String node=new ProcessBuilder("node","-p","process.execPath").start().inputReader().readLine();
        r.add("prescription.rendering.enabled",()->true); r.add("prescription.rendering.node-executable",()->node);
        r.add("prescription.rendering.worker-directory",()->worker.toString());
        r.add("prescription.rendering.modules-directory",()->java.nio.file.Path.of("../frontend/node_modules").toAbsolutePath().normalize().toString());
        String manifest=digest(java.nio.file.Files.readAllBytes(worker.resolve("manifest.json")));
        r.add("prescription.rendering.manifest-sha256",()->manifest);
        r.add("prescription.practitioner.file",()->PROFILE.toString()); String hash=digest(java.nio.file.Files.readAllBytes(PROFILE));
        r.add("prescription.practitioner.sha256",()->hash);
    }
    Browser dentist, reception;
    JsonNode patient;
    @BeforeEach void setup() throws Exception {
        org.mockito.Mockito.reset(renderer, profiles); clock.advance(120);
        if (jdbc.queryForObject("SELECT count(*) FROM application_user",Integer.class)==0) {
            var hash=new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(12).encode(PASSWORD);
            jdbc.update("INSERT INTO application_user(id,username,password_hash,role,created_at,updated_at) VALUES (?,'rx.dentist',?,'DENTIST',?,?)",DENTIST_ID,hash,java.sql.Timestamp.from(clock.instant()),java.sql.Timestamp.from(clock.instant()));
            jdbc.update("INSERT INTO application_user(id,username,password_hash,role,created_at,updated_at) VALUES (?,'rx.reception',?,'RECEPTIONIST',?,?)",UUID.randomUUID(),hash,java.sql.Timestamp.from(clock.instant()),java.sql.Timestamp.from(clock.instant()));
        }
        dentist=new Browser("rx.dentist"); reception=new Browser("rx.reception"); patient=patient();
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

    JsonNode complete() throws Exception {
        var input=input(); var c=(ObjectNode)input.get("content"); c.put("generalInstructions", "Instructions synthétiques privées");
        c.withArray("medications").add(line("Produit fictif Émeraude").put("dosage","Saisie fictive").put("frequency","Saisie fictive").put("duration","Saisie fictive"))
                .add(line("Produit fictif Zéphyr").put("dosage","Saisie fictive").put("frequency","Saisie fictive").put("duration","Saisie fictive"));
        return expect(dentist.send("POST",BASE,input,true),201);
    }
    ObjectNode finalInput(JsonNode p) { return version(p).put("patientVersion",p.get("patient").get("version").asLong()); }
    HttpResponse<String> finish(JsonNode p) throws Exception { return dentist.send("PUT",route(p,"/finalization"),finalInput(p),true); }
    String pdfRoute(JsonNode p) { return route(p,"/pdf")+"&version="+p.get("version").asLong(); }
    UUID id(JsonNode p) { return UUID.fromString(p.get("id").asString()); }
    void unchanged(JsonNode p) throws Exception {
        assertThat(expect(dentist.get(route(p,"")),200)).isEqualTo(p);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM prescription_document WHERE prescription_id=?",Integer.class,id(p))).isZero();
        assertThat(audits(p)).isEqualTo(1);
    }
    JsonNode snapshot(JsonNode p) { return json.readTree(jdbc.queryForObject("SELECT snapshot::text FROM prescription_document WHERE prescription_id=?",String.class,id(p))); }
    ma.sijilmassa.prescription.rendering.RenderedPdf rendered(JsonNode p) {
        return renderer.render(ma.sijilmassa.prescription.rendering.RenderingRequest.from(serviceDetails(p),ma.sijilmassa.prescription.rendering.RenderingRequest.Mode.FINAL_LAYOUT_CHECK));
    }
    ma.sijilmassa.prescription.PrescriptionDtos.Details serviceDetails(JsonNode p) {
        var context=org.springframework.security.core.context.SecurityContextHolder.getContext();
        context.setAuthentication(org.springframework.security.authentication.UsernamePasswordAuthenticationToken.authenticated(
                new ma.sijilmassa.security.AccountPrincipal(DENTIST_ID,"rx.dentist",ma.sijilmassa.security.Role.DENTIST,0),null,
                List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_DENTIST"))));
        try { return service.get(UUID.fromString(p.get("patientId").asString()),id(p)); }
        finally { org.springframework.security.core.context.SecurityContextHolder.clearContext(); }
    }
    @Test void successStoresOneA5WithExactOrderedSnapshotAndAuthenticatedPractitioner(CapturedOutput output) throws Exception {
        var p=complete(); var result=expect(finish(p),200);
        assertThat(result.get("status").asString()).isEqualTo("FINALISEE"); assertThat(result.get("version").asLong()).isEqualTo(1);
        assertThat(result.get("finalizedAt")).isEqualTo(result.get("updatedAt"));
        var snapshot=snapshot(p);
        assertThat(snapshot.get("prescription").get("medications")).isEqualTo(p.get("content").get("medications"));
        assertThat(snapshot.get("prescription").get("version").asLong()).isZero();
        assertThat(snapshot.get("practitioner")).isEqualTo(json.valueToTree(profile()));
        assertThat(snapshot.get("finalizedBy").asString()).isEqualTo(DENTIST_ID.toString());
        assertThat(snapshot.get("finalizedAt")).isEqualTo(result.get("finalizedAt"));
        assertThat(result.get("document").get("patientIdentity").get("firstName")).isEqualTo(p.get("patient").get("firstName"));
        var response=dentist.pdf(pdfRoute(result)); assertThat(response.statusCode()).isEqualTo(200);
        byte[] stored=jdbc.queryForObject("SELECT pdf_bytes FROM prescription_document WHERE prescription_id=?",byte[].class,id(p));
        assertThat(response.body()).isEqualTo(stored); assertThat(digest(stored)).isEqualTo(result.get("document").get("pdfSha256").asString());
        try(var pdf=org.apache.pdfbox.Loader.loadPDF(stored)) {
            assertThat(pdf.getNumberOfPages()).isEqualTo(1); assertThat(pdf.getPage(0).getMediaBox().getWidth()).isCloseTo(419.25f,within(.01f));
            String text=new org.apache.pdfbox.text.PDFTextStripper().getText(pdf);
            assertThat(text).contains("Émeraude","Zéphyr").doesNotContain("BROUILLON"); assertThat(text.indexOf("Émeraude")).isLessThan(text.indexOf("Zéphyr"));
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE target_prescription_id=? AND event_type='PRESCRIPTION_FINALIZED' AND actor_user_id=?",Integer.class,id(p),DENTIST_ID)).isEqualTo(1);
        assertThat(output.getAll()).doesNotContain(CANARY,PASSWORD,"Instructions synthétiques privées");
    }
    @Test void downloadHasSafeHeadersAndNoSensitiveFilename() throws Exception {
        var p=expect(finish(complete()),200); var r=dentist.pdf(pdfRoute(p)+"&disposition=attachment");
        assertThat(r.headers().firstValue("content-type").orElseThrow()).isEqualTo("application/pdf");
        assertThat(r.headers().firstValue("cache-control").orElseThrow()).contains("no-store");
        assertThat(r.headers().firstValue("x-content-type-options").orElseThrow()).isEqualTo("nosniff");
        assertThat(r.headers().firstValue("content-disposition").orElseThrow()).isEqualTo("attachment; filename=\"ordonnance-"+p.get("id").asString()+".pdf\"");
        assertThat(r.headers().firstValue("content-length").orElseThrow()).isEqualTo(""+r.body().length);
        assertThat(dentist.pdf(pdfRoute(p)).headers().firstValue("content-disposition").orElseThrow()).startsWith("inline;");
    }
    @Test void patientEditsAndArchiveDoNotChangeHistoricalIdentityOrBytesAndDownloadNeedsNoRendererOrProfile() throws Exception {
        var p=expect(finish(complete()),200); var before=dentist.pdf(pdfRoute(p)).body(); var snapshot=snapshot(p);
        var identity=patient.get("identity").deepCopy(); ((ObjectNode)identity).put("firstName","Nom changé");
        var input=version(patient).put("status","inactive");input.set("identity",identity);
        expect(reception.send("PUT","/api/v1/patients/"+patient.get("id").asString(),input,true),200);
        org.mockito.Mockito.clearInvocations(renderer,profiles);
        org.mockito.Mockito.doThrow(new AssertionError("download must not render")).when(renderer).render(org.mockito.ArgumentMatchers.any());
        org.mockito.Mockito.doThrow(new AssertionError("download must not load profile")).when(profiles).require(org.mockito.ArgumentMatchers.any());
        assertThat(dentist.pdf(pdfRoute(p)).body()).isEqualTo(before); assertThat(snapshot(p)).isEqualTo(snapshot);
        assertThat(expect(dentist.get(route(p,"")),200).get("document")).isEqualTo(p.get("document"));
        org.mockito.Mockito.verifyNoInteractions(renderer,profiles);
    }
    @Test void anonymousAndReceptionistDeniedOnBothRoutes() throws Exception {
        var p=complete();
        for(var browser:List.of(reception,new Browser(null))) {
            int status=browser==reception?403:401;
            try { problem(browser.send("PUT",route(p,"/finalization"),finalInput(p),true),status); problem(browser.get(pdfRoute(p)),status); }
            finally { if(browser!=reception) browser.close(); }
        } unchanged(p);
    }
    @Test void csrfAndUntrustedPractitionerFieldsAreRejected() throws Exception {
        var p=complete(); problem(dentist.send("PUT",route(p,"/finalization"),finalInput(p),false),403);
        problem(dentist.send("PUT",route(p,"/finalization"),finalInput(p).put("practitionerId",DENTIST_ID.toString()),true),400);
        unchanged(p); org.mockito.Mockito.verifyNoInteractions(renderer);
    }
    @Test void staleAggregateAndPatientVersionsFailBeforeRendering() throws Exception {
        var p=complete();
        problem(dentist.send("PUT",route(p,"/finalization"),finalInput(p).put("version",1),true),409);
        problem(dentist.send("PUT",route(p,"/finalization"),finalInput(p).put("patientVersion",1),true),409);
        unchanged(p); org.mockito.Mockito.verifyNoInteractions(renderer);
    }
    @Test void missingMalformedDuplicateAndUnsafeQueryInputsAreRejected() throws Exception {
        var p=complete();
        for(String value:List.of("null","-1","0.5","\"0\"","9007199254740992"))
            problem(dentist.raw("PUT",route(p,"/finalization"),"{\"version\":0,\"patientVersion\":"+value+"}",dentist.csrf,"application/json"),400);
        for(String body:List.of("{\"version\":0}","{\"version\":0,\"patientVersion\":0,\"patientVersion\":0}"))
            problem(dentist.raw("PUT",route(p,"/finalization"),body,dentist.csrf,"application/json"),400);
        for(String suffix:List.of("&version=0","&disposition=bad","&extra=1")) problem(dentist.get(pdfRoute(p)+suffix),400);
        problem(dentist.get(route(p,"/pdf")),400); unchanged(p);
    }
    @Test void patientScopeIsolationOnFinalizationAndDownload() throws Exception {
        var p=complete(); String wrong="?patientId="+patient().get("id").asString();
        problem(dentist.send("PUT",BASE+"/"+p.get("id").asString()+"/finalization"+wrong,finalInput(p),true),404);
        problem(dentist.get(BASE+"/"+p.get("id").asString()+"/pdf"+wrong+"&version=0"),404); unchanged(p);
    }
    @Test void incompleteAndWhitespaceOnlyDraftsCannotFinalize() throws Exception {
        var empty=create(); problem(finish(empty),400); unchanged(empty);
        var p=complete(); var c=p.get("content").deepCopy(); ((ObjectNode)c.get("medications").get(0)).put("dosage","\u00a0\u2003");
        var changed=expect(dentist.send("PUT",route(p,""),update(p,c),true),200); problem(finish(changed),400);
        assertThat(expect(dentist.get(route(p,"")),200)).isEqualTo(changed);
    }
    @Test void archivedDraftAndArchivedPatientCannotFinalize() throws Exception {
        var p=complete(); var archived=expect(dentist.send("PUT",route(p,"/archival"),version(p),true),200); problem(finish(archived),409);
        var other=complete(); var input=version(patient).put("status","inactive");input.set("identity",patient.get("identity"));
        expect(reception.send("PUT","/api/v1/patients/"+patient.get("id").asString(),input,true),200);
        var fresh=expect(dentist.get(route(other,"")),200); problem(finish(fresh),409);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM prescription_document WHERE prescription_id IN (?,?)",Integer.class,id(p),id(other))).isZero();
    }
    @Test void missingProfileFailsClosedWithoutInvokingRenderer() throws Exception {
        var p=complete(); org.mockito.Mockito.doThrow(new ma.sijilmassa.prescription.PrescriptionFailure(ma.sijilmassa.prescription.PrescriptionFailure.Reason.PRACTITIONER_UNAVAILABLE)).when(profiles).require(DENTIST_ID);
        problem(finish(p),503); unchanged(p); org.mockito.Mockito.verifyNoInteractions(renderer);
    }
    @Test void rendererTimeoutUnavailableDisabledAndMissingRuntimeLeaveNoState(CapturedOutput output) throws Exception {
        var p=complete();
        for(var code:List.of(ma.sijilmassa.prescription.rendering.RenderingFailure.Code.TIMEOUT,ma.sijilmassa.prescription.rendering.RenderingFailure.Code.UNAVAILABLE,
                ma.sijilmassa.prescription.rendering.RenderingFailure.Code.UNTRUSTED_WORKER,ma.sijilmassa.prescription.rendering.RenderingFailure.Code.BUSY)) {
            org.mockito.Mockito.doThrow(new ma.sijilmassa.prescription.rendering.RenderingFailure(code)).when(renderer).render(org.mockito.ArgumentMatchers.any());
            var r=finish(p);problem(r,503);assertThat(node(r).get("code").asString()).isEqualTo("RENDERER_UNAVAILABLE");unchanged(p);
        } assertThat(output.getAll()).doesNotContain(PASSWORD,"Instructions synthétiques privées");
    }
    @Test void invalidAndOversizedReturnedPdfAreIndependentlyRejected() throws Exception {
        var p=complete(); var valid=rendered(p);
        for(byte[] bytes:List.of("%PDF-1.4\ninvalid\n%%EOF".getBytes(java.nio.charset.StandardCharsets.US_ASCII),new byte[2097153])) {
            org.mockito.Mockito.doReturn(new ma.sijilmassa.prescription.rendering.RenderedPdf(bytes,digest(bytes),valid.rendererId(),valid.templateSha256(),valid.fontSha256())).when(renderer).render(org.mockito.ArgumentMatchers.any());
            var r=finish(p);assertThat(r.statusCode()).isIn(500,503);problem(r,r.statusCode());unchanged(p);
        }
    }
    @Test void actualWorkerRejectsDynamicArabicWithoutMutation() throws Exception {
        var p=complete(); var c=p.get("content").deepCopy();((ObjectNode)c).put("generalInstructions","تعليمات سريرية");
        p=expect(dentist.send("PUT",route(p,""),update(p,c),true),200);
        var response=finish(p);problem(response,400);assertThat(node(response).get("code").asString()).isEqualTo("PDF_UNSUPPORTED_CHARACTER");
        assertThat(expect(dentist.get(route(p,"")),200)).isEqualTo(p);assertThat(audits(p)).isEqualTo(2);
    }
    @Test void actualWorkerRejectsOverflowWithoutTruncation() throws Exception {
        var p=complete();var c=p.get("content").deepCopy();((ObjectNode)c).put("generalInstructions","Instruction synthétique. ".repeat(60));
        p=expect(dentist.send("PUT",route(p,""),update(p,c),true),200);
        var r=finish(p);problem(r,400);assertThat(node(r).get("code").asString()).isEqualTo("PDF_LAYOUT_OVERFLOW");
        assertThat(expect(dentist.get(route(p,"")),200)).isEqualTo(p);assertThat(audits(p)).isEqualTo(2);
    }
    @Test void staleRetryAndDraftOperationsOnFinalizedDocumentAreConflicts() throws Exception {
        var p=complete();var finalized=expect(finish(p),200);problem(finish(p),409);problem(finish(finalized),409);
        problem(dentist.send("PUT",route(p,""),update(finalized,p.get("content")),true),409);
        problem(dentist.send("PUT",route(p,"/archival"),version(finalized),true),409);
        problem(dentist.get(pdfRoute(p)),409);
        assertThat(expect(dentist.get(route(p,"")),200)).isEqualTo(finalized);assertThat(audits(p)).isEqualTo(2);
    }
    @Test void databaseGuardsRejectAllFinalizedMutationsAndDeletion() throws Exception {
        var p=expect(finish(complete()),200);var before=snapshot(p);var document=id(p);
        for(String sql:List.of("UPDATE prescription SET general_instructions='changed' WHERE id=?", "UPDATE prescription SET finalized_at=now() WHERE id=?",
                "UPDATE prescription SET status='BROUILLON',finalized_at=NULL,finalized_by=NULL WHERE id=?", "DELETE FROM prescription WHERE id=?",
                "UPDATE prescription_line SET instructions='changed' WHERE prescription_id=?", "DELETE FROM prescription_line WHERE prescription_id=?",
                "UPDATE prescription_document SET snapshot='{}'::jsonb WHERE prescription_id=?", "UPDATE prescription_document SET pdf_bytes='x'::bytea WHERE prescription_id=?",
                "DELETE FROM prescription_document WHERE prescription_id=?"))
            assertThatThrownBy(()->jdbc.update(sql,document)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(snapshot(p)).isEqualTo(before);assertThat(dentist.pdf(pdfRoute(p)).statusCode()).isEqualTo(200);
    }
    @Test void finalizationWithoutDocumentCannotCommitAtSqlBoundary() throws Exception {
        var p=complete();
        assertThatThrownBy(()->jdbc.update("UPDATE prescription SET status='FINALISEE',version=version+1,finalized_at=updated_at+interval '1 second',updated_at=updated_at+interval '1 second',finalized_by=updated_by WHERE id=?",id(p)))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);unchanged(p);
    }
    @Test void storageFailureRollsBackEverything(CapturedOutput output) throws Exception { rollbackFailure("prescription_document","true",output); }
    @Test void auditFailureRollsBackEverything(CapturedOutput output) throws Exception { rollbackFailure("security_audit_event","NEW.event_type='PRESCRIPTION_FINALIZED'",output); }
    void rollbackFailure(String table,String condition,CapturedOutput output) throws Exception {
        var p=complete();jdbc.execute("CREATE FUNCTION reject_finalization_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF "+condition+" THEN RAISE EXCEPTION 'Synthetic failure'; END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER reject_finalization_test BEFORE INSERT ON "+table+" FOR EACH ROW EXECUTE FUNCTION reject_finalization_test()");
        try { problem(finish(p),500);unchanged(p);assertThat(output.getAll()).doesNotContain(PASSWORD,"Instructions synthétiques privées"); }
        finally { jdbc.execute("DROP TRIGGER reject_finalization_test ON "+table);jdbc.execute("DROP FUNCTION reject_finalization_test()"); }
    }
    @Test void simultaneousFinalizationsHaveOneWinnerAndNoDuplicatePdf() throws Exception {
        var p=complete();var pdf=rendered(p);var gate=new CyclicBarrier(2);
        org.mockito.Mockito.doAnswer(call->{gate.await(10,TimeUnit.SECONDS);return pdf;}).when(renderer).render(org.mockito.ArgumentMatchers.any());
        try(var other=new Browser("rx.dentist");var pool=Executors.newFixedThreadPool(2)) {
            var a=pool.submit(()->finish(p));var b=pool.submit(()->other.send("PUT",route(p,"/finalization"),finalInput(p),true));
            assertThat(List.of(a.get(20,TimeUnit.SECONDS).statusCode(),b.get(20,TimeUnit.SECONDS).statusCode())).containsExactlyInAnyOrder(200,409);
        } assertThat(jdbc.queryForObject("SELECT count(*) FROM prescription_document WHERE prescription_id=?",Integer.class,id(p))).isEqualTo(1);assertThat(audits(p)).isEqualTo(2);
    }
    @Test void concurrentDraftEditDiscardsRenderedBytes() throws Exception {
        var p=complete();org.mockito.Mockito.doAnswer(call->{var pdf=call.callRealMethod();
            expect(dentist.send("PUT",route(p,""),update(p,p.get("content")),true),200);return pdf;}).when(renderer).render(org.mockito.ArgumentMatchers.any());
        problem(finish(p),409);var changed=expect(dentist.get(route(p,"")),200);assertThat(changed.get("version").asLong()).isEqualTo(1);
        assertThat(changed.get("status").asString()).isEqualTo("BROUILLON");assertThat(changed.get("document").isNull()).isTrue();assertThat(audits(p)).isEqualTo(2);
    }
    @Test void concurrentPatientIdentityChangeDiscardsRenderedBytes() throws Exception {
        var p=complete();org.mockito.Mockito.doAnswer(call->{var pdf=call.callRealMethod();
            var input=version(patient).put("status","active");var identity=patient.get("identity").deepCopy();((ObjectNode)identity).put("firstName","Modifié");input.set("identity",identity);
            expect(reception.send("PUT","/api/v1/patients/"+patient.get("id").asString(),input,true),200);return pdf;}).when(renderer).render(org.mockito.ArgumentMatchers.any());
        problem(finish(p),409);assertThat(jdbc.queryForObject("SELECT version FROM prescription WHERE id=?",Long.class,id(p))).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM prescription_document WHERE prescription_id=?",Integer.class,id(p))).isZero();assertThat(audits(p)).isEqualTo(1);
    }
    @Test void accountRevocationDuringRenderingPreventsCommit() throws Exception {
        var p=complete();org.mockito.Mockito.doAnswer(call->{var pdf=call.callRealMethod();jdbc.update("UPDATE application_user SET session_version=session_version+1 WHERE id=?",DENTIST_ID);return pdf;}).when(renderer).render(org.mockito.ArgumentMatchers.any());
        problem(finish(p),403);assertThat(jdbc.queryForObject("SELECT version FROM prescription WHERE id=?",Long.class,id(p))).isZero();assertThat(audits(p)).isEqualTo(1);
    }
    @Test void rendererRunsOutsideDatabaseTransactionAndCommitUsesTheCapturedSource() throws Exception {
        var p=complete();
        org.mockito.Mockito.doAnswer(call->{
            assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            var request=(ma.sijilmassa.prescription.rendering.RenderingRequest)call.getArgument(0);
            assertThat(request.record().version()).isEqualTo(p.get("version").asLong());
            assertThat(request.mode()).isEqualTo(ma.sijilmassa.prescription.rendering.RenderingRequest.Mode.FINAL_LAYOUT_CHECK);
            return call.callRealMethod();
        }).when(renderer).render(org.mockito.ArgumentMatchers.any());
        expect(finish(p),200);
    }
    @Test void finalizedLinesCannotBeExtendedAndSnapshotCannotBeReplaced() throws Exception {
        var p=expect(finish(complete()),200);
        assertThatThrownBy(()->jdbc.update("INSERT INTO prescription_line(id,prescription_id,position,medication_name,dosage,frequency,duration,instructions) VALUES (?,?,2,'Synthétique','','','','')",UUID.randomUUID(),id(p)))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(()->jdbc.update("INSERT INTO prescription_document SELECT * FROM prescription_document WHERE prescription_id=?",id(p)))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(audits(p)).isEqualTo(2);
    }
    @Test void finalizedHistoryReturnsTimestampAndMetadataWithoutPdfOrClinicalText() throws Exception {
        var p=expect(finish(complete()),200);var r=dentist.get(history()+"&status=FINALISEE");var history=expect(r,200).get("items");
        assertThat(history.size()).isEqualTo(1);assertThat(history.get(0).get("finalizedAt")).isEqualTo(p.get("finalizedAt"));
        assertThat(r.body()).doesNotContain("Instructions synthétiques privées","pdf_bytes","medications","Émeraude");
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
        HttpResponse<byte[]> pdf(String path) throws Exception {
            return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).GET().build(),HttpResponse.BodyHandlers.ofByteArray());
        }
        public void close() { client.close(); }
    }
    @TestConfiguration(proxyBeanMethods = false)
    static class TimeConfiguration { @Bean @Primary PatientIntegrationTest.MovingClock finalizationClock() { return new PatientIntegrationTest.MovingClock(); } }
}
