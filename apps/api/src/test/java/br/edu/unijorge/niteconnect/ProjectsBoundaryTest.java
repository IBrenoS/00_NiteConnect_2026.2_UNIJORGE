package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProjectsBoundaryTest extends ProjectTestSupport {
    @Test void administratorCreatesIndependentProjectAndAudit() throws Exception {
        UUID id = project();
        mvc.perform(get("/api/v1/projects/" + id).with(token(ADMIN))).andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(0));
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where entity_id=? and action='PROJECT_CREATED'", Integer.class, id)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=?", Integer.class, id)).isZero();
    }
    @Test void memberCannotCreateFormalProject() throws Exception {
        mvc.perform(post("/api/v1/projects").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Teste\",\"description\":\"Teste\",\"reason\":\"Teste\"}"))
                .andExpect(status().isForbidden());
    }
    @Test void contextualLeaderManagesOnlyOwnProjectWithoutAccessToPersonalData() throws Exception {
        UUID own = project(); UUID other = project(); join(own, LEADER); transfer(own, LEADER);
        mvc.perform(patch("/api/v1/projects/" + own).with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version(own)))).andExpect(status().isOk());
        mvc.perform(patch("/api/v1/projects/" + other).with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version(other)))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/members/" + ADMIN).with(token(LEADER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/projects").with(token(LEADER))).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/v1/audit-events").with(token(LEADER))).andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/projects/" + own + "/status").with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"ATIVO\",\"expectedVersion\":" + version(own) + ",\"reason\":\"Teste\"}"))
                .andExpect(status().isForbidden());
    }
    @Test void participationExitAndReturnPreservesOwnHistoryWithMinimalProjectData() throws Exception {
        UUID first = project(); UUID second = project(); join(first, MEMBER); join(second, MEMBER);
        mvc.perform(get("/api/v1/me/projects").with(token(MEMBER))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2));
        mvc.perform(delete("/api/v1/projects/" + first + "/members/" + MEMBER).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedVersion\":" + version(first) + ",\"reason\":\"Saída\"}")).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/projects/" + first).with(token(MEMBER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/me/projects/history").with(token(MEMBER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].description").doesNotExist()).andExpect(jsonPath("$.total").value(2));
        join(first, MEMBER);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and member_id=?", Integer.class, first, MEMBER)).isEqualTo(2);
        mvc.perform(get("/api/v1/projects/" + first + "/members/history").with(token(MEMBER))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/projects/" + first + "/members").with(token(MEMBER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].institutionalEmail").doesNotExist())
                .andExpect(jsonPath("$.items[0].startReason").doesNotExist());
    }
    @Test void leadershipTransferAndVacancyPreservePeriodsAndRevokePreviousAuthority() throws Exception {
        UUID id = project(); join(id, LEADER); join(id, MEMBER); transfer(id, LEADER);
        mvc.perform(delete("/api/v1/projects/" + id + "/members/" + LEADER).with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedVersion\":" + version(id) + ",\"reason\":\"Saída\"}")).andExpect(status().isConflict());
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_PROJETO',?,'Fixture')", MEMBER, ADMIN);
        transfer(id, MEMBER);
        mvc.perform(patch("/api/v1/projects/" + id).with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version(id)))).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where project_id=?", Integer.class, id)).isEqualTo(2);
        transfer(id, null);
        mvc.perform(get("/api/v1/projects/" + id + "/leadership").with(token(ADMIN))).andExpect(status().isOk())
                .andExpect(jsonPath("$.effective").value(false));
        mvc.perform(get("/api/v1/projects/" + id).with(token(ADMIN))).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and ended_at is null", Integer.class, id)).isEqualTo(2);
    }
    @Test void suspendedLeaderLosesAuthorityWithoutDestroyingProjectOrMembership() throws Exception {
        UUID id = project(); join(id, LEADER); transfer(id, LEADER);
        mvc.perform(patch("/api/v1/members/" + LEADER + "/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"AFASTADO\",\"expectedVersion\":0,\"reason\":\"Afastamento\"}")).andExpect(status().isOk());
        mvc.perform(patch("/api/v1/projects/" + id).with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version(id)))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/projects/" + id + "/leadership").with(token(ADMIN))).andExpect(status().isOk())
                .andExpect(jsonPath("$.effective").value(false)).andExpect(jsonPath("$.memberId").value(LEADER.toString()));
        join(id, MEMBER);
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_PROJETO',?,'Fixture')", MEMBER, ADMIN);
        transfer(id, MEMBER);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=?", Integer.class, id)).isEqualTo(2);
    }
    @Test void stateChangesPauseResumeCompleteAndReopenWithoutLosingHistory() throws Exception {
        UUID id = project();
        for (String state : java.util.List.of("ATIVO", "PAUSADO", "ATIVO", "CONCLUIDO", "ATIVO")) {
            mvc.perform(patch("/api/v1/projects/" + id + "/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"status\":\"" + state + "\",\"expectedVersion\":" + version(id) + ",\"reason\":\"Decisão\"}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value(state));
        }
        mvc.perform(get("/api/v1/projects/" + id + "/history").with(token(ADMIN))).andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(6));
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_status_history where project_id=? and new_status='CONCLUIDO'", Integer.class, id)).isEqualTo(1);
    }
    @Test void staleVersionInvalidPeriodAndInvalidMemberLeaveNoPartialChanges() throws Exception {
        UUID id = project(); join(id, MEMBER);
        mvc.perform(patch("/api/v1/projects/" + id + "/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"CONCLUIDO\",\"expectedVersion\":1,\"reason\":\"Pular ativação\"}"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/projects").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Teste\",\"description\":\"Teste\",\"reason\":\"  \"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/v1/projects/" + id).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(0))).andExpect(status().isConflict());
        mvc.perform(post("/api/v1/projects/" + id + "/members").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\"" + UUID.randomUUID() + "\",\"responsibility\":\"Teste\",\"expectedVersion\":1,\"reason\":\"Teste\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/projects").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Teste\",\"description\":\"Teste\",\"startsOn\":\"2026-10-20\",\"endsOn\":\"2026-10-19\",\"reason\":\"Teste\"}"))
                .andExpect(status().isBadRequest());
        assertThat(version(id)).isEqualTo(1);
    }
    @Test void simultaneousLeadershipTransfersHaveOneWinnerAndPreserveHistory() throws Exception {
        UUID id = project(); join(id, LEADER); join(id, MEMBER); long version = version(id);
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_PROJETO',?,'Fixture')", MEMBER, ADMIN);
        try (var executor = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            var start = new java.util.concurrent.CountDownLatch(1);
            var first = executor.submit(() -> transferAfter(start, id, LEADER, version));
            var second = executor.submit(() -> transferAfter(start, id, MEMBER, version));
            start.countDown();
            assertThat(java.util.List.of(first.get(), second.get())).containsExactlyInAnyOrder(200, 409);
        }
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where project_id=? and ended_at is null", Integer.class, id)).isEqualTo(1);
    }
    @Test void formerLeaderCanConsultOwnLeadershipPeriodsWithoutManagerialReasons() throws Exception {
        UUID id = project(); join(id, LEADER); transfer(id, LEADER); transfer(id, null);
        mvc.perform(get("/api/v1/projects/" + id + "/leadership/history").with(token(LEADER))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/me/projects/leadership/history").with(token(LEADER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].projectId").value(id.toString()))
                .andExpect(jsonPath("$.items[0].endedAt").isNotEmpty()).andExpect(jsonPath("$.items[0].startReason").doesNotExist());
        mvc.perform(get("/api/v1/me/projects/leadership/history").with(token(OTHER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0));
    }
}
