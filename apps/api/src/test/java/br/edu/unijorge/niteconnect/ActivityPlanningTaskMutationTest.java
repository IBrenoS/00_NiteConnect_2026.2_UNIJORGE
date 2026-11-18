package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ActivityPlanningTaskMutationTest extends ActivityTestSupport {
    private UUID planning(UUID actor,UUID project) throws Exception {
        mvc.perform(post("/api/v1/activity-plannings").with(token(actor)).contentType("application/json")
                .content("{\"title\":\"Plano\",\"projectId\":"+(project==null?"null":"\""+project+"\"")+"}"))
                .andExpect(status().isCreated());
        return jdbc.queryForObject("select id from nite_connect.activity_plannings order by created_at desc limit 1",UUID.class);
    }
    private UUID task(UUID actor,UUID plan) throws Exception {
        mvc.perform(post("/api/v1/activity-plannings/"+plan+"/tasks").with(token(actor)).contentType("application/json")
                .content("{\"title\":\"Original\",\"expectedVersion\":0}"))
                .andExpect(status().isCreated());
        return jdbc.queryForObject("select id from nite_connect.activities where planning_id=?",UUID.class,plan);
    }
    private String path(UUID plan,UUID task) { return "/api/v1/activity-plannings/"+plan+"/tasks/"+task; }

    @Test void creationPersistsEverySelectedPropertyInOneTransaction() throws Exception {
        UUID plan=planning(LEADER,activeProject());
        mvc.perform(post("/api/v1/activity-plannings/"+plan+"/tasks").with(token(LEADER)).contentType("application/json")
                .content("""
                    {"title":"Completa","description":"Descrição","startOn":"2026-01-01","dueOn":"2026-02-01",
                     "priority":"ALTA","primaryExecutorId":"%s","collaboratorIds":["%s"],"status":"CONCLUIDA","expectedVersion":0}
                    """.formatted(MEMBER,OTHER)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.activity.status").value("CONCLUIDA"))
                .andExpect(jsonPath("$.activity.priority").value("ALTA")).andExpect(jsonPath("$.activity.primaryExecutorId").value(MEMBER.toString()));
        UUID task=jdbc.queryForObject("select id from nite_connect.activities where planning_id=?",UUID.class,plan);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_assignments where activity_id=? and role='COLLABORATOR' and ended_at is null",Integer.class,task)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select completed_at is not null from nite_connect.activities where id=?",Boolean.class,task)).isTrue();
    }

    @Test void failedCreationRollsBackTaskEventsAssignmentsAndPlanningVersion() throws Exception {
        UUID plan=planning(MEMBER,null);
        mvc.perform(post("/api/v1/activity-plannings/"+plan+"/tasks").with(token(MEMBER)).contentType("application/json")
                .content("{\"title\":\"Falha\",\"expectedVersion\":0,\"collaboratorIds\":[\""+OTHER+"\"],\"status\":\"CANCELADA\"}"))
                .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activities where planning_id=?",Integer.class,plan)).isZero();
        assertThat(jdbc.queryForObject("select version from nite_connect.activity_plannings where id=?",Long.class,plan)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_events",Integer.class)).isZero();
    }

    @Test void failedLastStepRollsBackPropertiesExecutorCollaboratorsAndAudit() throws Exception {
        UUID plan=planning(LEADER,activeProject());UUID task=task(LEADER,plan);long version=av(task);
        int events=jdbc.queryForObject("select count(*) from nite_connect.activity_events where activity_id=?",Integer.class,task);
        mvc.perform(patch(path(plan,task)).with(token(LEADER)).contentType("application/json")
                .content("{\"title\":\"Não persistir\",\"primaryExecutorId\":\""+MEMBER+"\",\"collaboratorIds\":[\""+OTHER+"\"],\"status\":\"CANCELADA\",\"expectedVersion\":"+version+"}"))
                .andExpect(status().isBadRequest());
        assertThat(av(task)).isEqualTo(version);
        assertThat(jdbc.queryForObject("select title from nite_connect.activities where id=?",String.class,task)).isEqualTo("Original");
        assertThat(jdbc.queryForObject("select member_id from nite_connect.activity_assignments where activity_id=? and ended_at is null",UUID.class,task)).isEqualTo(LEADER);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_events where activity_id=?",Integer.class,task)).isEqualTo(events);
    }

    @Test void updatePersistsPropertiesAssignmentsAndStatusThenRejectsStaleVersion() throws Exception {
        UUID plan=planning(LEADER,activeProject());UUID task=task(LEADER,plan);long oldVersion=av(task);
        mvc.perform(patch(path(plan,task)).with(token(LEADER)).contentType("application/json")
                .content("{\"title\":\"Atualizada\",\"description\":null,\"priority\":\"BAIXA\",\"primaryExecutorId\":\""+MEMBER+"\",\"collaboratorIds\":[\""+OTHER+"\"],\"status\":\"CONCLUIDA\",\"expectedVersion\":"+oldVersion+"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Atualizada"))
                .andExpect(jsonPath("$.status").value("CONCLUIDA")).andExpect(jsonPath("$.description").value(""));
        mvc.perform(patch(path(plan,task)).with(token(LEADER)).contentType("application/json")
                .content("{\"title\":\"Antiga\",\"expectedVersion\":"+oldVersion+"}"))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select title from nite_connect.activities where id=?",String.class,task)).isEqualTo("Atualizada");
    }

    @Test void repeatedTransitionsAndReopeningRespectConfirmationAndCancellationRules() throws Exception {
        UUID plan=planning(MEMBER,null);UUID task=task(MEMBER,plan);
        for(String next:new String[]{"CONCLUIDA","EM_EXECUCAO","PLANEJADA","CONCLUIDA","PLANEJADA","CANCELADA","EM_EXECUCAO"}) {
            mvc.perform(patch(path(plan,task)).with(token(MEMBER)).contentType("application/json")
                    .content("{\"title\":\"Original\",\"status\":\""+next+"\",\"confirmed\":true,\"expectedVersion\":"+av(task)+"}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value(next));
        }
        state(task,MEMBER,"CANCELADA");long version=av(task);
        mvc.perform(patch(path(plan,task)).with(token(MEMBER)).contentType("application/json")
                .content("{\"status\":\"PLANEJADA\",\"confirmed\":true,\"expectedVersion\":"+version+"}"))
                .andExpect(status().isConflict());
        mvc.perform(patch(path(plan,task)).with(token(MEMBER)).contentType("application/json")
                .content("{\"status\":\"EM_EXECUCAO\",\"expectedVersion\":"+version+"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch(path(plan,task)).with(token(MEMBER)).contentType("application/json")
                .content("{\"title\":\"Reaberta\",\"status\":\"EM_EXECUCAO\",\"confirmed\":true,\"expectedVersion\":"+version+"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Reaberta"));
    }

    @Test void endpointRejectsTaskFromAnotherPlanningAndPreservesTaskPermissions() throws Exception {
        UUID plan=planning(MEMBER,null);UUID task=task(MEMBER,plan);UUID other=planning(MEMBER,null);
        mvc.perform(patch(path(other,task)).with(token(MEMBER)).contentType("application/json")
                .content("{\"title\":\"Outra\",\"expectedVersion\":"+av(task)+"}"))
                .andExpect(status().isNotFound());
        mvc.perform(patch(path(plan,task)).with(token(OTHER)).contentType("application/json")
                .content("{\"title\":\"Outra\",\"expectedVersion\":"+av(task)+"}"))
                .andExpect(status().isNotFound());
    }

    @Test void executorPromotionAndCollaboratorReplacementPreserveAssignmentPeriods() throws Exception {
        UUID plan=planning(LEADER,activeProject());UUID task=task(LEADER,plan);
        mvc.perform(patch(path(plan,task)).with(token(LEADER)).contentType("application/json")
                .content("{\"collaboratorIds\":[\""+MEMBER+"\",\""+OTHER+"\"],\"expectedVersion\":"+av(task)+"}"))
                .andExpect(status().isOk());
        mvc.perform(patch(path(plan,task)).with(token(LEADER)).contentType("application/json")
                .content("{\"primaryExecutorId\":\""+MEMBER+"\",\"collaboratorIds\":[\""+LEADER+"\"],\"expectedVersion\":"+av(task)+"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.primaryExecutorId").value(MEMBER.toString()));
        assertThat(jdbc.queryForList("select member_id from nite_connect.activity_assignments where activity_id=? and role='COLLABORATOR' and ended_at is null",UUID.class,task)).containsExactly(LEADER);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_assignments where activity_id=? and ended_at is not null",Integer.class,task)).isEqualTo(3);
    }
}
