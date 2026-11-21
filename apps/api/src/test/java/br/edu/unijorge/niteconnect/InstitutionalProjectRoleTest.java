package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class InstitutionalProjectRoleTest extends ProjectTestSupport {
    @Test void roleAloneDoesNotCreateParticipationLeadershipOrGlobalAuthority() throws Exception {
        UUID project = project();
        mvc.perform(get("/api/v1/me").with(token(LEADER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.roles[0]").value("INTEGRANTE"))
                .andExpect(jsonPath("$.roles[1]").value("GESTOR_PROJETO"));
        mvc.perform(get("/api/v1/me/projects").with(token(LEADER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/projects/" + project).with(token(LEADER))).andExpect(status().isNotFound());
        mvc.perform(patch("/api/v1/projects/" + project).with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version(project)))).andExpect(status().isNotFound());
        for (String path : java.util.List.of("/api/v1/members", "/api/v1/invitations",
                "/api/v1/attendance/frequency/summary?from=2026-11-01&to=2026-11-07",
                "/api/v1/analytics/dashboard?from=2026-11-01&to=2026-11-07", "/api/v1/management/activities",
                "/api/v1/admin/activity-plannings", "/api/v1/academic/enrollments")) {
            mvc.perform(get(path).with(token(LEADER))).andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/v1/members/" + ADMIN).with(token(LEADER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/me/dashboard?from=2026-11-01&to=2026-11-07").with(token(LEADER))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/me/academic/enrollments").with(token(LEADER))).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where member_id=?", Integer.class, LEADER)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where member_id=?", Integer.class, LEADER)).isZero();
    }

    @Test void leadershipIsContextualAndRequiresAnInstitutionalRole() throws Exception {
        UUID own = project(), other = project();
        join(own, LEADER);
        mvc.perform(post("/api/v1/projects/" + own + "/leadership-transfers").with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content(transferBody(MEMBER, version(own))))
                .andExpect(status().isConflict());
        transfer(own, LEADER);
        mvc.perform(patch("/api/v1/projects/" + own).with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version(own)))).andExpect(status().isOk());
        mvc.perform(patch("/api/v1/projects/" + other).with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version(other)))).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where project_id=? and ended_at is null", Integer.class, own)).isEqualTo(1);
    }

    @Test void revocationRequiresExplicitLeadershipTransferAndLastGlobalAdministratorRemains() throws Exception {
        UUID project = project(); join(project, LEADER); transfer(project, LEADER);
        mvc.perform(delete("/api/v1/members/" + LEADER + "/roles/GESTOR_PROJETO").with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":0,\"reason\":\"Teste\"}"))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where project_id=? and ended_at is null", Integer.class, project)).isEqualTo(1);
        mvc.perform(delete("/api/v1/members/" + ADMIN + "/roles/COORDENADOR").with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":0,\"reason\":\"Teste\"}"))
                .andExpect(status().isConflict());
        transfer(project, null);
        mvc.perform(delete("/api/v1/members/" + LEADER + "/roles/GESTOR_PROJETO").with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":0,\"reason\":\"Teste\"}"))
                .andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where project_id=?", Integer.class, project)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where member_id=? and action='ROLE_REVOKED'", Integer.class, LEADER)).isEqualTo(1);
    }

    @Test void globalManagersRetainAuthorityAndStatusHistory() throws Exception {
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_GERAL',?,'Fixture')", OTHER, ADMIN);
        mvc.perform(get("/api/v1/members").with(token(ADMIN))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/members").with(token(OTHER))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/members").with(token(MEMBER))).andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/members/" + ADMIN + "/status").with(token(OTHER))
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"AFASTADO\",\"expectedVersion\":0,\"reason\":\"Teste\"}"))
                .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.member_status_history where member_id=?", Integer.class, ADMIN)).isEqualTo(1);
        mvc.perform(get("/api/v1/members").with(token(OTHER))).andExpect(status().isOk());
    }

    @Test void promotionAndRoleChangesDoNotTransferLeadershipImplicitly() throws Exception {
        UUID project = project(); join(project, LEADER); transfer(project, LEADER);
        mvc.perform(post("/api/v1/members/" + LEADER + "/roles").with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"GESTOR_GERAL\",\"expectedVersion\":0,\"reason\":\"Promoção\"}"))
                .andExpect(status().isOk());
        mvc.perform(delete("/api/v1/members/" + LEADER + "/roles/GESTOR_PROJETO").with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":1,\"reason\":\"Ajuste de papel\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/members/" + LEADER + "/roles/GESTOR_GERAL").with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":2,\"reason\":\"Revogação\"}"))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select member_id from nite_connect.project_leadership_history where project_id=? and ended_at is null", UUID.class, project)).isEqualTo(LEADER);
        transfer(project, null);
        mvc.perform(delete("/api/v1/members/" + LEADER + "/roles/GESTOR_GERAL").with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":2,\"reason\":\"Revogação\"}"))
                .andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where project_id=?", Integer.class, project)).isEqualTo(1);
    }

    @Test void projectManagerCannotCountAsLastGlobalAdministratorOnDeactivation() throws Exception {
        mvc.perform(patch("/api/v1/members/" + ADMIN + "/status").with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"AFASTADO\",\"expectedVersion\":0,\"reason\":\"Teste\"}"))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select status from nite_connect.members where id=?", String.class, ADMIN)).isEqualTo("ATIVO");
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.member_status_history where member_id=?", Integer.class, ADMIN)).isZero();
    }
}
