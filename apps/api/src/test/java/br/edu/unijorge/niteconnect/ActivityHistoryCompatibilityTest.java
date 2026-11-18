package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ActivityHistoryCompatibilityTest extends ActivityTestSupport {
    @Test void historyPreservesNullReasonsVersionsAndPaginationWithoutRewritingEvents() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        mvc.perform(patch("/api/v1/activities/"+id).with(token(MEMBER)).contentType("application/json")
                .content("{\"title\":\"Sem motivo opcional\",\"expectedVersion\":0}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/activities/"+id+"/history").with(token(MEMBER)).param("size","1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items[0].activityId").value(id.toString()))
                .andExpect(jsonPath("$.items[0].activityVersion").value(1))
                .andExpect(jsonPath("$.items[0].reason").doesNotExist());
        mvc.perform(get("/api/v1/activities/"+id+"/history").with(token(MEMBER)).param("page","1").param("size","1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].activityVersion").value(0));
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_events where activity_id=? and reason is null",Integer.class,id)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_events where activity_id=?",Integer.class,id)).isEqualTo(2);
    }

    @Test void historyRetainsPersonalAndProjectAuthorizationForEveryRole() throws Exception {
        UUID independent=activity(MEMBER,null,MEMBER);
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_GERAL',?,'Fixture')",OTHER,ADMIN);
        for(UUID allowed:java.util.List.of(MEMBER,ADMIN,OTHER))
            mvc.perform(get("/api/v1/activities/"+independent+"/history").with(token(allowed))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/activities/"+independent+"/history").with(token(LEADER))).andExpect(status().isNotFound());
        UUID project=activeProject();UUID task=activity(LEADER,project,MEMBER);
        mvc.perform(get("/api/v1/activities/"+task+"/history").with(token(LEADER))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/activities/"+task+"/history").with(token(MEMBER))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/activities/"+task+"/history")).andExpect(status().isUnauthorized());
    }
}
