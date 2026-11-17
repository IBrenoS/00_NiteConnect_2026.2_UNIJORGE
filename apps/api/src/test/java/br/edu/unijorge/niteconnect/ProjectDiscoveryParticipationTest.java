package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import java.util.UUID;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProjectDiscoveryParticipationTest extends ProjectTestSupport {
    @Test void activeMemberCanDiscoverButCannotReadWorkspaceBeforeApproval() throws Exception {
        UUID id=project(); join(id,LEADER); transfer(id,LEADER);
        mvc.perform(get("/api/v1/project-catalog").with(token(OTHER)).param("q","Projeto").param("sort","name"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(id.toString()))
                .andExpect(jsonPath("$.items[0].memberCount").value(1))
                .andExpect(jsonPath("$.items[0].image").doesNotExist());
        mvc.perform(get("/api/v1/projects/"+id+"/workspace").with(token(OTHER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/projects/"+id+"/activities").with(token(OTHER))).andExpect(status().isNotFound());
    }

    @Test void requestApprovalCreatesOneParticipationAndNotifiesBothSides() throws Exception {
        UUID id=project(); join(id,LEADER); transfer(id,LEADER);
        mvc.perform(patch("/api/v1/projects/"+id+"/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"ATIVO\",\"expectedVersion\":"+version(id)+",\"reason\":\"Início\"}"))
                .andExpect(status().isOk());
        mvc.perform(patch("/api/v1/projects/"+id+"/availability").with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"acceptingMembers\":true,\"expectedVersion\":"+version(id)+"}")).andExpect(status().isOk());
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"Tenho interesse\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.state").value("PENDENTE"));
        UUID request=jdbc.queryForObject("select id from nite_connect.project_membership_requests where project_id=?",UUID.class,id);
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON)
                .content("{}" )).andExpect(status().isConflict());
        mvc.perform(get("/api/v1/me/project-participation-notifications").with(token(LEADER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests/"+request+"/decision").with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"approve\":true,\"expectedVersion\":0}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("APROVADA"));
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and member_id=? and ended_at is null",Integer.class,id,OTHER)).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_participation_notifications where recipient_id=? and event_type='SOLICITACAO_APROVADA'",Integer.class,OTHER)).isEqualTo(1);
        mvc.perform(get("/api/v1/projects/"+id+"/workspace").with(token(OTHER))).andExpect(status().isOk());
    }

    @Test void interestDoesNotCreateMembershipAndCoordinatorCanConsultIt() throws Exception {
        UUID id=project();
        mvc.perform(post("/api/v1/projects/"+id+"/interest-signals").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"Posso contribuir\"}"))
                .andExpect(status().isCreated());
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and member_id=?",Integer.class,id,OTHER)).isZero();
        mvc.perform(get("/api/v1/projects/"+id+"/interest-signals").with(token(ADMIN))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/v1/projects/"+id+"/interest-signals").with(token(OTHER))).andExpect(status().isForbidden());
    }

    @Test void pendingRequestSurvivesClosingAvailabilityUntilExplicitClosure() throws Exception {
        UUID id=project();join(id,LEADER);transfer(id,LEADER);
        mvc.perform(patch("/api/v1/projects/"+id+"/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"ATIVO\",\"expectedVersion\":"+version(id)+",\"reason\":\"Início\"}" )).andExpect(status().isOk());
        mvc.perform(patch("/api/v1/projects/"+id+"/availability").with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"acceptingMembers\":true,\"expectedVersion\":"+version(id)+"}")).andExpect(status().isOk());
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isCreated());
        UUID request=jdbc.queryForObject("select id from nite_connect.project_membership_requests where project_id=?",UUID.class,id);
        mvc.perform(patch("/api/v1/projects/"+id+"/availability").with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"acceptingMembers\":false,\"expectedVersion\":"+version(id)+"}")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/projects/"+id+"/membership-requests").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests/"+request+"/decision").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"approve\":false,\"expectedVersion\":0}" )).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests/"+request+"/close").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedVersion\":0}" )).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("ENCERRADA"));
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests/"+request+"/decision").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"approve\":false,\"expectedVersion\":0}" )).andExpect(status().isConflict());
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and member_id=? and ended_at is null",Integer.class,id,OTHER)).isZero();
    }
}
