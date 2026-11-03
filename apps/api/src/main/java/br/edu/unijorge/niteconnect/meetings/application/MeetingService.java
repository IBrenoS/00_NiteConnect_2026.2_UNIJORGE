package br.edu.unijorge.niteconnect.meetings.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import br.edu.unijorge.niteconnect.meetings.api.MeetingContracts;
import br.edu.unijorge.niteconnect.meetings.domain.MeetingMode;
import br.edu.unijorge.niteconnect.meetings.domain.MeetingInviteStatus;
import br.edu.unijorge.niteconnect.meetings.domain.MeetingProviderKind;
import br.edu.unijorge.niteconnect.meetings.domain.MeetingProviderState;
import br.edu.unijorge.niteconnect.meetings.infrastructure.MeetingRepository;
import br.edu.unijorge.niteconnect.meetings.infrastructure.MeetingsGraphProperties;
import br.edu.unijorge.niteconnect.members.application.MemberDirectory;
import br.edu.unijorge.niteconnect.members.domain.Member;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import tools.jackson.databind.ObjectMapper;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class MeetingService {
    private static final int IMMEDIATE_DEFAULT_DURATION_MINUTES = 60;

    private final MeetingProvider provider;
    private final MeetingRepository repository;
    private final MemberDirectory members;
    private final AccessService access;
    private final Clock clock;
    private final ObjectMapper json;
    private final IdentityDirectory identities;
    private final MeetingsGraphProperties graphProperties;

    public MeetingService(MeetingProvider provider, MeetingRepository repository, MemberDirectory members,
                         AccessService access, Clock clock, ObjectMapper json, IdentityDirectory identities,
                         MeetingsGraphProperties graphProperties) {
        this.provider = provider;
        this.repository = repository;
        this.members = members;
        this.access = access;
        this.clock = clock;
        this.json = json;
        this.identities = identities;
        this.graphProperties = graphProperties;
    }

    public MeetingContracts.CalendarCapabilities calendarCapabilities(UUID actor, String apiAccessToken) {
        access.requireActive(actor);
        try {
            var capabilities = provider.capabilities(apiAccessToken);
            return new MeetingContracts.CalendarCapabilities(capabilities.allowedOnlineMeetingProviders(),
                    capabilities.defaultOnlineMeetingProvider(), capabilities.supportsTeamsForBusiness());
        } catch (MeetingProviderException exception) {
            throw new MeetingProviderApiException(null, exception);
        }
    }

    public CreateResult create(UUID organizerId, String apiAccessToken, String idempotencyKey,
                               MeetingContracts.Create input) {
        Member organizer = access.requireActive(organizerId);
        String key = validateIdempotencyKey(idempotencyKey);
        String title = input.title().strip();
        if (title.isEmpty() || title.length() > 200) throw ApiException.invalid("O título deve ter até 200 caracteres");
        MeetingMode mode = input.mode();
        Instant startsAt;
        int duration;
        if (mode == MeetingMode.IMMEDIATE) {
            if (input.startsAt() != null) throw ApiException.invalid("IMMEDIATE não aceita startsAt");
            duration = input.plannedDurationMinutes() == null ? IMMEDIATE_DEFAULT_DURATION_MINUTES : input.plannedDurationMinutes();
            startsAt = clock.instant();
        } else {
            if (input.startsAt() == null || input.plannedDurationMinutes() == null) {
                throw ApiException.invalid("SCHEDULED exige startsAt e plannedDurationMinutes");
            }
            duration = input.plannedDurationMinutes();
            startsAt = input.startsAt().toInstant();
        }
        if (duration < 1) throw ApiException.invalid("plannedDurationMinutes deve ser positivo");
        Instant plannedEndsAt;
        try { plannedEndsAt = startsAt.plus(Duration.ofMinutes(duration)); }
        catch (ArithmeticException | java.time.DateTimeException exception) { throw ApiException.invalid("Duração prevista fora do intervalo suportado"); }

        List<UUID> inviteeIds = normalizeInvitees(input.inviteeIds(), organizerId);
        List<Member> invitees = new ArrayList<>(inviteeIds.size());
        for (UUID inviteeId : inviteeIds) invitees.add(access.requireActive(inviteeId));
        MeetingProviderKind providerKind = input.provider() == null ? MeetingProviderKind.GRAPH : input.provider();
        String payload = requestPayload(providerKind, mode, title, mode == MeetingMode.IMMEDIATE ? null : startsAt, duration, inviteeIds);
        String requestHash = hash(payload);
        Instant now = clock.instant();
        if (providerKind == MeetingProviderKind.TEAMS_LINK) {
            MeetingRepository.LocalCreateResult prepared = repository.prepareTeamsLink(organizerId, key, requestHash,
                    mode, title, startsAt, duration, inviteeIds, payload, now);
            return new CreateResult(prepared.created() ? 201 : 200, view(prepared.meetingId(), organizerId), null);
        }
        MeetingRepository.Reservation operation = repository.reserveCreate(organizerId, key, requestHash, mode,
                title, startsAt, duration, inviteeIds, payload, now);

        if (!operation.execute()) {
            if (operation.operationState().equals("CONFIRMADA")) {
                return new CreateResult(200, view(operation.meetingId(), organizerId), null);
            }
            return pending(operation);
        }

        List<MeetingProvider.Invitee> providerInvitees = invitees.stream()
                .map(member -> new MeetingProvider.Invitee(member.name(), member.institutionalEmail())).toList();
        try {
            var created = provider.createMeeting(apiAccessToken, new MeetingProvider.CreateRequest(
                    operation.graphTransactionId(), operation.title(), operation.startsAt(), operation.plannedEndsAt(), providerInvitees));
            if (created == null || created.eventId() == null || created.eventId().isBlank() || !validHttpsUrl(created.joinUrl())) {
                throw new MeetingProviderException("GRAPH_EVENT_OR_JOIN_URL_MISSING", MeetingProviderException.FailureKind.INDETERMINATE, null);
            }
            try {
                repository.confirmCreate(operation, organizerId, created, clock.instant());
            } catch (DataAccessException exception) {
                Instant retryAt = repository.markCreateIndeterminate(operation, "LOCAL_PERSISTENCE_UNCONFIRMED", null, null, clock.instant());
                return pending(operation, "RESULTADO_INDETERMINADO", retryAt);
            }
            return new CreateResult(201, view(operation.meetingId(), organizerId), null);
        } catch (MeetingProviderException exception) {
            if (exception.kind() == MeetingProviderException.FailureKind.INDETERMINATE
                    || exception.kind() == MeetingProviderException.FailureKind.RETRYABLE) {
                Instant retryAt = repository.markCreateIndeterminate(operation, exception.code(), exception.retryAfter(), exception.providerHttpStatus(), clock.instant());
                return pending(operation, "RESULTADO_INDETERMINADO", retryAt);
            }
            repository.markCreateFailed(operation, exception.code(), exception.providerHttpStatus(), clock.instant());
            throw new MeetingProviderApiException(operation.operationId(), exception);
        }
    }

    private CreateResult pending(MeetingRepository.Reservation operation) {
        return pending(operation, operation.operationState(), operation.retryAfter());
    }

    private CreateResult pending(MeetingRepository.Reservation operation, String operationStatus, Instant retryAt) {
        String status = operationStatus.equals("PROCESSANDO") ? "PENDENTE" : operationStatus;
        return new CreateResult(202, null, new MeetingContracts.CreateOperationView(operation.meetingId(), operation.operationId(),
                br.edu.unijorge.niteconnect.meetings.domain.MeetingStatus.valueOf(operation.meetingStatus()), status,
                !status.equals("FALHA_PROVEDOR"), retryAt == null ? operation.leaseUntil() : retryAt));
    }

    public MutationResult update(UUID organizerId, String apiAccessToken, UUID meetingId, String idempotencyKey,
                                 MeetingContracts.Update input) {
        access.requireActive(organizerId);
        String key = validateIdempotencyKey(idempotencyKey);
        String title = input.title().strip();
        if (title.isEmpty()) throw ApiException.invalid("O título não pode estar vazio");
        Instant startsAt = input.startsAt().toInstant();
        int duration = input.plannedDurationMinutes();
        Instant endsAt = endsAt(startsAt, duration);
        List<UUID> inviteeIds = normalizeInvitees(input.inviteeIds(), organizerId);
        List<Member> invitees = activeInvitees(inviteeIds);
        String payload = mutationPayload("UPDATE", meetingId, input.expectedVersion(), title, startsAt, duration, inviteeIds, null);
        String requestHash = hash(payload);
        Instant now = clock.instant();
        MeetingRepository.MeetingRecord existing = repository.requireMeetingForActor(meetingId, organizerId);
        if (!existing.organizerMemberId().equals(organizerId)) throw ApiException.notFound();
        if (existing.provider() == MeetingProviderKind.TEAMS_LINK) {
            MeetingRepository.MeetingRecord updated = repository.updateTeamsLinkLocally(organizerId, meetingId, key,
                    requestHash, payload, input.expectedVersion(), title, startsAt, duration, inviteeIds, now);
            return new MutationResult(200, view(updated.id(), organizerId), null);
        }
        MeetingRepository.MutationReservation operation = repository.reserveMutation(organizerId, meetingId, "UPDATE", key,
                requestHash, payload, input.expectedVersion(), now);
        if (!operation.execute()) {
            if (operation.operationState().equals("CONFIRMADA")) return new MutationResult(200, view(meetingId, organizerId), null);
            return pendingMutation(operation, "UPDATE");
        }
        var providerInvitees = invitees.stream().map(member -> new MeetingProvider.Invitee(member.name(), member.institutionalEmail())).toList();
        try {
            var updated = provider.updateMeeting(apiAccessToken, operation.graphEventId(),
                    new MeetingProvider.UpdateRequest(title, startsAt, endsAt, providerInvitees));
            try {
                repository.completeUpdate(operation, title, startsAt, duration, inviteeIds, updated, organizerId, clock.instant());
            } catch (DataAccessException exception) {
                Instant retryAt = repository.markMutationIndeterminate(operation, "LOCAL_PERSISTENCE_UNCONFIRMED", null, null, clock.instant());
                return pendingMutation(operation, "UPDATE", retryAt);
            }
            return new MutationResult(200, view(meetingId, organizerId), null);
        } catch (MeetingProviderException exception) {
            return handleMutationFailure(operation, "UPDATE", exception);
        }
    }

    public MutationResult cancel(UUID organizerId, String apiAccessToken, UUID meetingId, String idempotencyKey,
                                 MeetingContracts.Cancel input) {
        access.requireActive(organizerId);
        String key = validateIdempotencyKey(idempotencyKey);
        String comment = input.comment() == null ? "" : input.comment().strip();
        String payload = mutationPayload("CANCEL", meetingId, input.expectedVersion(), null, null, 0, List.of(), comment);
        Instant now = clock.instant();
        MeetingRepository.MeetingRecord existing = repository.requireMeetingForActor(meetingId, organizerId);
        if (!existing.organizerMemberId().equals(organizerId)) throw ApiException.notFound();
        if (existing.provider() == MeetingProviderKind.TEAMS_LINK) {
            MeetingRepository.MeetingRecord cancelled = repository.cancelTeamsLinkLocally(organizerId, meetingId, key,
                    hash(payload), payload, input.expectedVersion(), comment, now);
            return new MutationResult(200, view(cancelled.id(), organizerId), null);
        }
        MeetingRepository.MutationReservation operation = repository.reserveMutation(organizerId, meetingId, "CANCEL", key,
                hash(payload), payload, input.expectedVersion(), now);
        if (!operation.execute()) {
            if (operation.operationState().equals("CONFIRMADA")) return new MutationResult(200, view(meetingId, organizerId), null);
            return pendingMutation(operation, "CANCEL");
        }
        try {
            provider.cancelMeeting(apiAccessToken, operation.graphEventId(), comment);
            try {
                repository.completeCancel(operation, organizerId, comment, clock.instant());
            } catch (DataAccessException exception) {
                Instant retryAt = repository.markMutationIndeterminate(operation, "LOCAL_PERSISTENCE_UNCONFIRMED", null, null, clock.instant());
                return pendingMutation(operation, "CANCEL", retryAt);
            }
            return new MutationResult(200, view(meetingId, organizerId), null);
        } catch (MeetingProviderException exception) {
            return handleMutationFailure(operation, "CANCEL", exception);
        }
    }

    private MutationResult handleMutationFailure(MeetingRepository.MutationReservation operation, String type,
                                                  MeetingProviderException exception) {
        if (exception.kind() == MeetingProviderException.FailureKind.INDETERMINATE
                || exception.kind() == MeetingProviderException.FailureKind.RETRYABLE) {
            Instant retryAt = repository.markMutationIndeterminate(operation, exception.code(), exception.retryAfter(), exception.providerHttpStatus(), clock.instant());
            return pendingMutation(operation, type, retryAt);
        }
        repository.markMutationFailed(operation, exception.code(), exception.providerHttpStatus(), clock.instant());
        throw new MeetingProviderApiException(operation.operationId(), exception);
    }

    private MutationResult pendingMutation(MeetingRepository.MutationReservation operation, String type) {
        String status = operation.operationState().equals("PROCESSANDO") ? "PENDENTE" : operation.operationState();
        Instant retryAt = operation.retryAfter() == null ? operation.leaseUntil() : operation.retryAfter();
        return new MutationResult(202, null, new MeetingContracts.MutationOperationView(operation.meetingId(),
                operation.operationId(), type, status, !status.equals("FALHA_PROVEDOR"), retryAt));
    }

    private MutationResult pendingMutation(MeetingRepository.MutationReservation operation, String type, Instant retryAt) {
        String status = "RESULTADO_INDETERMINADO";
        return new MutationResult(202, null, new MeetingContracts.MutationOperationView(operation.meetingId(),
                operation.operationId(), type, status, !status.equals("FALHA_PROVEDOR"), retryAt));
    }

    public MeetingContracts.MeetingView get(UUID actor, UUID meetingId) {
        access.requireActive(actor);
        return view(meetingId, actor);
    }

    public PageResult<MeetingContracts.MeetingView> list(UUID actor, String scope, int page, int size) {
        access.requireActive(actor);
        if (!"upcoming".equals(scope) && !"past".equals(scope) && !"cancelled".equals(scope)) {
            throw ApiException.invalid("scope deve ser upcoming, past ou cancelled");
        }
        PageResult<UUID> ids = repository.listMeetingIds(actor, scope, clock.instant(), page, size);
        return new PageResult<>(ids.items().stream().map(id -> view(id, actor)).toList(), page, size, ids.total());
    }

    public MeetingContracts.Invitee respond(UUID actor, UUID meetingId, MeetingContracts.Respond input) {
        access.requireActive(actor);
        if (input.response() != MeetingInviteStatus.ACEITO && input.response() != MeetingInviteStatus.RECUSADO) {
            throw ApiException.invalid("response deve ser ACEITO ou RECUSADO");
        }
        var response = repository.respond(meetingId, actor, input.response(), input.expectedVersion(), clock.instant());
        String name = members.names(List.of(actor)).getOrDefault(actor, "Integrante");
        return new MeetingContracts.Invitee(actor, name, response.internalStatus(), response.calendarResponseStatus(),
                response.respondedAt(), response.version());
    }

    public String joinUrl(UUID actor, UUID meetingId) {
        access.requireActive(actor);
        return repository.requireJoinUrl(meetingId, actor);
    }

    public MeetingContracts.TeamsContinuation teamsContinuation(UUID actor, UUID meetingId) {
        access.requireActive(actor);
        MeetingRepository.MeetingRecord meeting = repository.requireMeetingForActor(meetingId, actor);
        if (!meeting.organizerMemberId().equals(actor)) throw ApiException.notFound();
        if (meeting.provider() != MeetingProviderKind.TEAMS_LINK || meeting.status() != br.edu.unijorge.niteconnect.meetings.domain.MeetingStatus.AGUARDANDO_TEAMS) {
            throw ApiException.conflict("A reunião não está aguardando uma ação no Teams");
        }
        String teamsHome = "https://teams.microsoft.com/";
        if (meeting.providerState() == MeetingProviderState.ATUALIZACAO_PENDENTE_NO_TEAMS) {
            return new MeetingContracts.TeamsContinuation("EDITAR_REUNIAO_NO_TEAMS_E_VINCULAR_LINK", teamsHome,
                    List.of("Edite a reunião já existente no Teams.",
                            "Depois, copie o link oficial de participação e vincule-o novamente no NITE Connect."),
                    "America/Bahia", meeting.startsAt(), meeting.plannedEndsAt());
        }
        if (meeting.mode() == MeetingMode.IMMEDIATE) {
            return new MeetingContracts.TeamsContinuation("ABRIR_TEAMS_REUNIR_AGORA", teamsHome,
                    List.of("No Teams, selecione Calendário > Reunir agora.",
                            "Defina o nome, escolha Obter um link para compartilhar e copie o link.",
                            "Volte ao NITE Connect para vincular o link oficial."),
                    "America/Bahia", meeting.startsAt(), meeting.plannedEndsAt());
        }
        List<String> attendees = activeInvitees(repository.invitees(meetingId).stream()
                .filter(invitee -> invitee.internalStatus() != MeetingInviteStatus.REVOGADO)
                .map(MeetingRepository.InviteRecord::memberId).toList()).stream()
                .map(Member::institutionalEmail).toList();
        String startTime = DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(meeting.startsAt().atZone(ZoneId.of("America/Bahia")));
        String endTime = DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(meeting.plannedEndsAt().atZone(ZoneId.of("America/Bahia")));
        String actionUrl = "https://teams.microsoft.com/l/meeting/new?subject=" + encodeQuery(meeting.title())
                + "&startTime=" + encodeQuery(startTime) + "&endTime=" + encodeQuery(endTime)
                + (attendees.isEmpty() ? "" : "&attendees=" + encodeQuery(String.join(",", attendees)));
        return new MeetingContracts.TeamsContinuation("PREENCHER_AGENDAMENTO_NO_TEAMS", actionUrl,
                List.of("Confira os dados e convidados no Teams.",
                        "Salve a reunião no calendário e copie o link oficial de participação.",
                        "Volte ao NITE Connect para vincular o link. A abertura deste endereço não confirma o agendamento."),
                "America/Bahia", meeting.startsAt(), meeting.plannedEndsAt());
    }

    public MeetingContracts.MeetingView linkTeamsMeeting(UUID organizerId, UUID meetingId,
                                                          MeetingContracts.LinkTeamsMeeting input) {
        access.requireActive(organizerId);
        String joinUrl = input.joinUrl().strip();
        if (!validTeamsJoinUrl(joinUrl)) throw ApiException.invalid("joinUrl deve ser um link oficial de participação do Microsoft Teams");
        MeetingRepository.MeetingRecord linked = repository.confirmTeamsLink(organizerId, meetingId,
                input.expectedVersion(), joinUrl, clock.instant());
        return view(linked.id(), organizerId);
    }

    public MeetingContracts.ShareLink shareLink(UUID actor, UUID meetingId) {
        access.requireActive(actor);
        var meeting = repository.requireMeetingForActor(meetingId, actor);
        if (meeting.status() != br.edu.unijorge.niteconnect.meetings.domain.MeetingStatus.AGENDADA) {
            throw ApiException.conflict("Somente reuniões confirmadas podem ser compartilhadas");
        }
        String path = "/api/v1/meetings/" + meetingId + "/join";
        path = "/reunioes/" + meetingId + "/entrar";
        return new MeetingContracts.ShareLink(path, meeting.title() + " — " + path);
    }

    public PageResult<MeetingContracts.Notification> notifications(UUID actor, int page, int size) {
        access.requireActive(actor);
        PageResult<MeetingRepository.NotificationRecord> result = repository.notifications(actor, page, size);
        return new PageResult<>(result.items().stream().map(item -> new MeetingContracts.Notification(item.id(), item.meetingId(),
                item.type(), item.title(), item.startsAt(), item.createdAt(), item.readAt())).toList(), page, size, result.total());
    }

    public void markNotificationRead(UUID actor, UUID notificationId) {
        access.requireActive(actor);
        repository.markNotificationRead(notificationId, actor, clock.instant());
    }

    public MeetingContracts.Attendance attendance(UUID actor, UUID tenantId, String apiAccessToken, UUID meetingId) {
        access.requireActive(actor);
        var meeting = repository.requireMeetingForActor(meetingId, actor);
        if (!meeting.organizerMemberId().equals(actor)) throw ApiException.notFound();
        var result = repository.attendance(meetingId, actor);
        if (graphProperties.isAttendanceEnabled()) {
            if (meeting.graphOnlineMeetingId() == null || meeting.graphOnlineMeetingId().isBlank()) {
                repository.markAttendanceStatus(meetingId, actor, "INDISPONIVEL", clock.instant());
            } else {
                try {
                    var report = provider.latestAttendanceReport(apiAccessToken, meeting.graphOnlineMeetingId());
                    if (report.isEmpty()) {
                        repository.markAttendanceStatus(meetingId, actor, "PENDENTE", clock.instant());
                    } else {
                        var graphReport = report.get();
                        Long actualDuration = null;
                        if (graphReport.startsAt() != null && graphReport.endsAt() != null
                                && !graphReport.endsAt().isBefore(graphReport.startsAt())) {
                            actualDuration = Duration.between(graphReport.startsAt(), graphReport.endsAt()).getSeconds();
                        }
                        List<MeetingRepository.AttendanceInput> records = new ArrayList<>();
                        int index = 0;
                        for (MeetingProvider.AttendanceRecord record : graphReport.records()) {
                            index++;
                            UUID memberId = null;
                            if (tenantId.equals(record.tenantId()) && record.objectId() != null) {
                                memberId = identities.memberForIdentity(tenantId, record.objectId()).orElse(null);
                            }
                            String recordId = record.recordId() == null || record.recordId().isBlank()
                                    ? UUID.nameUUIDFromBytes((graphReport.reportId() + ":" + index).getBytes(StandardCharsets.UTF_8)).toString()
                                    : record.recordId();
                            List<MeetingRepository.AttendanceIntervalInput> intervals = record.intervals().stream()
                                    .map(interval -> new MeetingRepository.AttendanceIntervalInput(interval.joinedAt(), interval.leftAt())).toList();
                            records.add(new MeetingRepository.AttendanceInput(recordId, memberId, record.durationSeconds(), intervals));
                        }
                        repository.saveAttendanceReport(meetingId, actor, graphReport.reportId(), graphReport.startsAt(),
                                graphReport.endsAt(), actualDuration, records, clock.instant());
                    }
                } catch (MeetingProviderException exception) {
                    if (exception.kind() == MeetingProviderException.FailureKind.PERMANENT
                            || exception.kind() == MeetingProviderException.FailureKind.FORBIDDEN
                            || exception.kind() == MeetingProviderException.FailureKind.UNAVAILABLE) {
                        repository.markAttendanceStatus(meetingId, actor, "INDISPONIVEL", clock.instant());
                    } else {
                        throw new MeetingProviderApiException(null, exception.code());
                    }
                }
            }
            result = repository.attendance(meetingId, actor);
        }
        return new MeetingContracts.Attendance(result.availabilityStatus(), result.actualStartsAt(), result.actualEndsAt(),
                result.actualDurationSeconds(), result.retrievedAt(), result.participants().stream().map(participant ->
                new MeetingContracts.AttendanceParticipant(participant.memberId(), participant.name(), participant.attendanceSeconds())).toList());
    }

    private List<Member> activeInvitees(List<UUID> inviteeIds) {
        return inviteeIds.stream().map(access::requireActive).toList();
    }

    private Instant endsAt(Instant startsAt, int duration) {
        if (duration < 1) throw ApiException.invalid("plannedDurationMinutes deve ser positivo");
        try { return startsAt.plus(Duration.ofMinutes(duration)); }
        catch (ArithmeticException | java.time.DateTimeException exception) { throw ApiException.invalid("Duração prevista fora do intervalo suportado"); }
    }

    private String mutationPayload(String type, UUID meetingId, long version, String title, Instant startsAt,
                                   int duration, List<UUID> invitees, String comment) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("type", type);
        values.put("meetingId", meetingId.toString());
        values.put("expectedVersion", version);
        values.put("title", title);
        values.put("startsAt", startsAt == null ? null : startsAt.toString());
        values.put("plannedDurationMinutes", duration);
        values.put("inviteeIds", invitees.stream().map(UUID::toString).toList());
        values.put("comment", comment);
        return json.writeValueAsString(values);
    }

    public record MutationResult(int httpStatus, MeetingContracts.MeetingView meeting,
                                 MeetingContracts.MutationOperationView operation) { }

    private MeetingContracts.MeetingView view(UUID meetingId, UUID actor) {
        var meeting = repository.requireMeetingForActor(meetingId, actor);
        List<MeetingRepository.InviteRecord> inviteRecords = repository.invitees(meetingId);
        if (!meeting.organizerMemberId().equals(actor)) {
            inviteRecords = inviteRecords.stream().filter(invite -> invite.memberId().equals(actor)).toList();
        }
        List<UUID> memberIds = new ArrayList<>();
        memberIds.add(meeting.organizerMemberId());
        inviteRecords.forEach(invite -> memberIds.add(invite.memberId()));
        Map<UUID, String> names = members.names(memberIds);
        List<MeetingContracts.Invitee> invitees = inviteRecords.stream().map(invite -> new MeetingContracts.Invitee(
                invite.memberId(), names.getOrDefault(invite.memberId(), "Integrante"), invite.internalStatus(),
                invite.calendarResponseStatus(), invite.respondedAt(), invite.version())).toList();
        return new MeetingContracts.MeetingView(meeting.id(), meeting.mode(), meeting.status(), meeting.provider(),
                meeting.providerState(), meeting.title(),
                meeting.startsAt(), meeting.plannedDurationMinutes(), meeting.plannedEndsAt(),
                meeting.actualStartsAt(), meeting.actualEndsAt(), meeting.actualDurationSeconds(),
                meeting.organizerMemberId(), names.getOrDefault(meeting.organizerMemberId(), "Integrante"), invitees,
                meeting.version(), meeting.createdAt(), meeting.updatedAt());
    }

    private List<UUID> normalizeInvitees(List<UUID> input, UUID organizerId) {
        if (input == null) throw ApiException.invalid("inviteeIds é obrigatório");
        var unique = new java.util.LinkedHashSet<UUID>();
        for (UUID invitee : input) {
            if (invitee == null || !unique.add(invitee)) throw ApiException.invalid("A lista de convidados contém identificador inválido ou repetido");
            if (invitee.equals(organizerId)) throw ApiException.invalid("O organizador não deve ser repetido como convidado");
        }
        return unique.stream().sorted().toList();
    }

    private String requestPayload(MeetingProviderKind provider, MeetingMode mode, String title, Instant startsAt,
                                  int duration, List<UUID> inviteeIds) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("provider", provider.name());
        values.put("mode", mode.name());
        values.put("title", title);
        values.put("startsAt", startsAt == null ? null : startsAt.toString());
        values.put("plannedDurationMinutes", duration);
        values.put("inviteeIds", inviteeIds.stream().map(UUID::toString).toList());
        return json.writeValueAsString(values);
    }

    private String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 indisponível", exception);
        }
    }

    private String validateIdempotencyKey(String value) {
        if (value == null || value.isBlank() || value.length() > 128 || value.chars().anyMatch(Character::isISOControl)) {
            throw ApiException.invalid("Idempotency-Key deve conter entre 1 e 128 caracteres válidos");
        }
        return value.strip();
    }

    private boolean validHttpsUrl(String value) {
        if (value == null || value.isBlank()) return false;
        try {
            var uri = java.net.URI.create(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null;
        } catch (IllegalArgumentException exception) { return false; }
    }

    private boolean validTeamsJoinUrl(String value) {
        try {
            var uri = java.net.URI.create(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || !"teams.microsoft.com".equalsIgnoreCase(uri.getHost())
                    || uri.getPort() != -1 || uri.getUserInfo() != null || uri.getFragment() != null
                    || uri.getRawQuery() == null) return false;
            String path = uri.getPath();
            if (path.matches("/meet/[0-9]+")) return hasQueryParameter(uri.getRawQuery(), "p");
            return path.startsWith("/l/meetup-join/") && path.length() > "/l/meetup-join/".length()
                    && hasQueryParameter(uri.getRawQuery(), "context");
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private boolean hasQueryParameter(String query, String expectedName) {
        return java.util.Arrays.stream(query.split("&"))
                .map(parameter -> parameter.split("=", 2))
                .anyMatch(pair -> pair.length == 2 && pair[0].equals(expectedName) && !pair[1].isBlank());
    }

    private String encodeQuery(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    public record CreateResult(int httpStatus, MeetingContracts.MeetingView meeting,
                               MeetingContracts.CreateOperationView operation) { }
}
