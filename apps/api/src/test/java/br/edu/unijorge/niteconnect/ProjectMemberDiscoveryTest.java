package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ProjectMemberDiscoveryTest extends ProjectTestSupport {
    @Test void teamIncludesNamesAndNoLongerExposesHistoricalPeriods() throws Exception {
        UUID project = project();
        jdbc.update("update nite_connect.members set name='Ana Souza' where id=?", MEMBER);
        join(project, MEMBER);

        mvc.perform(get("/api/v1/projects/" + project + "/members").with(token(MEMBER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].memberId").value(MEMBER.toString()))
                .andExpect(jsonPath("$.items[0].memberName").value("Ana Souza"))
                .andExpect(jsonPath("$.items[0].id").isNotEmpty())
                .andExpect(jsonPath("$.items[0].responsibility").value("Desenvolvimento"))
                .andExpect(jsonPath("$.items[0].startedAt").isNotEmpty())
                .andExpect(jsonPath("$.items[0].institutionalEmail").doesNotExist());

        mvc.perform(delete("/api/v1/projects/" + project + "/members/" + MEMBER).with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedVersion\":" + version(project) + ",\"reason\":\"Saída\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/projects/" + project + "/members/history").with(token(ADMIN)))
                .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=?", Integer.class, project)).isEqualTo(1);
        mvc.perform(get("/api/v1/projects/" + project + "/member-candidates")
                        .with(token(ADMIN)).param("query", "Ana"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(MEMBER.toString()));
    }

    @Test void candidatesIncludeOnlyActiveNonParticipantsAndCanBeSelected() throws Exception {
        UUID project = project();
        UUID eligible = candidate("Ana Elegível", "ATIVO");
        UUID linked = candidate("Ana Vinculada", "ATIVO");
        candidate("Ana Afastada", "AFASTADO");
        candidate("Ana Pendente", "PENDENTE_INGRESSO");
        candidate("Ana Desligada", "DESLIGADO");
        join(project, linked);

        mvc.perform(get("/api/v1/projects/" + project + "/member-candidates")
                        .with(token(ADMIN)).param("query", "ana").param("page", "0").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(eligible.toString()))
                .andExpect(jsonPath("$.items[0].name").value("Ana Elegível"))
                .andExpect(jsonPath("$.items[0].institutionalEmail").doesNotExist());
        mvc.perform(get("/api/v1/projects/" + project + "/member-candidates")
                        .with(token(ADMIN)).param("query", "ana").param("page", "1").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.total").value(1));

        join(project, eligible);
        mvc.perform(get("/api/v1/projects/" + project + "/member-candidates")
                        .with(token(ADMIN)).param("query", "ana"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and member_id=? and ended_at is null",
                Integer.class, project, eligible)).isEqualTo(1);
    }

    @Test void candidateSearchDoesNotBypassCurrentStatusAtInsertion() throws Exception {
        UUID project = project();
        UUID candidate = candidate("Ana Selecionada", "ATIVO");
        mvc.perform(get("/api/v1/projects/" + project + "/member-candidates")
                        .with(token(ADMIN)).param("query", "Ana"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(candidate.toString()));

        jdbc.update("update nite_connect.members set status='AFASTADO' where id=?", candidate);
        mvc.perform(post("/api/v1/projects/" + project + "/members").with(token(ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"memberId\":\"" + candidate + "\",\"responsibility\":\"Desenvolvimento\",\"expectedVersion\":"
                                + version(project) + ",\"reason\":\"Equipe\"}"))
                .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=?",
                Integer.class, project)).isZero();
    }

    @Test void onlyOwnManagerOrAdministratorCanSearchAndQueryIsBounded() throws Exception {
        UUID own = project(); UUID other = project();
        join(own, LEADER); join(own, MEMBER); transfer(own, LEADER);
        candidate("Ana Disponível", "ATIVO");

        mvc.perform(get("/api/v1/projects/" + own + "/member-candidates")
                        .with(token(LEADER)).param("query", "Ana"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/v1/projects/" + other + "/member-candidates")
                        .with(token(LEADER)).param("query", "Ana"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/projects/" + own + "/member-candidates")
                        .with(token(MEMBER)).param("query", "Ana"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/projects/" + own + "/member-candidates")
                        .with(token(ADMIN)).param("query", "A"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/projects/" + own + "/member-candidates")
                        .with(token(ADMIN)).param("query", "Ana").param("size", "101"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/projects/" + own + "/member-candidates")
                        .with(token(ADMIN)).param("query", "%%"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/projects/" + own + "/member-candidates").param("query", "Ana"))
                .andExpect(status().isUnauthorized());
        jdbc.update("update nite_connect.members set status='AFASTADO' where id=?", LEADER);
        mvc.perform(get("/api/v1/projects/" + own + "/member-candidates")
                        .with(token(LEADER)).param("query", "Ana"))
                .andExpect(status().isForbidden());
    }

    private UUID candidate(String name, String status) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,?,?,?)",
                id, name, id + "@unijorge.com.br", status);
        return id;
    }
}
