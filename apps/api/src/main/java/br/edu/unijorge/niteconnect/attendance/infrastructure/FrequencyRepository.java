package br.edu.unijorge.niteconnect.attendance.infrastructure;

import br.edu.unijorge.niteconnect.attendance.domain.Agenda.Event;
import br.edu.unijorge.niteconnect.attendance.domain.Agenda.EventStatus;
import br.edu.unijorge.niteconnect.attendance.domain.Frequency.*;
import br.edu.unijorge.niteconnect.attendance.domain.FrequencyRules;
import br.edu.unijorge.niteconnect.attendance.domain.Agenda.EventKind;
import br.edu.unijorge.niteconnect.attendance.domain.Agenda.Modality;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static br.edu.unijorge.niteconnect.attendance.infrastructure.AttendanceRepository.ts;

@Repository
public class FrequencyRepository {
    private final JdbcTemplate jdbc;

    public FrequencyRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private static Instant instant(ResultSet result, String column) throws SQLException {
        Timestamp value = result.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private static UUID uuid(ResultSet result, String column) throws SQLException {
        return result.getObject(column, UUID.class);
    }

    public static final RowMapper<ListSnapshot> LIST = (r, i) -> new ListSnapshot(
            uuid(r, "id"), uuid(r, "calendar_event_id"), r.getString("meeting_name"),
            Classification.valueOf(r.getString("classification")), r.getBoolean("counts_for_frequency"),
            r.getInt("confirmation_window_minutes"), instant(r, "confirmation_deadline"), instant(r, "opened_at"),
            new OpenedBy(uuid(r, "opened_by"), r.getString("opened_by_name"), r.getString("opened_by_role")),
            instant(r, "closed_at"), uuid(r, "closed_by"), ListStatus.valueOf(r.getString("status")),
            r.getString("outcome") == null ? null : Outcome.valueOf(r.getString("outcome")),
            r.getString("qr_token_hash"), instant(r, "qr_expires_at"), r.getInt("qr_version"), r.getLong("version"));

    public static final RowMapper<Participant> PARTICIPANT = (r, i) -> new Participant(
            uuid(r, "member_id"), r.getString("display_name"), r.getString("stored_status"),
            instant(r, "confirmed_at"), instant(r, "changed_at"), uuid(r, "changed_by"),
            r.getString("reason"), r.getLong("version"));

    public static final RowMapper<QrToken> QR_TOKEN = (r, i) -> new QrToken(
            r.getString("token_hash"), uuid(r, "list_id"), r.getInt("qr_version"),
            instant(r, "issued_at"), instant(r, "expires_at"), instant(r, "revoked_at"));

    public static final RowMapper<HandoffData> HANDOFF = (r, i) -> new HandoffData(
            r.getString("handoff_hash"), uuid(r, "list_id"), r.getString("token_hash"), r.getInt("qr_version"),
            instant(r, "expires_at"), instant(r, "consumed_at"), uuid(r, "consumed_by"));

    private static final String LIST_FROM = """
            from nite_connect.attendance_lists l
            join nite_connect.members opener on opener.id=l.opened_by
            """;
    private static final String LIST_COLUMNS = """
            l.*, opener.name as opened_by_name,
            coalesce((select ra.role from nite_connect.role_assignments ra
                      where ra.member_id=l.opened_by order by ra.role limit 1),'INTEGRANTE') as opened_by_role
            """;

    public Event lockEvent(UUID id) {
        return jdbc.query("select * from nite_connect.calendar_events where id=? for update",
                AttendanceRepository.EVENT, id).stream().findFirst().orElseThrow(ApiException::notFound);
    }

    public Event event(UUID id) {
        return jdbc.query("select * from nite_connect.calendar_events where id=?", AttendanceRepository.EVENT, id)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }

    public Event insertQuickEvent(UUID id, String title, EventKind kind, Modality modality, Instant startsAt, UUID actor) {
        jdbc.update("""
                insert into nite_connect.calendar_events
                    (id,title,description,kind,modality,starts_at,ends_at,status,created_by,frequency_quick)
                values (?,?,?, ?, ?, ?, null, 'ABERTO', ?, true)
                """, id, title, "", kind.name(), modality.name(), ts(startsAt), actor);
        return event(id);
    }

    public void openExistingEvent(UUID id, long expectedVersion) {
        changed(jdbc.update("""
                update nite_connect.calendar_events
                   set status='ABERTO',qr_hash=null,qr_expires_at=null,version=version+1
                 where id=? and version=? and status='AGENDADO'
                """, id, expectedVersion));
    }

    public Event closeEvent(UUID id, long expectedVersion, EventStatus status, Instant closedAt) {
        changed(jdbc.update("""
                update nite_connect.calendar_events
                   set status=?,qr_hash=null,qr_expires_at=null,
                       ends_at=case when frequency_quick and ends_at is null then ? else ends_at end,
                       version=version+1
                 where id=? and version=?
                """, status.name(), ts(closedAt), id, expectedVersion));
        return event(id);
    }

    public void insertList(UUID id, UUID eventId, String meetingName, Classification classification,
                           boolean countsForFrequency, int windowMinutes, Instant deadline, Instant openedAt,
                           UUID openedBy, String idempotencyKey, String requestHash) {
        jdbc.update("""
                insert into nite_connect.attendance_lists
                    (id,calendar_event_id,meeting_name,classification,counts_for_frequency,
                     confirmation_window_minutes,confirmation_deadline,opened_at,opened_by,
                     idempotency_key,request_hash)
                values (?,?,?,?,?,?,?,?,?,?,?)
                """, id, eventId, meetingName, classification.name(), countsForFrequency, windowMinutes,
                ts(deadline), ts(openedAt), openedBy, idempotencyKey, requestHash);
    }

    public void insertListMember(UUID listId, UUID memberId, String displayName, Instant capturedAt, String sortKey) {
        jdbc.update("""
                insert into nite_connect.attendance_list_members
                    (list_id,member_id,display_name,eligibility_status,captured_at,sort_key)
                values (?,?,?,'ATIVO',?,?)
                """, listId, memberId, displayName, ts(capturedAt), sortKey);
    }

    public ListSnapshot list(UUID id, boolean lock) {
        String sql = "select " + LIST_COLUMNS + LIST_FROM + " where l.id=?" + (lock ? " for update of l" : "");
        return jdbc.query(sql, LIST, id).stream().findFirst().orElseThrow(ApiException::notFound);
    }

    public Optional<ListSnapshot> listByEvent(UUID eventId, boolean lock) {
        String sql = "select " + LIST_COLUMNS + LIST_FROM + " where l.calendar_event_id=?" + (lock ? " for update of l" : "");
        return jdbc.query(sql, LIST, eventId).stream().findFirst();
    }

    public Optional<ListSnapshot> listByIdempotency(UUID actor, String key) {
        return jdbc.query("select " + LIST_COLUMNS + LIST_FROM + " where l.opened_by=? and l.idempotency_key=?",
                LIST, actor, key).stream().findFirst();
    }

    public String requestHash(UUID listId) {
        return jdbc.queryForObject("select request_hash from nite_connect.attendance_lists where id=?", String.class, listId);
    }

    public boolean listExistsForEvent(UUID eventId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "select exists(select 1 from nite_connect.attendance_lists where calendar_event_id=?)", Boolean.class, eventId));
    }

    public long countAttendance(UUID eventId) {
        return jdbc.queryForObject("select count(*) from nite_connect.attendance_records where event_id=?", Long.class, eventId);
    }

    public void updateListQr(UUID listId, long expectedVersion, String hash, Instant expiresAt, int qrVersion) {
        changed(jdbc.update("""
                update nite_connect.attendance_lists
                   set qr_token_hash=?,qr_expires_at=?,qr_version=?,version=version+1
                 where id=? and version=? and status='ABERTA'
                """, hash, ts(expiresAt), qrVersion, listId, expectedVersion));
    }

    public void updateListFinal(UUID listId, long expectedVersion, ListStatus status, Outcome outcome,
                                Instant closedAt, UUID closedBy) {
        changed(jdbc.update("""
                update nite_connect.attendance_lists
                   set status=?,outcome=?,closed_at=?,closed_by=?,qr_token_hash=null,qr_expires_at=null,version=version+1
                 where id=? and version=?
                """, status.name(), outcome.name(), ts(closedAt), closedBy, listId, expectedVersion));
    }

    public void incrementVersion(UUID listId, long expectedVersion) {
        changed(jdbc.update("update nite_connect.attendance_lists set version=version+1 where id=? and version=?",
                listId, expectedVersion));
    }

    public void updateMember(UUID listId, UUID memberId, long expectedVersion, ParticipantStatus status,
                             UUID attendanceId, Instant confirmedAt, Instant changedAt, UUID changedBy, String reason) {
        changed(jdbc.update("""
                update nite_connect.attendance_list_members
                   set status=?,attendance_id=?,confirmed_at=?,changed_at=?,changed_by=?,reason=?,version=version+1
                 where list_id=? and member_id=? and version=?
                """, status.name(), attendanceId, ts(confirmedAt), ts(changedAt), changedBy, reason,
                listId, memberId, expectedVersion));
    }

    public void markWaitingAsAbsent(UUID listId, UUID memberId, long memberVersion, Instant changedAt, UUID changedBy,
                                    String reason) {
        updateMember(listId, memberId, memberVersion, ParticipantStatus.AUSENTE, null, null, changedAt, changedBy, reason);
    }

    public Optional<Participant> participant(UUID listId, UUID memberId) {
        return jdbc.query("""
                select member_id,display_name,status as stored_status,confirmed_at,changed_at,changed_by,reason,version
                  from nite_connect.attendance_list_members where list_id=? and member_id=?
                """, PARTICIPANT, listId, memberId).stream().findFirst();
    }

    public ParticipantQueryPage participants(UUID listId, String displayedStatus, String name, int page, int size) {
        PageResult.validate(page, size);
        String search = name == null || name.isBlank() ? null : FrequencyRules.sortKey(name);
        String sql = """
                with all_members as (
                    select lm.member_id,lm.display_name,lm.sort_key,lm.status as stored_status,
                           lm.confirmed_at,lm.changed_at,lm.changed_by,lm.reason,lm.version,
                           case when (l.status='CONCLUIDA' and l.outcome<>'REALIZADA_CONTABILIZAVEL' or l.status='CANCELADA')
                                     and lm.status in ('AGUARDANDO','AUSENTE') then 'FORA_DA_APURACAO'
                                else lm.status end as displayed_status
                      from nite_connect.attendance_list_members lm
                      join nite_connect.attendance_lists l on l.id=lm.list_id
                     where lm.list_id=?
                ), list_counts as (
                    select count(*) as roster_total,
                           count(*) filter (where displayed_status='PRESENTE') as present,
                           count(*) filter (where displayed_status='JUSTIFICADO') as justified,
                           count(*) filter (where displayed_status='AUSENTE') as absent,
                           count(*) filter (where displayed_status='AGUARDANDO') as awaiting_confirmation,
                           count(*) filter (where displayed_status='FORA_DA_APURACAO') as outside_apuration
                      from all_members
                ), filtered as (
                    select * from all_members
                     where (cast(? as text) is null or displayed_status=?)
                       and (cast(? as text) is null or position(? in sort_key)>0)
                ), filtered_total as (
                    select count(*) as total from filtered
                ), page_rows as (
                    select * from filtered order by sort_key,display_name,member_id limit ? offset ?
                )
                select p.member_id,p.display_name,p.stored_status,p.confirmed_at,p.changed_at,p.changed_by,p.reason,p.version,
                       c.roster_total,c.present,c.justified,c.absent,c.awaiting_confirmation,c.outside_apuration,
                       f.total as filtered_total,(select count(*) from page_rows) as page_count
                  from list_counts c cross join filtered_total f
                  left join page_rows p on true
                 order by p.sort_key nulls last,p.display_name nulls last,p.member_id nulls last
                """;
        List<ParticipantQueryRow> rows = jdbc.query(sql, (r, i) -> new ParticipantQueryRow(
                r.getObject("member_id") == null ? null : PARTICIPANT.mapRow(r, i),
                new ParticipantCounts(r.getLong("roster_total"), r.getLong("present"), r.getLong("justified"),
                        r.getLong("absent"), r.getLong("awaiting_confirmation"), r.getLong("outside_apuration")),
                r.getLong("filtered_total"), r.getInt("page_count")),
                listId, displayedStatus, displayedStatus, search, search, size, (long) page * size);
        ParticipantQueryRow metadata = rows.getFirst();
        return new ParticipantQueryPage(rows.stream().map(ParticipantQueryRow::participant)
                .filter(java.util.Objects::nonNull).toList(), page, size, metadata.total(), metadata.pageCount(), metadata.counts());
    }

    public List<PersonalOpenList> personalOpenLists(UUID memberId, Instant now) {
        return jdbc.query("""
                select l.id as list_id,l.calendar_event_id,l.meeting_name,l.classification,e.starts_at as scheduled_at,
                       l.opened_at,l.confirmation_deadline,l.qr_expires_at,
                       case when l.confirmation_deadline>? then 'ABERTA' else 'EXPIRADA' end as confirmation_window_status,
                       (lm.member_id is not null) as eligible,
                       case when lm.member_id is null then 'NAO_ELEGIVEL'
                            when lm.status='PRESENTE' then 'PRESENCA_REGISTRADA'
                            when lm.status='JUSTIFICADO' then 'JUSTIFICADO'
                            else 'AGUARDANDO_CONFIRMACAO' end as participant_status,
                       lm.confirmed_at,
                       coalesce(lm.status='AGUARDANDO' and l.confirmation_deadline>? and l.qr_expires_at>?
                         and exists(select 1 from nite_connect.attendance_list_qr_tokens q
                                     where q.list_id=l.id and q.token_hash=l.qr_token_hash and q.qr_version=l.qr_version
                                       and q.revoked_at is null and q.expires_at>?),false) as confirmation_available
                  from nite_connect.attendance_lists l
                  join nite_connect.calendar_events e on e.id=l.calendar_event_id
                  left join nite_connect.attendance_list_members lm on lm.list_id=l.id and lm.member_id=?
                 where l.status='ABERTA'
                 order by l.opened_at desc,l.id desc
                """, (r, i) -> new PersonalOpenList(uuid(r, "list_id"), uuid(r, "calendar_event_id"),
                r.getString("meeting_name"), Classification.valueOf(r.getString("classification")),
                instant(r, "scheduled_at"), instant(r, "opened_at"), instant(r, "confirmation_deadline"),
                instant(r, "qr_expires_at"), ConfirmationWindowStatus.valueOf(r.getString("confirmation_window_status")),
                r.getBoolean("eligible"), PersonalConfirmationStatus.valueOf(r.getString("participant_status")),
                instant(r, "confirmed_at"), r.getBoolean("confirmation_available")),
                ts(now), ts(now), ts(now), ts(now), memberId);
    }

    public PageResult<ListSnapshot> lists(LocalDate fromDate, LocalDate toDate, String status, int page, int size) {
        var args = new ArrayList<Object>();
        String where = " where true";
        if (fromDate != null) { where += " and l.opened_at>=?"; args.add(ts(br.edu.unijorge.niteconnect.attendance.domain.FrequencyRules.startOf(fromDate))); }
        if (toDate != null) { where += " and l.opened_at<?"; args.add(ts(br.edu.unijorge.niteconnect.attendance.domain.FrequencyRules.endExclusive(toDate))); }
        if (status != null) { where += " and l.status=?"; args.add(status); }
        return page(LIST_COLUMNS, LIST_FROM + where, args, "l.opened_at desc,l.id", LIST, page, size);
    }

    public void insertListEvent(UUID id, UUID listId, UUID memberId, UUID actorId, String action,
                                long listVersion, Long memberVersion, String before, String after, String reason) {
        jdbc.update("""
                insert into nite_connect.attendance_list_events
                    (id,list_id,member_id,actor_id,action,list_version,member_version,before_value,after_value,reason)
                values (?,?,?,?,?,?,?,?,?,?)
                """, id, listId, memberId, actorId, action, listVersion, memberVersion, before, after, reason);
    }

    public List<ListUpdate> updates(UUID listId, long afterVersion) {
        ListSnapshot snapshot = list(listId, false);
        var events = jdbc.query("""
                select list_version,action,occurred_at from nite_connect.attendance_list_events
                 where list_id=? and list_version>? order by list_version,id
                """, (r, i) -> new ListUpdate(r.getLong("list_version"), snapshot.status(), snapshot.qrVersion(),
                snapshot.qrExpiresAt(), r.getString("action"), instant(r, "occurred_at")), listId, afterVersion);
        if (!events.isEmpty()) return events;
        return List.of(new ListUpdate(snapshot.version(), snapshot.status(), snapshot.qrVersion(), snapshot.qrExpiresAt(), null, null));
    }

    public boolean hasFinalization(UUID listId, long listVersion, UUID actor, Outcome outcome, String reason) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(
                    select 1 from nite_connect.attendance_list_events
                     where list_id=? and list_version=? and actor_id=? and action='LIST_FINALIZED'
                       and reason=? and (after_value::jsonb ->> 'outcome')=?
                )
                """, Boolean.class, listId, listVersion, actor, reason, outcome.name()));
    }

    public boolean hasHandoffReplay(String handoffHash, UUID actor) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(
                    select 1 from nite_connect.attendance_list_events
                     where member_id=? and action in ('PRESENCE_CONFIRMED','PRESENCE_CONFIRMATION_REPLAYED')
                       and (after_value::jsonb ->> 'handoffHash')=?
                )
                """, Boolean.class, actor, handoffHash));
    }

    public Optional<UUID> handoffReplayList(String handoffHash, UUID actor) {
        return jdbc.query("""
                select list_id from nite_connect.attendance_list_events
                 where member_id=? and action in ('PRESENCE_CONFIRMED','PRESENCE_CONFIRMATION_REPLAYED')
                   and (after_value::jsonb ->> 'handoffHash')=?
                 order by occurred_at desc,id desc limit 1
                """, (r, i) -> uuid(r, "list_id"), actor, handoffHash).stream().findFirst();
    }

    public int deleteExpiredHandoffsBefore(Instant retentionCutoff, int batchSize) {
        return jdbc.update("""
                delete from nite_connect.frequency_qr_handoffs
                 where handoff_hash in (
                     select handoff_hash from nite_connect.frequency_qr_handoffs
                      where expires_at<?
                      order by expires_at, handoff_hash
                      limit ?
                      for update skip locked
                 )
                """, ts(retentionCutoff), batchSize);
    }

    public void insertQrToken(String hash, UUID listId, int qrVersion, Instant issuedAt, Instant expiresAt) {
        jdbc.update("""
                insert into nite_connect.attendance_list_qr_tokens(token_hash,list_id,qr_version,issued_at,expires_at)
                values (?,?,?,?,?)
                """, hash, listId, qrVersion, ts(issuedAt), ts(expiresAt));
    }

    public void revokeQrTokens(UUID listId, Instant revokedAt) {
        jdbc.update("update nite_connect.attendance_list_qr_tokens set revoked_at=? where list_id=? and revoked_at is null",
                ts(revokedAt), listId);
    }

    public Optional<QrToken> qrToken(String hash, boolean lock) {
        return jdbc.query("select * from nite_connect.attendance_list_qr_tokens where token_hash=?" + (lock ? " for update" : ""),
                QR_TOKEN, hash).stream().findFirst();
    }

    public boolean currentQr(UUID listId, String hash, int version, Instant now) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(
                    select 1 from nite_connect.attendance_lists l
                    join nite_connect.attendance_list_qr_tokens q on q.list_id=l.id and q.token_hash=l.qr_token_hash
                    where l.id=? and l.status='ABERTA' and l.qr_token_hash=? and l.qr_version=?
                      and q.qr_version=? and q.revoked_at is null and q.expires_at>? and l.confirmation_deadline>?
                )
                """, Boolean.class, listId, hash, version, version, ts(now), ts(now)));
    }

    public void insertHandoff(String hash, UUID listId, String tokenHash, int qrVersion, Instant expiresAt) {
        jdbc.update("""
                insert into nite_connect.frequency_qr_handoffs
                    (handoff_hash,list_id,token_hash,qr_version,expires_at)
                values (?,?,?,?,?)
                """, hash, listId, tokenHash, qrVersion, ts(expiresAt));
    }

    public Optional<HandoffData> handoff(String hash, boolean lock) {
        return jdbc.query("select * from nite_connect.frequency_qr_handoffs where handoff_hash=?" + (lock ? " for update" : ""),
                HANDOFF, hash).stream().findFirst();
    }

    public void consumeHandoff(String hash, UUID memberId, Instant consumedAt) {
        changed(jdbc.update("""
                update nite_connect.frequency_qr_handoffs set consumed_at=?,consumed_by=?
                 where handoff_hash=? and consumed_at is null
                """, ts(consumedAt), memberId, hash));
    }

    public Optional<AttendanceRef> attendanceForList(UUID listId, UUID memberId) {
        return jdbc.query("""
                select a.id,a.event_id,a.member_id,a.version,a.created_at
                  from nite_connect.attendance_lists l
                  join nite_connect.attendance_records a on a.event_id=l.calendar_event_id and a.member_id=?
                 where l.id=?
                """, (r, i) -> new AttendanceRef(uuid(r, "id"), uuid(r, "event_id"), uuid(r, "member_id"),
                r.getLong("version"), instant(r, "created_at")), memberId, listId).stream().findFirst();
    }

    public Optional<AttendanceRef> attendance(UUID id) {
        return jdbc.query("select id,event_id,member_id,version,created_at from nite_connect.attendance_records where id=?",
                (r, i) -> new AttendanceRef(uuid(r, "id"), uuid(r, "event_id"), uuid(r, "member_id"),
                        r.getLong("version"), instant(r, "created_at")), id).stream().findFirst();
    }

    public Optional<ConfirmationEvidence> confirmationEvidence(UUID attendanceId) {
        return jdbc.query("""
                select a.id as attendance_id,a.member_id,a.event_id,a.version as attendance_version,a.created_at,
                       l.id as list_id,l.version as list_version,l.status as list_status,l.outcome,
                       lm.version as member_version,lm.status as participant_status,
                       e.title,e.kind,e.modality,e.status as event_status,e.starts_at
                  from nite_connect.attendance_records a
                  join nite_connect.attendance_lists l on l.calendar_event_id=a.event_id
                  join nite_connect.attendance_list_members lm on lm.list_id=l.id and lm.member_id=a.member_id
                       and lm.attendance_id=a.id
                  join nite_connect.calendar_events e on e.id=a.event_id
                 where a.id=?
                """, (r, i) -> new ConfirmationEvidence(uuid(r, "attendance_id"), uuid(r, "member_id"),
                uuid(r, "event_id"), r.getLong("attendance_version"), instant(r, "created_at"),
                uuid(r, "list_id"), r.getLong("list_version"), r.getString("list_status"), r.getString("outcome"),
                r.getLong("member_version"), r.getString("participant_status"), r.getString("title"),
                r.getString("kind"), r.getString("modality"), r.getString("event_status"),
                instant(r, "starts_at")), attendanceId).stream().findFirst();
    }

    public UUID createAttendance(UUID eventId, UUID memberId) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into nite_connect.attendance_records(id,event_id,member_id) values (?,?,?)", id, eventId, memberId);
        return id;
    }

    public Instant attendanceCreatedAt(UUID id) {
        return jdbc.queryForObject("select created_at from nite_connect.attendance_records where id=?", Timestamp.class, id).toInstant();
    }

    public Instant activatedAt() {
        return jdbc.queryForObject("select activated_at from nite_connect.frequency_settings where id=1", Timestamp.class).toInstant();
    }

    public AggregateCounts counts(UUID memberId, Instant from, Instant to, Instant activatedAt) {
        return jdbc.queryForObject("""
                select count(*) as eligible,
                       count(*) filter (where lm.status='PRESENTE') as present,
                       count(*) filter (where lm.status='JUSTIFICADO') as justified,
                       count(*) filter (where lm.status='AUSENTE') as absent
                  from nite_connect.attendance_lists l
                  join nite_connect.attendance_list_members lm on lm.list_id=l.id
                 where lm.member_id=? and l.opened_at>=? and l.opened_at>=? and l.opened_at<?
                   and l.status='CONCLUIDA' and l.outcome='REALIZADA_CONTABILIZAVEL'
                   and l.counts_for_frequency=true
                """, (r, i) -> new AggregateCounts(r.getLong("eligible"), r.getLong("present"),
                r.getLong("justified"), r.getLong("absent")), memberId, ts(from), ts(activatedAt), ts(to));
    }

    public List<BucketCounts> bucketCounts(UUID memberId, Instant from, Instant to, Instant activatedAt, GroupBy groupBy) {
        String bucket = switch (groupBy) {
            case MONTH -> "date_trunc('month',l.opened_at at time zone 'America/Bahia')::date";
            case SEMESTER -> "make_date(extract(year from l.opened_at at time zone 'America/Bahia')::int," +
                    "case when extract(month from l.opened_at at time zone 'America/Bahia')::int<7 then 1 else 7 end,1)";
        };
        return jdbc.query("""
                select %s as period_start,count(*) as eligible,
                       count(*) filter (where lm.status='PRESENTE') as present,
                       count(*) filter (where lm.status='JUSTIFICADO') as justified,
                       count(*) filter (where lm.status='AUSENTE') as absent
                  from nite_connect.attendance_lists l
                  join nite_connect.attendance_list_members lm on lm.list_id=l.id
                 where lm.member_id=? and l.opened_at>=? and l.opened_at>=? and l.opened_at<?
                   and l.status='CONCLUIDA' and l.outcome='REALIZADA_CONTABILIZAVEL'
                   and l.counts_for_frequency=true
                 group by period_start order by period_start
                """.formatted(bucket), (r, i) -> new BucketCounts(r.getObject("period_start", LocalDate.class),
                new AggregateCounts(r.getLong("eligible"), r.getLong("present"), r.getLong("justified"),
                        r.getLong("absent"))), memberId, ts(from), ts(activatedAt), ts(to));
    }

    public PageResult<CollectiveAggregate> collectiveCounts(Instant from, Instant to, Instant activatedAt,
                                                           String name, int page, int size) {
        PageResult.validate(page, size);
        String search = name == null || name.isBlank() ? null : FrequencyRules.sortKey(name);
        String sql = """
                with roster as (
                    select lm.member_id,lm.display_name,lm.sort_key,
                           row_number() over(partition by lm.member_id order by l.opened_at desc,l.id desc) as latest
                      from nite_connect.attendance_lists l
                      join nite_connect.attendance_list_members lm on lm.list_id=l.id
                     where l.opened_at>=? and l.opened_at>=? and l.opened_at<?
                ), latest_roster as (
                    select member_id,display_name,sort_key from roster where latest=1
                ), named_roster as (
                    select * from latest_roster where cast(? as text) is null or position(? in sort_key)>0
                ), eligible as (
                    select lm.member_id,lm.status
                      from nite_connect.attendance_lists l
                      join nite_connect.attendance_list_members lm on lm.list_id=l.id
                     where l.opened_at>=? and l.opened_at>=? and l.opened_at<? and l.status='CONCLUIDA'
                       and l.outcome='REALIZADA_CONTABILIZAVEL' and l.counts_for_frequency=true
                ), totals as (
                    select member_id,count(*) as eligible,
                           count(*) filter (where status='PRESENTE') as present,
                           count(*) filter (where status='JUSTIFICADO') as justified,
                           count(*) filter (where status='AUSENTE') as absent
                      from eligible group by member_id
                )
                , filtered as (
                    select r.member_id,r.display_name,r.sort_key,coalesce(t.eligible,0) as eligible,
                           coalesce(t.present,0) as present,coalesce(t.justified,0) as justified,coalesce(t.absent,0) as absent
                      from named_roster r left join totals t on t.member_id=r.member_id
                ), metadata as (
                    select count(*) as total from filtered
                ), page_rows as (
                    select * from filtered order by sort_key,display_name,member_id limit ? offset ?
                )
                select p.member_id,p.display_name,p.sort_key,p.eligible,p.present,p.justified,p.absent,m.total
                  from metadata m left join page_rows p on true
                 order by p.sort_key nulls last,p.display_name nulls last,p.member_id nulls last
                """;
        List<CollectiveAggregate> result = new ArrayList<>();
        long[] total = {0};
        jdbc.query(sql, (r, i) -> {
            total[0] = r.getLong("total");
            if (r.getObject("member_id") != null) {
                result.add(new CollectiveAggregate(uuid(r, "member_id"), r.getString("display_name"),
                        r.getString("sort_key"), new AggregateCounts(r.getLong("eligible"), r.getLong("present"),
                        r.getLong("justified"), r.getLong("absent"))));
            }
            return null;
        }, ts(from), ts(activatedAt), ts(to), search, search, ts(from), ts(activatedAt), ts(to), size, (long) page * size);
        return new PageResult<>(result, page, size, total[0]);
    }

    public List<AbsenceHistory> lastCountableMeetings(List<UUID> memberIds, Instant activatedAt) {
        if (memberIds.isEmpty()) return List.of();
        String placeholders = String.join(",", Collections.nCopies(memberIds.size(), "?"));
        var args = new ArrayList<Object>(memberIds);
        args.add(ts(activatedAt));
        String sql = """
                with ranked as (
                    select lm.member_id,lm.status,l.id as list_id,l.calendar_event_id,l.meeting_name,l.opened_at,
                           row_number() over(partition by lm.member_id order by l.opened_at desc,l.id desc) as position
                      from nite_connect.attendance_lists l
                      join nite_connect.attendance_list_members lm on lm.list_id=l.id
                     where lm.member_id in (%s) and l.opened_at>=? and l.status='CONCLUIDA'
                       and l.outcome='REALIZADA_CONTABILIZAVEL' and l.counts_for_frequency=true
                )
                select member_id,status,list_id,calendar_event_id,meeting_name,opened_at
                  from ranked where position<=3 order by member_id,opened_at desc,list_id
                """.formatted(placeholders);
        return jdbc.query(sql, (r, i) -> new AbsenceHistory(uuid(r, "member_id"),
                new AbsenceMeeting(uuid(r, "list_id"), uuid(r, "calendar_event_id"), r.getString("meeting_name"),
                        instant(r, "opened_at")), r.getString("status")), args.toArray());
    }

    public PageResult<HistoryRecord> history(UUID memberId, Instant from, Instant to, Instant activatedAt,
                                              int page, int size) {
        PageResult.validate(page, size);
        String cte = """
                with history as (
                    select l.id as list_id,l.calendar_event_id,l.meeting_name,l.opened_at as occurred_at,
                           case when (l.status='CANCELADA' or (l.status='CONCLUIDA' and l.outcome<>'REALIZADA_CONTABILIZAVEL'))
                                     and lm.status in ('AGUARDANDO','AUSENTE') then 'FORA_DA_APURACAO'
                                else lm.status end as status,
                           lm.confirmed_at,false as legacy,
                           (l.status='CONCLUIDA' and l.outcome='REALIZADA_CONTABILIZAVEL'
                                 and l.counts_for_frequency=true) as in_apuration,
                           (lm.attendance_id is not null) as presence_recorded,lm.status as attendance_status,
                           l.status as list_status,l.outcome,l.confirmation_deadline,l.counts_for_frequency
                      from nite_connect.attendance_list_members lm
                      join nite_connect.attendance_lists l on l.id=lm.list_id
                     where lm.member_id=? and l.opened_at>=?
                    union all
                     select null::uuid,a.event_id,e.title,a.created_at,'LEGADO',a.created_at,true,false,
                            true,'LEGADO','LEGADO',null::varchar,null::timestamptz,false
                      from nite_connect.attendance_records a
                      join nite_connect.calendar_events e on e.id=a.event_id
                      left join nite_connect.attendance_lists l on l.calendar_event_id=a.event_id
                     where a.member_id=? and a.created_at<? and l.id is null
                )
                """;
        long total = jdbc.queryForObject(cte + "select count(*) from history where occurred_at>=? and occurred_at<?",
                Long.class, memberId, ts(activatedAt), memberId, ts(activatedAt), ts(from), ts(to));
        String sql = cte + """
                select list_id,calendar_event_id,meeting_name,occurred_at,status,confirmed_at,legacy,in_apuration,
                       presence_recorded,attendance_status,list_status,outcome,confirmation_deadline,counts_for_frequency
                  from history where occurred_at>=? and occurred_at<?
                 order by occurred_at desc,list_id desc nulls last,calendar_event_id desc limit ? offset ?
                """;
        var args = new ArrayList<Object>();
        args.add(memberId); args.add(ts(activatedAt)); args.add(memberId); args.add(ts(activatedAt));
        args.add(ts(from)); args.add(ts(to)); args.add(size); args.add((long) page * size);
        return new PageResult<>(jdbc.query(sql, (r, i) -> new HistoryRecord(uuid(r, "list_id"),
                uuid(r, "calendar_event_id"), r.getString("meeting_name"), instant(r, "occurred_at"),
                r.getString("status"), instant(r, "confirmed_at"), r.getBoolean("legacy"),
                r.getBoolean("in_apuration"), r.getBoolean("presence_recorded"), r.getString("attendance_status"),
                r.getString("list_status"), r.getString("outcome"), instant(r, "confirmation_deadline"),
                r.getBoolean("counts_for_frequency")), args.toArray()), page, size, total);
    }

    private <T> PageResult<T> page(String columns, String from, List<Object> args, String order,
                                   RowMapper<T> mapper, int page, int size) {
        PageResult.validate(page, size);
        long total = jdbc.queryForObject("select count(*) " + from, Long.class, args.toArray());
        var paged = new ArrayList<>(args);
        paged.add(size);
        paged.add((long) page * size);
        return new PageResult<>(jdbc.query("select " + columns + " " + from + " order by " + order + " limit ? offset ?",
                mapper, paged.toArray()), page, size, total);
    }

    private void changed(int count) {
        if (count != 1) throw ApiException.conflict("Registro alterado; consulte a versão atual");
    }

    public record QrToken(String hash, UUID listId, int version, Instant issuedAt, Instant expiresAt, Instant revokedAt) {}
    public record HandoffData(String hash, UUID listId, String tokenHash, int qrVersion, Instant expiresAt,
                              Instant consumedAt, UUID consumedBy) {}
    public record AttendanceRef(UUID id, UUID eventId, UUID memberId, long version, Instant createdAt) {}
    public record ConfirmationEvidence(UUID attendanceId, UUID memberId, UUID eventId, long attendanceVersion,
                                      Instant confirmedAt, UUID listId, long listVersion, String listStatus,
                                      String outcome, long memberVersion, String participantStatus, String title,
                                      String kind, String modality, String eventStatus, Instant startsAt) {}
    public record AggregateCounts(long eligibleMeetings, long present, long justified, long unjustifiedAbsences) {}
    public record BucketCounts(LocalDate periodStart, AggregateCounts counts) {}
    public record CollectiveAggregate(UUID memberId, String displayName, String sortKey, AggregateCounts counts) {}
    public record AbsenceHistory(UUID memberId, AbsenceMeeting meeting, String status) {}
    public record ParticipantQueryPage(List<Participant> items, int page, int size, long total,
                                       int pageCount, ParticipantCounts counts) {}
    private record ParticipantQueryRow(Participant participant, ParticipantCounts counts, long total, int pageCount) {}
    public record HistoryRecord(UUID listId, UUID calendarEventId, String meetingName, Instant occurredAt,
                                String status, Instant confirmedAt, boolean legacy, boolean inApuration,
                                boolean presenceRecorded, String attendanceStatus, String listStatus,
                                String outcome, Instant confirmationDeadline, boolean countsForFrequency) {}
}
