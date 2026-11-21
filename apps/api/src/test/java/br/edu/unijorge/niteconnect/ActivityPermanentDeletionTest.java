package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.activities.application.ActivityEvidenceDeletionWorker;
import br.edu.unijorge.niteconnect.activities.application.EvidenceObjectStore;
import br.edu.unijorge.niteconnect.activities.infrastructure.ActivityEvidenceDeletionOutbox;
import br.edu.unijorge.niteconnect.activities.infrastructure.LocalEvidenceObjectStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.MediaType;
import java.io.InputStream;
import java.time.Instant;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ActivityPermanentDeletionTest extends ActivityTestSupport {
    @Autowired ActivityEvidenceDeletionOutbox outbox;
    private String deleteBody(long version) {
        return "{\"expectedVersion\":"+version+",\"confirmed\":true}";
    }

    @Test void creatorPermanentlyDeletesIndependentActivityAndSanitizesAuditSnapshots() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.canDelete").value(true));

        mvc.perform(delete("/api/v1/activities/"+id).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content(deleteBody(av(id)))).andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activities where id=?",Integer.class,id)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_assignments where activity_id=?",Integer.class,id)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_events where activity_id=?",Integer.class,id)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where entity_type='ACTIVITY' and entity_id=? and before_value is not null",Integer.class,id)).isZero();
        mvc.perform(get("/api/v1/activities/"+id).with(token(MEMBER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/me/activities").with(token(MEMBER))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
    }

    @Test void creatorCanDeleteProjectActivityWithoutCurrentProjectParticipation() throws Exception {
        UUID project=activeProject();
        UUID id=activity(LEADER,project,MEMBER);
        mvc.perform(post("/api/v1/activities/"+id+"/collaborators").with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content(command(id,",\"memberId\":\""+OTHER+"\""))).andExpect(status().isCreated());
        jdbc.update("update nite_connect.project_leadership_history set ended_at=clock_timestamp(),ended_by=?,end_reason='Saída do projeto' where project_id=? and member_id=? and ended_at is null",ADMIN,project,LEADER);
        jdbc.update("update nite_connect.project_memberships set ended_at=clock_timestamp(),ended_by=?,end_reason='Saída do projeto' where project_id=? and member_id=? and ended_at is null",ADMIN,project,LEADER);

        mvc.perform(get("/api/v1/activities/"+id+"/capabilities").with(token(LEADER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.canDelete").value(true)).andExpect(jsonPath("$.edit").value(false));
        mvc.perform(delete("/api/v1/activities/"+id).with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content(deleteBody(av(id)))).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activities where id=?",Integer.class,id)).isZero();
        mvc.perform(get("/api/v1/projects/"+project+"/activities").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
    }

    @Test void executorCollaboratorManagerAndAdministratorCannotDeleteAnotherCreatorsActivity() throws Exception {
        UUID project=activeProject();
        UUID id=activity(LEADER,project,MEMBER);
        mvc.perform(post("/api/v1/activities/"+id+"/collaborators").with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content(command(id,",\"memberId\":\""+OTHER+"\""))).andExpect(status().isCreated());
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_PROJETO',?,'Fixture')",OTHER,ADMIN);
        transfer(project,OTHER);
        for(UUID actor:java.util.List.of(MEMBER,OTHER,ADMIN)) {
            mvc.perform(delete("/api/v1/activities/"+id).with(token(actor)).contentType(MediaType.APPLICATION_JSON)
                    .content(deleteBody(av(id)))).andExpect(status().isNotFound());
        }
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activities where id=?",Integer.class,id)).isEqualTo(1);
    }

    @Test void staleVersionAndMissingConfirmationDoNotDeleteActivity() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        state(id,MEMBER,"EM_EXECUCAO");
        mvc.perform(delete("/api/v1/activities/"+id).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content(deleteBody(0))).andExpect(status().isConflict());
        mvc.perform(delete("/api/v1/activities/"+id).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedVersion\":"+av(id)+",\"confirmed\":false}")).andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activities where id=?",Integer.class,id)).isEqualTo(1);
    }

    @Test void evidenceIsUnlinkedImmediatelyAndPrivateBytesAreRetriedAfterCommit(@TempDir Path isolatedStorage) throws Exception {
        UUID id=activity(MEMBER,null,MEMBER), assignment=jdbc.queryForObject(
                "select id from nite_connect.activity_assignments where activity_id=? and ended_at is null",UUID.class,id);
        UUID objectId=UUID.randomUUID(),objectKey=UUID.randomUUID(),fileEvidence=UUID.randomUUID();
        jdbc.update("""
                insert into nite_connect.evidence_objects(id,activity_id,author_id,object_key,filename,content_type,size_bytes,sha256,state)
                values (?,?,?,?,?,'text/plain',3,repeat('a',64),'AVAILABLE')
                """,objectId,id,MEMBER,objectKey,"privado.txt");
        jdbc.update("""
                insert into nite_connect.activity_evidence(id,activity_id,author_id,assignment_id,type,object_id)
                values (?,?,?,?,'FILE',?)
                """,fileEvidence,id,MEMBER,assignment,objectId);
        mvc.perform(post("/api/v1/activities/"+id+"/evidence").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content(command(id,",\"type\":\"TEXT\",\"content\":\"Evidência de auditoria\""))).andExpect(status().isCreated());
        UUID textEvidence=jdbc.queryForObject("select id from nite_connect.activity_evidence where activity_id=? and type='TEXT'",UUID.class,id);

        mvc.perform(delete("/api/v1/activities/"+id).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content(deleteBody(av(id)))).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_evidence where id=?",Integer.class,fileEvidence)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.evidence_objects where id=?",Integer.class,objectId)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_evidence_deletion_outbox where object_key=? and state='PENDING'",Integer.class,objectKey)).isEqualTo(1);
        mvc.perform(get("/api/v1/me/activities/evidence/"+fileEvidence).with(token(MEMBER))).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where entity_type='EVIDENCE' and entity_id in (?,?) and (before_value is not null or after_value is not null or reason<>'Atividade excluída permanentemente')",Integer.class,fileEvidence,textEvidence)).isZero();

        AtomicInteger failures=new AtomicInteger(1);
        EvidenceObjectStore flaky=new EvidenceObjectStore() {
            public boolean enabled() { return true; }
            public Stored write(UUID key,String filename,String contentType,InputStream input) { throw new UnsupportedOperationException(); }
            public byte[] read(UUID key,long size,String sha256) { throw new UnsupportedOperationException(); }
            public void delete(UUID key) { if(failures.getAndDecrement()>0) throw new IllegalStateException("simulated storage failure"); }
            public List<StoredKey> olderThan(Instant cutoff) { return List.of(); }
        };
        var worker=new ActivityEvidenceDeletionWorker(outbox,flaky);
        worker.retryPendingDeletes();
        assertThat(jdbc.queryForObject("select state from nite_connect.activity_evidence_deletion_outbox where object_key=?",String.class,objectKey)).isEqualTo("FAILED");
        jdbc.update("update nite_connect.activity_evidence_deletion_outbox set next_attempt_at=clock_timestamp() where object_key=?",objectKey);
        Files.writeString(isolatedStorage.resolve(objectKey+".object"),"isolated evidence bytes");
        worker=new ActivityEvidenceDeletionWorker(outbox,new LocalEvidenceObjectStore(isolatedStorage.toString()));
        worker.retryPendingDeletes();
        assertThat(jdbc.queryForObject("select state from nite_connect.activity_evidence_deletion_outbox where object_key=?",String.class,objectKey)).isEqualTo("DELETED");
        assertThat(jdbc.queryForObject("select attempts from nite_connect.activity_evidence_deletion_outbox where object_key=?",Integer.class,objectKey)).isEqualTo(2);
        assertThat(Files.exists(isolatedStorage.resolve(objectKey+".object"))).isFalse();
    }

    @Test void projectHealthEvaluationAndSourceSnapshotSurviveActivityDeletion() throws Exception {
        UUID project=activeProject(),id=activity(LEADER,project,MEMBER);
        UUID policy=jdbc.queryForObject("select id from nite_connect.project_health_policy_versions where project_id=? and valid_until is null",UUID.class,project);
        UUID evaluation=UUID.randomUUID();
        jdbc.update("""
                insert into nite_connect.project_health_evaluations(
                  id,project_id,policy_version_id,status,evaluated_by,evaluated_at,max_overdue_days,days_since_relevant_update,
                  attention_overdue_days,critical_overdue_days,attention_no_update_days,critical_no_update_days,
                  source_activity_count,reason)
                values (?,?,?,'REGULAR',?,clock_timestamp(),0,null,7,14,14,30,1,'Avaliação sintética')
                """,evaluation,project,policy,ADMIN);
        jdbc.update("insert into nite_connect.project_health_evaluation_sources(evaluation_id,activity_id,source_kind) values (?,?,'ATRASO')",evaluation,id);

        mvc.perform(delete("/api/v1/activities/"+id).with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content(deleteBody(av(id)))).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_health_evaluations where id=?",Integer.class,evaluation)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select activity_id from nite_connect.project_health_evaluation_sources where evaluation_id=?",UUID.class,evaluation)).isEqualTo(id);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.activities where id=?",Integer.class,id)).isZero();
    }

    @Test void concurrentUpdateAndDeleteAreSerializedWithoutPartialState() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER);
        long expected=av(id);
        CountDownLatch start=new CountDownLatch(1);
        var executor=Executors.newFixedThreadPool(2);
        try {
            var deletion=executor.submit(() -> {
                start.await();
                return mvc.perform(delete("/api/v1/activities/"+id).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                        .content(deleteBody(expected))).andReturn().getResponse().getStatus();
            });
            var update=executor.submit(() -> {
                start.await();
                return mvc.perform(patch("/api/v1/activities/"+id).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedVersion\":"+expected+",\"title\":\"Concorrente\"}")).andReturn().getResponse().getStatus();
            });
            start.countDown();
            int deleteStatus=deletion.get(),updateStatus=update.get();
            assertThat(deleteStatus).isIn(204,409);
            if(deleteStatus==204) {
                assertThat(updateStatus).isEqualTo(404);
                assertThat(jdbc.queryForObject("select count(*) from nite_connect.activities where id=?",Integer.class,id)).isZero();
            } else {
                assertThat(updateStatus).isEqualTo(200);
                assertThat(jdbc.queryForObject("select title from nite_connect.activities where id=?",String.class,id)).isEqualTo("Concorrente");
            }
        } finally {
            executor.shutdownNow();
        }
    }

    @Test void restrictiveReferenceFailureRollsBackTheWholeDeletion() throws Exception {
        UUID id=activity(MEMBER,null,MEMBER),blocker=UUID.randomUUID();
        jdbc.execute("create table nite_connect.activity_delete_test_restrict(id uuid primary key, activity_id uuid not null references nite_connect.activities(id))");
        try {
            jdbc.update("insert into nite_connect.activity_delete_test_restrict(id,activity_id) values (?,?)",blocker,id);
            int status=mvc.perform(delete("/api/v1/activities/"+id).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                    .content(deleteBody(av(id)))).andReturn().getResponse().getStatus();
            assertThat(status).isBetween(400,599);
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.activities where id=?",Integer.class,id)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_assignments where activity_id=?",Integer.class,id)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_deletion_context where activity_id=?",Integer.class,id)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.activity_evidence_deletion_outbox",Integer.class)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where entity_type='ACTIVITY' and entity_id=? and after_value is not null",Integer.class,id)).isGreaterThan(0);
        } finally {
            jdbc.execute("drop table nite_connect.activity_delete_test_restrict");
        }
    }
}
