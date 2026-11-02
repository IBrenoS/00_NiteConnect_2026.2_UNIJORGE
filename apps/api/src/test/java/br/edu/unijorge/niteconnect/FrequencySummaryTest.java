package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class FrequencySummaryTest extends AttendanceTestSupport {
    private static final ZoneId BAHIA = ZoneId.of("America/Bahia");

    @Test
    void finalizedMeetingKeepsJustificationInDenominatorAndCancellationRemovesItFromMetrics() throws Exception {
        UUID event = event(), list = openList(event);
        String qr = qrForList(list);
        checkIn(event, qr);
        mvc.perform(post("/api/v1/me/frequency/confirmations").with(token(OTHER)).contentType("application/json")
                .content(json.writeValueAsString(Map.of("qrToken", qr))))
                .andExpect(status().isCreated());

        long justificationVersion = listVersion(list);
        String justification = json.writeValueAsString(Map.of("expectedVersion", justificationVersion,
                "targetStatus", "JUSTIFICADO", "reason", "EMAIL_EXTERNO_RECEBIDO"));
        mvc.perform(patch("/api/v1/attendance/lists/" + list + "/participants/" + LEADER).with(token(ADMIN))
                .contentType("application/json").content(justification))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("JUSTIFICADO"));
        assertThat(jdbc.queryForObject("select reason from nite_connect.attendance_list_members where list_id=? and member_id=?",
                String.class, list, LEADER)).isEqualTo("Comunicação externa recebida por e-mail");
        long eventsAfterJustification = jdbc.queryForObject("select count(*) from nite_connect.attendance_list_events where list_id=?", Long.class, list);
        mvc.perform(patch("/api/v1/attendance/lists/" + list + "/participants/" + LEADER).with(token(ADMIN))
                .contentType("application/json").content(justification)).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.attendance_list_events where list_id=?", Long.class, list))
                .isEqualTo(eventsAfterJustification);

        mvc.perform(patch("/api/v1/attendance/lists/" + list + "/participants/" + MEMBER).with(token(MEMBER))
                .contentType("application/json").content(json.writeValueAsString(Map.of(
                        "expectedVersion", listVersion(list), "targetStatus", "JUSTIFICADO", "reason", "EMAIL_EXTERNO_RECEBIDO"))))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/v1/attendance/lists/" + list + "/finalize").with(token(ADMIN)).contentType("application/json")
                .content(json.writeValueAsString(Map.of("expectedVersion", listVersion(list),
                        "outcome", "REALIZADA_CONTABILIZAVEL", "reason", "Reunião realizada"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CONCLUIDA"));

        LocalDate meetingDate = listOpenedAt(list).atZone(BAHIA).toLocalDate();
        String range = "?from=" + meetingDate + "&to=" + meetingDate;
        mvc.perform(get("/api/v1/me/frequency/summary" + range + "&groupBy=MONTH").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.counts.eligibleMeetings").value(1))
                .andExpect(jsonPath("$.counts.present").value(1)).andExpect(jsonPath("$.counts.attendancePercentage").value(100.00))
                .andExpect(jsonPath("$.buckets.length()").value(1));
        mvc.perform(get("/api/v1/me/frequency/summary" + range + "&groupBy=SEMESTER").with(token(LEADER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.counts.justified").value(1))
                .andExpect(jsonPath("$.counts.attendancePercentage").value(0.00))
                .andExpect(jsonPath("$.buckets[0].period.zoneId").value("America/Bahia"));
        mvc.perform(get("/api/v1/attendance/frequency/summary" + range).with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(4))
                .andExpect(jsonPath("$.items[?(@.memberId == '" + LEADER + "')].counts.justified").value(1));
        mvc.perform(get("/api/v1/attendance/frequency/summary" + range).with(token(MEMBER))).andExpect(status().isForbidden());

        mvc.perform(post("/api/v1/agenda/events/" + event + "/cancel").with(token(ADMIN)).contentType("application/json")
                .content(json.writeValueAsString(Map.of("expectedVersion", ev(event), "reason", "Cancelamento posterior", "confirmed", true))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELADO"));
        mvc.perform(get("/api/v1/me/frequency/summary" + range).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.counts.eligibleMeetings").value(0))
                .andExpect(jsonPath("$.counts.attendancePercentage").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.counts.noEligibleMeetings").value(true));
        mvc.perform(get("/api/v1/me/frequency/history" + range).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].status").value("PRESENTE"))
                .andExpect(jsonPath("$.items[0].inApuration").value(false))
                .andExpect(jsonPath("$.items[0].confirmedAt").isNotEmpty());
    }

    @Test
    void justificationRejectsFreeTextAndRequiresTheStandardAdministrativeReason() throws Exception {
        UUID event = event();
        UUID list = openList(event);
        mvc.perform(patch("/api/v1/attendance/lists/" + list + "/participants/" + MEMBER).with(token(ADMIN))
                        .contentType("application/json").content(json.writeValueAsString(Map.of(
                                "expectedVersion", listVersion(list), "targetStatus", "JUSTIFICADO",
                                "reason", "O integrante informou detalhes pessoais por e-mail"))))
                .andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.attendance_list_events where list_id=? and action='PARTICIPANT_JUSTIFIED'",
                Long.class, list)).isZero();

        mvc.perform(patch("/api/v1/attendance/lists/" + list + "/participants/" + MEMBER).with(token(ADMIN))
                        .contentType("application/json").content(json.writeValueAsString(Map.of(
                                "expectedVersion", listVersion(list), "targetStatus", "JUSTIFICADO",
                                "reason", "EMAIL_EXTERNO_RECEBIDO"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reason").value("Comunicação externa recebida por e-mail"));
    }

    @Test
    void threeLatestCountableAbsencesTriggerSignalAndAdministrativeCorrectionClearsIt() throws Exception {
        UUID latestList = null;
        for (int i = 0; i < 3; i++) {
            UUID meeting = event();
            latestList = openList(meeting);
            mvc.perform(post("/api/v1/attendance/lists/" + latestList + "/finalize").with(token(ADMIN)).contentType("application/json")
                    .content(json.writeValueAsString(Map.of("expectedVersion", 0,
                            "outcome", "REALIZADA_CONTABILIZAVEL", "reason", "Reunião realizada"))))
                    .andExpect(status().isOk());
        }
        LocalDate meetingDate = listOpenedAt(latestList).atZone(BAHIA).toLocalDate();
        String range = "?from=" + meetingDate + "&to=" + meetingDate;
        mvc.perform(get("/api/v1/attendance/frequency/summary" + range).with(token(ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.memberId == '" + MEMBER + "')].absenceSignal.hasThreeConsecutiveUnjustifiedAbsences").value(true))
                .andExpect(jsonPath("$.items[?(@.memberId == '" + MEMBER + "')].absenceSignal.meetings.length()").value(3));

        mvc.perform(patch("/api/v1/attendance/lists/" + latestList + "/participants/" + MEMBER).with(token(ADMIN))
                .contentType("application/json").content(json.writeValueAsString(Map.of("expectedVersion", listVersion(latestList),
                        "targetStatus", "JUSTIFICADO", "reason", "EMAIL_EXTERNO_RECEBIDO"))))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/attendance/frequency/summary" + range).with(token(ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.memberId == '" + MEMBER + "')].absenceSignal.hasThreeConsecutiveUnjustifiedAbsences").value(false));
    }

    @Test
    void emptyPeriodsReturnNullPercentAndMonthlyBucketsCoverRequestedCivilDates() throws Exception {
        LocalDate from = LocalDate.of(2026, 1, 20), to = LocalDate.of(2026, 3, 5);
        mvc.perform(get("/api/v1/me/frequency/summary?from=" + from + "&to=" + to + "&groupBy=MONTH").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.counts.noEligibleMeetings").value(true))
                .andExpect(jsonPath("$.counts.attendancePercentage").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.buckets.length()").value(3))
                .andExpect(jsonPath("$.buckets[0].period.from").value("2026-01-20"))
                .andExpect(jsonPath("$.buckets[2].period.to").value("2026-03-05"));
    }

    @Test
    void quickMeetingHasOpenEndedAgendaIntervalUntilTheListIsFinalized() throws Exception {
        Instant now = Instant.now();
        boolean regular = br.edu.unijorge.niteconnect.attendance.domain.FrequencyRules.isRegular(
                br.edu.unijorge.niteconnect.attendance.domain.Agenda.EventKind.ENCONTRO,
                br.edu.unijorge.niteconnect.attendance.domain.Agenda.Modality.PRESENCIAL, now);
        Map<String, Object> command = new java.util.HashMap<>();
        command.put("meetingName", "  Reunião aberta  ");
        command.put("confirmationWindowMinutes", 3);
        if (!regular) command.put("countsForFrequency", true);
        String response = mvc.perform(post("/api/v1/attendance/lists").with(token(ADMIN))
                        .header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json")
                        .content(json.writeValueAsString(command)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.meetingName").value("Reunião aberta"))
                .andReturn().getResponse().getContentAsString();
        UUID list = UUID.fromString(json.readTree(response).get("listId").asString());
        UUID event = UUID.fromString(json.readTree(response).get("calendarEventId").asString());
        assertThat(jdbc.queryForObject("select ends_at is null from nite_connect.calendar_events where id=?", Boolean.class, event)).isTrue();
        assertThat(jdbc.queryForObject("select frequency_quick from nite_connect.calendar_events where id=?", Boolean.class, event)).isTrue();
        assertThat(jdbc.queryForObject("select kind from nite_connect.calendar_events where id=?", String.class, event))
                .isEqualTo(regular ? "ENCONTRO" : "EXTRAORDINARIO");
        mvc.perform(post("/api/v1/attendance/lists/" + list + "/finalize").with(token(ADMIN)).contentType("application/json")
                        .content(json.writeValueAsString(Map.of("expectedVersion", 0,
                                "outcome", "REALIZADA_CONTABILIZAVEL", "reason", "Reunião realizada"))))
                .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select ends_at is not null from nite_connect.calendar_events where id=?", Boolean.class, event)).isTrue();
        assertThat(jdbc.queryForObject("select status from nite_connect.calendar_events where id=?", String.class, event)).isEqualTo("ENCERRADO");
    }

    @Test
    void preFinalizationCancellationPreservesConfirmedPresenceAndNeverGeneratesAbsence() throws Exception {
        UUID event = event(), list = openList(event);
        String token = qrForList(list);
        UUID attendance = checkIn(event, token);
        long version = listVersion(list);
        mvc.perform(post("/api/v1/agenda/events/" + event + "/close").with(token(ADMIN)).contentType("application/json")
                        .content(json.writeValueAsString(Map.of("expectedVersion", ev(event), "reason", "Atalho inválido"))))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/attendance/lists/" + list + "/cancel").with(token(ADMIN)).contentType("application/json")
                        .content(json.writeValueAsString(Map.of("expectedVersion", version, "reason", "Lista aberta por engano", "confirmed", true))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELADA"));
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.attendance_records where id=?", Long.class, attendance)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select status from nite_connect.attendance_list_members where list_id=? and member_id=?", String.class, list, MEMBER)).isEqualTo("PRESENTE");
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.attendance_list_members where list_id=? and status='AUSENTE'", Long.class, list)).isZero();
        mvc.perform(post("/api/v1/me/frequency/confirmations").with(token(OTHER)).contentType("application/json")
                        .content(json.writeValueAsString(Map.of("qrToken", token))))
                .andExpect(status().isConflict());
        LocalDate meetingDate = listOpenedAt(list).atZone(BAHIA).toLocalDate();
        mvc.perform(get("/api/v1/attendance/frequency/summary?from=" + meetingDate + "&to=" + meetingDate).with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(4))
                .andExpect(jsonPath("$.items[0].counts.noEligibleMeetings").value(true));
    }

    @Test
    void preCutoffPresenceAppearsOnlyAsLegacyHistoryAndNeverAffectsFrequency() throws Exception {
        UUID event = event(), attendance = legacyAttendance(event, MEMBER);
        jdbc.update("update nite_connect.attendance_records set created_at=(select activated_at-interval '1 day' from nite_connect.frequency_settings where id=1) where id=?", attendance);
        Instant occurredAt = jdbc.queryForObject("select created_at from nite_connect.attendance_records where id=?", Timestamp.class, attendance).toInstant();
        LocalDate date = occurredAt.atZone(BAHIA).toLocalDate();
        String range = "?from=" + date + "&to=" + date;
        mvc.perform(get("/api/v1/me/frequency/history" + range).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].status").value("LEGADO"))
                .andExpect(jsonPath("$.items[0].changedAt").value(nullValue()))
                .andExpect(jsonPath("$.items[0].legacy").value(true))
                .andExpect(jsonPath("$.items[0].presenceRecorded").value(true))
                .andExpect(jsonPath("$.items[0].attendanceStatus").value("LEGADO"))
                .andExpect(jsonPath("$.items[0].listStatus").value("LEGADO"))
                .andExpect(jsonPath("$.items[0].accountingStatus").value("ANTERIOR_AO_CORTE"))
                .andExpect(jsonPath("$.items[0].notCountedReason").value("ANTERIOR_AO_CORTE_OFICIAL"))
                .andExpect(jsonPath("$.items[0].inApuration").value(false));
        mvc.perform(get("/api/v1/me/frequency/summary" + range).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.counts.eligibleMeetings").value(0))
                .andExpect(jsonPath("$.counts.present").value(0))
                .andExpect(jsonPath("$.counts.attendancePercentage").value(org.hamcrest.Matchers.nullValue()));
        mvc.perform(get("/api/v1/me/attendance").with(token(MEMBER))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
    }

    private long listVersion(UUID list) {
        return jdbc.queryForObject("select version from nite_connect.attendance_lists where id=?", Long.class, list);
    }

    private Instant listOpenedAt(UUID list) {
        return jdbc.queryForObject("select opened_at from nite_connect.attendance_lists where id=?", Timestamp.class, list).toInstant();
    }
}
