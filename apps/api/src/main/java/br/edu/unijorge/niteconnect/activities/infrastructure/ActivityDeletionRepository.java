package br.edu.unijorge.niteconnect.activities.infrastructure;

import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public class ActivityDeletionRepository {
    private static final String REMOVAL_NOTE = "Atividade excluída permanentemente";
    private final JdbcTemplate jdbc;

    public ActivityDeletionRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public VersionedOwner lockOwnerAndVersion(UUID activityId) {
        return jdbc.query("select created_by,version from nite_connect.activities where id=? for update",
                (rs, row) -> new VersionedOwner(rs.getObject("created_by", UUID.class), rs.getLong("version")), activityId)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }

    public void deletePermanently(UUID actor, UUID activityId, long expectedVersion) {
        jdbc.update("insert into nite_connect.activity_deletion_context(activity_id,actor_id,expected_version) values (?,?,?)",
                activityId, actor, expectedVersion);
        sanitizeAuditSnapshots(activityId);
        jdbc.update("""
                insert into nite_connect.activity_evidence_deletion_outbox(id,object_key)
                select gen_random_uuid(),object_key from nite_connect.evidence_objects where activity_id=?
                on conflict(object_key) do nothing
                """, activityId);
        jdbc.update("delete from nite_connect.activity_evidence where activity_id=?", activityId);
        jdbc.update("delete from nite_connect.evidence_objects where activity_id=?", activityId);
        jdbc.update("delete from nite_connect.activity_assignments where activity_id=?", activityId);
        jdbc.update("delete from nite_connect.activity_events where activity_id=?", activityId);
        if (jdbc.update("delete from nite_connect.activities where id=? and version=?", activityId, expectedVersion) != 1) {
            throw ApiException.conflict("Atividade alterada; consulte a versão atual");
        }
        jdbc.update("delete from nite_connect.activity_deletion_context where activity_id=?", activityId);
    }

    private void sanitizeAuditSnapshots(UUID activityId) {
        jdbc.update("""
                update nite_connect.audit_events
                set before_value=null,after_value=null,reason=?
                where entity_type='ACTIVITY' and entity_id=?
                """, REMOVAL_NOTE, activityId);
        jdbc.update("""
                update nite_connect.audit_events a
                set before_value=null,after_value=null,reason=?
                where a.entity_type='EVIDENCE' and exists (
                  select 1 from nite_connect.activity_evidence e
                  where e.id=a.entity_id and e.activity_id=?
                )
                """, REMOVAL_NOTE, activityId);
    }

    public record VersionedOwner(UUID createdBy, long version) {}
}
