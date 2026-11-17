package br.edu.unijorge.niteconnect.activities.infrastructure;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Repository
public class ActivityEvidenceDeletionOutbox {
    private final JdbcTemplate jdbc;
    public ActivityEvidenceDeletionOutbox(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional
    public List<Job> claim(int limit) {
        return jdbc.query("""
                with due as (
                  select id from nite_connect.activity_evidence_deletion_outbox
                  where (state in ('PENDING','FAILED') and next_attempt_at<=clock_timestamp())
                     or (state='PROCESSING' and lease_until<clock_timestamp())
                  order by next_attempt_at,id for update skip locked limit ?
                )
                update nite_connect.activity_evidence_deletion_outbox o
                set state='PROCESSING',attempts=o.attempts+1,
                    lease_until=clock_timestamp()+interval '5 minutes',last_error_code=null
                from due where o.id=due.id
                returning o.id,o.object_key
                """, (rs, row) -> new Job(rs.getObject("id", UUID.class), rs.getObject("object_key", UUID.class)), limit);
    }

    @Transactional
    public void complete(UUID id) {
        jdbc.update("""
                update nite_connect.activity_evidence_deletion_outbox
                set state='DELETED',lease_until=null,last_error_code=null,completed_at=clock_timestamp()
                where id=? and state='PROCESSING'
                """, id);
    }

    @Transactional
    public void retry(UUID id, String errorCode) {
        jdbc.update("""
                update nite_connect.activity_evidence_deletion_outbox
                set state='FAILED',lease_until=null,last_error_code=?,
                    next_attempt_at=clock_timestamp()+make_interval(mins => (1 << least(attempts,8)))
                where id=? and state='PROCESSING'
                """, errorCode, id);
    }

    public record Job(UUID id, UUID objectKey) {}
}
