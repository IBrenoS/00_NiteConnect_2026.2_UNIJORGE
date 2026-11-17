package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ActivityAuthorizationTest extends ActivityTestSupport {
    @Test void personalCreatorCanDistributeWorkAndDelegatedCreatorLosesGeneralManagement() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        mvc.perform(post("/api/v1/activities/"+id+"/collaborators").with(token(MEMBER)).contentType("application/json")
                .content(command(id,",\"memberId\":\""+OTHER+"\""))).andExpect(status().isCreated());
        mvc.perform(put("/api/v1/activities/"+id+"/executor").with(token(ADMIN)).contentType("application/json")
                .content(command(id,",\"memberId\":\""+OTHER+"\",\"confirmed\":true"))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/activities/"+id).with(token(MEMBER))).andExpect(status().isOk());
        mvc.perform(patch("/api/v1/activities/"+id).with(token(MEMBER)).contentType("application/json")
                .content(command(id,",\"title\":\"Novo\",\"description\":\"Novo\""))).andExpect(status().isForbidden());
        state(id,OTHER,"EM_EXECUCAO");state(id,OTHER,"CONCLUIDA");
        mvc.perform(patch("/api/v1/activities/"+id+"/status").with(token(OTHER)).contentType("application/json")
                .content(command(id,",\"status\":\"EM_EXECUCAO\",\"confirmed\":true"))).andExpect(status().isForbidden());
    }
    @Test void cancellationAndReopeningRequireExplicitConfirmation() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        mvc.perform(patch("/api/v1/activities/"+id+"/status").with(token(MEMBER)).contentType("application/json")
                .content(command(id,",\"status\":\"CANCELADA\""))).andExpect(status().isBadRequest());
        assertThat(av(id)).isZero();state(id,MEMBER,"CANCELADA");state(id,MEMBER,"EM_EXECUCAO");
        assertThat(av(id)).isEqualTo(2);
    }
    @Test void candidatesUseExistingTeamInsteadOfRecruitmentAndNeverExposeContacts() throws Exception {
        UUID p=activeProject(),id=activity(LEADER,p,MEMBER);
        mvc.perform(get("/api/v1/projects/"+p+"/activity-assignee-candidates").param("query","Teste").with(token(LEADER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(3)).andExpect(jsonPath("$.items[0].institutionalEmail").doesNotExist());
        mvc.perform(get("/api/v1/activities/"+id+"/assignee-candidates").param("query","Teste").with(token(LEADER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2));
        mvc.perform(get("/api/v1/projects/"+p+"/activity-assignee-candidates").param("query","Teste").with(token(MEMBER)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/activities/independent-assignee-candidates").param("query","Teste").with(token(MEMBER)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/activities/independent-assignee-candidates").param("query","Teste").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(4));
        mvc.perform(get("/api/v1/projects/"+p+"/activity-assignee-candidates").param("query","%%").with(token(LEADER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
    }
    @Test void ordinaryParticipantCannotReadManagementHistoryOrMutateScope() throws Exception {
        UUID p=activeProject(),id=activity(LEADER,p,MEMBER);
        mvc.perform(get("/api/v1/activities/"+id+"/history").with(token(MEMBER))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/activities/"+id+"/assignees/history").with(token(MEMBER))).andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/activities/"+id).with(token(MEMBER)).contentType("application/json")
                .content(command(id,",\"title\":\"Novo\",\"description\":\"Novo\""))).andExpect(status().isForbidden());
    }
    @Test void duplicateOrInactiveAssigneeNeverCreatesAnotherPeriod() throws Exception {
        UUID p=activeProject(),id=activity(LEADER,p,MEMBER);
        mvc.perform(post("/api/v1/activities/"+id+"/collaborators").with(token(LEADER)).contentType("application/json")
                .content(command(id,",\"memberId\":\""+MEMBER+"\""))).andExpect(status().isConflict());
        jdbc.update("update nite_connect.members set status='AFASTADO' where id=?",OTHER);
        mvc.perform(post("/api/v1/activities/"+id+"/collaborators").with(token(LEADER)).contentType("application/json")
                .content(command(id,",\"memberId\":\""+OTHER+"\""))).andExpect(status().isForbidden());
        assertThat(av(id)).isZero();
    }
    @Test void independentActivityNotVisibleThroughForgedFiltersOrOwnListOfAdministrator() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        mvc.perform(get("/api/v1/activities").param("executorId",MEMBER.toString()).with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/me/activities").with(token(ADMIN))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/activities").with(token(ADMIN))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/v1/activities").param("size","101").with(token(MEMBER))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/activities/"+id)).andExpect(status().isUnauthorized());
    }
    @Test void correctionMustReferenceEvidenceFromSameActivity() throws Exception {
        UUID first=activity(MEMBER,null,MEMBER),second=activity(MEMBER,null,MEMBER);
        mvc.perform(post("/api/v1/activities/"+first+"/evidence").with(token(MEMBER)).contentType("application/json")
                .content(command(first,",\"type\":\"TEXT\",\"content\":\"Original\""))).andExpect(status().isCreated());
        UUID evidence=jdbc.queryForObject("select id from nite_connect.activity_evidence where activity_id=?",UUID.class,first);
        mvc.perform(post("/api/v1/activities/"+second+"/evidence").with(token(MEMBER)).contentType("application/json")
                .content(command(second,",\"type\":\"TEXT\",\"content\":\"Correção\",\"correctsEvidenceId\":\""+evidence+"\"")))
                .andExpect(status().isNotFound());
        assertThatThrownBy(()->jdbc.update("update nite_connect.activity_evidence set content='Reescrita' where id=?",evidence)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(av(second)).isZero();
    }
    @Test void inactiveMemberIsDeniedBeforeResourceExistenceIsDisclosed() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        jdbc.update("update nite_connect.members set status='AFASTADO' where id=?",MEMBER);
        for(UUID target:java.util.List.of(id,UUID.randomUUID())) {
            for(String suffix:java.util.List.of("","/assignees","/history","/evidence")) {
                mvc.perform(get("/api/v1/activities/"+target+suffix).with(token(MEMBER))).andExpect(status().isForbidden());
            }
        }
    }
    @Test void missingOrInactiveExecutorIsRejectedBeforeActivityIsCreated() throws Exception {
        jdbc.update("update nite_connect.members set status='DESLIGADO' where id=?",OTHER);
        for(UUID executor:java.util.List.of(UUID.randomUUID(),OTHER)) {
            mvc.perform(post("/api/v1/activities").with(token(ADMIN)).contentType("application/json")
                    .content("{\"title\":\"Nova\",\"description\":\"Teste\",\"primaryExecutorId\":\""+executor+"\",\"reason\":\"Planejar\"}"))
                    .andExpect(executor.equals(OTHER)?status().isForbidden():status().isNotFound());
        }
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activities",Integer.class)).isZero();
    }
    @Test void disabledStorageIsReportedOnlyAfterContextAuthorization() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        var file=new org.springframework.mock.web.MockMultipartFile("file","test.txt","text/plain","Teste".getBytes());
        var metadata=new org.springframework.mock.web.MockMultipartFile("metadata","","application/json",command(id,"").getBytes());
        mvc.perform(multipart("/api/v1/activities/"+id+"/evidence/uploads").file(file).file(metadata).with(token(MEMBER))).andExpect(status().isServiceUnavailable());
        mvc.perform(multipart("/api/v1/activities/"+id+"/evidence/uploads").file(file).file(metadata).with(token(OTHER))).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.evidence_objects",Integer.class)).isZero();
    }
}
