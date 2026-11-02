package br.edu.unijorge.niteconnect;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers
class Block04RetirementMigrationTest {
    @Container static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

    @Test
    void removesRetiredParticipationDataAndPreservesAgendaAndAttendanceHistory() {
        Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:Migrations").target("20").load().migrate();
        JdbcTemplate jdbc = new JdbcTemplate(new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));

        UUID member = UUID.randomUUID();
        UUID event = UUID.randomUUID();
        UUID attendance = UUID.randomUUID();
        UUID segment = UUID.randomUUID();
        UUID workLog = UUID.randomUUID();
        UUID agendaEvent = UUID.randomUUID();
        UUID attendanceEvent = UUID.randomUUID();
        UUID segmentEvent = UUID.randomUUID();
        UUID legacyPeriodEvent = UUID.randomUUID();
        UUID legacyJustificationEvent = UUID.randomUUID();
        UUID legacyCorrectionEvent = UUID.randomUUID();
        UUID legacyResponseEvent = UUID.randomUUID();
        UUID agendaAudit = UUID.randomUUID();
        UUID attendanceAudit = UUID.randomUUID();
        UUID segmentAudit = UUID.randomUUID();
        UUID legacyWorkLogAudit = UUID.randomUUID();
        UUID legacyJustificationAudit = UUID.randomUUID();
        UUID legacyCorrectionAudit = UUID.randomUUID();
        UUID legacyResponseAudit = UUID.randomUUID();
        UUID b03Audit = UUID.randomUUID();
        UUID justification = UUID.randomUUID();
        UUID policy = UUID.randomUUID();
        UUID adjustment = UUID.randomUUID();

        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Fixture migration','migration@unijorge.com.br','ATIVO')", member);
        jdbc.update("""
                insert into nite_connect.calendar_events(id,title,description,kind,modality,starts_at,ends_at,status,created_by)
                values (?,'Encontro sintético','Evento de fixture','ENCONTRO','PRESENCIAL',
                        '2027-03-01T18:00:00Z','2027-03-01T20:00:00Z','ENCERRADO',?)
                """, event, member);
        jdbc.update("insert into nite_connect.event_participants(event_id,member_id) values (?,?)", event, member);
        jdbc.update("insert into nite_connect.attendance_records(id,event_id,member_id) values (?,?,?)", attendance, event, member);
        jdbc.update("""
                insert into nite_connect.participation_periods
                    (id,member_id,attendance_id,kind,modality,starts_at,ends_at,description,origin,created_at)
                values (?,?,?,'ATTENDANCE','PRESENCIAL','2027-03-01T18:05:00Z','2027-03-01T18:55:00Z','',
                        'QR','2027-03-01T18:05:00Z')
                """, segment, member, attendance);
        jdbc.update("""
                insert into nite_connect.participation_periods
                    (id,member_id,kind,modality,starts_at,ends_at,description,origin)
                values (?,?,'WORK_LOG','REMOTA','2026-02-01T12:00:00Z','2026-02-01T12:30:00Z',
                        'Registro antigo sintético','DECLARATION')
                """, workLog, member);

        insertParticipationEvent(jdbc, agendaEvent, "CALENDAR_EVENT", event, member);
        insertParticipationEvent(jdbc, attendanceEvent, "ATTENDANCE", attendance, member);
        insertParticipationEvent(jdbc, segmentEvent, "PERIOD", segment, member);
        insertParticipationEvent(jdbc, legacyPeriodEvent, "PERIOD", workLog, member);
        insertParticipationEvent(jdbc, legacyJustificationEvent, "JUSTIFICATION", UUID.randomUUID(), member);
        insertParticipationEvent(jdbc, legacyCorrectionEvent, "CORRECTION", UUID.randomUUID(), member);
        insertParticipationEvent(jdbc, legacyResponseEvent, "WORK_LOG_CORRECTION_RESPONSE", UUID.randomUUID(), member);

        insertAuditEvent(jdbc, agendaAudit, member, "CALENDAR_EVENT", event);
        insertAuditEvent(jdbc, attendanceAudit, member, "ATTENDANCE", attendance);
        insertAuditEvent(jdbc, segmentAudit, member, "PERIOD", segment);
        insertAuditEvent(jdbc, legacyWorkLogAudit, member, "PERIOD", workLog);
        insertAuditEvent(jdbc, legacyJustificationAudit, member, "JUSTIFICATION", UUID.randomUUID());
        insertAuditEvent(jdbc, legacyCorrectionAudit, member, "CORRECTION", UUID.randomUUID());
        insertAuditEvent(jdbc, legacyResponseAudit, member, "WORK_LOG_CORRECTION_RESPONSE", UUID.randomUUID());
        insertAuditEvent(jdbc, b03Audit, member, "ACTIVITY", UUID.randomUUID());

        jdbc.update("""
                insert into nite_connect.absence_justifications(id,member_id,event_id,reason)
                values (?,?,?,'Motivo sintético de migração')
                """, justification, member, event);
        jdbc.update("""
                insert into nite_connect.correction_requests(id,member_id,period_id,proposed_start,proposed_end,reason)
                values (?,?,?,'2026-02-01T12:01:00Z','2026-02-01T12:31:00Z','Correção sintética')
                """, UUID.randomUUID(), member, workLog);
        jdbc.update("""
                insert into nite_connect.participation_load_policy_versions
                    (id,version,effective_from,presential_hours,remote_hours,source_reference,approved_by,approved_at)
                values (?,1,'2026-01-01',5,4,'Fixture institucional aprovado',?,current_timestamp)
                """, policy, member);
        jdbc.update("""
                insert into nite_connect.participation_adjustments
                    (id,member_id,source_week_start,source_week_end,kind,requested_modality,requested_hours,
                     authorized_modality,authorized_hours,status,requested_by,requested_at,decided_by,decided_at,
                     decision_reason,reason)
                values (?,?,'2026-02-02','2026-02-08','DISPENSA','PRESENCIAL',1,'PRESENCIAL',1,
                        'AUTORIZADA',?,current_timestamp,?,current_timestamp,'Decisão sintética','Dispensa sintética')
                """, adjustment, member, member, member);

        Flyway upgraded = Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:Migrations").load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(5);
        upgraded.validate();
        assertThat(upgraded.info().current().getVersion().getVersion()).isEqualTo("25");

        assertThat(jdbc.queryForObject("select count(*) from nite_connect.calendar_events where id=?", Long.class, event)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.event_participants where event_id=? and member_id=?", Long.class, event, member)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.attendance_records where id=?", Long.class, attendance)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.attendance_segments where id=? and attendance_id=? and member_id=? and starts_at='2027-03-01T18:05:00Z' and ends_at='2027-03-01T18:55:00Z' and created_at='2027-03-01T18:05:00Z'", Long.class, segment, attendance, member)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.attendance_events", Long.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select entity_type from nite_connect.attendance_events where id=?", String.class, segmentEvent)).isEqualTo("ATTENDANCE_SEGMENT");
        assertThat(jdbc.queryForObject("select action from nite_connect.attendance_events where id=?", String.class, agendaEvent)).isEqualTo("CREATED");

        assertThat(jdbc.queryForObject("select entity_type from nite_connect.audit_events where id=?", String.class, segmentAudit)).isEqualTo("ATTENDANCE_SEGMENT");
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where id in (?,?,?)", Long.class, agendaAudit, attendanceAudit, segmentAudit)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where id=?", Long.class, b03Audit)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where entity_type in ('PERIOD','JUSTIFICATION','CORRECTION','WORK_LOG_CORRECTION_RESPONSE')", Long.class)).isZero();

        List<String> retiredTables = List.of(
                "absence_justifications", "correction_requests", "participation_calendar_versions", "participation_adjustments",
                "participation_adjustment_events", "participation_replacement_allocations", "participation_review_batches",
                "participation_review_batch_items", "participation_load_policy_versions", "work_log_correction_responses",
                "work_log_correction_decisions", "participation_load_policy_drafts", "participation_load_policy_events",
                "justification_attachment_retention_policies", "justification_attachment_retention_events",
                "absence_justification_retention_classifications", "absence_justification_attachments",
                "absence_justification_attachment_events", "absence_justification_attachment_retention_holds",
                "justification_attachment_retention_purge_runs", "justification_attachment_retention_purge_run_events",
                "justification_attachment_retention_purge_items", "participation_periods", "participation_events");
        for (String table : retiredTables) {
            assertThat(jdbc.queryForObject("select to_regclass(?)", String.class, "nite_connect." + table))
                    .as("retired table %s", table).isNull();
        }
        assertThat(jdbc.queryForObject("select to_regprocedure('nite_connect.protect_participation_period()')", String.class)).isNull();
        assertThat(jdbc.queryForObject("select to_regprocedure('nite_connect.reject_history_mutation()')", String.class)).isNotNull();

        assertThatThrownBy(() -> jdbc.update("update nite_connect.attendance_events set reason='alterado' where id=?", agendaEvent))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("delete from nite_connect.attendance_segments where id=?", segment))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> insertAuditEvent(jdbc, UUID.randomUUID(), member, "PERIOD", segment))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
    }

    private static void insertParticipationEvent(JdbcTemplate jdbc, UUID id, String type, UUID entity, UUID member) {
        jdbc.update("""
                insert into nite_connect.participation_events(id,entity_type,entity_id,member_id,actor_id,action,reason)
                values (?,?,?,?,?,'CREATED','Fixture sintético')
                """, id, type, entity, member, member);
    }

    private static void insertAuditEvent(JdbcTemplate jdbc, UUID id, UUID actor, String type, UUID entity) {
        jdbc.update("""
                insert into nite_connect.audit_events(id,actor_id,entity_type,entity_id,action,reason)
                values (?,?,?,?,'CREATED','Fixture sintético')
                """, id, actor, type, entity);
    }
}
