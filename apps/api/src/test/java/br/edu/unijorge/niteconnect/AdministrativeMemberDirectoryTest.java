package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AdministrativeMemberDirectoryTest extends ProjectTestSupport {
    @Test void directorySearchFiltersPaginationAndPrivateDetail() throws Exception {
        jdbc.update("update nite_connect.members set name='Ana Souza',course='Computação',practice_area='Pesquisa',birth_date='2001-02-03' where id=?", MEMBER);
        jdbc.update("update nite_connect.members set status='AFASTADO' where id=?", OTHER);
        mvc.perform(get("/api/v1/administrative/members").with(token(ADMIN)).param("q", "ana")
                .param("size", "1")).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].name").value("Ana Souza"))
                .andExpect(jsonPath("$.items[0].birthDate").doesNotExist());
        mvc.perform(get("/api/v1/administrative/members").with(token(ADMIN)).param("q", MEMBER + "@unijorge"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/v1/administrative/members").with(token(ADMIN)).param("status", "AFASTADO"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/v1/administrative/members").with(token(ADMIN)).param("size", "2").param("page", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(2));
        mvc.perform(get("/api/v1/administrative/members/" + MEMBER).with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.birthDate").value("2001-02-03"))
                .andExpect(jsonPath("$.course").value("Computação"));
        mvc.perform(get("/api/v1/members/" + MEMBER).with(token(MEMBER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.birthDate").doesNotExist());
        mvc.perform(get("/api/v1/members/" + MEMBER + "/profile").with(token(ADMIN)))
                .andExpect(jsonPath("$.birthDate").doesNotExist());
    }

    @Test void lastAccessDistinguishesNoVisitFromObservedVisit() throws Exception {
        mvc.perform(get("/api/v1/administrative/members/" + MEMBER).with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.lastAccessAt").value(org.hamcrest.Matchers.nullValue()));
        mvc.perform(post("/api/v1/me/access").with(token(MEMBER))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/administrative/members").with(token(ADMIN)).param("q", MEMBER.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].lastAccessAt").isNotEmpty());
    }

    @Test void institutionalHistoryUsesActorNamesAndTechnicalMarker() throws Exception {
        jdbc.update("update nite_connect.members set name='Administradora Completa' where id=?", ADMIN);
        jdbc.update("insert into nite_connect.member_status_history(id,member_id,actor_id,previous_status,new_status,reason) values (?,?,?,null,'ATIVO','Ingresso')",
                UUID.randomUUID(), MEMBER, ADMIN);
        jdbc.update("insert into nite_connect.audit_events(id,actor_id,member_id,action,after_value,reason) values (?,?,?,'ROLE_GRANTED','GESTOR_PROJETO',null)",
                UUID.randomUUID(), ADMIN, MEMBER);
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_PROJETO',?,null)", MEMBER, ADMIN);
        jdbc.update("insert into nite_connect.audit_events(id,actor_id,member_id,action,after_value,reason) values (?,?,?,'ROLE_GRANTED','GESTOR_PROJETO','Regularização técnica B08.6-0')",
                UUID.randomUUID(), ADMIN, MEMBER);
        mvc.perform(get("/api/v1/administrative/members/" + MEMBER + "/history").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(3));
        mvc.perform(get("/api/v1/administrative/members/" + MEMBER + "/history").with(token(ADMIN))
                .param("page", "1").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.items.length()").value(1));
        String body = mvc.perform(get("/api/v1/administrative/members/" + MEMBER + "/history").with(token(ADMIN)))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).contains("Administradora Completa", "Regularização técnica", "GESTOR_PROJETO");
        assertThat(body).doesNotContain("MEMBER_UPDATED");
    }

    @Test void onlyGlobalAdministratorsCanReadOrChangeStatusAndEmailIsImmutable() throws Exception {
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_GERAL',?,'Fixture')", OTHER, ADMIN);
        mvc.perform(get("/api/v1/administrative/members").with(token(OTHER)))
                .andExpect(status().isOk());
        for (UUID actor : java.util.List.of(LEADER, MEMBER)) {
            mvc.perform(get("/api/v1/administrative/members").with(token(actor))).andExpect(status().isForbidden());
            mvc.perform(get("/api/v1/administrative/members/" + MEMBER).with(token(actor))).andExpect(status().isForbidden());
            mvc.perform(get("/api/v1/administrative/members/" + MEMBER + "/history").with(token(actor))).andExpect(status().isForbidden());
            mvc.perform(patch("/api/v1/members/" + MEMBER + "/status").with(token(actor)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"status\":\"AFASTADO\",\"expectedVersion\":0,\"reason\":\"Teste\"}"))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(patch("/api/v1/members/" + MEMBER).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Novo nome\",\"institutionalEmail\":\"outro@unijorge.com.br\",\"expectedVersion\":0,\"reason\":\"Teste\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/v1/members/" + MEMBER + "/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"AFASTADO\",\"expectedVersion\":0,\"reason\":\"Licença\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/administrative/members/" + MEMBER).with(token(ADMIN)))
                .andExpect(jsonPath("$.status").value("AFASTADO"));
        mvc.perform(get("/api/v1/administrative/members/" + MEMBER + "/history").with(token(ADMIN)))
                .andExpect(jsonPath("$.items[0].reason").value("Licença"));
    }
}
