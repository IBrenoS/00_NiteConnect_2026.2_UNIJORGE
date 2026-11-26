package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProjectAdministrationIntegrationTest extends ProjectTestSupport {
    @Test void currentLeadershipSummaryUsesOnlyActiveProjects() throws Exception {
        UUID id = project();
        join(id, LEADER);
        transfer(id, LEADER);
        mvc.perform(get("/api/v1/me/projects/leadership").with(token(LEADER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].projectId").value(id.toString()));
    }

    @Test void optionalLegacyUpdateReasonIsStillRecordedWhenProvided() throws Exception {
        UUID id = project();
        mvc.perform(patch("/api/v1/projects/" + id).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Projeto atualizado\",\"description\":\"Descrição\",\"expectedVersion\":0,\"reason\":\"Ajuste institucional\"}"))
                .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where entity_id=? and action='PROJECT_UPDATED' and reason='Ajuste institucional'", Integer.class, id)).isEqualTo(1);
    }

    @Test void statusAndMembershipCanBeChangedWithoutManualReasons() throws Exception {
        UUID id = project();
        mvc.perform(patch("/api/v1/projects/" + id + "/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"ATIVO\",\"expectedVersion\":0}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ATIVO"));
        mvc.perform(post("/api/v1/projects/" + id + "/members").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\"" + MEMBER + "\",\"responsibility\":\"Pesquisa\",\"expectedVersion\":1}"))
                .andExpect(status().isCreated());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_status_history where project_id=? and reason is null", Integer.class, id)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and start_reason is null", Integer.class, id)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where entity_id=? and action in ('PROJECT_STATUS_CHANGED','PROJECT_MEMBER_JOINED') and reason is null", Integer.class, id)).isEqualTo(2);
    }

    @Test void createsDirectlyInEachPermittedInitialStateWithoutManualReason() throws Exception {
        for (String initial : java.util.List.of("PLANEJAMENTO", "ATIVO", "PAUSADO")) {
            mvc.perform(post("/api/v1/projects").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"title\":\"Projeto "+initial+"\",\"description\":\"Descrição\",\"startsOn\":null,\"endsOn\":null,\"initialStatus\":\""+initial+"\"}"))
                    .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value(initial));
        }
        mvc.perform(post("/api/v1/projects").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Inválido\",\"description\":\"Descrição\",\"initialStatus\":\"CONCLUIDO\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/projects").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Período inválido\",\"description\":\"Descrição\",\"startsOn\":\"2026-12-01\",\"endsOn\":\"2026-11-30\"}"))
                .andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.projects",Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_status_history where reason='Criação institucional de projeto'",Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history",Integer.class)).isZero();
    }
    @Test void bothActiveGlobalRolesCreateWithoutImplicitMembershipOrLeadership() throws Exception {
        for (String role : java.util.List.of("COORDENADOR", "GESTOR_GERAL")) {
            jdbc.update("update nite_connect.role_assignments set role=? where member_id=?", role, ADMIN);
            UUID id = project();
            mvc.perform(get("/api/v1/me").with(token(ADMIN))).andExpect(jsonPath("$.roles").value(org.hamcrest.Matchers.hasItem(role)));
            mvc.perform(get("/api/v1/projects/" + id + "/workspace").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PLANEJAMENTO"))
                .andExpect(jsonPath("$.acceptingMembers").value(false)).andExpect(jsonPath("$.leaderId").isEmpty())
                .andExpect(jsonPath("$.memberCount").value(0));
            mvc.perform(get("/api/v1/me/projects").with(token(ADMIN))).andExpect(jsonPath("$.total").value(0));
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=?", Integer.class,id)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where project_id=?", Integer.class,id)).isZero();
            mvc.perform(patch("/api/v1/projects/" + id).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                    .content(updateBody(version(id)))).andExpect(status().isOk());
            mvc.perform(patch("/api/v1/projects/" + id + "/availability").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"acceptingMembers\":true,\"expectedVersion\":" + version(id) + "}"))
                    .andExpect(status().isOk());
            mvc.perform(patch("/api/v1/projects/" + id + "/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"status\":\"ATIVO\",\"expectedVersion\":" + version(id) + ",\"reason\":\"Início de homologação\"}"))
                    .andExpect(status().isOk());
            mvc.perform(patch("/api/v1/projects/" + id + "/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"status\":\"PAUSADO\",\"expectedVersion\":" + version(id) + ",\"reason\":\"Homologação\"}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAUSADO"));
            mvc.perform(get("/api/v1/me/projects").with(token(ADMIN))).andExpect(jsonPath("$.total").value(0));
            mvc.perform(get("/api/v1/project-catalog/" + id).with(token(MEMBER))).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAUSADO"));
        }
    }
    @Test void editingTransitionsAvailabilityAndAuditPersistWithOptimisticVersions() throws Exception {
        UUID id = project();
        mvc.perform(patch("/api/v1/projects/"+id).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"title":"Projeto editado","description":"Descrição persistida","startsOn":"2026-11-18","endsOn":"2026-12-18","expectedVersion":0}
                """)).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        mvc.perform(get("/api/v1/projects/"+id).with(token(ADMIN))).andExpect(jsonPath("$.title").value("Projeto editado"))
            .andExpect(jsonPath("$.startsOn").value("2026-11-18"));
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where entity_id=? and action='PROJECT_UPDATED' and reason is null",Integer.class,id)).isEqualTo(1);
        mvc.perform(patch("/api/v1/projects/"+id).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON).content(updateBody(0))).andExpect(status().isConflict());
        for (String state : java.util.List.of("ATIVO","PAUSADO","CONCLUIDO","ATIVO")) {
            mvc.perform(patch("/api/v1/projects/"+id+"/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\""+state+"\",\"expectedVersion\":"+version(id)+",\"reason\":\"Decisão registrada\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value(state));
        }
        mvc.perform(patch("/api/v1/projects/"+id+"/availability").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"acceptingMembers\":true,\"expectedVersion\":"+version(id)+"}")).andExpect(status().isOk());
        join(id, LEADER); transfer(id, LEADER);
        mvc.perform(patch("/api/v1/projects/"+id+"/availability").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"acceptingMembers\":true,\"expectedVersion\":"+version(id)+"}")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/projects/"+id+"/workspace").with(token(ADMIN))).andExpect(jsonPath("$.acceptingMembers").value(true));
        mvc.perform(get("/api/v1/projects/"+id+"/history").with(token(ADMIN))).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_status_history where project_id=?",Integer.class,id)).isEqualTo(5);
        mvc.perform(get("/api/v1/me/projects").with(token(ADMIN))).andExpect(jsonPath("$.total").value(0));
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where project_id=?",Integer.class,id)).isEqualTo(1);
    }
    @Test void contextualProjectManagerCannotEditInstitutionalFields() throws Exception {
        UUID id=project(); join(id,LEADER); transfer(id,LEADER); long before=version(id);
        mvc.perform(patch("/api/v1/projects/"+id).with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version(id)))).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select version from nite_connect.projects where id=?",Long.class,id)).isEqualTo(before);
    }
    @Test void editAndDeleteAreRestrictedToTheTwoGlobalAdministratorRoles() throws Exception {
        UUID id=project();
        for(UUID actor:java.util.List.of(MEMBER,LEADER)) {
            mvc.perform(patch("/api/v1/projects/"+id).with(token(actor)).contentType(MediaType.APPLICATION_JSON).content(updateBody(version(id))))
                    .andExpect(status().isForbidden());
            mvc.perform(delete("/api/v1/projects/"+id).with(token(actor)))
                    .andExpect(status().isForbidden());
        }
        for(String role:java.util.List.of("COORDENADOR","GESTOR_GERAL")) {
            jdbc.update("update nite_connect.role_assignments set role=? where member_id=?",role,ADMIN);
            mvc.perform(patch("/api/v1/projects/"+id).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON).content(updateBody(version(id))))
                    .andExpect(status().isOk());
        }
        mvc.perform(delete("/api/v1/projects/"+id).with(token(ADMIN))).andExpect(status().isOk());
    }
    @Test void deletionIsLogicalAtomicAuthorizedAndHidesProjectFromActiveLists() throws Exception {
        UUID id=project(); join(id,LEADER); transfer(id,LEADER);
        mvc.perform(post("/api/v1/activities").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Atividade histórica\",\"description\":\"Preservada\",\"projectId\":\""+id+"\",\"primaryExecutorId\":\""+LEADER+"\",\"reason\":\"Fixture\"}"))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/v1/me/activities").with(token(LEADER))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/v1/me/activity-items").with(token(LEADER))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(delete("/api/v1/projects/"+id).with(token(ADMIN))).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select deleted_by from nite_connect.projects where id=?",UUID.class,id)).isEqualTo(ADMIN);
        assertThat(jdbc.queryForObject("select deleted_at from nite_connect.projects where id=?",java.time.OffsetDateTime.class,id)).isNotNull();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=?",Integer.class,id)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where project_id=?",Integer.class,id)).isEqualTo(1);
        mvc.perform(get("/api/v1/projects").with(token(ADMIN))).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/project-catalog").with(token(MEMBER))).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/me/activities").with(token(LEADER))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/me/activity-items").with(token(LEADER))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/projects/"+id).with(token(ADMIN))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/projects/"+id).with(token(ADMIN))).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where entity_id=? and action='PROJECT_DELETED' and reason is null",Integer.class,id)).isEqualTo(1);
        mvc.perform(post("/api/v1/projects/"+id+"/members").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\""+MEMBER+"\",\"responsibility\":\"Teste\",\"expectedVersion\":"+version(id)+",\"reason\":\"Novo vínculo\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/activity-plannings").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Planejamento bloqueado\",\"description\":\"Teste\",\"projectId\":\""+id+"\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/activities").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Atividade bloqueada\",\"description\":\"Teste\",\"projectId\":\""+id+"\",\"primaryExecutorId\":\""+ADMIN+"\",\"reason\":\"Teste\"}"))
                .andExpect(status().isNotFound());
    }
    @Test void concurrentAndRepeatedDeletionNeverReplaysOrPartiallyDeletes() throws Exception {
        UUID id=project();
        try(var executor=java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            var start=new java.util.concurrent.CountDownLatch(1);
            var first=executor.submit(()->{start.await();return mvc.perform(delete("/api/v1/projects/"+id).with(token(ADMIN))).andReturn().getResponse().getStatus();});
            var second=executor.submit(()->{start.await();return mvc.perform(delete("/api/v1/projects/"+id).with(token(ADMIN))).andReturn().getResponse().getStatus();});
            start.countDown();
            var statuses=java.util.List.of(first.get(),second.get());
            assertThat(statuses).containsExactlyInAnyOrder(200,404);
        }
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where entity_id=? and action='PROJECT_DELETED'",Integer.class,id)).isEqualTo(1);
    }
    @Test void ordinaryMemberAndInactiveAdministratorCannotCreateOrAdminister() throws Exception {
        UUID id = project(); join(id,MEMBER);
        mvc.perform(post("/api/v1/projects").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"Negado\",\"description\":\"Negado\",\"reason\":\"Negado\"}")).andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/projects/"+id).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON).content(updateBody(version(id)))).andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/projects/"+id+"/status").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"status\":\"ATIVO\",\"expectedVersion\":"+version(id)+",\"reason\":\"Negado\"}")).andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/projects/"+id+"/availability").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"acceptingMembers\":true,\"expectedVersion\":"+version(id)+"}")).andExpect(status().isForbidden());
        jdbc.update("update nite_connect.members set status='AFASTADO' where id=?",ADMIN);
        mvc.perform(post("/api/v1/projects").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"Negado\",\"description\":\"Negado\",\"reason\":\"Negado\"}")).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.projects",Integer.class)).isEqualTo(1);
    }
}
