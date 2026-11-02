package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class MeetingsBoundaryTest extends ProjectTestSupport {
    @Test void meetingsSchemaIsSeparateFromAgendaAndFrequency() {
        assertThat(jdbc.queryForObject("select to_regclass('nite_connect.meetings') is not null", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("select to_regclass('nite_connect.calendar_events') is not null", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("select to_regclass('nite_connect.attendance_lists') is not null", Boolean.class)).isTrue();
    }

    @Test void inviteeSearchListsActiveMembersWithoutAdministrativeRole() throws Exception {
        jdbc.update("update nite_connect.members set status='DESLIGADO' where id=?", OTHER);

        mvc.perform(get("/api/v1/meetings/invitees").with(token(MEMBER))
                        .param("q", "Teste").param("page", "0").param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.items.length()").value(3))
                .andExpect(jsonPath("$.items[0].id").exists())
                .andExpect(jsonPath("$.items[0].name").value("Teste"))
                .andExpect(jsonPath("$.items[0].institutionalEmail").doesNotExist());
    }
}
