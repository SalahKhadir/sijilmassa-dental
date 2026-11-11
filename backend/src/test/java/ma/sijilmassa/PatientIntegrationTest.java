package ma.sijilmassa;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import jakarta.persistence.EntityManagerFactory;
import ma.sijilmassa.patient.*;
import ma.sijilmassa.security.AccountBootstrap;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.*;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.flyway.locations=classpath:db/migration,classpath:db/testmigration",
                "server.servlet.session.cookie.secure=false"})
@ActiveProfiles("test")
@Import(PatientIntegrationTest.TestTime.class)
@ExtendWith(OutputCaptureExtension.class)
class PatientIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-bookworm");
    private static final String PASSWORD = "Synthetic-patient-test-password-83";
    private static final String MEDICAL = "CLINICAL_PRIVATE_SENTINEL";
    @DynamicPropertySource static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper json;
    @Autowired AccountBootstrap bootstrap;
    @Autowired PatientService service;
    @Autowired EntityManagerFactory entityManagerFactory;
    @Autowired MovingClock clock;
    Browser dentist;
    Browser reception;

    @BeforeEach void isolatedData() throws Exception {
        jdbc.execute("TRUNCATE treatment_payment, treatment_charge, prescription_document, prescription_line, prescription, clinical_treatment, clinical_consultation, appointment, security_audit_event, patient_history_condition, patient_allergy_category, patient_medical_record, patient, application_user");
        clock.advance(120);
        bootstrap.initialize("patient.dentist", PASSWORD, "patient.reception", PASSWORD);
        dentist = new Browser("patient.dentist"); reception = new Browser("patient.reception");
    }
    @AfterEach void closeClients() { dentist.client.close(); reception.client.close(); }

    @Test void migrationChainAndMappedSchemaAreValidated() {
        assertThat(jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank", String.class))
                .contains("1", "2", "3", "4", "5", "6", "7", "8", "9", "900");
        assertThat(entityManagerFactory.isOpen()).isTrue();
        assertThat(jdbc.queryForObject("SHOW timezone", String.class)).isEqualTo("UTC");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM patient", Integer.class)).isZero();
    }

    @Test void bothRolesCreateAdministrativePatientsWithUnansweredRecords() throws Exception {
        for (Browser browser : List.of(dentist, reception)) {
            var response = browser.send("POST", "/api/v1/patients", admin("إيمان Démo", "El-Alaoui Démo"), true);
            assertThat(response.statusCode()).isEqualTo(201);
            JsonNode patient = node(response);
            assertThat(UUID.fromString(patient.get("id").asString())).isNotNull();
            assertThat(patient.get("reference").asString()).matches("PAT-[0-9]{6,19}");
            assertThat(patient.get("identity").get("firstName").asString()).isEqualTo("إيمان Démo");
            assertThat(patient.get("version").asLong()).isZero();
            assertThat(response.headers().firstValue("location").orElseThrow()).endsWith(patient.get("id").asString());
            JsonNode clinical = node(dentist.get(path(patient) + "/medical-record"));
            assertThat(clinical.get("record").get("medicalHistory").get("reportStatus").asString()).isEqualTo("unanswered");
            assertThat(clinical.get("record").get("healthQuestionnaire").get("pregnant").asString()).isEqualTo("unanswered");
        }
        assertThat(count("patient")).isEqualTo(2); assertThat(count("patient_medical_record")).isEqualTo(2);
        assertThat(events("PATIENT_CREATED")).isEqualTo(2);
    }

    @Test void dentistCombinedCreationIsAtomicAndClearlyClinical() throws Exception {
        ObjectNode input = json.createObjectNode().set("patient", admin("Fiction", "Dossier Démo"));
        input.set("medicalRecord", medical());
        assertThat(reception.send("POST", "/api/v1/patients/with-medical-record", input, true).statusCode()).isEqualTo(403);
        assertThat(count("patient")).isZero();
        ObjectNode invalid=input.deepCopy();
        ((ObjectNode)invalid.get("medicalRecord").get("medicalHistory")).putArray("conditions");
        assertThat(dentist.send("POST", "/api/v1/patients/with-medical-record", invalid, true).statusCode()).isEqualTo(400);
        assertThat(count("patient")).isZero();
        var response = dentist.send("POST", "/api/v1/patients/with-medical-record", input, true);
        assertThat(response.statusCode()).isEqualTo(201);
        JsonNode created = node(response);
        assertThat(created.get("medicalRecord").get("record").get("medicalHistory").get("conditions").get(0).asString()).isEqualTo("Autres");
        assertThat(created.get("patient").toString()).doesNotContain(MEDICAL, "medicalHistory", "healthQuestionnaire", "allergies");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM patient_history_condition WHERE condition_code='AUTRES'", Integer.class)).isEqualTo(1);
    }

    @Test void administrativeDtosNeverContainClinicalDataOrDirectoryCin() throws Exception {
        JsonNode patient = createClinical();
        for (Browser browser : List.of(dentist, reception)) {
            var detail = browser.get(path(patient));
            assertThat(detail.statusCode()).isEqualTo(200);
            assertThat(detail.body()).doesNotContain(MEDICAL, "medicalHistory", "allergies", "healthQuestionnaire", "questionnaireVersion");
            JsonNode identity = node(detail).get("identity");
            assertThat(identity.size()).isEqualTo(10);
            var listing = browser.get("/api/v1/patients");
            assertThat(listing.body()).doesNotContain(MEDICAL, "CIN_PRIVATE_SENTINEL", "cin", "profession", "medicalCoverage", "allergies");
            assertThat(node(listing).get("items").size()).isEqualTo(1);
            assertThat(listing.headers().firstValue("cache-control").orElseThrow()).contains("no-store");
        }
        assertThat(node(reception.get("/api/v1/patients?q=" + MEDICAL)).get("total").asLong()).isZero();
        assertThat(node(reception.get("/api/v1/patients?q=CIN_PRIVATE_SENTINEL")).get("total").asLong()).isZero();
    }

    @Test void medicalReadWriteIsDentistOnlyAtHttpBoundary() throws Exception {
        JsonNode patient = create(); String endpoint = path(patient) + "/medical-record";
        assertThat(reception.get(endpoint).statusCode()).isEqualTo(403);
        assertThat(reception.send("PUT", endpoint, medicalUpdate(0), true).statusCode()).isEqualTo(403);
        assertThat(new Browser(null).get(endpoint).statusCode()).isEqualTo(401);
        var updated = dentist.send("PUT", endpoint, medicalUpdate(0), true);
        assertThat(updated.statusCode()).isEqualTo(200);
        assertThat(node(updated).get("version").asLong()).isEqualTo(1);
        assertThat(node(dentist.get(endpoint)).get("record").get("healthQuestionnaire").get("pregnant").asString()).isEqualTo("no");
        assertThat(events("PATIENT_MEDICAL_UPDATED")).isEqualTo(1);
    }

    @Test void administrativeUpdatesPreserveClinicalRecordAndReference() throws Exception {
        JsonNode patient = createClinical(); String endpoint = path(patient);
        String clinicalBefore = dentist.get(endpoint + "/medical-record").body();
        ObjectNode input = admin("Prénom corrigé Démo", "Nom corrigé Démo"); input.put("version", 0);
        var response = reception.send("PUT", endpoint, input, true);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(node(response).get("reference")).isEqualTo(patient.get("reference"));
        assertThat(node(response).get("version").asLong()).isEqualTo(1);
        assertThat(dentist.get(endpoint + "/medical-record").body()).isEqualTo(clinicalBefore);
        assertThat(events("PATIENT_ADMIN_UPDATED")).isEqualTo(1);
    }

    @Test void unrecognizedClinicalOrInternalPropertiesAreRejectedWithoutAssignment() throws Exception {
        for (String key : List.of("medicalHistory", "medicalRecord", "id", "reference", "treatments", "demoNextAppointmentDate")) {
            ObjectNode input = admin("Nom Démo", "Prénom Démo"); input.put(key, MEDICAL);
            var response = reception.send("POST", "/api/v1/patients", input, true);
            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(response.body()).doesNotContain(MEDICAL);
        }
        ObjectNode nested = admin("Nom Démo", "Prénom Démo"); ((ObjectNode) nested.get("identity")).put("clinicalNotes", MEDICAL);
        assertThat(reception.send("POST", "/api/v1/patients", nested, true).statusCode()).isEqualTo(400);
        assertThat(count("patient")).isZero(); assertThat(events("PATIENT_CREATED")).isZero();
    }

    @Test void invalidAdministrativeInputCannotPartiallyCreateRecords() throws Exception {
        var invalid = new ArrayList<ObjectNode>();
        for (Map.Entry<String,String> entry : Map.of("firstName", " ", "lastName", "x".repeat(81), "dateOfBirth", "9999-12-31",
                "gsm", "+212 6XX XX 00 00", "landline", "12", "address", "x".repeat(301), "sex", "UNKNOWN").entrySet()) {
            ObjectNode input=admin("Nom Démo", "Prénom Démo"); ((ObjectNode) input.get("identity")).put(entry.getKey(),entry.getValue()); invalid.add(input);
        }
        ObjectNode missing=admin("Nom Démo", "Prénom Démo"); ((ObjectNode) missing.get("identity")).remove("firstName"); invalid.add(missing);
        ObjectNode date=admin("Nom Démo", "Prénom Démo"); ((ObjectNode) date.get("identity")).put("dateOfBirth","2025-02-30"); invalid.add(date);
        for (ObjectNode input : invalid) assertThat(reception.send("POST", "/api/v1/patients", input, true).statusCode()).isEqualTo(400);
        assertThat(count("patient")).isZero(); assertThat(count("patient_medical_record")).isZero();
    }

    @Test void questionnaireValidationPreservesUnansweredAndRejectsContradictions() throws Exception {
        JsonNode patient=create(); String endpoint=path(patient)+"/medical-record";
        List<ObjectNode> invalid=new ArrayList<>();
        ObjectNode unknown=medicalUpdate(0); ((ObjectNode)unknown.get("record").get("healthQuestionnaire")).put("pregnant","maybe");invalid.add(unknown);
        ObjectNode duplicate=medicalUpdate(0); ((ObjectNode)duplicate.get("record").get("medicalHistory")).putArray("conditions").add("Autres").add("Autres");invalid.add(duplicate);
        ObjectNode missingOther=medicalUpdate(0); ((ObjectNode)missingOther.get("record").get("medicalHistory")).putArray("conditions").add("Diabète");invalid.add(missingOther);
        ObjectNode unanswered=medicalUpdate(0); ((ObjectNode)unanswered.get("record").get("medicalHistory")).put("reportStatus","unanswered");invalid.add(unanswered);
        ObjectNode allergy=medicalUpdate(0); ((ObjectNode)allergy.get("record").get("allergies")).put("reportStatus","unanswered");invalid.add(allergy);
        ObjectNode duplicateAllergy=medicalUpdate(0); ((ObjectNode)duplicateAllergy.get("record").get("allergies")).putArray("categories").add("Aspirine").add("Aspirine");invalid.add(duplicateAllergy);
        ObjectNode missingAnswer=medicalUpdate(0); ((ObjectNode)missingAnswer.get("record").get("healthQuestionnaire")).remove("pregnant");invalid.add(missingAnswer);
        ObjectNode tooLong=medicalUpdate(0); ((ObjectNode)tooLong.get("record").get("healthQuestionnaire")).put("reasonForConsultation","x".repeat(2001));invalid.add(tooLong);
        ObjectNode version=medicalUpdate(0); ((ObjectNode)version.get("record")).put("questionnaireVersion",2);invalid.add(version);
        ObjectNode unknownField=medicalUpdate(0); ((ObjectNode)unknownField.get("record").get("healthQuestionnaire")).put("inventedQuestion",MEDICAL);invalid.add(unknownField);
        for(ObjectNode input:invalid) assertThat(dentist.send("PUT",endpoint,input,true).statusCode()).isEqualTo(400);
        JsonNode stored=node(dentist.get(endpoint)); assertThat(stored.get("version").asLong()).isZero();
        assertThat(stored.get("record").get("healthQuestionnaire").get("underMedicalTreatment").asString()).isEqualTo("unanswered");
        assertThat(events("PATIENT_MEDICAL_UPDATED")).isZero();
        assertThat(dentist.send("PUT",endpoint,medicalUpdate(0),true).statusCode()).isEqualTo(200);
        assertThat(node(dentist.get(endpoint)).get("record").get("healthQuestionnaire").get("underMedicalTreatment").asString()).isEqualTo("yes");
    }

    @Test void birthDateUsesTheClinicDayRatherThanTheUtcDay() throws Exception {
        ObjectNode input=admin("Date Démo","Naissance Démo");
        ((ObjectNode)input.get("identity")).put("dateOfBirth", "2026-11-09");
        assertThat(reception.send("POST","/api/v1/patients",input,true).statusCode()).isEqualTo(201);
        ((ObjectNode)input.get("identity")).put("dateOfBirth", "2026-11-10");
        assertThat(reception.send("POST","/api/v1/patients",input,true).statusCode()).isEqualTo(400);
    }

    @Test void numericVersionsMustBeIntegralWithoutSilentTruncation() throws Exception {
        JsonNode patient=create();ObjectNode input=admin("Fraction Démo","Nom Démo");input.put("version",0.5);
        assertThat(reception.send("PUT",path(patient),input,true).statusCode()).isEqualTo(400);
        ObjectNode medical=medicalUpdate(0);medical.put("version",0.5);
        assertThat(dentist.send("PUT",path(patient)+"/medical-record",medical,true).statusCode()).isEqualTo(400);
        medical=medicalUpdate(0);((ObjectNode)medical.get("record")).put("questionnaireVersion",1.5);
        assertThat(dentist.send("PUT",path(patient)+"/medical-record",medical,true).statusCode()).isEqualTo(400);
        assertThat(events("PATIENT_ADMIN_UPDATED")).isZero();assertThat(events("PATIENT_MEDICAL_UPDATED")).isZero();
    }

    @Test void searchPaginationAndUnicodeNamesOnlyUseApprovedFields() throws Exception {
        JsonNode first=create("Mériem Démo", "El-Alaoui Démo"); create("آمنة Démo", "Autre Démo"); create("Troisième Démo", "Zed Démo");
        assertThat(node(reception.get("/api/v1/patients?q=meriem")).get("total").asLong()).isEqualTo(1);
        assertThat(node(reception.get("/api/v1/patients?q="+first.get("reference").asString())).get("total").asLong()).isEqualTo(1);
        assertThat(node(reception.get("/api/v1/patients?q=060000")).get("total").asLong()).isEqualTo(3);
        JsonNode paged=node(reception.get("/api/v1/patients?page=2&pageSize=2&sort=name"));
        assertThat(paged.get("items").size()).isEqualTo(1);assertThat(paged.get("total").asLong()).isEqualTo(3);assertThat(paged.get("pageCount").asLong()).isEqualTo(2);
        assertThat(node(reception.get("/api/v1/patients?q=%25")).get("total").asLong()).isZero();
        for(String query:List.of("page=0","pageSize=51","pageSize=0","sort=cin","status=unexpected","q="+"x".repeat(161),"cin=CIN_PRIVATE_SENTINEL","page=1&page=2"))
            assertThat(reception.get("/api/v1/patients?"+query).statusCode()).isEqualTo(400);
    }

    @Test void archiveAndRestoreAreReversibleAndDoNotEraseMedicalData() throws Exception {
        JsonNode patient=createClinical();String endpoint=path(patient);
        String before=dentist.get(endpoint+"/medical-record").body();
        ObjectNode archive=admin("Dossier Démo","Clinique Démo");archive.put("version",0);archive.put("status","inactive");
        assertThat(reception.send("PUT",endpoint,archive,true).statusCode()).isEqualTo(200);
        assertThat(node(reception.get("/api/v1/patients")).get("total").asLong()).isZero();
        assertThat(node(reception.get("/api/v1/patients?status=inactive")).get("total").asLong()).isEqualTo(1);
        assertThat(reception.get(endpoint).statusCode()).isEqualTo(200);
        assertThat(dentist.send("PUT",endpoint+"/medical-record",medicalUpdate(0),true).statusCode()).isEqualTo(409);
        assertThat(dentist.get(endpoint+"/medical-record").body()).isEqualTo(before);
        archive.put("version",1);archive.put("status","active");
        assertThat(reception.send("PUT",endpoint,archive,true).statusCode()).isEqualTo(200);
        assertThat(node(reception.get(endpoint)).get("reference")).isEqualTo(patient.get("reference"));
        assertThat(events("PATIENT_ARCHIVED")).isEqualTo(1);assertThat(events("PATIENT_RESTORED")).isEqualTo(1);
        assertThat(dentist.send("DELETE",endpoint,null,true).statusCode()).isEqualTo(403);
    }

    @Test void staleVersionsConflictWithoutChangingDataOrAudit() throws Exception {
        JsonNode patient=create();ObjectNode update=admin("Modifié Démo","Nom Démo");update.put("version",0);
        assertThat(reception.send("PUT",path(patient),update,true).statusCode()).isEqualTo(200);
        assertThat(reception.send("PUT",path(patient),update,true).statusCode()).isEqualTo(409);
        assertThat(dentist.send("PUT",path(patient)+"/medical-record",medicalUpdate(0),true).statusCode()).isEqualTo(200);
        assertThat(dentist.send("PUT",path(patient)+"/medical-record",medicalUpdate(0),true).statusCode()).isEqualTo(409);
        assertThat(events("PATIENT_ADMIN_UPDATED")).isEqualTo(1);assertThat(events("PATIENT_MEDICAL_UPDATED")).isEqualTo(1);
    }

    @Test void concurrentCreationProducesStableDistinctUuidAndReferences() throws Exception {
        try(var executor=Executors.newFixedThreadPool(6)) {
            List<Future<HttpResponse<String>>> work=new ArrayList<>();
            for(int i=0;i<6;i++){final int index=i;work.add(executor.submit(()->reception.send("POST","/api/v1/patients",admin("Concurrent Démo "+index,"Nom Démo"),true)));}
            Set<String> ids=new HashSet<>(),references=new HashSet<>();
            for(var result:work){var response=result.get(20,TimeUnit.SECONDS);assertThat(response.statusCode()).isEqualTo(201);ids.add(node(response).get("id").asString());references.add(node(response).get("reference").asString());}
            assertThat(ids).hasSize(6);assertThat(references).hasSize(6);
        }
        assertThat(count("patient_medical_record")).isEqualTo(6);assertThat(events("PATIENT_CREATED")).isEqualTo(6);
    }

    @Test void concurrentAdministrativeUpdatesHaveExactlyOneWinner() throws Exception {
        JsonNode patient=create();ObjectNode a=admin("Premier Démo","Nom Démo");a.put("version",0);
        ObjectNode b=admin("Second Démo","Nom Démo");b.put("version",0);
        assertOneWinner(path(patient),a,b);
        JsonNode stored=node(dentist.get(path(patient)));assertThat(stored.get("version").asLong()).isEqualTo(1);
        assertThat(stored.get("identity").get("firstName").asString()).isIn("Premier Démo","Second Démo");
        assertThat(events("PATIENT_ADMIN_UPDATED")).isEqualTo(1);
    }

    @Test void concurrentMedicalUpdatesHaveExactlyOneWinner() throws Exception {
        JsonNode patient=create();ObjectNode a=medicalUpdate(0),b=medicalUpdate(0);
        ((ObjectNode)a.get("record").get("healthQuestionnaire")).put("reasonForConsultation","Premier motif fictif");
        ((ObjectNode)b.get("record").get("healthQuestionnaire")).put("reasonForConsultation","Second motif fictif");
        assertOneWinner(path(patient)+"/medical-record",a,b);
        JsonNode stored=node(dentist.get(path(patient)+"/medical-record"));assertThat(stored.get("version").asLong()).isEqualTo(1);
        assertThat(stored.get("record").get("healthQuestionnaire").get("reasonForConsultation").asString()).isIn("Premier motif fictif","Second motif fictif");
        assertThat(events("PATIENT_MEDICAL_UPDATED")).isEqualTo(1);
    }
    private void assertOneWinner(String path,ObjectNode a,ObjectNode b) throws Exception {
        try(var executor=Executors.newFixedThreadPool(2)) {
            var barrier=new CyclicBarrier(2);
            var first=executor.submit(()->{barrier.await();return dentist.send("PUT",path,a,true).statusCode();});
            var second=executor.submit(()->{barrier.await();return dentist.send("PUT",path,b,true).statusCode();});
            assertThat(List.of(first.get(20,TimeUnit.SECONDS),second.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);
        }
    }

    @Test void independentAdministrativeAndClinicalVersionsAllowBothPostesToWrite() throws Exception {
        JsonNode patient=create();ObjectNode administrative=admin("Accueil Démo","Nom Démo");administrative.put("version",0);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var barrier=new CyclicBarrier(2);
            var first=executor.submit(()->{barrier.await();return reception.send("PUT",path(patient),administrative,true).statusCode();});
            var second=executor.submit(()->{barrier.await();return dentist.send("PUT",path(patient)+"/medical-record",medicalUpdate(0),true).statusCode();});
            assertThat(first.get(20,TimeUnit.SECONDS)).isEqualTo(200);
            assertThat(second.get(20,TimeUnit.SECONDS)).isEqualTo(200);
        }
        assertThat(node(dentist.get(path(patient))).get("version").asLong()).isEqualTo(1);
        assertThat(node(dentist.get(path(patient)+"/medical-record")).get("version").asLong()).isEqualTo(1);
    }

    @Test void reportedEmptyAndNegativeAnswersRemainDistinctFromUnanswered() throws Exception {
        JsonNode patient=create();
        ObjectNode content=(ObjectNode)json.valueToTree(PatientDtos.MedicalContent.unanswered());
        ((ObjectNode)content.get("medicalHistory")).put("reportStatus","reported");
        ((ObjectNode)content.get("allergies")).put("reportStatus","reported");
        ((ObjectNode)content.get("healthQuestionnaire")).put("underMedicalTreatment","no");
        ObjectNode input=json.createObjectNode().put("version",0).set("record",content);
        assertThat(dentist.send("PUT",path(patient)+"/medical-record",input,true).statusCode()).isEqualTo(200);
        JsonNode stored=node(dentist.get(path(patient)+"/medical-record")).get("record");
        assertThat(stored.get("medicalHistory").get("reportStatus").asString()).isEqualTo("reported");
        assertThat(stored.get("medicalHistory").get("conditions").size()).isZero();
        assertThat(stored.get("healthQuestionnaire").get("underMedicalTreatment").asString()).isEqualTo("no");
        assertThat(stored.get("healthQuestionnaire").get("pregnant").asString()).isEqualTo("unanswered");
    }

    @Test void auditFailureRollsBackCreationAndClinicalUpdates() throws Exception {
        JsonNode existing=create();
        jdbc.execute("CREATE FUNCTION reject_patient_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_patient_id IS NOT NULL THEN RAISE EXCEPTION 'synthetic audit refusal' USING ERRCODE='23514'; END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER reject_patient_audit BEFORE INSERT ON security_audit_event FOR EACH ROW EXECUTE FUNCTION reject_patient_audit()");
        try {
            assertThat(reception.send("POST","/api/v1/patients",admin("Rollback Démo","Nom Démo"),true).statusCode()).isEqualTo(409);
            ObjectNode full=json.createObjectNode().set("patient",admin("Rollback clinique Démo","Nom Démo"));full.set("medicalRecord",medical());
            assertThat(dentist.send("POST","/api/v1/patients/with-medical-record",full,true).statusCode()).isEqualTo(409);
            assertThat(count("patient")).isEqualTo(1);assertThat(count("patient_medical_record")).isEqualTo(1);
            assertThat(count("patient_history_condition")).isZero();
            assertThat(dentist.send("PUT",path(existing)+"/medical-record",medicalUpdate(0),true).statusCode()).isEqualTo(409);
            assertThat(node(dentist.get(path(existing)+"/medical-record")).get("version").asLong()).isZero();
            assertThat(events("PATIENT_CREATED")).isEqualTo(1);assertThat(events("PATIENT_MEDICAL_UPDATED")).isZero();
        } finally { jdbc.execute("DROP TRIGGER reject_patient_audit ON security_audit_event");jdbc.execute("DROP FUNCTION reject_patient_audit()"); }
    }

    @Test void databaseConstraintsRejectDuplicatesNullsInvalidEnumsAndPhysicalDeletion() throws Exception {
        JsonNode patient=create();UUID id=UUID.fromString(patient.get("id").asString());
        assertThatThrownBy(()->jdbc.update("UPDATE patient SET first_name=NULL WHERE id=?",id)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(()->jdbc.update("UPDATE patient SET status='UNKNOWN' WHERE id=?",id)).isInstanceOf(DataIntegrityViolationException.class);
        JsonNode second=create();UUID secondId=UUID.fromString(second.get("id").asString());
        assertThatThrownBy(()->jdbc.update("UPDATE patient SET reference=? WHERE id=?",patient.get("reference").asString(),secondId)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(()->jdbc.update("INSERT INTO patient_history_condition(patient_id,condition_code) VALUES (?,'AUTRES')",UUID.randomUUID())).isInstanceOf(DataIntegrityViolationException.class);
        jdbc.update("INSERT INTO patient_history_condition(patient_id,condition_code) VALUES (?,'AUTRES')",id);
        assertThatThrownBy(()->jdbc.update("INSERT INTO patient_history_condition(patient_id,condition_code) VALUES (?,'AUTRES')",id)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(()->jdbc.update("DELETE FROM patient WHERE id=?",id)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test void sensitiveErrorsAndAuditNeverExposePayloads(CapturedOutput output) throws Exception {
        JsonNode patient=createClinical();String target=patient.get("id").asString();
        ObjectNode invalid=admin("PRIVATE_NAME_SENTINEL".repeat(10),"Nom Démo");
        var response=reception.send("POST","/api/v1/patients",invalid,true);
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).doesNotContain("PRIVATE_NAME_SENTINEL",MEDICAL,"CIN_PRIVATE_SENTINEL","sql","stackTrace");
        String rows=String.join("",jdbc.queryForList("SELECT row_to_json(e)::text FROM security_audit_event e WHERE target_patient_id IS NOT NULL",String.class));
        assertThat(rows).contains(target,"PATIENT_CREATED").doesNotContain(MEDICAL,"Dossier Démo","CIN_PRIVATE_SENTINEL","password");
        assertThatThrownBy(()->jdbc.update("UPDATE patient_medical_record SET history_report_status='UNANSWERED',history_other_details=? WHERE patient_id=?",MEDICAL,UUID.fromString(target)))
                .isInstanceOf(DataIntegrityViolationException.class)
                .satisfies(error -> assertThat(((DataIntegrityViolationException)error).getMostSpecificCause().getMessage()).doesNotContain(MEDICAL));
        assertThat(output.getAll()).doesNotContain(MEDICAL,"PRIVATE_NAME_SENTINEL","CIN_PRIVATE_SENTINEL");
    }

    @Test void missingResourcesReturnSafe404AndReceptionCannotProbeClinicalExistence() throws Exception {
        String path="/api/v1/patients/"+UUID.randomUUID();
        assertThat(reception.get(path).statusCode()).isEqualTo(404);
        assertThat(dentist.get(path+"/medical-record").statusCode()).isEqualTo(404);
        assertThat(reception.get(path+"/medical-record").statusCode()).isEqualTo(403);
        ObjectNode update=admin("Nom Démo","Prénom Démo");update.put("version",0);
        assertThat(reception.send("PUT",path,update,true).statusCode()).isEqualTo(404);
    }

    @Test void csrfSessionsRevocationAndDefaultDenyRemainEnforced() throws Exception {
        JsonNode patient=create();String path=path(patient);
        assertThat(dentist.send("POST","/api/v1/patients",admin("Nom Démo","Prénom Démo"),false).statusCode()).isEqualTo(403);
        assertThat(new Browser(null).get(path).statusCode()).isEqualTo(401);
        assertThat(dentist.get("/api/v1/unconfigured").statusCode()).isEqualTo(403);
        assertThat(dentist.get(path+"/unconfigured").statusCode()).isEqualTo(403);
        jdbc.update("UPDATE application_user SET session_version=session_version+1 WHERE username='patient.reception'");
        assertThat(reception.get(path).statusCode()).isEqualTo(401);
        jdbc.update("UPDATE application_user SET active=false WHERE username='patient.dentist'");
        assertThat(dentist.get(path).statusCode()).isEqualTo(401);
    }

    @Test @WithMockUser(roles="RECEPTIONIST")
    void serviceBoundaryIndependentlyRejectsClinicalAccess() {
        assertThatThrownBy(()->service.getMedical(UUID.randomUUID())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(()->service.createWithMedical(new PatientDtos.ClinicalCreate(null,null))).isInstanceOf(AccessDeniedException.class);
    }

    private ObjectNode admin(String first,String last) {
        return (ObjectNode)json.valueToTree(Map.of("identity",Map.of("firstName",first,"lastName",last,"sex","unanswered",
                "dateOfBirth","1990-05-20","address","Adresse fictive","gsm","0600000000","landline","",
                "profession","","cin","CIN_PRIVATE_SENTINEL","medicalCoverage",""),"status","active"));
    }
    private ObjectNode medical() {
        return (ObjectNode)json.valueToTree(Map.of("questionnaireVersion",1,
                "medicalHistory",Map.of("reportStatus","reported","conditions",List.of("Autres"),"otherDetails",MEDICAL),
                "allergies",Map.of("reportStatus","reported","categories",List.of("Aspirine"),"clarification",MEDICAL),
                "healthQuestionnaire",Map.of("underMedicalTreatment","yes","pregnant","no","additionalInformation",MEDICAL,"reasonForConsultation",MEDICAL)));
    }
    private ObjectNode medicalUpdate(long version) { return json.createObjectNode().put("version",version).set("record",medical()); }
    private JsonNode create() throws Exception { return create("Patient Démo","Dossier Démo"); }
    private JsonNode create(String first,String last) throws Exception {
        var result=reception.send("POST","/api/v1/patients",admin(first,last),true);assertThat(result.statusCode()).isEqualTo(201);return node(result);
    }
    private JsonNode createClinical() throws Exception {
        ObjectNode input=json.createObjectNode().set("patient",admin("Dossier Démo","Clinique Démo"));input.set("medicalRecord",medical());
        var result=dentist.send("POST","/api/v1/patients/with-medical-record",input,true);assertThat(result.statusCode()).isEqualTo(201);return node(result).get("patient");
    }
    private int count(String table) { return jdbc.queryForObject("SELECT count(*) FROM "+table,Integer.class); }
    private int events(String type) { return jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE event_type=?",Integer.class,type); }
    private String path(JsonNode patient) { return "/api/v1/patients/"+patient.get("id").asString(); }
    private JsonNode node(HttpResponse<String> response) { return json.readTree(response.body()); }

    private class Browser {
        final HttpClient client=HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();
        final String csrf;
        Browser(String username) throws Exception {
            String anonymousToken=node(get("/api/v1/auth/csrf")).get("token").asString();
            if(username!=null) {
                var result=raw("POST","/api/v1/auth/login",json.valueToTree(Map.of("identifier",username,"password",PASSWORD)),anonymousToken);
                assertThat(result.statusCode()).isEqualTo(200);
            }
            csrf=node(get("/api/v1/auth/csrf")).get("token").asString();
        }
        HttpResponse<String> get(String path) throws Exception { return raw("GET",path,null,null); }
        HttpResponse<String> send(String method,String path,JsonNode body,boolean csrf) throws Exception { return raw(method,path,body,csrf?this.csrf:null); }
        private HttpResponse<String> raw(String method,String path,JsonNode body,String csrf) throws Exception {
            var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).timeout(Duration.ofSeconds(15));
            if(csrf!=null)request.header("X-CSRF-TOKEN",csrf);
            if(method.equals("GET"))request.GET();
            else request.header("Content-Type","application/json").method(method,HttpRequest.BodyPublishers.ofString(body==null?"":json.writeValueAsString(body)));
            return client.send(request.build(),HttpResponse.BodyHandlers.ofString());
        }
    }
    static class MovingClock extends Clock {
        private final AtomicReference<Instant> instant=new AtomicReference<>(Instant.parse("2026-11-08T23:30:00Z"));
        void advance(long seconds){instant.updateAndGet(now->now.plusSeconds(seconds));}
        public ZoneId getZone(){return ZoneOffset.UTC;}
        public Clock withZone(ZoneId zone){return Clock.fixed(instant(),zone);}
        public Instant instant(){return instant.get();}
    }
    @TestConfiguration(proxyBeanMethods=false)
    static class TestTime { @Bean @Primary MovingClock patientClock(){return new MovingClock();} }
}
