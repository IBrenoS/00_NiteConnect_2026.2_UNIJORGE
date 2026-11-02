package br.edu.unijorge.niteconnect.attendance.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.attendance.api.FrequencyContracts.*;
import br.edu.unijorge.niteconnect.attendance.domain.Agenda.*;
import br.edu.unijorge.niteconnect.attendance.domain.Attendance.Presence;
import br.edu.unijorge.niteconnect.attendance.domain.Frequency.*;
import br.edu.unijorge.niteconnect.attendance.domain.FrequencyRules;
import br.edu.unijorge.niteconnect.attendance.infrastructure.AttendanceRepository;
import br.edu.unijorge.niteconnect.attendance.infrastructure.FrequencyRepository;
import br.edu.unijorge.niteconnect.attendance.infrastructure.FrequencyRepository.AggregateCounts;
import br.edu.unijorge.niteconnect.attendance.infrastructure.FrequencyRepository.CollectiveAggregate;
import br.edu.unijorge.niteconnect.attendance.infrastructure.FrequencyRepository.HistoryRecord;
import br.edu.unijorge.niteconnect.attendance.infrastructure.FrequencyRepository.ParticipantQueryPage;
import br.edu.unijorge.niteconnect.members.application.MemberDirectory;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import br.edu.unijorge.niteconnect.shared.security.AdministrativeTransactions;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static br.edu.unijorge.niteconnect.attendance.domain.FrequencyRules.ZONE;

import static br.edu.unijorge.niteconnect.attendance.infrastructure.AttendanceRepository.ts;

@Service
public class FrequencyService {
    private static final int QR_TTL_SECONDS = 120;
    private static final Set<String> DISPLAYABLE_STATUSES = Set.of(
            "AGUARDANDO", "PRESENTE", "JUSTIFICADO", "AUSENTE", "FORA_DA_APURACAO");

    private final FrequencyRepository repo;
    private final AttendanceRepository attendance;
    private final AccessService access;
    private final MemberDirectory members;
    private final AdministrativeTransactions transactions;
    private final AttendanceJournal journal;
    private final Clock clock;
    private final ObjectMapper json;
    private final SecureRandom random = new SecureRandom();

    public FrequencyService(FrequencyRepository repo, AttendanceRepository attendance, AccessService access,
                            MemberDirectory members, AdministrativeTransactions transactions,
                            AttendanceJournal journal, Clock clock, ObjectMapper json) {
        this.repo = repo;
        this.attendance = attendance;
        this.access = access;
        this.members = members;
        this.transactions = transactions;
        this.journal = journal;
        this.clock = clock;
        this.json = json;
    }

    @Transactional
    public ListView open(UUID actor, OpenList command, String idempotencyKey) {
        transactions.lock();
        access.requireAdministrator(actor);
        if (idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 128) {
            throw ApiException.invalid("Idempotency-Key obrigatório e limitado a 128 caracteres");
        }
        FrequencyRules.confirmationWindow(command.confirmationWindowMinutes());
        Instant openedAt = clock.instant();
        if (command.calendarEventId() != null && command.meetingName() != null) {
            throw ApiException.invalid("O nome do encontro existente vem da Agenda");
        }
        String meetingName = command.calendarEventId() == null ? cleanMeetingName(command.meetingName()) : null;
        String requestHash = openRequestHash(command, meetingName);

        Optional<ListSnapshot> replay = repo.listByIdempotency(actor, idempotencyKey);
        if (replay.isPresent()) {
            if (!requestHash.equals(requestHashFor(replay.get().id()))) {
                throw ApiException.conflict("Idempotency-Key já utilizado com outro conteúdo");
            }
            return view(replay.get());
        }

        UUID eventId;
        Event event;
        Classification classification;
        boolean countsForFrequency;
        if (command.calendarEventId() != null) {
            event = repo.lockEvent(command.calendarEventId());
            if (repo.listByEvent(event.id(), true).isPresent()) {
                throw ApiException.conflict("Encontro já possui uma lista de frequência");
            }
            if (repo.countAttendance(event.id()) > 0) {
                throw ApiException.conflict("Encontro já possui presença legada e não pode receber uma lista nova");
            }
            validateScheduledEvent(event, openedAt, command.confirmationWindowMinutes());
            boolean regular = FrequencyRules.isRegular(event.kind(), event.modality(), event.startsAt());
            classification = regular ? Classification.REGULAR : Classification.EXCEPTIONAL;
            countsForFrequency = countsForFrequency(regular, command.countsForFrequency());
            meetingName = event.title();
            repo.openExistingEvent(event.id(), event.version());
            Event after = repo.event(event.id());
            journal.record(actor, null, "CALENDAR_EVENT", event.id(), after.version(), "FREQUENCY_LIST_OPENED",
                    event, after, "Abertura de lista de Frequência");
            event = after;
            eventId = event.id();
        } else {
            EventKind kind = FrequencyRules.isRegular(EventKind.ENCONTRO, Modality.PRESENCIAL, openedAt)
                    ? EventKind.ENCONTRO : EventKind.EXTRAORDINARIO;
            boolean regular = kind == EventKind.ENCONTRO;
            classification = regular ? Classification.REGULAR : Classification.EXCEPTIONAL;
            countsForFrequency = countsForFrequency(regular, command.countsForFrequency());
            eventId = UUID.randomUUID();
            event = repo.insertQuickEvent(eventId, meetingName, kind, Modality.PRESENCIAL, openedAt, actor);
            journal.record(actor, null, "CALENDAR_EVENT", eventId, event.version(), "CREATED", null, event,
                    "Abertura rápida de lista de Frequência");
        }

        UUID listId = UUID.randomUUID();
        Instant deadline = openedAt.plusSeconds(command.confirmationWindowMinutes() * 60L);
        repo.insertList(listId, eventId, meetingName, classification, countsForFrequency,
                command.confirmationWindowMinutes(), deadline, openedAt, actor, idempotencyKey, requestHash);

        var roster = new ArrayList<>(members.activeRoster());
        roster.sort(Comparator.comparing((MemberDirectory.RosterMember member) -> FrequencyRules.sortKey(member.displayName()))
                .thenComparing(MemberDirectory.RosterMember::displayName)
                .thenComparing(MemberDirectory.RosterMember::id));
        for (MemberDirectory.RosterMember member : roster) {
            repo.insertListMember(listId, member.id(), member.displayName(), openedAt, FrequencyRules.sortKey(member.displayName()));
        }

        var after = Map.of(
                "calendarEventId", eventId,
                "meetingName", meetingName,
                "classification", classification,
                "countsForFrequency", countsForFrequency,
                "openedAt", openedAt,
                "openedBy", actor,
                "snapshotSize", roster.size());
        repo.insertListEvent(UUID.randomUUID(), listId, null, actor, "LIST_OPENED", 0, null,
                null, toJson(after), "Abertura de lista de Frequência");
        return view(repo.list(listId, false));
    }

    @Transactional
    public QrPayload renewQr(UUID actor, UUID listId, RenewQr command) {
        transactions.lock();
        access.requireAdministrator(actor);
        ListSnapshot list = repo.list(listId, true);
        checkVersion(list.version(), command.expectedVersion());
        Instant now = clock.instant();
        if (list.status() != ListStatus.ABERTA) throw ApiException.conflict("Lista não está aberta");
        if (!now.isBefore(list.confirmationDeadline())) throw ApiException.conflict("Janela de confirmação encerrada");

        String token = opaqueSecret();
        String tokenHash = hash(token);
        Instant expiry = now.plusSeconds(QR_TTL_SECONDS);
        if (expiry.isAfter(list.confirmationDeadline())) expiry = list.confirmationDeadline();
        int qrVersion = list.qrVersion() + 1;
        if (list.qrTokenHash() != null) repo.revokeQrTokens(listId, now);
        repo.insertQrToken(tokenHash, listId, qrVersion, now, expiry);
        repo.updateListQr(listId, list.version(), tokenHash, expiry, qrVersion);
        long nextVersion = list.version() + 1;
        Map<String, Object> before = values("qrVersion", list.qrVersion(), "qrExpiresAt", list.qrExpiresAt());
        Map<String, Object> after = values("qrVersion", qrVersion, "qrExpiresAt", expiry);
        repo.insertListEvent(UUID.randomUUID(), listId, null, actor, qrVersion == 1 ? "QR_ISSUED" : "QR_ROTATED",
                nextVersion, null, toJson(before), toJson(after), qrVersion == 1 ? "Emissão inicial do QR" : "Rotação do QR");
        return new QrPayload(listId, token, qrVersion, expiry, nextVersion);
    }

    @Transactional
    public Handoff createHandoff(String qrToken) {
        String tokenHash = secretHash(qrToken);
        FrequencyRepository.QrToken observed = repo.qrToken(tokenHash, false)
                .orElseThrow(() -> ApiException.conflict("QR inválido ou expirado"));
        Instant observedAt = clock.instant();
        if (observed.revokedAt() != null || !observedAt.isBefore(observed.expiresAt())
                || !repo.currentQr(observed.listId(), tokenHash, observed.version(), observedAt)) {
            throw ApiException.conflict("QR inválido ou expirado");
        }

        // A ordem é a mesma de renew/finalize: lista antes do token QR.
        ListSnapshot list = repo.list(observed.listId(), true);
        FrequencyRepository.QrToken token = repo.qrToken(tokenHash, true)
                .orElseThrow(() -> ApiException.conflict("QR inválido ou expirado"));
        Instant now = clock.instant();
        if (token.revokedAt() != null || !now.isBefore(token.expiresAt())
                || !token.listId().equals(list.id())
                || !repo.currentQr(list.id(), tokenHash, token.version(), now)) {
            throw ApiException.conflict("QR inválido ou expirado");
        }
        String handoffId = opaqueSecret();
        Instant expiresAt = token.expiresAt();
        repo.insertHandoff(hash(handoffId), list.id(), tokenHash, token.version(), expiresAt);
        return new Handoff(handoffId, expiresAt);
    }

    @Transactional
    public Confirmation confirm(UUID actor, ConfirmPresence command) {
        return confirm(actor, command, null);
    }

    @Transactional
    public Confirmation confirmLegacy(UUID actor, UUID eventId, String payload) {
        return confirm(actor, new ConfirmPresence(payload, null), eventId);
    }

    private Confirmation confirm(UUID actor, ConfirmPresence command, UUID expectedEventId) {
        transactions.lock();
        access.requireActive(actor);
        boolean hasQr = command.qrToken() != null && !command.qrToken().isBlank();
        boolean hasHandoff = command.handoffId() != null && !command.handoffId().isBlank();
        if (hasQr == hasHandoff) throw ApiException.invalid("Informe qrToken ou handoffId, exclusivamente");

        FrequencyRepository.QrToken qr = null;
        FrequencyRepository.HandoffData handoff = null;
        String handoffHash = null;
        UUID listId;
        if (hasQr) {
            String qrHash = secretHash(command.qrToken());
            qr = repo.qrToken(qrHash, false).orElseThrow(() -> ApiException.conflict("QR inválido, expirado ou revogado"));
            listId = qr.listId();
        } else {
            handoffHash = secretHash(command.handoffId());
            Optional<FrequencyRepository.HandoffData> observedHandoff = repo.handoff(handoffHash, false);
            if (observedHandoff.isEmpty()) {
                Optional<UUID> replayList = repo.handoffReplayList(handoffHash, actor);
                if (replayList.isPresent()) {
                    Optional<FrequencyRepository.AttendanceRef> replay = repo.attendanceForList(replayList.get(), actor);
                    if (replay.isPresent()) {
                        FrequencyRepository.AttendanceRef presence = replay.get();
                        return new Confirmation(presence.id(), presence.eventId(), replayList.get(),
                                ParticipantStatus.PRESENTE, presence.createdAt(), true);
                    }
                }
                throw ApiException.conflict("Handoff inválido ou expirado");
            }
            handoff = observedHandoff.get();
            listId = handoff.listId();
        }

        ListSnapshot list = repo.list(listId, true);
        if (hasQr) {
            qr = repo.qrToken(qr.hash(), true)
                    .orElseThrow(() -> ApiException.conflict("QR inválido, expirado ou revogado"));
        } else {
            handoff = repo.handoff(handoff.hash(), true)
                    .orElseThrow(() -> ApiException.conflict("Handoff inválido ou expirado"));
        }
        if (expectedEventId != null && !expectedEventId.equals(list.calendarEventId())) {
            throw ApiException.conflict("QR não corresponde ao encontro informado");
        }
        Optional<FrequencyRepository.AttendanceRef> existing = repo.attendanceForList(listId, actor);
        if (existing.isPresent()) {
            if (handoff != null && handoff.consumedBy() != null && !handoff.consumedBy().equals(actor)) {
                throw ApiException.conflict("Handoff já consumido por outra identidade");
            }
            FrequencyRepository.AttendanceRef presence = existing.get();
            if (handoff != null && !repo.hasHandoffReplay(handoff.hash(), actor)) {
                repo.insertListEvent(UUID.randomUUID(), listId, actor, actor, "PRESENCE_CONFIRMATION_REPLAYED",
                        list.version(), null, null,
                        toJson(values("attendanceId", presence.id(), "handoffHash", handoff.hash())),
                        "Referência idempotente à presença existente");
            }
            return new Confirmation(presence.id(), presence.eventId(), listId, ParticipantStatus.PRESENTE,
                    presence.createdAt(), true);
        }

        Instant now = clock.instant();
        if (list.status() != ListStatus.ABERTA || !now.isBefore(list.confirmationDeadline())) {
            throw ApiException.conflict("Lista ou janela de confirmação encerrada");
        }
        if (hasQr) {
            if (qr.revokedAt() != null || !now.isBefore(qr.expiresAt())
                    || !repo.currentQr(listId, qr.hash(), qr.version(), now)) {
                throw ApiException.conflict("QR inválido, expirado ou revogado");
            }
        } else {
            if (handoff.consumedAt() != null || handoff.consumedBy() != null || !now.isBefore(handoff.expiresAt())
                    || !handoff.tokenHash().equals(list.qrTokenHash()) || handoff.qrVersion() != list.qrVersion()
                    || !repo.currentQr(listId, handoff.tokenHash(), handoff.qrVersion(), now)) {
                throw ApiException.conflict("Handoff inválido, expirado ou revogado");
            }
        }

        Participant member = repo.participant(listId, actor)
                .orElseThrow(ApiException::forbidden);
        if (!member.storedStatus().equals(ParticipantStatus.AGUARDANDO.name())) {
            throw ApiException.conflict("Participante não aguarda confirmação");
        }
        UUID attendanceId = repo.createAttendance(list.calendarEventId(), actor);
        Instant confirmedAt = repo.attendanceCreatedAt(attendanceId);
        long nextListVersion = list.version() + 1;
        long nextMemberVersion = member.version() + 1;
        repo.updateMember(listId, actor, member.version(), ParticipantStatus.PRESENTE,
                attendanceId, confirmedAt, confirmedAt, actor, null);
        repo.incrementVersion(listId, list.version());
        if (handoff != null) repo.consumeHandoff(handoff.hash(), actor, confirmedAt);

        repo.insertListEvent(UUID.randomUUID(), listId, actor, actor, "PRESENCE_CONFIRMED",
                nextListVersion, nextMemberVersion,
                toJson(values("status", member.storedStatus())),
                toJson(handoff == null
                        ? values("status", ParticipantStatus.PRESENTE, "attendanceId", attendanceId, "confirmedAt", confirmedAt)
                        : values("status", ParticipantStatus.PRESENTE, "attendanceId", attendanceId,
                                "confirmedAt", confirmedAt, "handoffHash", handoff.hash())),
                "Confirmação individual por QR");
        Presence presence = attendance.attendance(attendanceId);
        journal.record(actor, actor, "ATTENDANCE", attendanceId, presence.version(), "CREATED",
                null, presence, "Presença individual pela Frequência");
        return new Confirmation(attendanceId, list.calendarEventId(), listId, ParticipantStatus.PRESENTE, confirmedAt, false);
    }

    @Transactional
    public ListView finalizeList(UUID actor, UUID listId, FinalizeList command) {
        transactions.lock();
        access.requireAdministrator(actor);
        ListSnapshot list = repo.list(listId, true);
        if (list.status() != ListStatus.ABERTA && command.expectedVersion() < Long.MAX_VALUE
                && repo.hasFinalization(listId, command.expectedVersion() + 1, actor,
                command.outcome(), command.reason())) {
            return view(list);
        }
        checkVersion(list.version(), command.expectedVersion());
        if (list.status() != ListStatus.ABERTA) throw ApiException.conflict("Lista não está aberta");
        validateOutcome(list, command.outcome());

        Instant closedAt = clock.instant();
        Event eventBefore = repo.lockEvent(list.calendarEventId());
        long nextListVersion = list.version() + 1;
        if (command.outcome() == Outcome.REALIZADA_CONTABILIZAVEL) {
            ParticipantQueryPage page;
            int pageNumber = 0;
            do {
                page = repo.participants(listId, null, null, pageNumber, 100);
                for (Participant participant : page.items()) {
                    if (!participant.storedStatus().equals(ParticipantStatus.AGUARDANDO.name())) continue;
                    repo.markWaitingAsAbsent(listId, participant.memberId(), participant.version(), closedAt, actor,
                            "Ausência gerada ao concluir a reunião contabilizável");
                    repo.insertListEvent(UUID.randomUUID(), listId, participant.memberId(), actor, "ABSENCE_RECORDED",
                            nextListVersion, participant.version() + 1,
                            toJson(values("status", participant.storedStatus())),
                            toJson(values("status", ParticipantStatus.AUSENTE)),
                            "Ausência gerada ao concluir a reunião contabilizável");
                }
                pageNumber++;
            } while ((long) pageNumber * 100 < page.total());
        }

        revokeQr(list, actor, closedAt, nextListVersion, "QR revogado ao concluir a lista");
        repo.updateListFinal(listId, list.version(), ListStatus.CONCLUIDA, command.outcome(), closedAt, actor);
        Event eventAfter = repo.closeEvent(eventBefore.id(), eventBefore.version(), EventStatus.ENCERRADO, closedAt);
        repo.insertListEvent(UUID.randomUUID(), listId, null, actor, "LIST_FINALIZED", nextListVersion, null,
                toJson(values("status", list.status(), "outcome", list.outcome())),
                toJson(values("status", ListStatus.CONCLUIDA, "outcome", command.outcome())), command.reason());
        journal.record(actor, null, "CALENDAR_EVENT", eventAfter.id(), eventAfter.version(), "SESSION_CLOSED",
                eventBefore, eventAfter, command.reason());
        return view(repo.list(listId, false));
    }

    @Transactional
    public ListView cancelList(UUID actor, UUID listId, CancelList command) {
        transactions.lock();
        access.requireAdministrator(actor);
        ListSnapshot list = repo.list(listId, true);
        if (list.status() == ListStatus.CANCELADA) return view(list);
        checkVersion(list.version(), command.expectedVersion());
        if (!Boolean.TRUE.equals(command.confirmed())) throw ApiException.invalid("Confirmação explícita obrigatória");
        return cancelLocked(actor, list, command.reason());
    }

    @Transactional
    public Optional<Event> cancelForAgenda(UUID actor, UUID eventId, long expectedEventVersion,
                                          String reason, Boolean confirmed) {
        transactions.lock();
        access.requireAdministrator(actor);
        Event event = repo.lockEvent(eventId);
        if (event.version() != expectedEventVersion) throw ApiException.conflict("Encontro alterado; consulte a versão atual");
        Optional<ListSnapshot> linked = repo.listByEvent(eventId, true);
        if (linked.isEmpty()) return Optional.empty();
        if (linked.get().status() != ListStatus.CANCELADA) {
            if (!Boolean.TRUE.equals(confirmed)) throw ApiException.invalid("Confirmação explícita obrigatória");
            cancelLocked(actor, linked.get(), reason);
        }
        return Optional.of(repo.event(eventId));
    }

    private ListView cancelLocked(UUID actor, ListSnapshot list, String reason) {
        Instant canceledAt = clock.instant();
        Event eventBefore = repo.lockEvent(list.calendarEventId());
        long nextListVersion = list.version() + 1;
        revokeQr(list, actor, canceledAt, nextListVersion, "QR revogado ao cancelar a lista");
        repo.updateListFinal(list.id(), list.version(), ListStatus.CANCELADA, Outcome.NAO_REALIZADA, canceledAt, actor);
        Event eventAfter = repo.closeEvent(eventBefore.id(), eventBefore.version(), EventStatus.CANCELADO, canceledAt);
        repo.insertListEvent(UUID.randomUUID(), list.id(), null, actor, "LIST_CANCELLED", nextListVersion, null,
                toJson(values("status", list.status(), "outcome", list.outcome())),
                toJson(values("status", ListStatus.CANCELADA, "outcome", Outcome.NAO_REALIZADA)), reason);
        journal.record(actor, null, "CALENDAR_EVENT", eventAfter.id(), eventAfter.version(), "CANCELLED",
                eventBefore, eventAfter, reason);
        return view(repo.list(list.id(), false));
    }

    @Transactional
    public ParticipantView changeParticipant(UUID actor, UUID listId, UUID memberId, ChangeParticipant command) {
        transactions.lock();
        access.requireAdministrator(actor);
        ListSnapshot list = repo.list(listId, true);
        Participant participant = repo.participant(listId, memberId).orElseThrow(ApiException::notFound);
        ParticipantStatus target;
        try {
            target = ParticipantStatus.valueOf(command.targetStatus());
        } catch (IllegalArgumentException ex) {
            throw ApiException.invalid("Situação administrativa inválida");
        }
        ParticipantStatus current = ParticipantStatus.valueOf(participant.storedStatus());
        String reason = justificationReason(target, command.reason());
        if (current == target) {
            if (java.util.Objects.equals(participant.reason(), reason)) return participantView(list, participant);
            throw ApiException.conflict("Situação já aplicada com outro motivo; consulte a versão atual");
        }
        checkVersion(list.version(), command.expectedVersion());
        if (current == ParticipantStatus.PRESENTE) throw ApiException.conflict("Presença confirmada por QR é imutável");
        if (list.status() == ListStatus.CANCELADA || (list.status() == ListStatus.CONCLUIDA
                && list.outcome() != Outcome.REALIZADA_CONTABILIZAVEL)) {
            throw ApiException.conflict("Lista fora da apuração não admite justificativa");
        }
        if (list.status() == ListStatus.ABERTA) {
            if (current != ParticipantStatus.AGUARDANDO || target != ParticipantStatus.JUSTIFICADO) {
                throw ApiException.conflict("Durante a abertura, somente AGUARDANDO pode virar JUSTIFICADO");
            }
        } else if (list.status() == ListStatus.CONCLUIDA) {
            boolean allowed = (current == ParticipantStatus.AUSENTE && target == ParticipantStatus.JUSTIFICADO)
                    || (current == ParticipantStatus.JUSTIFICADO && target == ParticipantStatus.AUSENTE);
            if (!allowed) throw ApiException.conflict("Correção pós-conclusão permitida somente entre AUSENTE e JUSTIFICADO");
        }
        Instant changedAt = clock.instant();
        long nextListVersion = list.version() + 1;
        long nextMemberVersion = participant.version() + 1;
        repo.updateMember(listId, memberId, participant.version(), target, null, null, changedAt, actor, reason);
        repo.incrementVersion(listId, list.version());
        repo.insertListEvent(UUID.randomUUID(), listId, memberId, actor,
                target == ParticipantStatus.JUSTIFICADO ? "PARTICIPANT_JUSTIFIED" : "JUSTIFICATION_REVOKED",
                nextListVersion, nextMemberVersion,
                toJson(values("status", current)), toJson(values("status", target)), reason);
        return participantView(repo.list(listId, false), repo.participant(listId, memberId).orElseThrow());
    }

    @Transactional(readOnly = true)
    public ListView list(UUID actor, UUID listId) {
        access.requireAdministrator(actor);
        return view(repo.list(listId, false));
    }

    @Transactional(readOnly = true)
    public PageResult<ListView> lists(UUID actor, java.time.LocalDate from, java.time.LocalDate to,
                                     String status, int page, int size) {
        access.requireAdministrator(actor);
        if (from != null && to != null && from.isAfter(to)) throw ApiException.invalid("Período invertido");
        if (to != null && to.equals(java.time.LocalDate.MAX)) throw ApiException.invalid("Data final fora do intervalo permitido");
        if (status != null) {
            try { ListStatus.valueOf(status); }
            catch (IllegalArgumentException ex) { throw ApiException.invalid("Estado de lista inválido"); }
        }
        PageResult<ListSnapshot> result = repo.lists(from, to, status, page, size);
        return new PageResult<>(result.items().stream().map(this::view).toList(), page, size, result.total());
    }

    @Transactional(readOnly = true)
    public ParticipantPage participants(UUID actor, UUID listId, String status, String name, int page, int size) {
        access.requireAdministrator(actor);
        ListSnapshot list = repo.list(listId, false);
        if (status != null && !DISPLAYABLE_STATUSES.contains(status)) throw ApiException.invalid("Situação de participante inválida");
        ParticipantQueryPage result = repo.participants(listId, status, nameFilter(name), page, size);
        List<ParticipantView> items = result.items().stream().map(p -> participantView(list, p)).toList();
        return new ParticipantPage(items, page, size, result.total(), result.pageCount(), result.counts());
    }

    @Transactional(readOnly = true)
    public List<ListUpdate> updates(UUID actor, UUID listId, long afterVersion) {
        access.requireAdministrator(actor);
        ListSnapshot list = repo.list(listId, false);
        if (afterVersion < 0 || afterVersion > list.version()) throw ApiException.invalid("afterVersion inválida");
        return repo.updates(listId, afterVersion);
    }

    public boolean hasListForEvent(UUID eventId) {
        return repo.listExistsForEvent(eventId);
    }

    @Transactional(readOnly = true)
    public Summary personalSummary(UUID actor, LocalDate from, LocalDate to, GroupBy groupBy) {
        access.requireActive(actor);
        FrequencyRules.range(from, to);
        Instant start = FrequencyRules.startOf(from);
        Instant end = FrequencyRules.endExclusive(to);
        Instant activatedAt = repo.activatedAt();
        AggregateCounts total = repo.counts(actor, start, end, activatedAt);
        List<Bucket> buckets = groupBy == null ? List.of() : buildBuckets(from, to, groupBy,
                repo.bucketCounts(actor, start, end, activatedAt, groupBy));
        return new Summary(new Period(from, to, ZONE.getId()), counts(total), buckets);
    }

    @Transactional(readOnly = true)
    public List<PersonalOpenList> personalOpenLists(UUID actor) {
        access.requireActive(actor);
        return repo.personalOpenLists(actor, clock.instant());
    }

    @Transactional(readOnly = true)
    public PageResult<HistoryEntry> personalHistory(UUID actor, LocalDate from, LocalDate to, int page, int size) {
        access.requireActive(actor);
        FrequencyRules.range(from, to);
        return historyPage(actor, FrequencyRules.startOf(from), FrequencyRules.endExclusive(to), page, size);
    }

    @Transactional(readOnly = true)
    public PageResult<CollectiveSummaryRow> collectiveSummary(UUID actor, LocalDate from, LocalDate to,
                                                                String name, int page, int size) {
        access.requireAdministrator(actor);
        FrequencyRules.range(from, to);
        PageResult<CollectiveAggregate> result = repo.collectiveCounts(
                FrequencyRules.startOf(from), FrequencyRules.endExclusive(to), repo.activatedAt(),
                nameFilter(name), page, size);
        Map<UUID, List<FrequencyRepository.AbsenceHistory>> recent = new HashMap<>();
        for (FrequencyRepository.AbsenceHistory meeting : repo.lastCountableMeetings(
                result.items().stream().map(CollectiveAggregate::memberId).toList(), repo.activatedAt())) {
            recent.computeIfAbsent(meeting.memberId(), ignored -> new ArrayList<>()).add(meeting);
        }
        List<CollectiveSummaryRow> rows = result.items().stream().map(row -> {
            List<FrequencyRepository.AbsenceHistory> history = recent.getOrDefault(row.memberId(), List.of());
            List<AbsenceMeeting> meetings = history.stream().map(FrequencyRepository.AbsenceHistory::meeting).toList();
            boolean signal = history.size() == 3 && history.stream()
                    .allMatch(item -> ParticipantStatus.AUSENTE.name().equals(item.status()));
            return new CollectiveSummaryRow(row.memberId(), row.displayName(), counts(row.counts()),
                    new AbsenceSignal(signal, meetings));
        }).toList();
        return new PageResult<>(rows, page, size, result.total());
    }

    @Transactional(readOnly = true)
    public PageResult<HistoryEntry> collectiveHistory(UUID actor, UUID memberId, LocalDate from,
                                                        LocalDate to, int page, int size) {
        access.requireAdministrator(actor);
        members.require(memberId);
        FrequencyRules.range(from, to);
        return historyPage(memberId, FrequencyRules.startOf(from), FrequencyRules.endExclusive(to), page, size);
    }

    private PageResult<HistoryEntry> historyPage(UUID memberId, Instant from, Instant to, int page, int size) {
        PageResult<HistoryRecord> result = repo.history(memberId, from, to, repo.activatedAt(), page, size);
        Instant evaluatedAt = clock.instant();
        List<HistoryEntry> items = result.items().stream().map(record -> historyEntry(record, evaluatedAt)).toList();
        return new PageResult<>(items, page, size, result.total());
    }

    private HistoryEntry historyEntry(HistoryRecord record, Instant evaluatedAt) {
        HistoryListStatus listStatus = HistoryListStatus.valueOf(record.listStatus());
        Outcome outcome = record.outcome() == null ? null : Outcome.valueOf(record.outcome());
        ConfirmationWindowStatus windowStatus = switch (listStatus) {
            case LEGADO -> ConfirmationWindowStatus.NAO_APLICAVEL;
            case CONCLUIDA, CANCELADA -> ConfirmationWindowStatus.ENCERRADA;
            case ABERTA -> record.confirmationDeadline().isAfter(evaluatedAt)
                    ? ConfirmationWindowStatus.ABERTA : ConfirmationWindowStatus.EXPIRADA;
        };

        AccountingStatus accountingStatus;
        NonApurationReason notCountedReason;
        if (listStatus == HistoryListStatus.LEGADO) {
            accountingStatus = AccountingStatus.ANTERIOR_AO_CORTE;
            notCountedReason = NonApurationReason.ANTERIOR_AO_CORTE_OFICIAL;
        } else if (listStatus == HistoryListStatus.CANCELADA) {
            accountingStatus = AccountingStatus.CANCELADA;
            notCountedReason = NonApurationReason.REUNIAO_CANCELADA;
        } else if (listStatus == HistoryListStatus.ABERTA) {
            accountingStatus = AccountingStatus.AGUARDANDO_CONCLUSAO;
            notCountedReason = NonApurationReason.LISTA_AGUARDANDO_CONCLUSAO;
        } else if (outcome == Outcome.REALIZADA_CONTABILIZAVEL && record.countsForFrequency()) {
            accountingStatus = AccountingStatus.CONTABILIZADA;
            notCountedReason = null;
        } else {
            accountingStatus = AccountingStatus.NAO_CONTABILIZAVEL;
            notCountedReason = outcome == Outcome.NAO_REALIZADA
                    ? NonApurationReason.REUNIAO_NAO_REALIZADA
                    : NonApurationReason.REUNIAO_NAO_CONTABILIZAVEL;
        }

        return new HistoryEntry(record.listId(), record.calendarEventId(), record.meetingName(), record.occurredAt(),
                record.status(), record.confirmedAt(), record.changedAt(), record.legacy(), record.inApuration(), record.presenceRecorded(),
                HistoryParticipantStatus.valueOf(record.attendanceStatus()), listStatus, outcome,
                record.confirmationDeadline(), windowStatus, accountingStatus, notCountedReason);
    }

    private List<Bucket> buildBuckets(LocalDate from, LocalDate to, GroupBy groupBy,
                                      List<FrequencyRepository.BucketCounts> result) {
        Map<LocalDate, AggregateCounts> byStart = new HashMap<>();
        result.forEach(bucket -> byStart.put(bucket.periodStart(), bucket.counts()));
        LocalDate bucketStart = switch (groupBy) {
            case MONTH -> from.withDayOfMonth(1);
            case SEMESTER -> LocalDate.of(from.getYear(), from.getMonthValue() <= 6 ? 1 : 7, 1);
        };
        List<Bucket> buckets = new ArrayList<>();
        while (!bucketStart.isAfter(to)) {
            LocalDate nextStart = switch (groupBy) {
                case MONTH -> bucketStart.plusMonths(1);
                case SEMESTER -> bucketStart.plusMonths(6);
            };
            LocalDate bucketFrom = from.isAfter(bucketStart) ? from : bucketStart;
            LocalDate bucketTo = to.isBefore(nextStart.minusDays(1)) ? to : nextStart.minusDays(1);
            AggregateCounts aggregate = byStart.getOrDefault(bucketStart, new AggregateCounts(0, 0, 0, 0));
            buckets.add(new Bucket(new Period(bucketFrom, bucketTo, ZONE.getId()), counts(aggregate)));
            bucketStart = nextStart;
        }
        return List.copyOf(buckets);
    }

    private Counts counts(AggregateCounts aggregate) {
        return new Counts(aggregate.eligibleMeetings(), aggregate.present(), aggregate.justified(),
                aggregate.unjustifiedAbsences(), FrequencyRules.percentage(aggregate.present(), aggregate.eligibleMeetings()),
                aggregate.eligibleMeetings() == 0);
    }

    private String nameFilter(String name) {
        if (name == null || name.isBlank()) return null;
        String normalized = name.strip();
        if (normalized.length() > 120) throw ApiException.invalid("A busca por nome aceita até 120 caracteres");
        return FrequencyRules.sortKey(normalized);
    }

    private ListView view(ListSnapshot list) {
        QrMetadata qr = null;
        if (list.qrTokenHash() != null) {
            String state = list.status() == ListStatus.ABERTA && clock.instant().isBefore(list.confirmationDeadline())
                    ? "ATIVA" : "EXPIRADA";
            qr = new QrMetadata(list.qrVersion(), list.qrExpiresAt(), state);
        }
        return new ListView(list.id(), list.calendarEventId(), list.meetingName(), list.classification(),
                list.countsForFrequency(), list.status(), list.outcome(), list.openedAt(), list.openedBy(),
                list.confirmationWindowMinutes(), list.confirmationDeadline(), list.closedAt(), list.closedBy(), qr, list.version());
    }

    private ParticipantView participantView(ListSnapshot list, Participant participant) {
        String status = participant.storedStatus();
        boolean outside = list.status() == ListStatus.CANCELADA || (list.status() == ListStatus.CONCLUIDA
                && list.outcome() != Outcome.REALIZADA_CONTABILIZAVEL);
        if (outside && (status.equals(ParticipantStatus.AGUARDANDO.name()) || status.equals(ParticipantStatus.AUSENTE.name()))) {
            status = "FORA_DA_APURACAO";
        }
        return new ParticipantView(participant.memberId(), participant.displayName(), status, participant.confirmedAt(),
                participant.changedAt(), participant.changedBy(), participant.reason());
    }

    private void validateScheduledEvent(Event event, Instant now, int windowMinutes) {
        if (event.kind() == EventKind.FERIADO || event.status() != EventStatus.AGENDADO || event.endsAt() == null
                || now.isBefore(event.startsAt()) || !now.isBefore(event.endsAt())
                || now.plusSeconds(windowMinutes * 60L).isAfter(event.endsAt())) {
            throw ApiException.conflict("Encontro indisponível ou sem tempo suficiente para a janela de confirmação");
        }
    }

    private boolean countsForFrequency(boolean regular, Boolean requested) {
        if (regular) {
            if (requested != null) throw ApiException.invalid("countsForFrequency não se aplica a reunião regular");
            return true;
        }
        if (requested == null) throw ApiException.invalid("countsForFrequency é obrigatório para reunião excepcional");
        return requested;
    }

    private String cleanMeetingName(String name) {
        if (name == null || name.isBlank() || name.strip().length() > 200) {
            throw ApiException.invalid("meetingName é obrigatório e limitado a 200 caracteres");
        }
        return name.strip();
    }

    private String openRequestHash(OpenList command, String normalizedName) {
        String canonical = String.join("|", String.valueOf(command.calendarEventId()),
                String.valueOf(normalizedName), String.valueOf(command.confirmationWindowMinutes()),
                String.valueOf(command.countsForFrequency()));
        return hash(canonical);
    }

    private String requestHashFor(UUID listId) {
        return repo.requestHash(listId);
    }

    private void validateOutcome(ListSnapshot list, Outcome outcome) {
        if (list.classification() == Classification.REGULAR) {
            if (outcome != Outcome.REALIZADA_CONTABILIZAVEL && outcome != Outcome.NAO_REALIZADA) {
                throw ApiException.invalid("Reunião regular deve contar quando realizada");
            }
            return;
        }
        if (outcome == Outcome.REALIZADA_CONTABILIZAVEL && !list.countsForFrequency()) {
            throw ApiException.invalid("Reunião excepcional foi definida como não contabilizável");
        }
        if (outcome == Outcome.REALIZADA_NAO_CONTABILIZAVEL && list.countsForFrequency()) {
            throw ApiException.invalid("Reunião excepcional foi definida como contabilizável");
        }
    }

    private String justificationReason(ParticipantStatus target, String reasonCode) {
        if (target == ParticipantStatus.JUSTIFICADO && "EMAIL_EXTERNO_RECEBIDO".equals(reasonCode)) {
            return "Comunicação externa recebida por e-mail";
        }
        if (target == ParticipantStatus.AUSENTE && "CORRECAO_ADMINISTRATIVA".equals(reasonCode)) {
            return "Correção administrativa";
        }
        throw ApiException.invalid("Motivo administrativo incompatível com a situação solicitada");
    }

    private void checkVersion(long actual, long expected) {
        if (actual != expected) throw ApiException.conflict("Lista alterada; consulte a versão atual");
    }

    private void revokeQr(ListSnapshot list, UUID actor, Instant at, long nextListVersion, String reason) {
        if (list.qrTokenHash() != null) {
            repo.insertListEvent(UUID.randomUUID(), list.id(), null, actor, "QR_REVOKED", nextListVersion, null,
                    toJson(values("qrVersion", list.qrVersion(), "qrExpiresAt", list.qrExpiresAt())),
                    toJson(values("revoked", true)), reason);
        }
        repo.revokeQrTokens(list.id(), at);
    }

    private String opaqueSecret() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String secretHash(String secret) {
        if (secret == null || secret.length() != 43) throw ApiException.conflict("Código inválido, expirado ou revogado");
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(secret);
            if (decoded.length != 32) throw ApiException.conflict("Código inválido, expirado ou revogado");
        } catch (IllegalArgumentException error) {
            throw ApiException.conflict("Código inválido, expirado ou revogado");
        }
        return hash(secret);
    }

    private static String hash(String value) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 indisponível", error);
        }
    }

    private String toJson(Object value) {
        return json.writeValueAsString(value);
    }

    private Map<String, Object> values(Object... pairs) {
        Map<String, Object> result = new HashMap<>();
        for (int i = 0; i < pairs.length; i += 2) result.put((String) pairs[i], pairs[i + 1]);
        return result;
    }
}
