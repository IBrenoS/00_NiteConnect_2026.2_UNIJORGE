package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ActivitiesBoundaryTest extends ActivityTestSupport {
    @Test void memberCreatesIndependentActivityForAnotherActivePerson() throws Exception {
        UUID id = activity(MEMBER, null, MEMBER);
        mvc.perform(get("/api/v1/activities/" + id).with(token(MEMBER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.projectId").isEmpty()).andExpect(jsonPath("$.primaryExecutorName").value("Teste"));
        mvc.perform(post("/api/v1/activities").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Teste\",\"description\":\"Teste\",\"primaryExecutorId\":\"" + OTHER + "\",\"reason\":\"Teste\"}"))
                .andExpect(status().isCreated());
        UUID assigned = jdbc.queryForObject("select id from nite_connect.activities where title='Teste'", UUID.class);
        mvc.perform(get("/api/v1/activities/" + assigned).with(token(OTHER))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/activities").with(token(OTHER))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
    }
    @Test void leaderCreatesOnlyForCurrentTeamAndCannotReadAnotherProjectActivity() throws Exception {
        UUID p = activeProject(); UUID id = activity(LEADER, p, MEMBER);
        mvc.perform(get("/api/v1/activities/" + id).with(token(LEADER))).andExpect(status().isOk());
        UUID outsider = UUID.randomUUID();
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Fora','outside@unijorge.com.br','ATIVO')", outsider);
        mvc.perform(post("/api/v1/activities").with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Teste\",\"description\":\"Teste\",\"projectId\":\"" + p + "\",\"primaryExecutorId\":\"" + outsider + "\",\"reason\":\"Teste\"}"))
                .andExpect(status().isConflict());
        UUID other = activity(ADMIN, null, ADMIN);
        mvc.perform(get("/api/v1/activities/" + other).with(token(LEADER))).andExpect(status().isNotFound());
    }
    @Test void lifecycleAllowsDirectCompletionAndPreservesCompletionWhenReopened() throws Exception {
        UUID id = activity(MEMBER, null, MEMBER);
        mvc.perform(patch("/api/v1/activities/" + id + "/status").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content(command(id, ",\"status\":\"CONCLUIDA\""))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/activities/" + id).with(token(MEMBER))).andExpect(jsonPath("$.completedAt").isNotEmpty());
        state(id, MEMBER, "PLANEJADA");
        mvc.perform(get("/api/v1/activities/" + id).with(token(MEMBER))).andExpect(jsonPath("$.completedAt").isEmpty());
        state(id, MEMBER, "EM_EXECUCAO"); state(id, MEMBER, "CONCLUIDA"); state(id, MEMBER, "EM_EXECUCAO");
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_events where activity_id=? and action='STATUS_CHANGED'", Integer.class, id)).isEqualTo(5);
    }
    @Test void collaboratorCannotCompleteAndExecutorTransferPreservesPeriods() throws Exception {
        UUID p = activeProject(); UUID id = activity(LEADER, p, MEMBER);
        mvc.perform(post("/api/v1/activities/" + id + "/collaborators").with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content(command(id, ",\"memberId\":\"" + OTHER + "\""))).andExpect(status().isCreated());
        mvc.perform(patch("/api/v1/activities/" + id + "/status").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON)
                .content(command(id, ",\"status\":\"EM_EXECUCAO\""))).andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/activities/" + id + "/executor").with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content(command(id, ",\"memberId\":\"" + OTHER + "\",\"confirmed\":true"))).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_assignments where activity_id=? and ended_at is not null", Integer.class, id)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select member_id from nite_connect.activity_assignments where activity_id=? and role='EXECUTOR' and ended_at is null", UUID.class, id)).isEqualTo(OTHER);
    }
    @Test void oldVersionAndProjectMoveAreRejectedWithoutPartialWrites() throws Exception {
        UUID id = activity(MEMBER, null, MEMBER); state(id, MEMBER, "EM_EXECUCAO");
        mvc.perform(patch("/api/v1/activities/" + id).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Novo\",\"description\":\"Novo\",\"expectedVersion\":0,\"reason\":\"Teste\"}"))
                .andExpect(status().isConflict());
        mvc.perform(patch("/api/v1/activities/" + id).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content(command(id, ",\"title\":\"Novo\",\"description\":\"Novo\",\"projectId\":\"" + UUID.randomUUID() + "\"")))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/v1/activities/" + id).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content(command(id, ",\"title\":\"Novo\",\"description\":\"Novo\",\"projectId\":null")))
                .andExpect(status().isBadRequest());
        assertThat(av(id)).isEqualTo(1);
    }
    @Test void evidenceCorrectionIsAppendOnlyAndWithdrawalHidesContentFromPeers() throws Exception {
        UUID p = activeProject(); UUID id = activity(LEADER, p, MEMBER);
        mvc.perform(post("/api/v1/activities/" + id + "/evidence").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content(command(id, ",\"type\":\"TEXT\",\"content\":\"Contribuição original\""))).andExpect(status().isCreated());
        UUID e = jdbc.queryForObject("select id from nite_connect.activity_evidence where activity_id=?", UUID.class, id);
        mvc.perform(post("/api/v1/activities/" + id + "/evidence").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content(command(id, ",\"type\":\"TECHNICAL\",\"content\":\"Correção\",\"correctsEvidenceId\":\"" + e + "\""))).andExpect(status().isCreated());
        mvc.perform(post("/api/v1/activities/" + id + "/evidence/" + e + "/withdraw").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content(command(id, ",\"confirmed\":true"))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/activities/" + id + "/evidence/" + e).with(token(OTHER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isEmpty()).andExpect(jsonPath("$.withdrawnAt").isNotEmpty());
        assertThat(jdbc.queryForObject("select content from nite_connect.activity_evidence where id=?", String.class, e)).isEqualTo("Contribuição original");
    }
    @Test void rejectsUnsafeLinkAndCrossActivityCorrection() throws Exception {
        UUID id = activity(MEMBER, null, MEMBER);
        for (String url : java.util.List.of("javascript:alert(1)", "https://user:pass@example.org", "relative")) {
            mvc.perform(post("/api/v1/activities/" + id + "/evidence").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                    .content(command(id, ",\"type\":\"LINK\",\"url\":\"" + url + "\""))).andExpect(status().isBadRequest());
        }
        assertThat(av(id)).isZero();
    }
    @Test void pausedProjectBlocksExecutionAndCompletedProjectBlocksManagement() throws Exception {
        UUID p = activeProject(); UUID id = activity(LEADER, p, MEMBER);
        for (String next : java.util.List.of("PAUSADO", "CONCLUIDO")) {
            mvc.perform(patch("/api/v1/projects/" + p + "/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"status\":\"" + next + "\",\"expectedVersion\":" + version(p) + ",\"reason\":\"Teste\"}"))
                    .andExpect(status().isOk());
            mvc.perform(patch("/api/v1/activities/" + id + "/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                    .content(command(id, ",\"status\":\"EM_EXECUCAO\""))).andExpect(status().isConflict());
        }
        assertThat(av(id)).isZero();
    }
    @Test void snapshotsDistinguishFieldsContainingDelimitersQuotesAndNewlines() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        var json=tools.jackson.databind.json.JsonMapper.builder().build();
        for(var fields:java.util.List.of(java.util.Map.of("title","A;description=B","description","C"),
                java.util.Map.of("title","A","description","B;description=C"))) {
            var body=new java.util.HashMap<String,Object>(fields);body.put("expectedVersion",av(id));body.put("reason","Ajustar");
            mvc.perform(patch("/api/v1/activities/"+id).with(token(MEMBER)).contentType("application/json").content(json.writeValueAsString(body))).andExpect(status().isOk());
        }
        var event=jdbc.queryForMap("select before_value,after_value from nite_connect.activity_events where activity_id=? and activity_version=2",id);
        assertThat(event.get("before_value")).isNotEqualTo(event.get("after_value"));
        String special="Aspas \" e quebra\n;description=outro";
        mvc.perform(patch("/api/v1/activities/"+id).with(token(MEMBER)).contentType("application/json")
                .content(json.writeValueAsString(java.util.Map.of("title",special,"description","Preservada","expectedVersion",av(id),"reason","Ajustar")))).andExpect(status().isOk());
        String snapshot=jdbc.queryForObject("select after_value from nite_connect.activity_events where activity_id=? and activity_version=3",String.class,id);
        assertThat(json.readTree(snapshot).get("title").asString()).isEqualTo(special);
    }
}
