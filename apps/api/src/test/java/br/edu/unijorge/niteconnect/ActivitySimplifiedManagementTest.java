package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ActivitySimplifiedManagementTest extends ActivityTestSupport {
    @Test void createsActivityWithOnlyTitleAndDefaultsExecutorToCreator() throws Exception {
        mvc.perform(post("/api/v1/activities").with(token(MEMBER)).contentType("application/json")
                .content("{\"title\":\"Planejar experimento\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.title").value("Planejar experimento"))
                .andExpect(jsonPath("$.description").value("")).andExpect(jsonPath("$.status").value("PLANEJADA"))
                .andExpect(jsonPath("$.primaryExecutorId").value(MEMBER.toString()));
    }

    @Test void patchChangesOnlySpecifiedFieldsAndReturnsCurrentVersion() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        mvc.perform(patch("/api/v1/activities/"+id).with(token(MEMBER)).contentType("application/json")
                .content("{\"expectedVersion\":"+av(id)+",\"priority\":\"ALTA\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.priority").value("ALTA"))
                .andExpect(jsonPath("$.title").value("Atividade")).andExpect(jsonPath("$.version").value(1));
        mvc.perform(patch("/api/v1/activities/"+id).with(token(MEMBER)).contentType("application/json")
                .content("{\"expectedVersion\":"+av(id)+",\"priority\":null}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.priority").doesNotExist());
    }

    @Test void creatorCanAssignIndependentActivityToAnotherActiveMember() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        mvc.perform(put("/api/v1/activities/"+id+"/executor").with(token(MEMBER)).contentType("application/json")
                .content("{\"memberId\":\""+OTHER+"\",\"expectedVersion\":"+av(id)+"}"))
                .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_assignments where activity_id=? and ended_at is null",Integer.class,id)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select member_id from nite_connect.activity_assignments where activity_id=? and role='EXECUTOR' and ended_at is null",UUID.class,id)).isEqualTo(OTHER);
    }

    @Test void unrelatedMemberCannotReassignIndependentActivity() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        mvc.perform(put("/api/v1/activities/"+id+"/executor").with(token(OTHER)).contentType("application/json")
                .content("{\"memberId\":\""+OTHER+"\",\"expectedVersion\":"+av(id)+"}"))
                .andExpect(status().isNotFound());
    }

    @Test void personalQueryIncludesCreatedAndAssignedActivitiesWithoutDuplicates() throws Exception {
        UUID created=activity(MEMBER,null,OTHER);
        UUID assigned=activity(ADMIN,null,MEMBER);
        UUID both=activity(MEMBER,null,MEMBER);
        mvc.perform(get("/api/v1/me/activities").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(3));
    }

    @Test void ordinaryStatusTransitionDoesNotRequireReason() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        mvc.perform(patch("/api/v1/activities/"+id+"/status").with(token(MEMBER)).contentType("application/json")
                .content("{\"status\":\"EM_EXECUCAO\",\"expectedVersion\":"+av(id)+"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("EM_EXECUCAO"))
                .andExpect(jsonPath("$.version").value(1));
    }

    @Test void stalePatchDoesNotOverwriteCurrentValues() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        mvc.perform(patch("/api/v1/activities/"+id).with(token(MEMBER)).contentType("application/json")
                .content("{\"expectedVersion\":"+av(id)+",\"priority\":\"ALTA\"}"))
                .andExpect(status().isOk());
        mvc.perform(patch("/api/v1/activities/"+id).with(token(MEMBER)).contentType("application/json")
                .content("{\"expectedVersion\":0,\"title\":\"Sobrescrever\"}"))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select title from nite_connect.activities where id=?",String.class,id)).isEqualTo("Atividade");
    }

    @Test void personalFiltersAcceptPriorityAndServerSort() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        mvc.perform(patch("/api/v1/activities/"+id).with(token(MEMBER)).contentType("application/json")
                .content("{\"expectedVersion\":"+av(id)+",\"priority\":\"BAIXA\",\"startOn\":\"2026-11-01\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/me/activities").with(token(MEMBER)).param("priority","BAIXA")
                .param("startFrom","2026-11-01").param("sort","startOn").param("direction","asc"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].startOn").value("2026-11-01"));
    }
}
