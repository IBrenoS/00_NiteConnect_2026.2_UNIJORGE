package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import java.util.UUID;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ActivityCapabilitiesTest extends ActivityTestSupport {
    @Test void independentOwnerAndOutsiderHaveCorrectCapabilities() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        mvc.perform(get("/api/v1/me/activities/capabilities").with(token(MEMBER))).andExpect(status().isOk()).andExpect(jsonPath("$.createIndependent").value(true));
        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(MEMBER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.edit").value(true)).andExpect(jsonPath("$.history").value(true))
                .andExpect(jsonPath("$.manageAssignees").value(true)).andExpect(jsonPath("$.collaborate").value(true)).andExpect(jsonPath("$.addEvidence").value(true))
                .andExpect(jsonPath("$.upload").value(false)).andExpect(jsonPath("$.transitions[0]").value("EM_EXECUCAO"));
        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(OTHER))).andExpect(status().isNotFound());
        state(id,MEMBER,"CANCELADA");
        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(MEMBER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.edit").value(false)).andExpect(jsonPath("$.addEvidence").value(false))
                .andExpect(jsonPath("$.transitions[0]").value("EM_EXECUCAO"));
    }
    @Test void collaboratorAndLeaderHaveDifferentRights() throws Exception {
        UUID p=activeProject(), id=activity(LEADER,p,MEMBER);
        mvc.perform(post("/api/v1/activities/"+id+"/collaborators").with(token(LEADER)).contentType("application/json")
                .content(command(id,",\"memberId\":\""+OTHER+"\""))).andExpect(status().isCreated());
        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(OTHER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.edit").value(false)).andExpect(jsonPath("$.history").value(false))
                .andExpect(jsonPath("$.addEvidence").value(true)).andExpect(jsonPath("$.transitions.length()").value(0));
        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(LEADER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.edit").value(true)).andExpect(jsonPath("$.history").value(true))
                .andExpect(jsonPath("$.manageAssignees").value(true)).andExpect(jsonPath("$.changePriority").value(true))
                .andExpect(jsonPath("$.collaborate").value(true)).andExpect(jsonPath("$.canDelete").value(true));
    }
    @Test void delegationHistoryRemovesPersonalOwnerAndAdministratorKeepsManagement() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        mvc.perform(put("/api/v1/activities/"+id+"/executor").with(token(ADMIN)).contentType("application/json")
                .content(command(id,",\"memberId\":\""+OTHER+"\",\"confirmed\":true"))).andExpect(status().isOk());
        mvc.perform(put("/api/v1/activities/"+id+"/executor").with(token(ADMIN)).contentType("application/json")
                .content(command(id,",\"memberId\":\""+MEMBER+"\",\"confirmed\":true"))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(MEMBER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.edit").value(false)).andExpect(jsonPath("$.history").value(false))
                .andExpect(jsonPath("$.transitions.length()").value(2))
                .andExpect(jsonPath("$.transitions[0]").value("EM_EXECUCAO"))
                .andExpect(jsonPath("$.transitions[1]").value("CONCLUIDA"));
        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(ADMIN))).andExpect(status().isOk())
                .andExpect(jsonPath("$.edit").value(true)).andExpect(jsonPath("$.manageAssignees").value(true));
        state(id,MEMBER,"EM_EXECUCAO");state(id,MEMBER,"CONCLUIDA");
        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(MEMBER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.transitions.length()").value(0)).andExpect(jsonPath("$.addEvidence").value(false));
        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(ADMIN))).andExpect(status().isOk())
                .andExpect(jsonPath("$.transitions.length()").value(2))
                .andExpect(jsonPath("$.transitions[0]").value("PLANEJADA"))
                .andExpect(jsonPath("$.transitions[1]").value("EM_EXECUCAO"));
    }
    @Test void evidenceWithdrawalIsSpecificToAuthorAndCurrentContext() throws Exception {
        UUID p=activeProject(), id=activity(LEADER,p,MEMBER);
        mvc.perform(post("/api/v1/activities/"+id+"/evidence").with(token(MEMBER)).contentType("application/json")
                .content(command(id,",\"type\":\"TEXT\",\"content\":\"Teste\""))).andExpect(status().isCreated());
        UUID evidence=jdbc.queryForObject("select id from nite_connect.activity_evidence where activity_id=?",UUID.class,id);
        String path="/api/v1/activities/"+id+"/evidence/"+evidence+"/capabilities";
        mvc.perform(get(path).with(token(MEMBER))).andExpect(status().isOk()).andExpect(jsonPath("$.withdraw").value(true));
        mvc.perform(get(path).with(token(OTHER))).andExpect(status().isOk()).andExpect(jsonPath("$.withdraw").value(false));
        mvc.perform(get(path).with(token(LEADER))).andExpect(status().isOk()).andExpect(jsonPath("$.withdraw").value(true));
        mvc.perform(post("/api/v1/activities/"+id+"/evidence/"+evidence+"/withdraw").with(token(MEMBER)).contentType("application/json")
                .content(command(id,",\"confirmed\":true"))).andExpect(status().isOk());
        mvc.perform(get(path).with(token(LEADER))).andExpect(status().isOk()).andExpect(jsonPath("$.withdraw").value(false));
    }
    @Test void inactiveActorCannotInspectCapabilitiesAndPausedProjectBlocksExecution() throws Exception {
        UUID p=activeProject(), id=activity(LEADER,p,MEMBER);
        mvc.perform(post("/api/v1/activities/"+id+"/collaborators").with(token(LEADER)).contentType("application/json")
                .content(command(id,",\"memberId\":\""+OTHER+"\""))).andExpect(status().isCreated());
        mvc.perform(patch("/api/v1/projects/"+p+"/status").with(token(ADMIN)).contentType("application/json")
                .content("{\"status\":\"PAUSADO\",\"expectedVersion\":"+version(p)+",\"reason\":\"Pausa\"}")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(MEMBER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.addEvidence").value(false)).andExpect(jsonPath("$.upload").value(false))
                .andExpect(jsonPath("$.transitions.length()").value(0))
                .andExpect(jsonPath("$.executionBlockedByProjectPause").value(true))
                .andExpect(jsonPath("$.canResumeProject").value(false));
        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(LEADER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.edit").value(true)).andExpect(jsonPath("$.changePriority").value(true))
                .andExpect(jsonPath("$.executionBlockedByProjectPause").value(true))
                .andExpect(jsonPath("$.canResumeProject").value(false));
        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(ADMIN))).andExpect(status().isOk())
                .andExpect(jsonPath("$.canResumeProject").value(true));
        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(OTHER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.executionBlockedByProjectPause").value(false));
        mvc.perform(patch("/api/v1/activities/"+id+"/status").with(token(OTHER)).contentType("application/json")
                .content("{\"status\":\"EM_EXECUCAO\",\"expectedVersion\":"+av(id)+"}"))
                .andExpect(status().isForbidden());
        long staleVersion=av(id);
        mvc.perform(patch("/api/v1/activities/"+id).with(token(LEADER)).contentType("application/json")
                .content("{\"priority\":\"ALTA\",\"expectedVersion\":"+av(id)+"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.priority").value("ALTA"));
        mvc.perform(patch("/api/v1/activities/"+id+"/status").with(token(LEADER)).contentType("application/json")
                .content("{\"status\":\"EM_EXECUCAO\",\"expectedVersion\":"+staleVersion+"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").doesNotExist());
        mvc.perform(patch("/api/v1/activities/"+id+"/status").with(token(LEADER)).contentType("application/json")
                .content("{\"status\":\"EM_EXECUCAO\",\"expectedVersion\":"+av(id)+"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROJECT_PAUSED"));
        mvc.perform(patch("/api/v1/activities/"+id+"/status").with(token(MEMBER)).contentType("application/json")
                .content("{\"status\":\"EM_EXECUCAO\",\"expectedVersion\":"+av(id)+"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROJECT_PAUSED"));
        mvc.perform(patch("/api/v1/projects/"+p+"/status").with(token(ADMIN)).contentType("application/json")
                .content("{\"status\":\"ATIVO\",\"expectedVersion\":"+version(p)+",\"reason\":\"Retomada\"}"))
                .andExpect(status().isOk());
        state(id,LEADER,"EM_EXECUCAO");
        mvc.perform(get("/api/v1/activities/"+id).with(token(MEMBER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("EM_EXECUCAO"))
                .andExpect(jsonPath("$.priority").value("ALTA"));
        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(MEMBER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.executionBlockedByProjectPause").value(false));
        jdbc.update("update nite_connect.members set status='AFASTADO' where id=?",MEMBER);
        mvc.perform(get("/api/v1/me/activities/capabilities").with(token(MEMBER))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(MEMBER))).andExpect(status().isForbidden());
    }
}
