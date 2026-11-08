package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(properties = {
        "nite.entra.enabled=true",
        "nite.entra.tenant-id=11111111-1111-4111-8111-111111111111",
        "nite.entra.audience=22222222-2222-4222-8222-222222222222",
        "nite.entra.required-scope=access_as_user",
        "nite.documents.enabled=false"
})
class IdentityBoundaryTest {
    @Container @ServiceConnection
    static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    static final UUID TENANT = UUID.fromString("11111111-1111-4111-8111-111111111111");
    static final UUID ADMIN = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    static final UUID ADMIN_OID = UUID.fromString("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    static final UUID MEMBER = UUID.fromString("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    static final UUID MEMBER_OID = UUID.fromString("dddddddd-dddd-4ddd-8ddd-dddddddddddd");

    @BeforeEach
    void fixtures() {
        // Deliberately test-only identities; no seed data in application migrations.
        Integer installed = jdbc.queryForObject("select count(*) from information_schema.tables where table_schema='nite_connect' and table_name='members'", Integer.class);
        if (installed == 0) return;
        jdbc.execute("truncate nite_connect.members cascade");
        seed(ADMIN, ADMIN_OID, "admin-test@unijorge.com.br", "ATIVO");
        seed(MEMBER, MEMBER_OID, "member-test@unijorge.com.br", "ATIVO");
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'COORDENADOR',?,'Fixture')", ADMIN, ADMIN);
    }

    void seed(UUID id, UUID oid, String email, String state) {
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Pessoa de teste',?,?)", id, email, state);
        jdbc.update("insert into nite_connect.identity_accounts(tenant_id,object_id,member_id) values (?,?,?)", TENANT, oid, id);
    }

    RequestPostProcessor token(UUID oid) {
        return jwt().jwt(j -> j.subject("test-subject").claim("tid", TENANT.toString()).claim("oid", oid.toString()));
    }

    @Test
    void administrativeCreationIsPersistentAndAudited() throws Exception {
        mvc.perform(post("/api/v1/members").with(token(ADMIN_OID)).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"name":"Novo integrante","institutionalEmail":"new-test@unijorge.com.br"}
                        """))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PENDENTE_INGRESSO"));
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where action='MEMBER_CREATED'", Integer.class)).isEqualTo(1);
    }

    @Test
    void activeMemberCanOnlyReadOwnPersonalData() throws Exception {
        mvc.perform(get("/api/v1/me").with(token(MEMBER_OID))).andExpect(status().isOk())
                .andExpect(jsonPath("$.member.id").value(MEMBER.toString()))
                .andExpect(jsonPath("$.roles[0]").value("INTEGRANTE"));
        mvc.perform(get("/api/v1/members/" + ADMIN).with(token(MEMBER_OID))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/members").with(token(MEMBER_OID))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/members/" + MEMBER + "/history").with(token(MEMBER_OID))).andExpect(status().isForbidden());
    }

    @Test
    void unknownInstitutionalIdentityCannotReadInternalData() throws Exception {
        mvc.perform(get("/api/v1/me").with(token(UUID.randomUUID()))).andExpect(status().isForbidden());
    }

    @Test
    void tokenRolesCannotElevatePrivileges() throws Exception {
        mvc.perform(post("/api/v1/members").with(jwt().jwt(j -> j.claim("tid", TENANT.toString())
                        .claim("oid", MEMBER_OID.toString()).claim("roles", java.util.List.of("COORDENADOR", "GESTOR_PROJETO"))))
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Teste\",\"institutionalEmail\":\"x@unijorge.com.br\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void duplicateInstitutionalEmailIsAConflict() throws Exception {
        mvc.perform(post("/api/v1/members").with(token(ADMIN_OID)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Duplicado\",\"institutionalEmail\":\"MEMBER-TEST@unijorge.com.br\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void invalidOrNonInstitutionalInputIsRejected() throws Exception {
        for (String email : java.util.List.of("outside@example.org", "fake@unijorge.com.br.evil", "bad")) {
            mvc.perform(post("/api/v1/members").with(token(ADMIN_OID)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"Teste\",\"institutionalEmail\":\"" + email + "\"}"))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/v1/members?size=100000").with(token(ADMIN_OID))).andExpect(status().isBadRequest());
    }

    @Test
    void removalImmediatelyDeniesExistingIdentityAndPreservesHistory() throws Exception {
        mvc.perform(patch("/api/v1/members/" + MEMBER + "/status").with(token(ADMIN_OID))
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"DESLIGADO\",\"expectedVersion\":0,\"reason\":\"Decisão administrativa de teste\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/me").with(token(MEMBER_OID))).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.identity_accounts where member_id=?", Integer.class, MEMBER)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.member_status_history where member_id=?", Integer.class, MEMBER)).isEqualTo(1);
        mvc.perform(patch("/api/v1/members/" + MEMBER + "/status").with(token(ADMIN_OID))
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"ATIVO\",\"expectedVersion\":1,\"reason\":\"Retorno autorizado\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/me").with(token(MEMBER_OID))).andExpect(status().isOk());
    }

    @Test
    void staleVersionCannotOverwriteAdministrativeChange() throws Exception {
        String data = "{\"name\":\"Nome atualizado\",\"institutionalEmail\":\"member-test@unijorge.com.br\",\"expectedVersion\":0,\"reason\":\"Correção cadastral\"}";
        mvc.perform(patch("/api/v1/members/" + MEMBER).with(token(ADMIN_OID)).contentType(MediaType.APPLICATION_JSON).content(data)).andExpect(status().isOk());
        mvc.perform(patch("/api/v1/members/" + MEMBER).with(token(ADMIN_OID)).contentType(MediaType.APPLICATION_JSON).content(data)).andExpect(status().isConflict());
    }

    @Test
    void lastActiveAdministratorCannotBeRemoved() throws Exception {
        mvc.perform(patch("/api/v1/members/" + ADMIN + "/status").with(token(ADMIN_OID))
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"DESLIGADO\",\"expectedVersion\":0,\"reason\":\"Teste\"}"))
                .andExpect(status().isConflict());
        mvc.perform(delete("/api/v1/members/" + ADMIN + "/roles/COORDENADOR").with(token(ADMIN_OID))
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":0,\"reason\":\"Teste\"}"))
                .andExpect(status().isConflict());
    }

    UUID pending() throws Exception {
        mvc.perform(post("/api/v1/members").with(token(ADMIN_OID)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Convidado de teste\",\"institutionalEmail\":\"invite-test@unijorge.com.br\"}"))
                .andExpect(status().isCreated());
        return jdbc.queryForObject("select id from nite_connect.members where institutional_email='invite-test@unijorge.com.br'", UUID.class);
    }

    UUID invite(UUID target, UUID oid) throws Exception {
        mvc.perform(post("/api/v1/invitations").with(token(ADMIN_OID)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\"" + target + "\",\"objectId\":\"" + oid + "\",\"expiresAt\":\"" + java.time.Instant.now().plusSeconds(3600) + "\",\"reason\":\"Ingresso autorizado\"}"))
                .andExpect(status().isCreated());
        return jdbc.queryForObject("select id from nite_connect.invitations where member_id=? and accepted_at is null and revoked_at is null", UUID.class, target);
    }

    @Test
    void onlyInvitedStableIdentityCanAcceptAndAcceptanceIsIdempotent() throws Exception {
        UUID target = pending(); UUID oid = UUID.randomUUID(); UUID invitation = invite(target, oid);
        mvc.perform(get("/api/v1/me").with(token(oid))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/invitations/" + invitation + "/accept").with(token(MEMBER_OID))).andExpect(status().isNotFound());
        for (int attempt = 0; attempt < 2; attempt++) {
            mvc.perform(post("/api/v1/invitations/" + invitation + "/accept").with(token(oid)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(target.toString()));
        }
        mvc.perform(get("/api/v1/me").with(token(oid))).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where action='INVITATION_ACCEPTED'", Integer.class)).isEqualTo(1);
    }

    @Test
    void revokedInvitationCannotBeUsed() throws Exception {
        UUID target = pending(); UUID oid = UUID.randomUUID(); UUID invitation = invite(target, oid);
        mvc.perform(delete("/api/v1/invitations/" + invitation).with(token(ADMIN_OID))
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Cancelado\"}")).andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/invitations/" + invitation + "/accept").with(token(oid))).andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select status from nite_connect.members where id=?", String.class, target)).isEqualTo("PENDENTE_INGRESSO");
    }

    @Test
    void identityAlreadyLinkedCannotBeInvitedForAnotherMember() throws Exception {
        UUID target = pending();
        mvc.perform(post("/api/v1/invitations").with(token(ADMIN_OID)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\"" + target + "\",\"objectId\":\"" + MEMBER_OID + "\",\"expiresAt\":\"" + java.time.Instant.now().plusSeconds(3600) + "\",\"reason\":\"Teste\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void permissionRevocationTakesEffectOnNextRequest() throws Exception {
        mvc.perform(post("/api/v1/members/" + MEMBER + "/roles").with(token(ADMIN_OID)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"GESTOR_GERAL\",\"expectedVersion\":0,\"reason\":\"Delegação de teste\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/members").with(token(MEMBER_OID))).andExpect(status().isOk());
        mvc.perform(delete("/api/v1/members/" + MEMBER + "/roles/GESTOR_GERAL").with(token(ADMIN_OID))
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":1,\"reason\":\"Revogado\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/members").with(token(MEMBER_OID))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/me").with(token(MEMBER_OID))).andExpect(status().isOk());
    }

    @Test
    void auditFailureRollsBackTheEntireAdministrativeOperation() throws Exception {
        jdbc.execute("create function nite_connect.fail_audit_test() returns trigger language plpgsql as $$ begin raise exception 'test fault'; end; $$");
        jdbc.execute("create trigger fail_audit_test before insert on nite_connect.audit_events for each row execute function nite_connect.fail_audit_test()");
        try {
            org.junit.jupiter.api.Assertions.assertThrows(Exception.class, () -> mvc.perform(patch("/api/v1/members/" + MEMBER + "/status").with(token(ADMIN_OID))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"DESLIGADO\",\"expectedVersion\":0,\"reason\":\"Teste de rollback\"}")));
            assertThat(jdbc.queryForObject("select status from nite_connect.members where id=?", String.class, MEMBER)).isEqualTo("ATIVO");
            assertThat(jdbc.queryForObject("select version from nite_connect.members where id=?", Long.class, MEMBER)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.member_status_history where member_id=?", Integer.class, MEMBER)).isZero();
        } finally {
            jdbc.execute("drop trigger fail_audit_test on nite_connect.audit_events");
            jdbc.execute("drop function nite_connect.fail_audit_test()");
        }
    }

    @ParameterizedTest
    @ValueSource(strings={"PENDENTE_INGRESSO", "AFASTADO", "DESLIGADO"})
    void inactiveMembershipCannotAccessOperationalEndpoints(String state) throws Exception {
        jdbc.update("update nite_connect.members set status=? where id=?", state, MEMBER);
        mvc.perform(get("/api/v1/me").with(token(MEMBER_OID))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/members/" + MEMBER).with(token(MEMBER_OID))).andExpect(status().isForbidden());
    }

    @Test
    void malformedBearerTokenIsUnauthorized() throws Exception {
        mvc.perform(get("/api/v1/me").header("Authorization", "Bearer malformed-test-token")).andExpect(status().isUnauthorized());
    }

    @Test
    void simultaneousUpdatesHaveOneWinnerAndOneConflict() throws Exception {
        java.util.concurrent.CountDownLatch start = new java.util.concurrent.CountDownLatch(1);
        try (java.util.concurrent.ExecutorService workers = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Integer> update = () -> {
                start.await();
                return mvc.perform(patch("/api/v1/members/" + MEMBER).with(token(ADMIN_OID)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Atualização concorrente\",\"institutionalEmail\":\"member-test@unijorge.com.br\",\"expectedVersion\":0,\"reason\":\"Teste concorrente\"}"))
                        .andReturn().getResponse().getStatus();
            };
            var first = workers.submit(update); var second = workers.submit(update); start.countDown();
            assertThat(java.util.List.of(first.get(15, java.util.concurrent.TimeUnit.SECONDS), second.get(15, java.util.concurrent.TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 409);
        }
        assertThat(jdbc.queryForObject("select version from nite_connect.members where id=?", Long.class, MEMBER)).isEqualTo(1);
    }

    @Test
    void concurrentAdministrativeDeactivationPreservesOneAuthorizedAdministrator() throws Exception {
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_GERAL',?,'Fixture')", MEMBER, ADMIN);
        java.util.concurrent.CountDownLatch start = new java.util.concurrent.CountDownLatch(1);
        try (java.util.concurrent.ExecutorService workers = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var first = workers.submit(() -> deactivateAfter(start, ADMIN_OID, MEMBER));
            var second = workers.submit(() -> deactivateAfter(start, MEMBER_OID, ADMIN)); start.countDown();
            assertThat(java.util.List.of(first.get(15, java.util.concurrent.TimeUnit.SECONDS), second.get(15, java.util.concurrent.TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 403);
        }
        assertThat(jdbc.queryForObject("select count(distinct m.id) from nite_connect.members m join nite_connect.role_assignments r on r.member_id=m.id where m.status='ATIVO'", Integer.class)).isEqualTo(1);
    }
    int deactivateAfter(java.util.concurrent.CountDownLatch start, UUID actor, UUID target) throws Exception {
        start.await();
        return mvc.perform(patch("/api/v1/members/" + target + "/status").with(token(actor)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"DESLIGADO\",\"expectedVersion\":0,\"reason\":\"Teste concorrente\"}"))
                .andReturn().getResponse().getStatus();
    }

    @Test
    void expiredInvitationRequiresExplicitRevocationBeforeReplacement() throws Exception {
        UUID target = pending(); UUID oid = UUID.randomUUID(); UUID invitation = invite(target, oid);
        jdbc.update("update nite_connect.invitations set created_at=current_timestamp - interval '2 days',expires_at=current_timestamp - interval '1 day' where id=?", invitation);
        mvc.perform(post("/api/v1/invitations/" + invitation + "/accept").with(token(oid))).andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.identity_accounts where member_id=?", Integer.class, target)).isZero();
        mvc.perform(post("/api/v1/invitations").with(token(ADMIN_OID)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\"" + target + "\",\"objectId\":\"" + oid + "\",\"expiresAt\":\"" + java.time.Instant.now().plusSeconds(3600) + "\",\"reason\":\"Substituição de convite expirado\"}"))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.invitations where member_id=?", Integer.class, target)).isEqualTo(1);

        mvc.perform(delete("/api/v1/invitations/" + invitation).with(token(ADMIN_OID))
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Revogar convite expirado para substituição\"}"))
                .andExpect(status().isNoContent());
        UUID replacement = invite(target, oid);
        assertThat(replacement).isNotEqualTo(invitation);
        mvc.perform(post("/api/v1/invitations/" + invitation + "/accept").with(token(oid))).andExpect(status().isConflict());
        mvc.perform(post("/api/v1/invitations/" + replacement + "/accept").with(token(oid)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(target.toString()));
        mvc.perform(get("/api/v1/me").with(token(oid))).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.invitations where member_id=?", Integer.class, target)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select revoked_at is not null and accepted_at is null from nite_connect.invitations where id=?", Boolean.class, invitation)).isTrue();
        assertThat(jdbc.queryForObject("select accepted_at is not null and revoked_at is null from nite_connect.invitations where id=?", Boolean.class, replacement)).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.identity_accounts where member_id=?", Integer.class, target)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where member_id=? and action='INVITATION_REVOKED'", Integer.class, target)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where member_id=? and action='INVITATION_ACCEPTED'", Integer.class, target)).isEqualTo(1);
    }

    @Test
    void acceptedInvitationCannotReactivateADisabledMember() throws Exception {
        UUID target = pending(); UUID oid = UUID.randomUUID(); UUID invitation = invite(target, oid);
        mvc.perform(post("/api/v1/invitations/" + invitation + "/accept").with(token(oid))).andExpect(status().isOk());
        jdbc.update("update nite_connect.members set status='DESLIGADO' where id=?", target);
        mvc.perform(post("/api/v1/invitations/" + invitation + "/accept").with(token(oid))).andExpect(status().isForbidden());
    }

    @Test
    void administrativeHistoryCannotBeRewrittenOrDeleted() throws Exception {
        pending();
        assertThatThrownBy(() -> jdbc.update("update nite_connect.audit_events set reason='rewrite'"))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("delete from nite_connect.member_status_history"))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
    }

    @Test
    void basicAuthenticationAndUnimplementedRoutesStayDenied() throws Exception {
        mvc.perform(get("/api/v1/me").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic("user", "test-only-password")))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/activities").with(token(ADMIN_OID))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/activities/" + UUID.randomUUID() + "/unsupported-operation").with(token(ADMIN_OID)))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/members/" + MEMBER).with(token(ADMIN_OID))).andExpect(status().isForbidden());
    }

    @Test
    void missingJustificationAndInvalidRoleAreBadRequests() throws Exception {
        mvc.perform(patch("/api/v1/members/" + MEMBER + "/status").with(token(ADMIN_OID)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"AFASTADO\",\"expectedVersion\":0,\"reason\":\"   \"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/members/" + MEMBER + "/roles").with(token(ADMIN_OID)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"GESTOR_PROJETO\",\"expectedVersion\":0,\"reason\":\"Teste\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/v1/members/" + MEMBER + "/status").with(token(MEMBER_OID)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"ATIVO\",\"expectedVersion\":0,\"reason\":\"Teste\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void auditAndInvitationsAreRestrictedAndPersonalDataIsNotInErrors() throws Exception {
        mvc.perform(get("/api/v1/invitations").with(token(MEMBER_OID))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/audit-events").with(token(MEMBER_OID))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/audit-events").with(token(ADMIN_OID))).andExpect(status().isOk());
        mvc.perform(post("/api/v1/members").with(token(ADMIN_OID)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Duplicate\",\"institutionalEmail\":\"member-test@unijorge.com.br\"}"))
                .andExpect(status().isConflict())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().string(
                        org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("member-test@unijorge.com.br"))));
    }

    @Test
    void enabledApiRequiresBearerAuthentication() throws Exception {
        mvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void identityPersistenceIsInstalledByFlyway() {
        assertThat(jdbc.queryForObject("""
                select count(*) from information_schema.tables
                where table_schema = 'nite_connect' and table_name in
                ('members', 'identity_accounts', 'invitations', 'role_assignments',
                 'member_status_history', 'audit_events')
                """, Integer.class)).isEqualTo(6);
    }
}
