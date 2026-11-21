package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ActivityManagementTest extends ActivityTestSupport {
    @Test
    void consolidatesLinksAndEvidenceWithoutDuplicatingActivity() throws Exception {
        UUID activity = activity(MEMBER, null, MEMBER);
        mvc.perform(post("/api/v1/activities/" + activity + "/collaborators").with(token(MEMBER))
                        .contentType(APPLICATION_JSON)
                        .content(command(activity, ",\"memberId\":\"" + OTHER + "\"")))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/v1/activities/" + activity + "/evidence").with(token(OTHER))
                        .contentType(APPLICATION_JSON)
                        .content(command(activity, ",\"type\":\"TEXT\",\"content\":\"Registro\"")))
                .andExpect(status().isCreated());

        mvc.perform(get("/api/v1/management/activities").with(token(ADMIN))
                        .param("memberId", MEMBER.toString()).param("page", "0").param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].activityId").value(activity.toString()))
                .andExpect(jsonPath("$.items[0].createdById").value(MEMBER.toString()))
                .andExpect(jsonPath("$.items[0].primaryExecutorId").value(MEMBER.toString()))
                .andExpect(jsonPath("$.items[0].linkKinds", org.hamcrest.Matchers.containsInAnyOrder("CREATED", "EXECUTOR")))
                .andExpect(jsonPath("$.items[0].activeEvidenceCount").value(1))
                .andExpect(jsonPath("$.summary.total").value(1))
                .andExpect(jsonPath("$.summary.withEvidence").value(1));
    }

    @Test
    void filtersStatusPriorityAndPaginationKeepSummaryBasedOnFilteredCanonicalIds() throws Exception {
        UUID first = activity(MEMBER, null, MEMBER);
        UUID second = activity(MEMBER, null, MEMBER);
        jdbc.update("update nite_connect.activities set priority='ALTA', status='CONCLUIDA', completed_at=clock_timestamp() where id=?", first);
        jdbc.update("update nite_connect.activities set priority='BAIXA' where id=?", second);

        mvc.perform(get("/api/v1/management/activities").with(token(ADMIN))
                        .param("status", "CONCLUIDA").param("priority", "ALTA").param("page", "0").param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.summary.total").value(1))
                .andExpect(jsonPath("$.summary.completed").value(1))
                .andExpect(jsonPath("$.summary.completionRate").value(100.0))
                .andExpect(jsonPath("$.items[0].linkKinds", org.hamcrest.Matchers.containsInAnyOrder("CREATED", "EXECUTOR")));
    }
    @Test
    void requiresGlobalAuthorityOutsideProjectAndAllowsLeaderInOwnProject() throws Exception {
        UUID project = activeProject();
        UUID activity = activity(LEADER, project, MEMBER);

        mvc.perform(get("/api/v1/management/activities").with(token(MEMBER)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/projects/" + project + "/management/activities").with(token(LEADER))
                        .param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].activityId").value(activity.toString()));
    }
    @Test
    void projectPlanningUsesCanonicalIdsAndKeepsPausedOverdueSeparateFromAttention() throws Exception {
        UUID project = activeProject();
        mvc.perform(post("/api/v1/activity-plannings").with(token(LEADER)).contentType(APPLICATION_JSON)
                        .content("{\"title\":\"Plano\",\"projectId\":\"" + project + "\"}"))
                .andExpect(status().isCreated());
        UUID plan = jdbc.queryForObject("select id from nite_connect.activity_plannings where project_id=?", UUID.class, project);
        String tasks = "/api/v1/activity-plannings/" + plan + "/tasks";
        mvc.perform(post(tasks).with(token(LEADER)).contentType(APPLICATION_JSON)
                        .content("{\"title\":\"Tarefa\",\"expectedVersion\":0,\"primaryExecutorId\":\"" + MEMBER
                                + "\",\"startOn\":\"2020-01-01\",\"dueOn\":\"2020-01-05\"}"))
                .andExpect(status().isCreated());
        UUID task = jdbc.queryForObject("select id from nite_connect.activities where planning_id=?", UUID.class, plan);
        activity(LEADER, project, MEMBER);
        mvc.perform(patch("/api/v1/projects/" + project + "/status").with(token(ADMIN)).contentType(APPLICATION_JSON)
                        .content("{\"status\":\"PAUSADO\",\"expectedVersion\":" + version(project) + ",\"reason\":\"Pausa\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/projects/" + project + "/management/activities").with(token(LEADER))
                        .param("planningId", plan.toString()).param("executorId", MEMBER.toString())
                        .param("startFrom", "2020-01-01").param("startTo", "2020-01-01")
                        .param("dueFrom", "2020-01-05").param("dueTo", "2020-01-05").param("overdue", "true"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].activityId").value(task.toString()))
                .andExpect(jsonPath("$.items[0].projectStatus").value("PAUSADO"))
                .andExpect(jsonPath("$.summary.pending").value(1))
                .andExpect(jsonPath("$.summary.overdue").value(1))
                .andExpect(jsonPath("$.summary.attentionRequired").value(0));
        mvc.perform(get("/api/v1/me/activities").with(token(MEMBER)).param("planningId", plan.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(task.toString()))
                .andExpect(jsonPath("$.items[0].attentionRequired").value(false));
        mvc.perform(get("/api/v1/me/projects").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(project.toString()));
        mvc.perform(get("/api/v1/me/projects").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void pagesBeyondResultsStillReturnFullSummaryAndDeletedTasksDisappear() throws Exception {
        UUID older = activity(MEMBER, null, MEMBER);
        UUID newer = activity(MEMBER, null, MEMBER);
        state(older, MEMBER, "CANCELADA");
        for (int page = 0; page <= 2; page++) {
            var result = mvc.perform(get("/api/v1/management/activities").with(token(ADMIN))
                            .param("size", "1").param("page", Integer.toString(page)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2))
                    .andExpect(jsonPath("$.summary.cancelled").value(1))
                    .andExpect(jsonPath("$.summary.completionDenominator").value(1));
            if (page < 2) result.andExpect(jsonPath("$.items[0].activityId").value((page == 0 ? newer : older).toString()));
            else result.andExpect(jsonPath("$.items.length()").value(0));
        }
        mvc.perform(delete("/api/v1/activities/" + newer).with(token(MEMBER)).contentType(APPLICATION_JSON)
                        .content("{\"expectedVersion\":0,\"confirmed\":true}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/management/activities").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.summary.completionDenominator").value(0))
                .andExpect(jsonPath("$.summary.completionRate").value(0.0));
    }

    @Test
    void managerReadsWithoutMembershipAndProjectLeaderCannotEscapeScope() throws Exception {
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_GERAL',?,'Fixture')", OTHER, ADMIN);
        UUID project = project();
        join(project, MEMBER);
        UUID task = activity(ADMIN, project, MEMBER);
        String global = "/api/v1/management/activities";
        String scoped = "/api/v1/projects/" + project + "/management/activities";
        mvc.perform(get(global)).andExpect(status().isUnauthorized());
        mvc.perform(get(global).with(token(OTHER)).param("projectId", project.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].activityId").value(task.toString()));
        mvc.perform(get(scoped).with(token(MEMBER))).andExpect(status().isForbidden());
        activeProject();
        mvc.perform(get(scoped).with(token(LEADER))).andExpect(status().isNotFound());
        mvc.perform(get(global).with(token(LEADER)).param("projectId", project.toString())).andExpect(status().isForbidden());
        jdbc.update("update nite_connect.members set status='AFASTADO' where id=?", OTHER);
        mvc.perform(get(global).with(token(OTHER))).andExpect(status().isForbidden());
    }
}
