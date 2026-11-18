package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import java.util.UUID;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ActivityPersonalIsolationTest extends ActivityTestSupport {
    private UUID planning(UUID actor, UUID project) throws Exception {
        mvc.perform(post("/api/v1/activity-plannings").with(token(actor)).contentType("application/json")
                .content("{\"title\":\"Planejamento\",\"projectId\":" + (project == null ? "null" : "\"" + project + "\"") + "}"))
                .andExpect(status().isCreated());
        return jdbc.queryForObject("select id from nite_connect.activity_plannings order by created_at desc limit 1", UUID.class);
    }

    @Test void administratorsHavePersonalPlanningListAndSeparateAdministrativeQuery() throws Exception {
        planning(ADMIN, null); planning(MEMBER, null);
        mvc.perform(get("/api/v1/activity-plannings").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].createdBy").value(ADMIN.toString()));
        mvc.perform(get("/api/v1/admin/activity-plannings").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2));
        mvc.perform(get("/api/v1/admin/activity-plannings").with(token(MEMBER))).andExpect(status().isForbidden());
    }

    @Test void projectFilterDoesNotExpandPersonalPerspectiveAndProjectQueryKeepsAcl() throws Exception {
        UUID project=activeProject(); planning(LEADER,project);
        mvc.perform(get("/api/v1/activity-plannings").param("projectId",project.toString()).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/projects/"+project+"/activity-plannings").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        UUID outsider=UUID.randomUUID();
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Fora',?,'ATIVO')",outsider,outsider+"@unijorge.com.br");
        jdbc.update("insert into nite_connect.identity_accounts(tenant_id,object_id,member_id) values (?,?,?)",TENANT,outsider,outsider);
        mvc.perform(get("/api/v1/projects/"+project+"/activity-plannings").with(token(outsider))).andExpect(status().isNotFound());
    }

    @Test void personalTasksAndStatsRemainDeduplicatedForAdministrators() throws Exception {
        activity(ADMIN,null,ADMIN); activity(MEMBER,null,MEMBER); activity(MEMBER,null,ADMIN);
        mvc.perform(get("/api/v1/me/activities").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2));
        mvc.perform(get("/api/v1/me/activities/stats").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2));
    }

    @Test void assignedPlanningAppearsOnceAndRevokedProjectMembershipRemovesPersonalEntries() throws Exception {
        UUID project=activeProject(); UUID plan=planning(LEADER,project);
        mvc.perform(post("/api/v1/activity-plannings/"+plan+"/tasks").with(token(LEADER)).contentType("application/json")
                .content("{\"title\":\"Atribuida\",\"primaryExecutorId\":\""+MEMBER+"\",\"expectedVersion\":0}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/v1/activity-plannings/"+plan+"/tasks").with(token(LEADER)).contentType("application/json")
                .content("{\"title\":\"Outra\",\"primaryExecutorId\":\""+MEMBER+"\",\"expectedVersion\":1}"))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/v1/activity-plannings").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(delete("/api/v1/projects/"+project+"/members/"+MEMBER).with(token(ADMIN)).contentType("application/json")
                .content("{\"expectedVersion\":"+version(project)+",\"reason\":\"Saida\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/activity-plannings").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/me/activities/stats").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
    }

    @Test void memberStatisticsReachServiceAuthorizationAndRespectManagementScope() throws Exception {
        UUID project=activeProject(); activity(LEADER,project,MEMBER);
        mvc.perform(get("/api/v1/members/"+MEMBER+"/activity-stats").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/v1/members/"+MEMBER+"/activity-stats").with(token(LEADER))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/members/"+MEMBER+"/activity-stats").param("projectId",project.toString()).with(token(LEADER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/v1/members/"+MEMBER+"/activity-stats").param("projectId",project.toString()).with(token(OTHER)))
                .andExpect(status().isForbidden());
    }
}
