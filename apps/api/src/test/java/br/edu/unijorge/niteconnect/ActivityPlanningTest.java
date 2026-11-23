package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.Set;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ActivityPlanningTest extends ActivityTestSupport {
    @Test void personalActivityItemsReturnsAnEmptyPageForAnActiveMemberWithoutActivities() throws Exception {
        mvc.perform(get("/api/v1/me/activity-items").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0)).andExpect(jsonPath("$.total").value(0));
    }

    private UUID planning(UUID actor, String projectJson) throws Exception {
        String body = "{\"title\":\"Plano\"" + (projectJson == null ? "" : ",\"projectId\":" + projectJson) + "}";
        mvc.perform(post("/api/v1/activity-plannings").with(token(actor)).contentType("application/json").content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.title").value("Plano"))
                .andExpect(jsonPath("$.description").value(""));
        return jdbc.queryForObject("select id from nite_connect.activity_plannings order by created_at desc limit 1", UUID.class);
    }

    @Test void activeMembersOfEveryRoleCanPersistAndReadIndependentPlanning() throws Exception {
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_GERAL',?,'Fixture')", OTHER, ADMIN);
        for (UUID actor : java.util.List.of(MEMBER, ADMIN, OTHER)) {
            UUID id = planning(actor, null);
            mvc.perform(get("/api/v1/activity-plannings").with(token(actor))).andExpect(status().isOk());
            mvc.perform(get("/api/v1/activity-plannings/" + id).with(token(actor)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id.toString()))
                    .andExpect(jsonPath("$.createdBy").value(actor.toString()));
            assertThat(jdbc.queryForObject("select created_by from nite_connect.activity_plannings where id=?", UUID.class, id)).isEqualTo(actor);
        }
    }

    @Test void inactiveAndUnmappedIdentitiesCannotCreateOrListPlanning() throws Exception {
        jdbc.update("update nite_connect.members set status='AFASTADO' where id=?", MEMBER);
        for (UUID actor : java.util.List.of(MEMBER, UUID.randomUUID())) {
            mvc.perform(get("/api/v1/activity-plannings").with(token(actor))).andExpect(status().isForbidden());
            mvc.perform(get("/api/v1/me/activity-items").with(token(actor))).andExpect(status().isForbidden());
            mvc.perform(post("/api/v1/activity-plannings").with(token(actor)).contentType("application/json")
                    .content("{\"title\":\"Bloqueado\"}")).andExpect(status().isForbidden());
        }
    }

    @Test void planningAcceptsOnlyTitleAndOwnsMultipleCanonicalTasksWithAggregates() throws Exception {
        UUID plan=planning(MEMBER,null);
        mvc.perform(post("/api/v1/activity-plannings/"+plan+"/tasks").with(token(MEMBER)).contentType("application/json")
                .content("{\"title\":\"Primeira\",\"expectedVersion\":0}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.activity.title").value("Primeira"))
                .andExpect(jsonPath("$.activity.planningId").value(plan.toString())).andExpect(jsonPath("$.planningVersion").value(1));
        mvc.perform(post("/api/v1/activity-plannings/"+plan+"/tasks").with(token(MEMBER)).contentType("application/json")
                .content("{\"title\":\"Segunda\",\"priority\":\"ALTA\",\"expectedVersion\":1}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.activity.priority").value("ALTA"));
        mvc.perform(get("/api/v1/activity-plannings/"+plan+"/tasks").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2));
        mvc.perform(get("/api/v1/activity-plannings/"+plan+"/stats").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.planned").value(2)).andExpect(jsonPath("$.completionDenominator").value(2))
                .andExpect(jsonPath("$.completionRate").value(0));
    }

    @Test void personalActivityItemsPagePlansAndUnplannedTasksWithoutDuplicatingVisibleTasks() throws Exception {
        UUID plan=planning(MEMBER,null);
        mvc.perform(post("/api/v1/activity-plannings/"+plan+"/tasks").with(token(MEMBER)).contentType("application/json")
                .content("{\"title\":\"Tarefa no plano\",\"expectedVersion\":0}"))
                .andExpect(status().isCreated());
        UUID unplanned=activity(MEMBER,null,MEMBER);

        mvc.perform(get("/api/v1/me/activity-items").with(token(MEMBER)).param("page","0").param("size","20"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[?(@.kind == 'PLANNING')].taskCount").value(org.hamcrest.Matchers.contains(1)))
                .andExpect(jsonPath("$.items[?(@.kind == 'TASK')].id").value(org.hamcrest.Matchers.contains(unplanned.toString())));
        mvc.perform(get("/api/v1/me/activity-items").with(token(MEMBER)).param("page","0").param("size","1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2)).andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(get("/api/v1/me/activity-items").with(token(MEMBER)).param("page","1").param("size","1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2)).andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(get("/api/v1/me/activity-items").with(token(MEMBER)).param("q","Tarefa no plano"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].kind").value("PLANNING"));
    }

    @Test void assignedTaskInUnreadablePlanningAppearsAsItsCanonicalTask() throws Exception {
        UUID plan=planning(MEMBER,null);
        mvc.perform(post("/api/v1/activity-plannings/"+plan+"/tasks").with(token(MEMBER)).contentType("application/json")
                .content("{\"title\":\"Atribuída diretamente\",\"primaryExecutorId\":\""+OTHER+"\",\"expectedVersion\":0}"))
                .andExpect(status().isCreated());
        UUID task=jdbc.queryForObject("select id from nite_connect.activities where planning_id=?",UUID.class,plan);
        mvc.perform(get("/api/v1/me/activity-items").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].kind").value("TASK"))
                .andExpect(jsonPath("$.items[0].id").value(task.toString()))
                .andExpect(jsonPath("$.items[0].planningId").value(plan.toString()));
    }

    @Test void personalActivityItemsApplyProjectScopeAndReturnTheRealProjectName() throws Exception {
        UUID project=activeProject();
        String title=jdbc.queryForObject("select title from nite_connect.projects where id=?",String.class,project);
        UUID plan=planning(LEADER,"\""+project+"\"");
        mvc.perform(post("/api/v1/activity-plannings/"+plan+"/tasks").with(token(LEADER)).contentType("application/json")
                .content("{\"title\":\"Tarefa do projeto\",\"primaryExecutorId\":\""+MEMBER+"\",\"expectedVersion\":0}"))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/v1/me/activity-items").with(token(LEADER)).param("projectId",project.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].projectTitle").value(title));
        mvc.perform(get("/api/v1/me/activity-items").with(token(MEMBER)).param("projectId",project.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].kind").value("PLANNING"))
                .andExpect(jsonPath("$.items[0].projectTitle").value(title));
        UUID inaccessibleProject=project();
        mvc.perform(get("/api/v1/me/activity-items").with(token(MEMBER)).param("projectId",inaccessibleProject.toString()))
                .andExpect(status().isNotFound());
    }

    @Test void taskStatusCanMoveRepeatedlyInEitherDirectionWithVersionChecks() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        for(String status:new String[]{"CONCLUIDA","EM_EXECUCAO","PLANEJADA","EM_EXECUCAO","CONCLUIDA"}) {
            mvc.perform(patch("/api/v1/activities/"+id+"/status").with(token(MEMBER)).contentType("application/json")
                    .content("{\"status\":\""+status+"\",\"expectedVersion\":"+av(id)+",\"confirmed\":true}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value(status));
        }
        assertThat(av(id)).isEqualTo(5);
        mvc.perform(get("/api/v1/activities/"+id).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CONCLUIDA"));
    }

    @Test void deletingPlanningDetachesTasksWithoutDeletingThirdPartyTaskData() throws Exception {
        UUID plan=planning(MEMBER,null);
        mvc.perform(post("/api/v1/activity-plannings/"+plan+"/tasks").with(token(MEMBER)).contentType("application/json")
                .content("{\"title\":\"Tarefa\",\"primaryExecutorId\":\""+OTHER+"\",\"expectedVersion\":0}"))
                .andExpect(status().isCreated());
        UUID task=jdbc.queryForObject("select id from nite_connect.activities order by created_at desc limit 1",UUID.class);
        mvc.perform(post("/api/v1/activities/"+task+"/evidence").with(token(OTHER)).contentType("application/json")
                .content("{\"type\":\"TEXT\",\"content\":\"Evidência preservada\",\"expectedVersion\":"+av(task)+",\"reason\":\"Registro\"}"))
                .andExpect(status().isCreated());
        UUID evidence=jdbc.queryForObject("select id from nite_connect.activity_evidence where activity_id=?",UUID.class,task);
        mvc.perform(delete("/api/v1/activity-plannings/"+plan).with(token(MEMBER)).contentType("application/json")
                .content("{\"expectedVersion\":1,\"confirmed\":true}"))
                .andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_plannings where id=?",Integer.class,plan)).isZero();
        assertThat(jdbc.queryForObject("select planning_id from nite_connect.activities where id=?",UUID.class,task)).isNull();
        assertThat(av(task)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_assignments where activity_id=?",Integer.class,task)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_evidence where id=? and activity_id=?",Integer.class,evidence,task)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_events where activity_id=? and action='PLANNING_DETACHED'",Integer.class,task)).isEqualTo(1);
        mvc.perform(get("/api/v1/me/activity-items").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].kind").value("TASK"))
                .andExpect(jsonPath("$.items[0].id").value(task.toString()));
    }

    @Test void projectPlanningCannotBeReadByNonParticipantAndNewTasksInheritProjectScope() throws Exception {
        UUID project=activeProject();
        UUID plan=planning(LEADER,"\""+project+"\"");
        UUID outsider=UUID.fromString("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Fora','fora@unijorge.com.br','ATIVO')",outsider);
        jdbc.update("insert into nite_connect.identity_accounts(tenant_id,object_id,member_id) values (?,?,?)",TENANT,outsider,outsider);
        mvc.perform(get("/api/v1/activity-plannings/"+plan).with(token(outsider))).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/activity-plannings/"+plan+"/tasks").with(token(LEADER)).contentType("application/json")
                .content("{\"title\":\"Tarefa sem projeto\",\"expectedVersion\":0}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.activity.projectId").value(project.toString()));
    }

    @Test void planningDeletionRejectsOtherCreatorsAndStaleVersions() throws Exception {
        UUID plan=planning(MEMBER,null);
        mvc.perform(delete("/api/v1/activity-plannings/"+plan).with(token(OTHER)).contentType("application/json")
                .content("{\"expectedVersion\":0,\"confirmed\":true}"))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/activity-plannings/"+plan).with(token(MEMBER)).contentType("application/json")
                .content("{\"expectedVersion\":1,\"confirmed\":true}"))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_plannings where id=?",Integer.class,plan)).isEqualTo(1);
    }

    @Test void onlyOneConcurrentTaskCreationCanConsumeTheSamePlanningVersion() throws Exception {
        UUID plan=planning(MEMBER,null);
        var pool=Executors.newFixedThreadPool(2);
        var start=new CountDownLatch(1);
        try {
            var first=pool.submit(()->createAtVersion(start,plan,"Concorrente A"));
            var second=pool.submit(()->createAtVersion(start,plan,"Concorrente B"));
            start.countDown();
            assertThat(Set.of(first.get(30,TimeUnit.SECONDS),second.get(30,TimeUnit.SECONDS))).containsExactlyInAnyOrder(201,409);
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.activities where planning_id=?",Integer.class,plan)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select version from nite_connect.activity_plannings where id=?",Long.class,plan)).isEqualTo(1);
        } finally { pool.shutdownNow(); }
    }

    private int createAtVersion(CountDownLatch start,UUID plan,String title) throws Exception {
        start.await();
        return mvc.perform(post("/api/v1/activity-plannings/"+plan+"/tasks").with(token(MEMBER)).contentType("application/json")
                .content("{\"title\":\""+title+"\",\"expectedVersion\":0}"))
                .andReturn().getResponse().getStatus();
    }

    @Test void databaseRejectsLinkingTaskToPlanningWithDifferentProjectScope() throws Exception {
        UUID project=activeProject();UUID plan=planning(LEADER,"\""+project+"\"");UUID independentTask=activity(MEMBER,null,MEMBER);
        assertThatThrownBy(()->jdbc.update("update nite_connect.activities set planning_id=? where id=?",plan,independentTask))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject("select planning_id from nite_connect.activities where id=?",UUID.class,independentTask)).isNull();
    }

    @Test void planningPropertiesPatchDistinguishesOmittedFromExplicitNullAndUsesVersion() throws Exception {
        UUID plan=planning(MEMBER,null);
        mvc.perform(patch("/api/v1/activity-plannings/"+plan).with(token(MEMBER)).contentType("application/json")
                .content("{\"expectedVersion\":0,\"title\":\"Plano atualizado\",\"description\":null}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Plano atualizado"))
                .andExpect(jsonPath("$.description").value("")).andExpect(jsonPath("$.version").value(1));
        mvc.perform(patch("/api/v1/activity-plannings/"+plan).with(token(MEMBER)).contentType("application/json")
                .content("{\"expectedVersion\":0,\"title\":\"Versão antiga\"}"))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select title from nite_connect.activity_plannings where id=?",String.class,plan)).isEqualTo("Plano atualizado");
    }
}
