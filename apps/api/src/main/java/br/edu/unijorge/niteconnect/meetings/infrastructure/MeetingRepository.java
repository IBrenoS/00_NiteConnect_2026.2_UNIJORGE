package br.edu.unijorge.niteconnect.meetings.infrastructure;

import br.edu.unijorge.niteconnect.meetings.application.MeetingProvider;
import br.edu.unijorge.niteconnect.meetings.domain.CalendarResponseStatus;
import br.edu.unijorge.niteconnect.meetings.domain.MeetingInviteStatus;
import br.edu.unijorge.niteconnect.meetings.domain.MeetingMode;
import br.edu.unijorge.niteconnect.meetings.domain.MeetingStatus;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Repository
public class MeetingRepository {
    private final JdbcTemplate jdbc;
    private static final RowMapper<Reservation> RESERVATION = (rs, row) -> new Reservation(
            rs.getObject("meeting_id", UUID.class), rs.getObject("organizer_member_id", UUID.class),
            rs.getObject("operation_id", UUID.class),
            rs.getObject("graph_transaction_id", UUID.class), rs.getString("request_hash").trim(),
            rs.getString("operation_state"), rs.getString("meeting_status"), rs.getString("mode"),
            rs.getString("title"), rs.getTimestamp("starts_at").toInstant(),
            rs.getInt("planned_duration_minutes"), rs.getTimestamp("planned_ends_at").toInstant(),
            rs.getTimestamp("created_at").toInstant(),
            instant(rs.getTimestamp("lease_until")), instant(rs.getTimestamp("retry_after")), false);

    public MeetingRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional
    public Reservation reserveCreate(UUID organizerId, String idempotencyKey, String requestHash,
                                     MeetingMode mode, String title, Instant startsAt,
                                     int plannedDurationMinutes,
                                     List<UUID> inviteeIds, String requestPayload, Instant now) {
        String lockKey = organizerId + ":CREATE:" + idempotencyKey;
        jdbc.query("select pg_advisory_xact_lock(hashtextextended(?, 0))", rs -> {
            if (rs.next()) rs.getObject(1);
            return null;
        }, lockKey);

        var existing = jdbc.query("""
                select m.id meeting_id,m.organizer_member_id,o.id operation_id,o.graph_transaction_id,o.request_hash,o.state operation_state,
                       m.status meeting_status,m.mode,m.title,m.starts_at,m.planned_duration_minutes,m.planned_ends_at,
                       m.created_at,o.lease_until,o.retry_after
                  from nite_connect.meeting_provider_operations o
                  join nite_connect.meetings m on m.id=o.meeting_id
                 where o.organizer_member_id=? and o.operation_type='CREATE' and o.idempotency_key=?
                 for update of o,m
                """, RESERVATION, organizerId, idempotencyKey);
        if (!existing.isEmpty()) {
            Reservation prior = existing.getFirst();
            if (!prior.requestHash().equals(requestHash)) throw ApiException.conflict("Idempotency-Key já foi usado com outro conteúdo");
            if (prior.operationState().equals("CONFIRMADA")) return prior;
            if (prior.operationState().equals("PROCESSANDO") && prior.leaseUntil() != null && prior.leaseUntil().isAfter(now)) return prior;
            if (prior.operationState().equals("RESULTADO_INDETERMINADO") && prior.retryAfter() != null && prior.retryAfter().isAfter(now)) return prior;
            jdbc.update("""
                    update nite_connect.meeting_provider_operations
                       set state='PROCESSANDO',attempt_count=attempt_count+1,lease_until=?,retry_after=null,
                           provider_error_code=null,provider_http_status=null,updated_at=?
                     where id=?
                    """, Timestamp.from(now.plus(Duration.ofMinutes(1))), Timestamp.from(now), prior.operationId());
            jdbc.update("update nite_connect.meetings set status='CRIACAO_PENDENTE',last_provider_error_code=null,updated_at=? where id=?",
                    Timestamp.from(now), prior.meetingId());
            return new Reservation(prior.meetingId(), prior.organizerMemberId(), prior.operationId(), prior.graphTransactionId(), prior.requestHash(),
                    "PROCESSANDO", "CRIACAO_PENDENTE", prior.mode(), prior.title(), prior.startsAt(),
                    prior.plannedDurationMinutes(), prior.plannedEndsAt(), prior.createdAt(),
                    now.plus(Duration.ofMinutes(1)), null, true);
        }

        UUID meetingId = UUID.randomUUID();
        UUID operationId = UUID.randomUUID();
        UUID graphTransactionId = UUID.randomUUID();
        Instant plannedEndsAt = startsAt.plus(Duration.ofMinutes(plannedDurationMinutes));
        jdbc.update("""
                insert into nite_connect.meetings(id,organizer_member_id,mode,title,status,starts_at,
                    planned_duration_minutes,planned_ends_at,created_at,updated_at)
                values (?,?,?,?, 'CRIACAO_PENDENTE',?,?,?,?,?)
                """, meetingId, organizerId, mode.name(), title, Timestamp.from(startsAt), plannedDurationMinutes,
                Timestamp.from(plannedEndsAt), Timestamp.from(now), Timestamp.from(now));
        jdbc.update("""
                insert into nite_connect.meeting_provider_operations(id,meeting_id,organizer_member_id,operation_type,
                    idempotency_key,request_hash,graph_transaction_id,state,request_payload,attempt_count,lease_until,created_at,updated_at)
                values (?,?,?,'CREATE',?,?,?,'PROCESSANDO',?::jsonb,1,?,?,?)
                """, operationId, meetingId, organizerId, idempotencyKey, requestHash, graphTransactionId,
                requestPayload, Timestamp.from(now.plus(Duration.ofMinutes(1))), Timestamp.from(now), Timestamp.from(now));
        for (UUID inviteeId : inviteeIds) {
            jdbc.update("insert into nite_connect.meeting_invites(id,meeting_id,member_id) values (?,?,?)",
                    UUID.randomUUID(), meetingId, inviteeId);
        }
        jdbc.update("""
                insert into nite_connect.meeting_history(id,meeting_id,actor_member_id,action,meeting_version,after_snapshot,occurred_at)
                values (?,?,?,'CRIACAO_SOLICITADA',1,
                    jsonb_build_object('mode',?::text,'title',?::text,'startsAt',?::timestamptz,'plannedDurationMinutes',?::integer),?)
                """, UUID.randomUUID(), meetingId, organizerId, mode.name(), title, Timestamp.from(startsAt),
                plannedDurationMinutes, Timestamp.from(now));
        return new Reservation(meetingId, organizerId, operationId, graphTransactionId, requestHash, "PROCESSANDO",
                "CRIACAO_PENDENTE", mode.name(), title, startsAt, plannedDurationMinutes, plannedEndsAt,
                now, now.plus(Duration.ofMinutes(1)), null, true);
    }

    @Transactional
    public void confirmCreate(Reservation reservation, UUID organizerId, MeetingProvider.CreatedMeeting created, Instant now) {
        int changed = jdbc.update("""
                update nite_connect.meetings
                   set status='AGENDADA',graph_event_id=?,graph_online_meeting_id=?,join_url=?,graph_change_key=?,
                       last_provider_error_code=null,updated_at=?
                 where id=? and status='CRIACAO_PENDENTE'
                """, created.eventId(), blankToNull(created.onlineMeetingId()), created.joinUrl(),
                blankToNull(created.changeKey()), Timestamp.from(now), reservation.meetingId());
        if (changed != 1) throw ApiException.conflict("Reunião alterada durante a confirmação externa");
        jdbc.update("""
                update nite_connect.meeting_provider_operations
                   set state='CONFIRMADA',lease_until=null,retry_after=null,provider_error_code=null,
                       provider_http_status=null,updated_at=?,completed_at=?
                 where id=? and state='PROCESSANDO'
                """, Timestamp.from(now), Timestamp.from(now), reservation.operationId());
        jdbc.update("""
                insert into nite_connect.meeting_history(id,meeting_id,actor_member_id,action,meeting_version,after_snapshot,occurred_at)
                values (?,?,?,'REUNIAO_CRIADA',1,jsonb_build_object('graphEventId',?::text),?)
                """, UUID.randomUUID(), reservation.meetingId(), organizerId, created.eventId(), Timestamp.from(now));
        for (UUID inviteeId : inviteeMemberIds(reservation.meetingId())) {
            jdbc.update("""
                    insert into nite_connect.meeting_notifications(id,recipient_member_id,meeting_id,notification_type,source_key,created_at)
                    values (?,?,?,'CONVITE_RECEBIDO',?,?) on conflict (recipient_member_id,source_key) do nothing
                    """, UUID.randomUUID(), inviteeId, reservation.meetingId(),
                    "meeting-invite:" + reservation.meetingId() + ":" + inviteeId, Timestamp.from(now));
        }
    }

    @Transactional
    public Instant markCreateIndeterminate(Reservation reservation, String code, Duration retryAfter, Integer providerHttpStatus, Instant now) {
        int attempts = jdbc.queryForObject("select attempt_count from nite_connect.meeting_provider_operations where id=?", Integer.class,
                reservation.operationId());
        Duration delay = retryAfter == null ? Duration.ofSeconds(Math.min(60, 1L << Math.min(attempts, 6))) : retryAfter;
        Instant nextAttempt = now.plus(delay);
        jdbc.update("""
                update nite_connect.meeting_provider_operations
                   set state='RESULTADO_INDETERMINADO',lease_until=null,retry_after=?,provider_error_code=?,
                       provider_http_status=?,updated_at=? where id=?
                """, Timestamp.from(nextAttempt), code, providerHttpStatus, Timestamp.from(now), reservation.operationId());
        jdbc.update("update nite_connect.meetings set last_provider_error_code=?,updated_at=? where id=? and status='CRIACAO_PENDENTE'",
                code, Timestamp.from(now), reservation.meetingId());
        return nextAttempt;
    }

    @Transactional
    public void markCreateFailed(Reservation reservation, String code, Integer providerHttpStatus, Instant now) {
        jdbc.update("""
                update nite_connect.meeting_provider_operations
                   set state='FALHA_PROVEDOR',lease_until=null,retry_after=null,provider_error_code=?,
                       provider_http_status=?,updated_at=?,completed_at=? where id=?
                """, code, providerHttpStatus, Timestamp.from(now), Timestamp.from(now), reservation.operationId());
        jdbc.update("update nite_connect.meetings set status='FALHA_PROVEDOR',last_provider_error_code=?,updated_at=? where id=?",
                code, Timestamp.from(now), reservation.meetingId());
        jdbc.update("""
                insert into nite_connect.meeting_history(id,meeting_id,actor_member_id,action,meeting_version,after_snapshot,occurred_at)
                values (?,?,?,'CRIACAO_FALHOU',1,jsonb_build_object('providerCode',?::text),?)
                """, UUID.randomUUID(), reservation.meetingId(), reservation.organizerMemberId(), code, Timestamp.from(now));
    }

    public MeetingRecord requireMeetingForActor(UUID meetingId, UUID actor) {
        return jdbc.query("""
                select m.* from nite_connect.meetings m
                 where m.id=? and (m.organizer_member_id=? or exists(
                       select 1 from nite_connect.meeting_invites i where i.meeting_id=m.id and i.member_id=?
                         and i.internal_status<>'REVOGADO'))
                """, MEETING, meetingId, actor, actor).stream().findFirst().orElseThrow(ApiException::notFound);
    }

    public List<InviteRecord> invitees(UUID meetingId) {
        return jdbc.query("""
                select member_id,internal_status,calendar_response_status,internal_responded_at,version
                  from nite_connect.meeting_invites where meeting_id=? order by invited_at,member_id
                """, (rs, row) -> new InviteRecord(rs.getObject("member_id", UUID.class),
                MeetingInviteStatus.valueOf(rs.getString("internal_status")),
                CalendarResponseStatus.valueOf(rs.getString("calendar_response_status")),
                instant(rs.getTimestamp("internal_responded_at")), rs.getLong("version")), meetingId);
    }

    @Transactional
    public MutationReservation reserveMutation(UUID organizerId, UUID meetingId, String operationType,
                                               String idempotencyKey, String requestHash, String requestPayload,
                                               long expectedVersion, Instant now) {
        var priorRows = jdbc.query("""
                select o.id operation_id,o.meeting_id,o.organizer_member_id,o.graph_transaction_id,o.request_hash,o.state operation_state,
                       o.retry_after,o.lease_until,o.expected_version,m.status meeting_status,m.version,m.graph_event_id,
                       m.graph_change_key,m.join_url,m.title,m.starts_at,m.planned_duration_minutes,m.planned_ends_at,m.mode
                  from nite_connect.meeting_provider_operations o
                  join nite_connect.meetings m on m.id=o.meeting_id
                 where o.organizer_member_id=? and o.operation_type=? and o.idempotency_key=?
                 for update of o,m
                """, (rs, row) -> new MutationReservation(
                rs.getObject("meeting_id", UUID.class), rs.getObject("organizer_member_id", UUID.class),
                rs.getObject("operation_id", UUID.class), rs.getObject("graph_transaction_id", UUID.class),
                rs.getString("request_hash").trim(), rs.getString("operation_state"), rs.getString("meeting_status"),
                rs.getLong("version"), rs.getObject("expected_version") == null ? null : rs.getLong("expected_version"),
                rs.getString("graph_event_id"), rs.getString("graph_change_key"), rs.getString("join_url"),
                rs.getString("title"), rs.getTimestamp("starts_at").toInstant(), rs.getInt("planned_duration_minutes"),
                rs.getTimestamp("planned_ends_at").toInstant(), MeetingMode.valueOf(rs.getString("mode")),
                instant(rs.getTimestamp("retry_after")), instant(rs.getTimestamp("lease_until")), false),
                organizerId, operationType, idempotencyKey);
        if (!priorRows.isEmpty()) {
            MutationReservation prior = priorRows.getFirst();
            if (!prior.meetingId().equals(meetingId) || !prior.requestHash().equals(requestHash)) {
                throw ApiException.conflict("Idempotency-Key já foi usado com outro conteúdo");
            }
            if (prior.operationState().equals("CONFIRMADA")) return prior;
            if (prior.operationState().equals("PROCESSANDO") && prior.leaseUntil() != null && prior.leaseUntil().isAfter(now)) return prior;
            if (prior.operationState().equals("RESULTADO_INDETERMINADO") && prior.retryAfter() != null && prior.retryAfter().isAfter(now)) return prior;
            Instant lease = now.plus(Duration.ofMinutes(1));
            jdbc.update("""
                    update nite_connect.meeting_provider_operations
                       set state='PROCESSANDO',attempt_count=attempt_count+1,lease_until=?,retry_after=null,
                           provider_error_code=null,provider_http_status=null,updated_at=? where id=?
                    """, Timestamp.from(lease), Timestamp.from(now), prior.operationId());
            int meetingChanged = jdbc.update("""
                    update nite_connect.meetings set status='SINCRONIZACAO_PENDENTE',last_provider_error_code=null,updated_at=?
                     where id=? and version=? and status in ('AGENDADA','SINCRONIZACAO_PENDENTE')
                    """, Timestamp.from(now), prior.meetingId(), prior.expectedVersion());
            if (meetingChanged != 1) throw ApiException.conflict("Reunião alterada; consulte a versão atual antes de tentar novamente");
            return prior.forExecution(lease);
        }

        MeetingRecord current = jdbc.query("select * from nite_connect.meetings where id=? and organizer_member_id=? for update",
                MEETING, meetingId, organizerId).stream().findFirst().orElseThrow(ApiException::notFound);
        if (current.status() != MeetingStatus.AGENDADA) throw ApiException.conflict("Somente reuniões confirmadas podem ser alteradas");
        if (current.version() != expectedVersion) throw ApiException.conflict("Reunião alterada; consulte a versão atual");
        UUID operationId = UUID.randomUUID();
        UUID graphTransactionId = UUID.randomUUID();
        Instant lease = now.plus(Duration.ofMinutes(1));
        jdbc.update("""
                insert into nite_connect.meeting_provider_operations(id,meeting_id,organizer_member_id,operation_type,
                    idempotency_key,request_hash,graph_transaction_id,state,expected_version,request_payload,attempt_count,lease_until,created_at,updated_at)
                values (?,?,?,?,?,?,?,'PROCESSANDO',?,?::jsonb,1,?,?,?)
                """, operationId, meetingId, organizerId, operationType, idempotencyKey, requestHash, graphTransactionId,
                expectedVersion, requestPayload, Timestamp.from(lease), Timestamp.from(now), Timestamp.from(now));
        jdbc.update("update nite_connect.meetings set status='SINCRONIZACAO_PENDENTE',updated_at=? where id=? and version=?",
                Timestamp.from(now), meetingId, expectedVersion);
        return new MutationReservation(meetingId, organizerId, operationId, graphTransactionId, requestHash,
                "PROCESSANDO", "SINCRONIZACAO_PENDENTE", expectedVersion, expectedVersion, current.graphEventId(),
                current.graphChangeKey(), current.joinUrl(), current.title(), current.startsAt(),
                current.plannedDurationMinutes(), current.plannedEndsAt(),
                current.mode(), null, lease, true);
    }

    @Transactional
    public void completeUpdate(MutationReservation operation, String title, Instant startsAt, int duration,
                               List<UUID> inviteeIds, MeetingProvider.UpdatedMeeting updated, UUID actor, Instant now) {
        Set<UUID> previouslyInvited = invitees(operation.meetingId()).stream()
                .filter(invite -> invite.internalStatus() != MeetingInviteStatus.REVOGADO)
                .map(InviteRecord::memberId).collect(java.util.stream.Collectors.toSet());
        Instant endsAt = startsAt.plus(Duration.ofMinutes(duration));
        int changed = jdbc.update("""
                update nite_connect.meetings
                   set status='AGENDADA',title=?,starts_at=?,planned_duration_minutes=?,planned_ends_at=?,
                       graph_change_key=?,last_provider_error_code=null,version=version+1,updated_at=?
                 where id=? and organizer_member_id=? and version=? and status='SINCRONIZACAO_PENDENTE'
                """, title, Timestamp.from(startsAt), duration, Timestamp.from(endsAt), blankToNull(updated.changeKey()),
                Timestamp.from(now), operation.meetingId(), actor, operation.expectedVersion());
        if (changed != 1) throw ApiException.conflict("Reunião alterada durante a confirmação externa");
        synchronizeInvitees(operation.meetingId(), inviteeIds, now);
        jdbc.update("""
                update nite_connect.meeting_provider_operations set state='CONFIRMADA',lease_until=null,retry_after=null,
                    provider_error_code=null,updated_at=?,completed_at=? where id=? and state='PROCESSANDO'
                """, Timestamp.from(now), Timestamp.from(now), operation.operationId());
        long version = operation.expectedVersion() + 1;
        jdbc.update("""
                insert into nite_connect.meeting_history(id,meeting_id,actor_member_id,action,meeting_version,before_snapshot,after_snapshot,occurred_at)
                values (?,?,?,'REUNIAO_ALTERADA',?,jsonb_build_object('title',?::text,'startsAt',?::timestamptz,'plannedDurationMinutes',?::integer),
                        jsonb_build_object('title',?::text,'startsAt',?::timestamptz,'plannedDurationMinutes',?::integer),?)
                """, UUID.randomUUID(), operation.meetingId(), actor, version, operation.title(), Timestamp.from(operation.startsAt()),
                operation.plannedDurationMinutes(), title, Timestamp.from(startsAt), duration, Timestamp.from(now));
        List<UUID> newlyInvited = inviteeIds.stream().filter(memberId -> !previouslyInvited.contains(memberId)).toList();
        for (UUID memberId : newlyInvited) {
            jdbc.update("""
                    insert into nite_connect.meeting_notifications(id,recipient_member_id,meeting_id,notification_type,source_key,created_at)
                    values (?,?,?,'CONVITE_RECEBIDO',?,?) on conflict (recipient_member_id,source_key) do nothing
                    """, UUID.randomUUID(), memberId, operation.meetingId(),
                    "meeting-invite-update:" + operation.meetingId() + ":" + memberId + ":" + version, Timestamp.from(now));
        }
        Set<UUID> affected = new HashSet<>(previouslyInvited);
        affected.addAll(inviteeIds);
        notifyMembers(operation.meetingId(), affected, "REUNIAO_ALTERADA",
                "meeting-updated:" + operation.meetingId() + ":" + version, now);
    }

    private void synchronizeInvitees(UUID meetingId, List<UUID> inviteeIds, Instant now) {
        Set<UUID> desired = new HashSet<>(inviteeIds);
        for (InviteRecord invite : invitees(meetingId)) {
            if (!desired.contains(invite.memberId()) && invite.internalStatus() != MeetingInviteStatus.REVOGADO) {
                jdbc.update("update nite_connect.meeting_invites set internal_status='REVOGADO',revoked_at=?,version=version+1 where meeting_id=? and member_id=?",
                        Timestamp.from(now), meetingId, invite.memberId());
            } else if (desired.remove(invite.memberId()) && invite.internalStatus() == MeetingInviteStatus.REVOGADO) {
                jdbc.update("update nite_connect.meeting_invites set internal_status='PENDENTE',internal_responded_at=null,revoked_at=null,invited_at=?,version=version+1 where meeting_id=? and member_id=?",
                        Timestamp.from(now), meetingId, invite.memberId());
            } else {
                desired.remove(invite.memberId());
            }
        }
        for (UUID memberId : desired) {
            jdbc.update("insert into nite_connect.meeting_invites(id,meeting_id,member_id) values (?,?,?)",
                    UUID.randomUUID(), meetingId, memberId);
        }
    }

    @Transactional
    public void completeCancel(MutationReservation operation, UUID actor, String comment, Instant now) {
        int changed = jdbc.update("""
                update nite_connect.meetings set status='CANCELADA',last_provider_error_code=null,version=version+1,updated_at=?
                 where id=? and organizer_member_id=? and version=? and status='SINCRONIZACAO_PENDENTE'
                """, Timestamp.from(now), operation.meetingId(), actor, operation.expectedVersion());
        if (changed != 1) throw ApiException.conflict("Reunião alterada durante a confirmação externa");
        jdbc.update("""
                update nite_connect.meeting_provider_operations set state='CONFIRMADA',lease_until=null,retry_after=null,
                    provider_error_code=null,updated_at=?,completed_at=? where id=? and state='PROCESSANDO'
                """, Timestamp.from(now), Timestamp.from(now), operation.operationId());
        long version = operation.expectedVersion() + 1;
        jdbc.update("""
                insert into nite_connect.meeting_history(id,meeting_id,actor_member_id,action,meeting_version,after_snapshot,occurred_at)
                values (?,?,?,'REUNIAO_CANCELADA',?,jsonb_build_object('comment',?::text),?)
                """, UUID.randomUUID(), operation.meetingId(), actor, version, comment, Timestamp.from(now));
        notifyInvitees(operation.meetingId(), "REUNIAO_CANCELADA", "meeting-cancelled:" + operation.meetingId() + ":" + version, now);
    }

    @Transactional
    public Instant markMutationIndeterminate(MutationReservation operation, String code, Duration retryAfter,
                                             Integer providerHttpStatus, Instant now) {
        int attempts = jdbc.queryForObject("select attempt_count from nite_connect.meeting_provider_operations where id=?", Integer.class,
                operation.operationId());
        Duration delay = retryAfter == null ? Duration.ofSeconds(Math.min(60, 1L << Math.min(attempts, 6))) : retryAfter;
        Instant retryAt = now.plus(delay);
        jdbc.update("update nite_connect.meeting_provider_operations set state='RESULTADO_INDETERMINADO',lease_until=null,retry_after=?,provider_error_code=?,provider_http_status=?,updated_at=? where id=?",
                Timestamp.from(retryAt), code, providerHttpStatus, Timestamp.from(now), operation.operationId());
        return retryAt;
    }

    @Transactional
    public void markMutationFailed(MutationReservation operation, String code, Integer providerHttpStatus, Instant now) {
        jdbc.update("update nite_connect.meeting_provider_operations set state='FALHA_PROVEDOR',lease_until=null,retry_after=null,provider_error_code=?,provider_http_status=?,updated_at=?,completed_at=? where id=?",
                code, providerHttpStatus, Timestamp.from(now), Timestamp.from(now), operation.operationId());
        jdbc.update("update nite_connect.meetings set status='AGENDADA',last_provider_error_code=?,updated_at=? where id=? and status='SINCRONIZACAO_PENDENTE'",
                code, Timestamp.from(now), operation.meetingId());
        String action = operation.operationId() == null ? "OPERACAO_FALHOU"
                : jdbc.queryForObject("select operation_type from nite_connect.meeting_provider_operations where id=?", String.class,
                operation.operationId()).equals("UPDATE") ? "ATUALIZACAO_FALHOU" : "CANCELAMENTO_FALHOU";
        jdbc.update("""
                insert into nite_connect.meeting_history(id,meeting_id,actor_member_id,action,meeting_version,after_snapshot,occurred_at)
                values (?,?,?,?,?,jsonb_build_object('providerCode',?::text),?)
                """, UUID.randomUUID(), operation.meetingId(), operation.organizerMemberId(), action,
                operation.expectedVersion(), code, Timestamp.from(now));
    }

    @Transactional
    public InviteRecord respond(UUID meetingId, UUID memberId, MeetingInviteStatus response,
                                long expectedVersion, Instant now) {
        var rows = jdbc.query("""
                select i.internal_status,i.internal_responded_at,i.version,i.revoked_at,m.organizer_member_id,m.status meeting_status,m.version meeting_version
                  from nite_connect.meeting_invites i join nite_connect.meetings m on m.id=i.meeting_id
                 where i.meeting_id=? and i.member_id=? for update of i,m
                """, (rs, row) -> new InviteState(MeetingInviteStatus.valueOf(rs.getString("internal_status")),
                instant(rs.getTimestamp("internal_responded_at")), rs.getLong("version"), rs.getObject("revoked_at") != null,
                rs.getObject("organizer_member_id", UUID.class), rs.getString("meeting_status"), rs.getLong("meeting_version")), meetingId, memberId);
        InviteState current = rows.stream().findFirst().orElseThrow(ApiException::notFound);
        if (current.status() == response) return new InviteRecord(memberId, current.status(), CalendarResponseStatus.NAO_SINCRONIZADO,
                current.respondedAt(), current.version());
        if (current.revoked() || !current.meetingStatus().equals("AGENDADA")) throw ApiException.conflict("Convite indisponível para resposta");
        if (current.version() != expectedVersion) throw ApiException.conflict("Convite alterado; consulte a versão atual");
        int changed = jdbc.update("""
                update nite_connect.meeting_invites set internal_status=?,internal_responded_at=?,version=version+1
                 where meeting_id=? and member_id=? and version=? and internal_status<>'REVOGADO'
                """, response.name(), Timestamp.from(now), meetingId, memberId, expectedVersion);
        if (changed != 1) throw ApiException.conflict("Convite alterado; consulte a versão atual");
        String action = response == MeetingInviteStatus.ACEITO ? "CONVITE_ACEITO" : "CONVITE_RECUSADO";
        jdbc.update("""
                insert into nite_connect.meeting_history(id,meeting_id,actor_member_id,action,meeting_version,after_snapshot,occurred_at)
                values (?,?,?,?,?,jsonb_build_object('response',?::text,'inviteVersion',?::bigint),?)
                """, UUID.randomUUID(), meetingId, memberId, action, current.meetingVersion(), response.name(),
                expectedVersion + 1, Timestamp.from(now));
        jdbc.update("""
                insert into nite_connect.meeting_notifications(id,recipient_member_id,meeting_id,notification_type,source_key,created_at)
                values (?,?,?, ?,?,?) on conflict (recipient_member_id,source_key) do nothing
                """, UUID.randomUUID(), current.organizerId(), meetingId, action,
                "meeting-response:" + meetingId + ":" + memberId + ":" + (expectedVersion + 1), Timestamp.from(now));
        return new InviteRecord(memberId, response, CalendarResponseStatus.NAO_SINCRONIZADO, now, expectedVersion + 1);
    }

    public PageResult<UUID> listMeetingIds(UUID actor, String scope, Instant now, int page, int size) {
        PageResult.validate(page, size);
        String dateFilter = scope.equals("upcoming") ? "m.planned_ends_at >= ?" : "m.planned_ends_at < ?";
        String relation = "(m.organizer_member_id=? or exists(select 1 from nite_connect.meeting_invites i where i.meeting_id=m.id and i.member_id=? and i.internal_status<>'REVOGADO'))";
        String where = " from nite_connect.meetings m where m.status in ('AGENDADA','CANCELADA','SINCRONIZACAO_PENDENTE') and " + relation + " and " + dateFilter;
        long total = jdbc.queryForObject("select count(*)" + where, Long.class, actor, actor, Timestamp.from(now));
        List<UUID> items = jdbc.query("select m.id" + where + " order by m.starts_at " + (scope.equals("upcoming") ? "asc" : "desc")
                        + ",m.id limit ? offset ?", (rs, row) -> rs.getObject(1, UUID.class), actor, actor, Timestamp.from(now), size, (long) page * size);
        return new PageResult<>(items, page, size, total);
    }

    public String requireJoinUrl(UUID meetingId, UUID actor) {
        MeetingRecord meeting = requireMeetingForActor(meetingId, actor);
        if (meeting.status() != MeetingStatus.AGENDADA || meeting.joinUrl() == null) throw ApiException.conflict("Link de reunião indisponível");
        return meeting.joinUrl();
    }

    @Transactional(readOnly = true)
    public PageResult<NotificationRecord> notifications(UUID actor, int page, int size) {
        PageResult.validate(page, size);
        long total = jdbc.queryForObject("select count(*) from nite_connect.meeting_notifications where recipient_member_id=?", Long.class, actor);
        List<NotificationRecord> items = jdbc.query("""
                select n.id,n.meeting_id,n.notification_type,n.created_at,n.read_at,m.title,m.starts_at
                  from nite_connect.meeting_notifications n join nite_connect.meetings m on m.id=n.meeting_id
                 where n.recipient_member_id=? order by n.created_at desc,n.id limit ? offset ?
                """, (rs, row) -> new NotificationRecord(rs.getObject("id", UUID.class), rs.getObject("meeting_id", UUID.class),
                rs.getString("notification_type"), rs.getString("title"), rs.getTimestamp("starts_at").toInstant(),
                rs.getTimestamp("created_at").toInstant(), instant(rs.getTimestamp("read_at"))), actor, size, (long) page * size);
        return new PageResult<>(items, page, size, total);
    }

    @Transactional
    public void markNotificationRead(UUID notificationId, UUID actor, Instant now) {
        int changed = jdbc.update("update nite_connect.meeting_notifications set read_at=? where id=? and recipient_member_id=? and read_at is null",
                Timestamp.from(now), notificationId, actor);
        if (changed == 0 && jdbc.queryForObject("select count(*) from nite_connect.meeting_notifications where id=? and recipient_member_id=?",
                Long.class, notificationId, actor) == 0) throw ApiException.notFound();
    }

    public AttendanceRecord attendance(UUID meetingId, UUID actor) {
        MeetingRecord meeting = requireMeetingForActor(meetingId, actor);
        if (!meeting.organizerMemberId().equals(actor)) throw ApiException.notFound();
        var reports = jdbc.query("select availability_status,actual_starts_at,actual_ends_at,actual_duration_seconds,retrieved_at from nite_connect.meeting_attendance_reports where meeting_id=?",
                (rs, row) -> new AttendanceRecord(rs.getString("availability_status"), instant(rs.getTimestamp("actual_starts_at")),
                        instant(rs.getTimestamp("actual_ends_at")), (Long) rs.getObject("actual_duration_seconds"),
                        instant(rs.getTimestamp("retrieved_at")), List.of()), meetingId);
        if (reports.isEmpty()) return new AttendanceRecord("INDISPONIVEL", null, null, null, null, List.of());
        AttendanceRecord report = reports.getFirst();
        if (!report.availabilityStatus().equals("DISPONIVEL")) return report;
        List<AttendanceParticipant> records = jdbc.query("""
                select a.member_id,a.attendance_seconds,m.name from nite_connect.meeting_attendance_records a
                  left join nite_connect.members m on m.id=a.member_id
                 where a.report_id=(select id from nite_connect.meeting_attendance_reports where meeting_id=?)
                 order by m.name nulls last,a.graph_record_id
                """, (rs, row) -> new AttendanceParticipant((UUID) rs.getObject("member_id"), rs.getString("name"),
                (Long) rs.getObject("attendance_seconds")), meetingId);
        return new AttendanceRecord(report.availabilityStatus(), report.actualStartsAt(), report.actualEndsAt(),
                report.actualDurationSeconds(), report.retrievedAt(), records);
    }

    @Transactional
    public void markAttendanceStatus(UUID meetingId, UUID actor, String status, Instant now) {
        jdbc.update("""
                insert into nite_connect.meeting_attendance_reports(id,meeting_id,availability_status,retrieved_at)
                values (?,?,?,?) on conflict (meeting_id) do update
                    set availability_status=case when nite_connect.meeting_attendance_reports.availability_status='DISPONIVEL'
                                                 then 'DISPONIVEL' else excluded.availability_status end,
                        retrieved_at=excluded.retrieved_at
                """, UUID.randomUUID(), meetingId, status, Timestamp.from(now));
    }

    @Transactional
    public void saveAttendanceReport(UUID meetingId, UUID actor, String graphReportId, Instant startsAt,
                                     Instant endsAt, Long durationSeconds, List<AttendanceInput> records, Instant now) {
        UUID reportId = UUID.randomUUID();
        jdbc.update("""
                insert into nite_connect.meeting_attendance_reports(id,meeting_id,graph_report_id,availability_status,
                    actual_starts_at,actual_ends_at,actual_duration_seconds,retrieved_at)
                values (?,?,?,'DISPONIVEL',?,?,?,?) on conflict (meeting_id) do update set
                    graph_report_id=excluded.graph_report_id,availability_status='DISPONIVEL',actual_starts_at=excluded.actual_starts_at,
                    actual_ends_at=excluded.actual_ends_at,actual_duration_seconds=excluded.actual_duration_seconds,retrieved_at=excluded.retrieved_at
                """, reportId, meetingId, graphReportId, timestamp(startsAt), timestamp(endsAt), durationSeconds, Timestamp.from(now));
        UUID savedReportId = jdbc.queryForObject("select id from nite_connect.meeting_attendance_reports where meeting_id=?", UUID.class, meetingId);
        jdbc.update("delete from nite_connect.meeting_attendance_intervals where attendance_record_id in (select id from nite_connect.meeting_attendance_records where report_id=?)",
                savedReportId);
        jdbc.update("delete from nite_connect.meeting_attendance_records where report_id=?", savedReportId);
        for (AttendanceInput record : records) {
            UUID recordId = UUID.randomUUID();
            jdbc.update("""
                    insert into nite_connect.meeting_attendance_records(id,report_id,graph_record_id,member_id,attendance_seconds)
                    values (?,?,?,?,?)
                    """, recordId, savedReportId, record.graphRecordId(), record.memberId(), record.attendanceSeconds());
            for (AttendanceIntervalInput interval : record.intervals()) {
                jdbc.update("insert into nite_connect.meeting_attendance_intervals(id,attendance_record_id,joined_at,left_at) values (?,?,?,?)",
                        UUID.randomUUID(), recordId, timestamp(interval.joinedAt()), timestamp(interval.leftAt()));
            }
        }
        jdbc.update("""
                insert into nite_connect.meeting_history(id,meeting_id,actor_member_id,action,meeting_version,after_snapshot,occurred_at)
                select ?,m.id,?,'RELATORIO_PRESENCA_IMPORTADO',m.version,jsonb_build_object('reportId',?::text,'recordCount',?::integer),?
                  from nite_connect.meetings m where m.id=?
                """, UUID.randomUUID(), actor, graphReportId, records.size(), Timestamp.from(now), meetingId);
        jdbc.update("""
                insert into nite_connect.meeting_notifications(id,recipient_member_id,meeting_id,notification_type,source_key,created_at)
                values (?,?,?,'RELATORIO_DE_PRESENCA_DISPONIVEL',?,?) on conflict (recipient_member_id,source_key) do nothing
                """, UUID.randomUUID(), actor, meetingId, "attendance-report:" + meetingId + ":" + graphReportId, Timestamp.from(now));
    }

    private void notifyInvitees(UUID meetingId, String type, String sourceKey, Instant now) {
        jdbc.update("""
                insert into nite_connect.meeting_notifications(id,recipient_member_id,meeting_id,notification_type,source_key,created_at)
                select gen_random_uuid(),member_id,?, ?, ?,? from nite_connect.meeting_invites
                 where meeting_id=? and internal_status<>'REVOGADO'
                on conflict (recipient_member_id,source_key) do nothing
                """, meetingId, type, sourceKey, Timestamp.from(now), meetingId);
    }

    private void notifyMembers(UUID meetingId, Set<UUID> members, String type, String sourceKey, Instant now) {
        for (UUID member : members) {
            jdbc.update("""
                    insert into nite_connect.meeting_notifications(id,recipient_member_id,meeting_id,notification_type,source_key,created_at)
                    values (?,?,?,?,?,?) on conflict (recipient_member_id,source_key) do nothing
                    """, UUID.randomUUID(), member, meetingId, type, sourceKey, Timestamp.from(now));
        }
    }

    private static Timestamp timestamp(Instant value) { return value == null ? null : Timestamp.from(value); }

    public record Reservation(UUID meetingId, UUID organizerMemberId, UUID operationId, UUID graphTransactionId, String requestHash,
                              String operationState, String meetingStatus, String mode, String title,
                              Instant startsAt, int plannedDurationMinutes, Instant plannedEndsAt,
                              Instant createdAt, Instant leaseUntil, Instant retryAfter, boolean execute) { }

    public record MeetingRecord(UUID id, UUID organizerMemberId, MeetingMode mode, MeetingStatus status,
                                String title, Instant startsAt, int plannedDurationMinutes, Instant plannedEndsAt,
                                Instant actualStartsAt, Instant actualEndsAt, Long actualDurationSeconds,
                                String graphEventId, String graphOnlineMeetingId, String joinUrl, String graphChangeKey,
                                long version, Instant createdAt, Instant updatedAt) { }

    public record InviteRecord(UUID memberId, MeetingInviteStatus internalStatus,
                               CalendarResponseStatus calendarResponseStatus, Instant respondedAt, long version) { }
    public record MutationReservation(UUID meetingId, UUID organizerMemberId, UUID operationId, UUID graphTransactionId,
                                     String requestHash, String operationState, String meetingStatus, long currentVersion,
                                     Long expectedVersion, String graphEventId, String graphChangeKey, String joinUrl,
                                     String title, Instant startsAt, int plannedDurationMinutes, Instant plannedEndsAt,
                                     MeetingMode mode, Instant retryAfter, Instant leaseUntil, boolean execute) {
        MutationReservation forExecution(Instant lease) {
            return new MutationReservation(meetingId, organizerMemberId, operationId, graphTransactionId, requestHash,
                    "PROCESSANDO", meetingStatus, currentVersion, expectedVersion, graphEventId, graphChangeKey, joinUrl,
                    title, startsAt, plannedDurationMinutes, plannedEndsAt, mode, null, lease, true);
        }
    }
    private record InviteState(MeetingInviteStatus status, Instant respondedAt, long version, boolean revoked,
                               UUID organizerId, String meetingStatus, long meetingVersion) { }
    public record NotificationRecord(UUID id, UUID meetingId, String type, String title, Instant startsAt,
                                     Instant createdAt, Instant readAt) { }
    public record AttendanceParticipant(UUID memberId, String name, Long attendanceSeconds) { }
    public record AttendanceRecord(String availabilityStatus, Instant actualStartsAt, Instant actualEndsAt,
                                   Long actualDurationSeconds, Instant retrievedAt, List<AttendanceParticipant> participants) {
        public AttendanceRecord { participants = List.copyOf(participants); }
    }
    public record AttendanceInput(String graphRecordId, UUID memberId, Long attendanceSeconds,
                                  List<AttendanceIntervalInput> intervals) {
        public AttendanceInput { intervals = List.copyOf(intervals); }
    }
    public record AttendanceIntervalInput(Instant joinedAt, Instant leftAt) { }

    private List<UUID> inviteeMemberIds(UUID meetingId) {
        return jdbc.query("select member_id from nite_connect.meeting_invites where meeting_id=? order by member_id",
                (rs, row) -> rs.getObject(1, UUID.class), meetingId);
    }

    private static final RowMapper<MeetingRecord> MEETING = (rs, row) -> new MeetingRecord(
            rs.getObject("id", UUID.class), rs.getObject("organizer_member_id", UUID.class),
            MeetingMode.valueOf(rs.getString("mode")), MeetingStatus.valueOf(rs.getString("status")),
            rs.getString("title"), rs.getTimestamp("starts_at").toInstant(), rs.getInt("planned_duration_minutes"),
            rs.getTimestamp("planned_ends_at").toInstant(), instant(rs.getTimestamp("actual_starts_at")),
            instant(rs.getTimestamp("actual_ends_at")), (Long) rs.getObject("actual_duration_seconds"),
            rs.getString("graph_event_id"), rs.getString("graph_online_meeting_id"), rs.getString("join_url"),
            rs.getString("graph_change_key"), rs.getLong("version"), rs.getTimestamp("created_at").toInstant(),
            rs.getTimestamp("updated_at").toInstant());

    private static Instant instant(Timestamp value) { return value == null ? null : value.toInstant(); }
    private static String blankToNull(String value) { return value == null || value.isBlank() ? null : value; }
}
