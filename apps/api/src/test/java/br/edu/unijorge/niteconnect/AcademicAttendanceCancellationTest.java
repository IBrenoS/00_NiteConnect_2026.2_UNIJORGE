package br.edu.unijorge.niteconnect;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Import;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(AcademicSyntheticSupport.Documents.class)
class AcademicAttendanceCancellationTest extends AcademicSyntheticSupport {
    @Test
    void cancellationAfterFrequencyEvidenceCapturePreservesHistoryAndRejectsCurrentUse() throws Exception {
        UUID enrollment = enrollment(policy(term()));
        approve(enrollment);
        UUID attendance = frequencyAttendance();
        UUID event = jdbc.queryForObject(
                "select event_id from nite_connect.attendance_records where id=?", UUID.class, attendance);
        UUID list = jdbc.queryForObject(
                "select id from nite_connect.attendance_lists where calendar_event_id=?", UUID.class, event);

        mvc.perform(post("/api/v1/attendance/lists/" + list + "/finalize").with(token(ADMIN))
                        .contentType("application/json").content(json.writeValueAsString(Map.of(
                                "expectedVersion", jdbc.queryForObject(
                                        "select version from nite_connect.attendance_lists where id=?", Long.class, list),
                                "outcome", "REALIZADA_CONTABILIZAVEL", "reason", "Reunião realizada"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONCLUIDA"));

        UUID evidence = identifier(postAs(MEMBER,
                "/api/v1/me/academic/enrollments/" + enrollment + "/evidence",
                Map.of("source", "ATTENDANCE_CONFIRMATION", "sourceId", attendance,
                        "expectedVersion", ev(enrollment), "reason", "Presença confirmada"), 201));
        String capturedSnapshot = jdbc.queryForObject(
                "select snapshot::text from nite_connect.academic_evidence where id=?", String.class, evidence);
        var captureTime = jdbc.queryForObject(
                "select captured_at from nite_connect.academic_evidence where id=?", java.sql.Timestamp.class, evidence);

        postAs(ADMIN, "/api/v1/academic/enrollments/" + enrollment + "/assessments",
                Map.of("pillar", "PRESENTATIONS", "score", 8, "evidenceIds", List.of(evidence),
                        "expectedVersion", ev(enrollment), "reason", "Avaliação sintética"), 409);
        assertThat(jdbc.queryForObject(
                "select count(*) from nite_connect.academic_assessments where enrollment_id=?", Long.class, enrollment))
                .isZero();

        completedCalculation(enrollment);
        UUID deliveryEvidence = jdbc.queryForObject("""
                select ae.evidence_id from nite_connect.academic_assessment_evidence ae
                join nite_connect.academic_assessments a on a.id=ae.assessment_id
                where a.enrollment_id=? and a.pillar='DELIVERIES' order by a.revision desc,ae.position limit 1
                """, UUID.class, enrollment);
        postAs(ADMIN, "/api/v1/academic/enrollments/" + enrollment + "/assessments",
                Map.of("pillar", "DELIVERIES", "score", 9, "evidenceIds", List.of(deliveryEvidence, evidence),
                        "expectedVersion", ev(enrollment), "reason", "Entrega e contexto de presença"), 201);
        UUID calculation = identifier(postAs(ADMIN,
                "/api/v1/academic/enrollments/" + enrollment + "/calculations", command(ev(enrollment)), 201));
        UUID homologation = identifier(postAs(ADMIN,
                "/api/v1/academic/calculations/" + calculation + "/homologations", command(ev(enrollment)), 201));
        String calculationBeforeCancellation = jdbc.queryForObject(
                "select data::text from nite_connect.academic_calculations where id=?", String.class, calculation);
        assertThat(jdbc.queryForObject(
                "select count(*) from nite_connect.academic_calculations where enrollment_id=?", Long.class, enrollment))
                .isEqualTo(2);
        assertThat(jdbc.queryForObject(
                "select count(*) from nite_connect.academic_homologations where enrollment_id=?", Long.class, enrollment))
                .isEqualTo(1);

        mvc.perform(post("/api/v1/agenda/events/" + event + "/cancel").with(token(ADMIN))
                        .contentType("application/json").content(json.writeValueAsString(Map.of(
                                "expectedVersion", jdbc.queryForObject(
                                        "select version from nite_connect.calendar_events where id=?", Long.class, event),
                                "reason", "Cancelamento posterior auditado", "confirmed", true))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELADO"));

        assertThat(jdbc.queryForObject(
                "select status from nite_connect.attendance_lists where id=?", String.class, list)).isEqualTo("CANCELADA");
        assertThat(jdbc.queryForObject(
                "select outcome from nite_connect.attendance_lists where id=?", String.class, list)).isEqualTo("NAO_REALIZADA");
        assertThat(jdbc.queryForObject(
                "select count(*) from nite_connect.attendance_records where id=?", Long.class, attendance)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "select snapshot::text from nite_connect.academic_evidence where id=?", String.class, evidence))
                .isEqualTo(capturedSnapshot);
        assertThat(jdbc.queryForObject(
                "select captured_at from nite_connect.academic_evidence where id=?", java.sql.Timestamp.class, evidence))
                .isEqualTo(captureTime);
        assertThat(jdbc.queryForObject(
                "select count(*) from nite_connect.academic_events where entity_type='EVIDENCE' and entity_id=? and action='CAPTURED'",
                Long.class, evidence)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "select count(*) from nite_connect.attendance_list_events where list_id=? and action='LIST_CANCELLED'",
                Long.class, list)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "select data::text from nite_connect.academic_calculations where id=?", String.class, calculation))
                .isEqualTo(calculationBeforeCancellation);
        assertThat(jdbc.queryForObject(
                "select count(*) from nite_connect.academic_calculations where enrollment_id=?", Long.class, enrollment))
                .isEqualTo(2);
        assertThat(jdbc.queryForObject(
                "select count(*) from nite_connect.academic_homologations where enrollment_id=?", Long.class, enrollment))
                .isEqualTo(1);
        mvc.perform(get("/api/v1/academic/enrollments/" + enrollment + "/homologation").with(token(ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(homologation.toString()));

        String ownEvidenceBody = mvc.perform(get("/api/v1/me/academic/enrollments/" + enrollment + "/evidence")
                        .with(token(MEMBER)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var ownEvidence = json.readTree(ownEvidenceBody).path("items");
        assertThat(ownEvidence.toString()).contains(evidence.toString());

        mvc.perform(get("/api/v1/academic/evidence/" + evidence + "/comparison").with(token(ADMIN)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Reunião cancelada"));

        postAs(MEMBER, "/api/v1/me/academic/enrollments/" + enrollment + "/evidence",
                Map.of("source", "ATTENDANCE_CONFIRMATION", "sourceId", attendance,
                        "expectedVersion", ev(enrollment), "reason", "Nova captura sintética"), 409);
        postAs(ADMIN, "/api/v1/academic/homologations/" + homologation + "/reopen", command(ev(enrollment)), 201);
        mvc.perform(post("/api/v1/academic/enrollments/" + enrollment + "/assessments").with(token(ADMIN))
                        .contentType("application/json").content(json.writeValueAsString(Map.of(
                                "pillar", "DELIVERIES", "score", 9, "evidenceIds", List.of(deliveryEvidence, evidence),
                                "expectedVersion", ev(enrollment), "reason", "Reutilização sintética"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Reunião cancelada"));
        postAs(ADMIN, "/api/v1/academic/enrollments/" + enrollment + "/calculations", command(ev(enrollment)), 409);
        assertThat(jdbc.queryForObject(
                "select count(*) from nite_connect.academic_calculations where enrollment_id=?", Long.class, enrollment))
                .isEqualTo(2);
        assertThat(jdbc.queryForObject(
                "select count(*) from nite_connect.academic_homologations where enrollment_id=?", Long.class, enrollment))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "select count(*) from nite_connect.academic_events where enrollment_id=? and action='HOMOLOGATION_REOPENED'",
                Long.class, enrollment)).isEqualTo(1);
    }

    private UUID frequencyAttendance() throws Exception {
        UUID event = identifier(postAs(ADMIN, "/api/v1/agenda/events", Map.of(
                "title", "Presença B06", "description", "Fixture acadêmica", "kind", "EVENTO", "modality", "REMOTA",
                "startsAt", Instant.now().minusSeconds(30).toString(), "endsAt", Instant.now().plusSeconds(3600).toString(),
                "expectedMemberIds", List.of(MEMBER), "reason", "Fixture"), 201));
        String openResponse = mvc.perform(post("/api/v1/attendance/lists").with(token(ADMIN))
                        .header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json")
                        .content(json.writeValueAsString(Map.of("calendarEventId", event,
                                "confirmationWindowMinutes", 3, "countsForFrequency", true))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID list = UUID.fromString(json.readTree(openResponse).path("listId").asText());
        String qrResponse = mvc.perform(post("/api/v1/attendance/lists/" + list + "/qr/renew").with(token(ADMIN))
                        .contentType("application/json").content(json.writeValueAsString(Map.of("expectedVersion", 0))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String qr = json.readTree(qrResponse).path("qrToken").asText();
        var confirmation = postAs(MEMBER, "/api/v1/me/frequency/confirmations", Map.of("qrToken", qr), 201);
        return UUID.fromString(confirmation.path("attendanceId").asText());
    }
}
