package ma.sijilmassa;

import java.net.*;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import ma.sijilmassa.security.AccountBootstrap;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.system.*;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DataIntegrityViolationException;
import org.junit.jupiter.api.extension.ExtendWith;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties={"spring.flyway.locations=classpath:db/migration,classpath:db/testmigration","server.servlet.session.cookie.secure=false"})
@Import(AppointmentIntegrationTest.TimeConfiguration.class)
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@ExtendWith(OutputCaptureExtension.class)
class AppointmentIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:17.11-bookworm");
    @org.springframework.test.context.DynamicPropertySource
    static void database(org.springframework.test.context.DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl);r.add("spring.datasource.username",POSTGRES::getUsername);r.add("spring.datasource.password",POSTGRES::getPassword);
    }
    static final String PASSWORD="Synthetic-Appointment-Test-42";
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired javax.sql.DataSource dataSource;
    @Autowired JsonMapper json;
    @Autowired AccountBootstrap bootstrap;
    @Autowired PatientIntegrationTest.MovingClock clock;
    Browser dentist,reception;
    JsonNode patient;
    @BeforeEach void setup() throws Exception {
        jdbc.execute("TRUNCATE prescription_document, prescription_line, prescription, clinical_treatment, clinical_consultation, appointment, security_audit_event, patient_history_condition, patient_allergy_category, patient_medical_record, patient, application_user");
        clock.advance(120);
        bootstrap.initialize("appointment.dentist",PASSWORD,"appointment.reception",PASSWORD);
        dentist=new Browser("appointment.dentist");reception=new Browser("appointment.reception");
        ObjectNode identity=json.createObjectNode();
        for(String key:List.of("address","gsm","landline","profession","cin","medicalCoverage"))identity.put(key,"");
        identity.put("firstName","Patient synthétique").put("lastName","Agenda Démo").put("sex","unanswered").putNull("dateOfBirth");
        ObjectNode input=json.createObjectNode().put("status","active");input.set("identity",identity);
        var created=reception.send("POST","/api/v1/patients",input,true);assertThat(created.statusCode()).isEqualTo(201);patient=node(created);
    }
    @AfterEach void close() { dentist.client.close();reception.client.close(); }
    ObjectNode slot(String start,String end) { return json.createObjectNode().put("patientId",patient.get("id").asString()).put("startAt",start).put("endAt",end).put("type","CONSULTATION"); }
    ObjectNode slot() { return slot("2027-01-10T10:00:00Z","2027-01-10T10:30:00Z"); }
    JsonNode create() throws Exception { return create(slot()); }
    JsonNode create(ObjectNode input) throws Exception { var r=reception.send("POST","/api/v1/appointments",input,true);assertThat(r.statusCode()).isEqualTo(201);return node(r); }
    String path(JsonNode a) { return "/api/v1/appointments/"+a.get("id").asString(); }
    ObjectNode update(JsonNode a,String start,String end) { return slot(start,end).put("version",a.get("version").asLong()); }
    HttpResponse<String> status(Browser b,JsonNode a,String status) throws Exception { return b.send("PUT",path(a)+"/status",json.createObjectNode().put("version",a.get("version").asLong()).put("status",status),true); }
    int count(String table) { return jdbc.queryForObject("SELECT count(*) FROM "+table,Integer.class); }
    int events() { return jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE target_appointment_id IS NOT NULL",Integer.class); }
    JsonNode node(HttpResponse<String> response) { return json.readTree(response.body()); }

    @Test void migrationJpaAndExclusionAreReal() {
        assertThat(jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank",String.class)).contains("1","2","3","4","5","6");
        assertThat(jdbc.queryForObject("SELECT contype::text FROM pg_constraint WHERE conname='appointment_no_overlap'",String.class)).isEqualTo("x");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_indexes WHERE tablename='appointment'",Integer.class)).isEqualTo(6);
        assertThat(count("appointment")).isZero();assertThat(jdbc.queryForObject("SHOW timezone",String.class)).isEqualTo("UTC");
    }
    @Test void bothRolesCreateReadAndEditWithoutMedicalProjection() throws Exception {
        JsonNode a=create();
        assertThat(UUID.fromString(a.get("id").asString())).isNotNull();assertThat(a.get("status").asString()).isEqualTo("EN_ATTENTE");
        assertThat(a.properties().stream().map(Map.Entry::getKey)).containsExactlyInAnyOrder("id","patientId","startAt","endAt","type","status","createdAt","updatedAt","version");
        var read=dentist.get(path(a));assertThat(read.statusCode()).isEqualTo(200);assertThat(read.headers().firstValue("cache-control").orElseThrow()).contains("no-store","private");
        var change=dentist.send("PUT",path(a),update(a,"2027-01-10T11:00:00Z","2027-01-10T11:30:00Z"),true);
        assertThat(change.statusCode()).isEqualTo(200);assertThat(node(change).get("version").asLong()).isEqualTo(1);
        assertThat(events()).isEqualTo(3);
    }
    @Test void invalidTimesAndUnknownFieldsAreRejected() throws Exception {
        for(ObjectNode bad:List.of(slot("2027-01-10T10:00:00Z","2027-01-10T10:00:00Z"),slot("2027-01-10T10:30:00Z","2027-01-10T10:00:00Z"),
            slot("2027-01-10T10:00:00Z","2027-01-10T10:29:00Z"),slot("2027-01-10T10:00:00Z","2027-01-10T13:01:00Z"),
            slot("2027-01-10T10:00:01Z","2027-01-10T10:30:01Z"),slot("2027-01-10T10:00:00.5Z","2027-01-10T10:30:00.5Z"),
            slot("2027-01-10T10:00","2027-01-10T10:30"),slot().put("notes","private canary"),slot().put("reason","private canary"),slot().put("status","TERMINE"),
            slot().put("type","DIAGNOSIS"),slot().put("patientId","patient-demo-001"))) {
            assertThat(reception.send("POST","/api/v1/appointments",bad,true).statusCode()).isEqualTo(400);
        }
        assertThat(count("appointment")).isZero();assertThat(events()).isZero();
    }
    @Test void thirtyAndOneHundredEightyMinutesAndMidnightBoundaryAreSupported() throws Exception {
        create(slot("2027-01-10T08:00:00Z","2027-01-10T11:00:00Z"));
        ZoneId zone=ZoneId.of("Africa/Casablanca");LocalDate day=LocalDate.of(2027,1,10);
        create(slot(day.atTime(23,30).atZone(zone).toOffsetDateTime().toString(),day.plusDays(1).atStartOfDay(zone).toOffsetDateTime().toString()));
        assertThat(reception.send("POST","/api/v1/appointments",slot(day.atTime(23,45).atZone(zone).toOffsetDateTime().toString(),day.plusDays(1).atTime(0,15).atZone(zone).toOffsetDateTime().toString()),true).statusCode()).isEqualTo(400);
    }
    @Test void overlapAdjacentAndCancelledReuseFollowHalfOpenIntervals() throws Exception {
        JsonNode first=create();create(slot("2027-01-10T10:30:00Z","2027-01-10T11:00:00Z"));
        assertThat(reception.send("POST","/api/v1/appointments",slot("2027-01-10T10:15:00Z","2027-01-10T10:45:00Z"),true).statusCode()).isEqualTo(409);
        var cancelled=status(reception,first,"ANNULE");assertThat(cancelled.statusCode()).isEqualTo(200);create();
        assertThat(status(reception,node(cancelled),"CONFIRME").statusCode()).isEqualTo(409);
    }
    @Test void reschedulingConflictIsAtomic() throws Exception {
        JsonNode a=create(),b=create(slot("2027-01-10T11:00:00Z","2027-01-10T11:30:00Z"));
        assertThat(reception.send("PUT",path(b),update(b,"2027-01-10T10:15:00Z","2027-01-10T10:45:00Z"),true).statusCode()).isEqualTo(409);
        assertThat(node(reception.get(path(b))).get("version").asLong()).isZero();assertThat(events()).isEqualTo(2);
        assertThat(reception.send("PUT",path(a),update(a,"2027-01-10T12:00:00Z","2027-01-10T12:30:00Z"),true).statusCode()).isEqualTo(200);
    }
    @Test void inactivePatientCannotBookRescheduleOrReactivateButCanCancel() throws Exception {
        JsonNode a=create();ObjectNode change=json.createObjectNode().put("version",patient.get("version").asLong()).put("status","inactive");change.set("identity",patient.get("identity"));
        assertThat(reception.send("PUT","/api/v1/patients/"+patient.get("id").asString(),change,true).statusCode()).isEqualTo(200);
        assertThat(reception.send("POST","/api/v1/appointments",slot("2027-01-10T12:00:00Z","2027-01-10T12:30:00Z"),true).statusCode()).isEqualTo(409);
        assertThat(reception.send("PUT",path(a),update(a,"2027-01-10T12:00:00Z","2027-01-10T12:30:00Z"),true).statusCode()).isEqualTo(409);
        var cancelled=status(reception,a,"ANNULE");assertThat(cancelled.statusCode()).isEqualTo(200);
        assertThat(status(reception,node(cancelled),"EN_ATTENTE").statusCode()).isEqualTo(409);
        assertThat(reception.get(path(a)).statusCode()).isEqualTo(200);
    }
    @Test void concurrentPatientArchiveAndBookingCannotUseAStaleActiveStatus() throws Exception {
        try(var connection=dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try(var statement=connection.prepareStatement("UPDATE patient SET status='INACTIVE',version=version+1 WHERE id=?")) {
                statement.setObject(1,UUID.fromString(patient.get("id").asString()));statement.executeUpdate();
            }
            try(var pool=Executors.newSingleThreadExecutor()) {
                var booking=pool.submit(() -> reception.send("POST","/api/v1/appointments",slot(),true).statusCode());
                boolean blocked=false;
                try {
                    for(int attempt=0;attempt<200;attempt++) {
                        if(jdbc.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND datname=current_database()",Integer.class)>0) {blocked=true;break;}
                        Thread.sleep(25);
                    }
                } finally { connection.commit(); }
                assertThat(blocked).isTrue();assertThat(booking.get(15,TimeUnit.SECONDS)).isEqualTo(409);
            }
        }
        assertThat(count("appointment")).isZero();
    }
    @Test void missingPatientsAndAppointmentsAreSafe404() throws Exception {
        assertThat(reception.send("POST","/api/v1/appointments",slot().put("patientId",UUID.randomUUID().toString()),true).statusCode()).isEqualTo(404);
        assertThat(reception.get("/api/v1/appointments/"+UUID.randomUUID()).statusCode()).isEqualTo(404);
    }
    @Test void onlyDentistCanCompleteAndCompletedRecordsAreImmutableAndBlocking() throws Exception {
        JsonNode a=create();assertThat(status(reception,a,"TERMINE").statusCode()).isEqualTo(403);
        var done=status(dentist,a,"TERMINE");assertThat(done.statusCode()).isEqualTo(200);a=node(done);
        for(String next:List.of("EN_ATTENTE","CONFIRME","ANNULE","ABSENT"))assertThat(status(dentist,a,next).statusCode()).isEqualTo(409);
        assertThat(dentist.send("PUT",path(a),update(a,"2027-01-10T12:00:00Z","2027-01-10T12:30:00Z"),true).statusCode()).isEqualTo(409);
        assertThat(reception.send("POST","/api/v1/appointments",slot(),true).statusCode()).isEqualTo(409);
    }
    @Test void administrativeTransitionsAndAbsentSlotReleaseAreExplicit() throws Exception {
        JsonNode a=create();
        for(String next:List.of("CONFIRME","EN_ATTENTE","ABSENT","ANNULE","CONFIRME")) { var r=status(reception,a,next);assertThat(r.statusCode()).isEqualTo(200);a=node(r); }
        var absent=status(reception,a,"ABSENT");assertThat(absent.statusCode()).isEqualTo(200);create();
        assertThat(status(reception,node(absent),"EN_ATTENTE").statusCode()).isEqualTo(409);
    }
    @Test void sameStatusNoOpStillChecksVersionAndDoesNotAudit() throws Exception {
        JsonNode a=create();assertThat(status(reception,a,"EN_ATTENTE").statusCode()).isEqualTo(200);assertThat(events()).isEqualTo(1);
        assertThat(reception.send("PUT",path(a)+"/status",json.createObjectNode().put("version",99).put("status","EN_ATTENTE"),true).statusCode()).isEqualTo(409);
    }
    @Test void versionsMustBeIntegralAndStaleWritesCannotOverwrite() throws Exception {
        JsonNode a=create();ObjectNode input=update(a,"2027-01-10T11:00:00Z","2027-01-10T11:30:00Z");
        assertThat(reception.send("PUT",path(a),input.deepCopy().put("version",0.5),true).statusCode()).isEqualTo(400);
        assertThat(reception.send("PUT",path(a),input,true).statusCode()).isEqualTo(200);
        assertThat(reception.send("PUT",path(a),input,true).statusCode()).isEqualTo(409);
        assertThat(status(reception,a,"ANNULE").statusCode()).isEqualTo(409);
    }
    @Test void offsetsNormalizeAndMoroccanRepeatedHourRemainsUnambiguous() throws Exception {
        create(slot("2026-02-15T02:00:00+01:00","2026-02-15T02:30:00+01:00"));
        create(slot("2026-02-15T02:00:00Z","2026-02-15T02:30:00Z"));
        assertThat(reception.send("POST","/api/v1/appointments",slot("2026-02-15T01:00:00Z","2026-02-15T01:30:00Z"),true).statusCode()).isEqualTo(409);
        ZoneId zone=ZoneId.of("Africa/Casablanca");assertThat(zone.getRules().getOffset(Instant.parse("2026-02-15T01:00:00Z")) ).isEqualTo(ZoneOffset.ofHours(1));
        assertThat(zone.getRules().getOffset(Instant.parse("2026-02-15T02:00:00Z")) ).isEqualTo(ZoneOffset.UTC);
    }
    @Test void elapsedDurationSurvivesMoroccanClockTransitions() throws Exception {
        ZoneId zone=ZoneId.of("Africa/Casablanca");
        var transition=zone.getRules().nextTransition(Instant.parse("2026-01-01T00:00:00Z"));
        var spring=zone.getRules().nextTransition(transition.getInstant().plusSeconds(1));
        for(var change:List.of(transition,spring)) {
            Instant start=change.getInstant().minusSeconds(900),end=change.getInstant().plusSeconds(900);
            JsonNode appointment=create(slot(start.toString(),end.toString()));
            assertThat(Duration.between(Instant.parse(appointment.get("startAt").asString()),Instant.parse(appointment.get("endAt").asString())).toMinutes()).isEqualTo(30);
            var date=start.atZone(zone).toLocalDate();
            String from=date.atStartOfDay(zone).toInstant().toString(),to=date.plusDays(1).atStartOfDay(zone).toInstant().toString();
            assertThat(node(reception.get("/api/v1/appointments?from="+from+"&to="+to)).get("total").asLong()).isEqualTo(1);
        }
    }
    @Test void boundedCalendarUsesOverlapFilteringStablePaginationAndNoMedicalData() throws Exception {
        JsonNode a=create();create(slot("2027-01-10T10:30:00Z","2027-01-10T11:00:00Z"));
        String base="/api/v1/appointments?from=2027-01-10T10:30:00Z&to=2027-01-10T11:00:00Z";
        var r=reception.get(base);assertThat(r.statusCode()).isEqualTo(200);assertThat(node(r).get("total").asLong()).isEqualTo(1);
        assertThat(r.body()).doesNotContain("Patient synthétique","medicalHistory","allergies","cin","reason","notes");
        assertThat(node(reception.get(base+"&patientId="+UUID.randomUUID())).get("total").asLong()).isZero();
        String all="/api/v1/appointments?from=2027-01-10T10:01:00Z&to=2027-01-10T11:00:00Z&pageSize=1";
        assertThat(node(reception.get(all)).get("items").get(0).get("id").asString()).isEqualTo(a.get("id").asString());
        assertThat(node(reception.get(all+"&page=2")).get("pageCount").asLong()).isEqualTo(2);
    }
    @Test void invalidQueriesCannotRequestUnboundedCalendar() throws Exception {
        for(String q:List.of("","?from=2027-01-01T00:00:00Z&to=2027-04-01T00:00:00Z","?from=2027-01-02T00:00:00Z&to=2027-01-01T00:00:00Z",
            "?from=2027-01-01T00:00:00&to=2027-01-02T00:00:00","?from=2027-01-01T00:00:00Z&to=2027-01-02T00:00:00Z&pageSize=101",
            "?from=2027-01-01T00:00:00Z&to=2027-01-02T00:00:00Z&extra=x","?from=2027-01-01T00:00:00Z&to=2027-01-02T00:00:00Z&page=1&page=2"))
            assertThat(reception.get("/api/v1/appointments"+q).statusCode()).isEqualTo(400);
    }
    @Test void realConcurrentOverlappingCreatesHaveOneWinner() throws Exception {
        parallel(() -> reception.send("POST","/api/v1/appointments",slot(),true).statusCode(),() -> dentist.send("POST","/api/v1/appointments",slot(),true).statusCode(),201);
        assertThat(count("appointment")).isEqualTo(1);assertThat(events()).isEqualTo(1);
    }
    @Test void realConcurrentCrossRowReschedulesHaveOneWinner() throws Exception {
        JsonNode a=create(),b=create(slot("2027-01-10T11:00:00Z","2027-01-10T11:30:00Z"));
        parallel(() -> reception.send("PUT",path(a),update(a,"2027-01-10T12:00:00Z","2027-01-10T12:30:00Z"),true).statusCode(),
            () -> dentist.send("PUT",path(b),update(b,"2027-01-10T12:00:00Z","2027-01-10T12:30:00Z"),true).statusCode(),200);
        assertThat(events()).isEqualTo(4);
    }
    @Test void realConcurrentSameRecordChangesHaveOneWinner() throws Exception {
        JsonNode a=create();parallel(() -> status(reception,a,"CONFIRME").statusCode(),() -> status(dentist,a,"ANNULE").statusCode(),200);
        assertThat(events()).isEqualTo(2);
    }
    @Test void realConcurrentReactivationAndReservationHaveOneWinner() throws Exception {
        JsonNode a=node(status(reception,create(),"ANNULE"));
        parallel(() -> status(reception,a,"CONFIRME").statusCode(),() -> reception.send("POST","/api/v1/appointments",slot(),true).statusCode(),-1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM appointment WHERE status IN ('EN_ATTENTE','CONFIRME')",Integer.class)).isEqualTo(1);
    }
    private void parallel(Callable<Integer> first,Callable<Integer> second,int success) throws Exception {
        CountDownLatch start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Future<Integer> a=pool.submit(() -> { start.await();return first.call(); });Future<Integer> b=pool.submit(() -> { start.await();return second.call(); });start.countDown();
            List<Integer> results=List.of(a.get(25,TimeUnit.SECONDS),b.get(25,TimeUnit.SECONDS));
            if(success<0) { assertThat(results).contains(409);assertThat(results.stream().filter(v->v==200||v==201).count()).isEqualTo(1); }
            else assertThat(results).containsExactlyInAnyOrder(success,409);
        }
    }
    @Test void twoPostgresTransactionsBothSeeingAnEmptySlotStillHaveOneWinner() throws Exception {
        CyclicBarrier barrier=new CyclicBarrier(2);
        Callable<Integer> reservation=() -> {
            try(var connection=dataSource.getConnection()) {
                connection.setAutoCommit(false);
                try {
                    try(var statement=connection.createStatement();var result=statement.executeQuery("SELECT count(*) FROM appointment")) {
                        result.next();assertThat(result.getInt(1)).isZero();
                    }
                    barrier.await(10,TimeUnit.SECONDS);
                    try(var statement=connection.prepareStatement("INSERT INTO appointment(id,patient_id,start_at,end_at,appointment_type,status,created_at,updated_at) VALUES (?,?,TIMESTAMPTZ '2027-01-10 10:00:00Z',TIMESTAMPTZ '2027-01-10 10:30:00Z','CONSULTATION','EN_ATTENTE',now(),now())")) {
                        statement.setObject(1,UUID.randomUUID());statement.setObject(2,UUID.fromString(patient.get("id").asString()));statement.executeUpdate();
                    }
                    connection.commit();return 201;
                } catch(java.sql.SQLException exception) {
                    connection.rollback();assertThat(exception.getSQLState()).isEqualTo("23P01");return 409;
                }
            }
        };
        parallel(reservation,reservation,201);assertThat(count("appointment")).isEqualTo(1);
    }
    @Test void databaseConstraintIsAuthoritativeEvenWithoutServiceCheck() throws Exception {
        JsonNode a=create();
        assertThatThrownBy(() -> jdbc.update("INSERT INTO appointment SELECT ?,patient_id,0,start_at,end_at,appointment_type,status,created_at,updated_at FROM appointment WHERE id=?",UUID.randomUUID(),UUID.fromString(a.get("id").asString()))).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE appointment SET end_at=start_at WHERE id=?",UUID.fromString(a.get("id").asString()))).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE appointment SET patient_id=? WHERE id=?",UUID.randomUUID(),UUID.fromString(a.get("id").asString()))).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE appointment SET status='NEW_STATUS' WHERE id=?",UUID.fromString(a.get("id").asString()))).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM patient WHERE id=?",UUID.fromString(patient.get("id").asString()))).isInstanceOf(DataIntegrityViolationException.class);
    }
    @Test void auditFailureRollsBackEveryMutation() throws Exception {
        JsonNode a=create();jdbc.execute("CREATE FUNCTION reject_appointment_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_appointment_id IS NOT NULL THEN RAISE EXCEPTION 'synthetic rejection'; END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER reject_appointment_audit BEFORE INSERT ON security_audit_event FOR EACH ROW EXECUTE FUNCTION reject_appointment_audit()");
        try {
            assertThat(reception.send("POST","/api/v1/appointments",slot("2027-01-10T12:00:00Z","2027-01-10T12:30:00Z"),true).statusCode()).isGreaterThanOrEqualTo(400);
            assertThat(reception.send("PUT",path(a),update(a,"2027-01-10T12:00:00Z","2027-01-10T12:30:00Z"),true).statusCode()).isGreaterThanOrEqualTo(400);
            assertThat(status(reception,a,"ANNULE").statusCode()).isGreaterThanOrEqualTo(400);
            assertThat(count("appointment")).isEqualTo(1);assertThat(events()).isEqualTo(1);assertThat(node(reception.get(path(a))).get("version").asLong()).isZero();
        } finally { jdbc.execute("DROP TRIGGER reject_appointment_audit ON security_audit_event");jdbc.execute("DROP FUNCTION reject_appointment_audit()"); }
    }
    @Test void authenticationCsrfDefaultDenyAndRevocationRemainEnforced() throws Exception {
        try(Browser anonymous=new Browser(null)) { assertThat(anonymous.get("/api/v1/appointments").statusCode()).isEqualTo(401); }
        assertThat(reception.send("POST","/api/v1/appointments",slot(),false).statusCode()).isEqualTo(403);
        JsonNode a=create();assertThat(reception.send("DELETE",path(a),null,true).statusCode()).isEqualTo(403);
        assertThat(reception.send("PATCH",path(a),slot(),true).statusCode()).isEqualTo(403);
        jdbc.update("UPDATE application_user SET session_version=session_version+1 WHERE username='appointment.reception'");
        assertThat(reception.get(path(a)).statusCode()).isEqualTo(401);
    }
    @Test void errorAndAuditDoNotLeakPayloads(CapturedOutput output) throws Exception {
        JsonNode a=create();var conflict=reception.send("POST","/api/v1/appointments",slot(),true);
        assertThat(conflict.statusCode()).isEqualTo(409);assertThat(conflict.headers().firstValue("content-type").orElseThrow()).contains("application/problem+json");
        assertThat(conflict.body()).doesNotContain("appointment_no_overlap","patientId","Patient synthétique","SELECT","constraint");
        reception.send("POST","/api/v1/appointments",slot().put("notes","CONFIDENTIAL-SCHEDULING-CANARY"),true);
        assertThat(output.getAll()).doesNotContain("CONFIDENTIAL-SCHEDULING-CANARY",PASSWORD,"Patient synthétique");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM security_audit_event WHERE target_appointment_id=? AND actor_user_id IS NOT NULL AND subject_user_id IS NULL AND target_patient_id IS NULL",Integer.class,UUID.fromString(a.get("id").asString()))).isEqualTo(1);
    }
    class Browser implements AutoCloseable {
        final HttpClient client=HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();final String csrf;
        Browser(String username) throws Exception {
            String token=node(get("/api/v1/auth/csrf")).get("token").asString();
            if(username!=null)assertThat(raw("POST","/api/v1/auth/login",json.valueToTree(Map.of("identifier",username,"password",PASSWORD)),token).statusCode()).isEqualTo(200);
            csrf=node(get("/api/v1/auth/csrf")).get("token").asString();
        }
        HttpResponse<String> get(String path)throws Exception{return raw("GET",path,null,null);}
        HttpResponse<String> send(String method,String path,JsonNode body,boolean token)throws Exception{return raw(method,path,body,token?csrf:null);}
        HttpResponse<String> raw(String method,String path,JsonNode body,String token)throws Exception {
            var b=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).timeout(Duration.ofSeconds(20));if(token!=null)b.header("X-CSRF-TOKEN",token);
            if(method.equals("GET"))b.GET();else b.header("Content-Type","application/json").method(method,HttpRequest.BodyPublishers.ofString(body==null?"":json.writeValueAsString(body)));
            return client.send(b.build(),HttpResponse.BodyHandlers.ofString());
        }
        public void close(){client.close();}
    }
    @TestConfiguration(proxyBeanMethods=false)
    static class TimeConfiguration { @Bean @Primary PatientIntegrationTest.MovingClock appointmentClock(){return new PatientIntegrationTest.MovingClock();} }
}
