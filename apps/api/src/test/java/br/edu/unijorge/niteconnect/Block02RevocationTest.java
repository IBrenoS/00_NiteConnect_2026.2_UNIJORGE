package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.members.application.MemberAdministration;
import br.edu.unijorge.niteconnect.members.domain.MemberStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class Block02RevocationTest extends ProjectTestSupport {
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired MemberAdministration memberAdministration;

    @Test void queuedWriteRechecksAuthorityAfterConcurrentDeactivationCommits() throws Exception {
        UUID id = project(); join(id, LEADER); transfer(id, LEADER); long version = version(id);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var request = new java.util.concurrent.atomic.AtomicReference<Future<Integer>>();
            new TransactionTemplate(transactionManager).executeWithoutResult(transaction -> {
                jdbc.queryForList("select pg_advisory_xact_lock(784629301)");
                request.set(executor.submit(() -> mvc.perform(patch("/api/v1/projects/" + id).with(token(LEADER))
                        .contentType(MediaType.APPLICATION_JSON).content(updateBody(version))).andReturn().getResponse().getStatus()));
                awaitBlockedAdministrativeWrite();
                memberAdministration.changeStatus(ADMIN, LEADER, MemberStatus.DESLIGADO, 0, "Desligamento concorrente");
            });
            assertThat(request.get().get(10, TimeUnit.SECONDS)).isEqualTo(403);
        }
        assertThat(version(id)).isEqualTo(version);
        assertThat(jdbc.queryForObject("select title from nite_connect.projects where id=?", String.class, id)).isEqualTo("Projeto de teste");
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where entity_id=? and action='PROJECT_UPDATED'", Integer.class, id)).isZero();
    }
    void awaitBlockedAdministrativeWrite() {
        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        while (System.nanoTime() < deadline) {
            // pg_locks reflects the live wait even inside this long-running transaction.
            // pg_stat_activity's transaction snapshot can predate the request being submitted.
            if (Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from pg_locks where locktype='advisory' and classid=0 and objid=784629301 and not granted)", Boolean.class))) return;
            try { Thread.sleep(20); }
            catch (InterruptedException ex) { Thread.currentThread().interrupt(); throw new AssertionError(ex); }
        }
        throw new AssertionError("Request did not block on the administrative lock; live locks="
                + jdbc.queryForList("select locktype,granted,classid,objid from pg_locks where locktype='advisory'"));
    }
    @Test void reactivationRestoresOnlyLeadershipWhosePeriodHasNotBeenClosed() throws Exception {
        UUID retained = project(); UUID replaced = project();
        join(retained, LEADER); transfer(retained, LEADER); join(replaced, LEADER); transfer(replaced, LEADER);
        memberAdministration.changeStatus(ADMIN, LEADER, MemberStatus.AFASTADO, 0, "Afastamento");
        transfer(replaced, null);
        memberAdministration.changeStatus(ADMIN, LEADER, MemberStatus.ATIVO, 1, "Retorno");
        mvc.perform(get("/api/v1/projects/" + retained + "/leadership").with(token(ADMIN))).andExpect(status().isOk())
                .andExpect(jsonPath("$.effective").value(true)).andExpect(jsonPath("$.memberId").value(LEADER.toString()));
        mvc.perform(get("/api/v1/projects/" + replaced + "/leadership").with(token(ADMIN))).andExpect(status().isOk())
                .andExpect(jsonPath("$.effective").value(false));
        mvc.perform(patch("/api/v1/projects/" + replaced).with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version(replaced)))).andExpect(status().isForbidden());
    }
    @Test void suspendedMemberCannotJoinOrProposeAndOutsiderCannotReadHistories() throws Exception {
        UUID id = project();
        memberAdministration.changeStatus(ADMIN, OTHER, MemberStatus.AFASTADO, 0, "Afastamento");
        mvc.perform(post("/api/v1/projects/" + id + "/members").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\"" + OTHER + "\",\"responsibility\":\"Teste\",\"expectedVersion\":0,\"reason\":\"Teste\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/proposals").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Ideia\",\"description\":\"Teste\",\"reason\":\"Teste\"}"))
                .andExpect(status().isForbidden());
        for (String path : java.util.List.of("history", "members/history", "leadership/history")) {
            mvc.perform(get("/api/v1/projects/" + id + "/" + path).with(token(MEMBER))).andExpect(status().isForbidden());
        }
    }
    @Test void concurrentJoinsCannotCreateTwoCurrentPeriods() throws Exception {
        UUID id = project();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var start = new CountDownLatch(1);
            Callable<Integer> join = () -> {
                start.await();
                return mvc.perform(post("/api/v1/projects/" + id + "/members").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"memberId\":\"" + MEMBER + "\",\"responsibility\":\"Teste\",\"expectedVersion\":0,\"reason\":\"Teste\"}"))
                        .andReturn().getResponse().getStatus();
            };
            var first = executor.submit(join); var second = executor.submit(join); start.countDown();
            assertThat(java.util.List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS))).containsExactlyInAnyOrder(201, 409);
        }
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and member_id=?", Integer.class, id, MEMBER)).isEqualTo(1);
    }
}
