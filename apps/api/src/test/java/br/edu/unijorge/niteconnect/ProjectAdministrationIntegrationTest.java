package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProjectAdministrationIntegrationTest extends ProjectTestSupport {
    @Test void bothActiveGlobalRolesCreateWithoutImplicitMembershipOrLeadership() throws Exception {
        for (String role : java.util.List.of("COORDENADOR", "GESTOR_GERAL")) {
            jdbc.update("update nite_connect.role_assignments set role=? where member_id=?", role, ADMIN);
            UUID id = project();
            mvc.perform(get("/api/v1/me").with(token(ADMIN))).andExpect(jsonPath("$.roles").value(org.hamcrest.Matchers.hasItem(role)));
            mvc.perform(get("/api/v1/projects/" + id + "/workspace").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PLANEJAMENTO"))
                .andExpect(jsonPath("$.acceptingMembers").value(false)).andExpect(jsonPath("$.leaderId").isEmpty())
                .andExpect(jsonPath("$.memberCount").value(0));
            mvc.perform(get("/api/v1/me/projects").with(token(ADMIN))).andExpect(jsonPath("$.total").value(0));
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=?", Integer.class,id)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where project_id=?", Integer.class,id)).isZero();
            mvc.perform(get("/api/v1/project-catalog/" + id).with(token(MEMBER))).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PLANEJAMENTO"));
        }
    }
    @Test void editingTransitionsAvailabilityAndAuditPersistWithOptimisticVersions() throws Exception {
        UUID id = project();
        mvc.perform(patch("/api/v1/projects/"+id).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"title":"Projeto editado","description":"Descrição persistida","startsOn":"2026-11-18","endsOn":"2026-12-18","expectedVersion":0,"reason":"Correção administrativa"}
                """)).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        mvc.perform(get("/api/v1/projects/"+id).with(token(ADMIN))).andExpect(jsonPath("$.title").value("Projeto editado"))
            .andExpect(jsonPath("$.startsOn").value("2026-11-18"));
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where entity_id=? and action='PROJECT_UPDATED' and reason='Correção administrativa'",Integer.class,id)).isEqualTo(1);
        mvc.perform(patch("/api/v1/projects/"+id).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON).content(updateBody(0))).andExpect(status().isConflict());
        for (String state : java.util.List.of("ATIVO","PAUSADO","CONCLUIDO","ATIVO")) {
            mvc.perform(patch("/api/v1/projects/"+id+"/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\""+state+"\",\"expectedVersion\":"+version(id)+",\"reason\":\"Decisão registrada\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value(state));
        }
        mvc.perform(patch("/api/v1/projects/"+id+"/availability").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"acceptingMembers\":true,\"expectedVersion\":"+version(id)+"}")).andExpect(status().isConflict());
        join(id, LEADER); transfer(id, LEADER);
        mvc.perform(patch("/api/v1/projects/"+id+"/availability").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"acceptingMembers\":true,\"expectedVersion\":"+version(id)+"}")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/projects/"+id+"/workspace").with(token(ADMIN))).andExpect(jsonPath("$.acceptingMembers").value(true));
        mvc.perform(get("/api/v1/projects/"+id+"/history").with(token(ADMIN))).andExpect(jsonPath("$.total").value(5));
        mvc.perform(get("/api/v1/me/projects").with(token(ADMIN))).andExpect(jsonPath("$.total").value(0));
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where project_id=?",Integer.class,id)).isEqualTo(1);
    }
    @Test void ordinaryMemberAndInactiveAdministratorCannotCreateOrAdminister() throws Exception {
        UUID id = project(); join(id,MEMBER);
        mvc.perform(post("/api/v1/projects").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"Negado\",\"description\":\"Negado\",\"reason\":\"Negado\"}")).andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/projects/"+id).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON).content(updateBody(version(id)))).andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/projects/"+id+"/status").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"status\":\"ATIVO\",\"expectedVersion\":"+version(id)+",\"reason\":\"Negado\"}")).andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/projects/"+id+"/availability").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"acceptingMembers\":true,\"expectedVersion\":"+version(id)+"}")).andExpect(status().isForbidden());
        jdbc.update("update nite_connect.members set status='AFASTADO' where id=?",ADMIN);
        mvc.perform(post("/api/v1/projects").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"Negado\",\"description\":\"Negado\",\"reason\":\"Negado\"}")).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.projects",Integer.class)).isEqualTo(1);
    }
}
