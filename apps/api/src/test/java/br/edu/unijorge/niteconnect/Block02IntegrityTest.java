package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.dao.DataAccessException;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class Block02IntegrityTest extends ProjectTestSupport {
    @Test void databaseIndependentlyRejectsDuplicateCurrentMembershipAndLeadership() throws Exception {
        UUID id = project(); join(id, LEADER); join(id, MEMBER); transfer(id, LEADER);
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_PROJETO',?,'Fixture')", MEMBER, ADMIN);
        assertThatThrownBy(() -> jdbc.update("""
                insert into nite_connect.project_memberships(id,project_id,member_id,responsibility,started_by,start_reason)
                values (?,?,?,'Teste',?,'Duplicidade')
                """, UUID.randomUUID(), id, LEADER, ADMIN)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        UUID membership = jdbc.queryForObject("select id from nite_connect.project_memberships where project_id=? and member_id=?", UUID.class, id, MEMBER);
        assertThatThrownBy(() -> jdbc.update("""
                insert into nite_connect.project_leadership_history(id,project_id,member_id,membership_id,started_by,start_reason)
                values (?,?,?,?,?,'Duplicidade')
                """, UUID.randomUUID(), id, MEMBER, membership, ADMIN)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
                insert into nite_connect.project_memberships(id,project_id,member_id,responsibility,started_by,start_reason)
                values (?,?,?,'Teste',?,'Inexistente')
                """, UUID.randomUUID(), id, UUID.randomUUID(), ADMIN)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
    @Test void closedPeriodsAndProjectStatusHistoryCannotBeRewrittenOrDeleted() throws Exception {
        UUID id = project(); join(id, LEADER); transfer(id, LEADER); transfer(id, null);
        mvc.perform(delete("/api/v1/projects/" + id + "/members/" + LEADER).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedVersion\":" + version(id) + ",\"reason\":\"Saída\"}")).andExpect(status().isNoContent());
        for (String sql : java.util.List.of(
                "delete from nite_connect.projects", "delete from nite_connect.project_memberships",
                "update nite_connect.project_memberships set end_reason='Reescrita'",
                "delete from nite_connect.project_leadership_history",
                "update nite_connect.project_leadership_history set end_reason='Reescrita'",
                "update nite_connect.project_status_history set reason='Reescrita'")) {
            assertThatThrownBy(() -> jdbc.update(sql)).isInstanceOf(DataAccessException.class);
        }
    }
    @Test void projectAndMembershipChangesRollbackWhenAuditInsertFails() throws Exception {
        UUID id = project();
        jdbc.execute("create function nite_connect.fail_project_audit_test() returns trigger language plpgsql as $$ begin raise exception 'test fault'; end; $$");
        jdbc.execute("create trigger fail_project_audit_test before insert on nite_connect.audit_events for each row execute function nite_connect.fail_project_audit_test()");
        try {
            assertThatThrownBy(() -> mvc.perform(post("/api/v1/projects/" + id + "/members").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"memberId\":\"" + MEMBER + "\",\"responsibility\":\"Teste\",\"expectedVersion\":0,\"reason\":\"Teste\"}")))
                    .hasRootCauseInstanceOf(org.postgresql.util.PSQLException.class);
            assertThat(version(id)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=?", Integer.class, id)).isZero();
            assertThatThrownBy(() -> mvc.perform(patch("/api/v1/projects/" + id + "/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"status\":\"ATIVO\",\"expectedVersion\":0,\"reason\":\"Teste\"}")))
                    .hasRootCauseInstanceOf(org.postgresql.util.PSQLException.class);
            assertThat(jdbc.queryForObject("select status from nite_connect.projects where id=?", String.class, id)).isEqualTo("PLANEJAMENTO");
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_status_history where project_id=?", Integer.class, id)).isEqualTo(1);
        } finally {
            jdbc.execute("drop trigger fail_project_audit_test on nite_connect.audit_events");
            jdbc.execute("drop function nite_connect.fail_project_audit_test()");
        }
    }
    @Test void unimplementedAndDestructiveRoutesStayDenied() throws Exception {
        UUID id = project();
        mvc.perform(delete("/api/v1/projects/" + id).with(token(ADMIN))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/projects/" + id + "/tasks").with(token(ADMIN))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/projects")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/projects?size=101").with(token(ADMIN))).andExpect(status().isBadRequest());
    }
    @Test void leadershipAuditFailureRestoresPreviousOpenPeriodAndProjectVersion() throws Exception {
        UUID id = project(); join(id, LEADER); join(id, MEMBER); transfer(id, LEADER); long version = version(id);
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_PROJETO',?,'Fixture')", MEMBER, ADMIN);
        jdbc.execute("""
                create function nite_connect.fail_leadership_test() returns trigger language plpgsql as $$
                begin if NEW.action='PROJECT_LEADERSHIP_TRANSFERRED' then raise exception 'test fault'; end if; return NEW; end; $$
                """);
        jdbc.execute("create trigger fail_leadership_test before insert on nite_connect.audit_events for each row execute function nite_connect.fail_leadership_test()");
        try {
            assertThatThrownBy(() -> mvc.perform(post("/api/v1/projects/" + id + "/leadership-transfers").with(token(ADMIN))
                    .contentType(MediaType.APPLICATION_JSON).content(transferBody(MEMBER, version))))
                    .hasRootCauseInstanceOf(org.postgresql.util.PSQLException.class);
            assertThat(version(id)).isEqualTo(version);
            assertThat(jdbc.queryForObject("select member_id from nite_connect.project_leadership_history where project_id=? and ended_at is null", UUID.class, id)).isEqualTo(LEADER);
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where project_id=?", Integer.class, id)).isEqualTo(1);
        } finally {
            jdbc.execute("drop trigger fail_leadership_test on nite_connect.audit_events");
            jdbc.execute("drop function nite_connect.fail_leadership_test()");
        }
    }
}
