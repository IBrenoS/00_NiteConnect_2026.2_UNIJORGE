package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class FrequencyListDeletionTest extends AttendanceTestSupport {
    @Test
    void deletingAccountedListRemovesItFromReadsAndMetricsButPreservesAttendanceAndAudit() throws Exception {
        UUID event = event();
        UUID list = openList(event);
        checkIn(event, qrForList(list));
        mvc.perform(post("/api/v1/attendance/lists/" + list + "/finalize").with(token(ADMIN))
                        .contentType("application/json").content(json.writeValueAsString(Map.of(
                                "expectedVersion", listVersion(list), "outcome", "REALIZADA_CONTABILIZAVEL",
                                "reason", "Reunião realizada"))))
                .andExpect(status().isOk());
        LocalDate date = listOpenedAt(list).atZone(ZoneId.of("America/Bahia")).toLocalDate();
        String range = "?from=" + date + "&to=" + date;

        mvc.perform(get("/api/v1/me/frequency/summary" + range).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.counts.eligibleMeetings").value(1));
        mvc.perform(get("/api/v1/attendance/frequency/summary" + range).with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[?(@.memberId == '" + MEMBER + "')].counts.present").value(1));

        mvc.perform(delete("/api/v1/attendance/lists/" + list).with(token(ADMIN)))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/attendance/lists").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/attendance/lists?status=CONCLUIDA").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/attendance/lists/" + list).with(token(ADMIN)))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/attendance/lists").with(token(ADMIN))
                        .header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json")
                        .content(json.writeValueAsString(Map.of("calendarEventId", event,
                                "confirmationWindowMinutes", 3, "countsForFrequency", true))))
                .andExpect(status().isConflict());
        mvc.perform(get("/api/v1/me/frequency/history" + range).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/me/frequency/summary" + range).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.counts.eligibleMeetings").value(0));
        mvc.perform(get("/api/v1/attendance/frequency/summary" + range).with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));

        assertThat(jdbc.queryForObject("select count(*) from nite_connect.attendance_records where event_id=?", Long.class, event)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.attendance_list_members where list_id=?", Long.class, list)).isEqualTo(4);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.attendance_list_events where list_id=? and action='LIST_DELETED'", Long.class, list)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select deleted_at is not null from nite_connect.attendance_lists where id=?", Boolean.class, list)).isTrue();
        assertThat(jdbc.queryForObject("select status from nite_connect.calendar_events where id=?", String.class, event)).isEqualTo("ENCERRADO");
    }

    @Test
    void openListMustBeCanceledBeforeDeletionAndRepeatedDeleteIsIdempotent() throws Exception {
        UUID list = openList(event());

        mvc.perform(delete("/api/v1/attendance/lists/" + list).with(token(ADMIN)))
                .andExpect(status().isConflict());

        mvc.perform(post("/api/v1/attendance/lists/" + list + "/cancel").with(token(ADMIN))
                        .contentType("application/json").content(json.writeValueAsString(Map.of(
                                "expectedVersion", listVersion(list), "reason", "Reunião cancelada", "confirmed", true))))
                .andExpect(status().isOk());

        mvc.perform(delete("/api/v1/attendance/lists/" + list).with(token(ADMIN)))
                .andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/attendance/lists/" + list).with(token(ADMIN)))
                .andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.attendance_list_events where list_id=? and action='LIST_DELETED'", Long.class, list)).isEqualTo(1);
    }

    @Test
    void onlyGlobalAdministratorCanDeleteFrequencyLists() throws Exception {
        UUID list = openList(event());
        mvc.perform(delete("/api/v1/attendance/lists/" + list).with(token(LEADER)))
                .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select deleted_at is null from nite_connect.attendance_lists where id=?", Boolean.class, list)).isTrue();

        mvc.perform(post("/api/v1/attendance/lists/" + list + "/cancel").with(token(ADMIN))
                        .contentType("application/json").content(json.writeValueAsString(Map.of(
                                "expectedVersion", listVersion(list), "reason", "Reunião cancelada", "confirmed", true))))
                .andExpect(status().isOk());
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_GERAL',?,'Fixture')", OTHER, ADMIN);
        mvc.perform(delete("/api/v1/attendance/lists/" + list).with(token(OTHER)))
                .andExpect(status().isNoContent());
    }

    private long listVersion(UUID list) {
        return jdbc.queryForObject("select version from nite_connect.attendance_lists where id=?", Long.class, list);
    }

    private java.time.Instant listOpenedAt(UUID list) {
        return jdbc.queryForObject("select opened_at from nite_connect.attendance_lists where id=?", java.sql.Timestamp.class, list).toInstant();
    }
}
