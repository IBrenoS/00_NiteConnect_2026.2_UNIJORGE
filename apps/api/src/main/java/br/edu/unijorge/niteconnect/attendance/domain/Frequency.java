package br.edu.unijorge.niteconnect.attendance.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class Frequency {
    private Frequency() {}

    public enum Classification { REGULAR, EXCEPTIONAL }
    public enum ListStatus { ABERTA, CONCLUIDA, CANCELADA }
    public enum Outcome { REALIZADA_CONTABILIZAVEL, REALIZADA_NAO_CONTABILIZAVEL, NAO_REALIZADA }
    public enum ParticipantStatus { AGUARDANDO, PRESENTE, JUSTIFICADO, AUSENTE }
    public enum GroupBy { MONTH, SEMESTER }
    public enum PersonalConfirmationStatus { AGUARDANDO_CONFIRMACAO, PRESENCA_REGISTRADA, JUSTIFICADO, NAO_ELEGIVEL }
    public enum HistoryListStatus { ABERTA, CONCLUIDA, CANCELADA, LEGADO }
    public enum ConfirmationWindowStatus { ABERTA, EXPIRADA, ENCERRADA, NAO_APLICAVEL }
    public enum AccountingStatus { AGUARDANDO_CONCLUSAO, CONTABILIZADA, NAO_CONTABILIZAVEL, CANCELADA, ANTERIOR_AO_CORTE }
    public enum NonApurationReason {
        LISTA_AGUARDANDO_CONCLUSAO, REUNIAO_CANCELADA, REUNIAO_NAO_REALIZADA,
        REUNIAO_NAO_CONTABILIZAVEL, ANTERIOR_AO_CORTE_OFICIAL
    }
    public enum HistoryParticipantStatus { AGUARDANDO, PRESENTE, JUSTIFICADO, AUSENTE, LEGADO }

    public record OpenedBy(UUID memberId, String displayName, String role) {}

    public record QrMetadata(int version, Instant expiresAt, String windowState) {}

    public record ListSnapshot(
            UUID id,
            UUID calendarEventId,
            String meetingName,
            Classification classification,
            boolean countsForFrequency,
            int confirmationWindowMinutes,
            Instant confirmationDeadline,
            Instant openedAt,
            OpenedBy openedBy,
            Instant closedAt,
            UUID closedBy,
            ListStatus status,
            Outcome outcome,
            String qrTokenHash,
            Instant qrExpiresAt,
            int qrVersion,
            long version) {}

    public record ListView(
            UUID listId,
            UUID calendarEventId,
            String meetingName,
            Classification classification,
            boolean countsForFrequency,
            ListStatus status,
            Outcome outcome,
            Instant openedAt,
            OpenedBy openedBy,
            int confirmationWindowMinutes,
            Instant confirmationDeadline,
            Instant closedAt,
            UUID closedBy,
            QrMetadata qr,
            long version) {}

    public record QrPayload(UUID listId, String qrToken, int qrVersion, Instant expiresAt, long version) {}

    public record Participant(
            UUID memberId,
            String displayName,
            String storedStatus,
            Instant confirmedAt,
            Instant changedAt,
            UUID changedBy,
            String reason,
            long version) {}

    public record ParticipantView(
            UUID memberId,
            String displayName,
            String status,
            Instant confirmedAt,
            Instant changedAt,
            UUID changedBy,
            String reason) {}

    public record ParticipantCounts(long rosterTotal, long present, long justified, long absent,
                                    long awaitingConfirmation, long outsideApuration) {}

    public record ParticipantPage(List<ParticipantView> items, int page, int size, long total,
                                  int pageCount, ParticipantCounts counts) {}

    public record PersonalOpenList(UUID listId, UUID calendarEventId, String meetingName,
                                   Classification classification, Instant scheduledAt, Instant openedAt,
                                   Instant confirmationDeadline, Instant qrExpiresAt,
                                   ConfirmationWindowStatus confirmationWindowStatus, boolean eligible,
                                   PersonalConfirmationStatus status, Instant confirmedAt,
                                   boolean confirmationAvailable) {}

    public record Confirmation(
            UUID attendanceId,
            UUID calendarEventId,
            UUID listId,
            ParticipantStatus status,
            Instant confirmedAt,
            boolean alreadyRegistered) {}

    public record Handoff(String handoffId, Instant expiresAt) {}

    public record Period(LocalDate from, LocalDate to, String zoneId) {}

    public record Counts(long eligibleMeetings, long present, long justified, long unjustifiedAbsences,
                         BigDecimal attendancePercentage, boolean noEligibleMeetings) {}

    public record Bucket(Period period, Counts counts) {}

    public record Summary(Period period, Counts counts, List<Bucket> buckets) {}

    public record AbsenceMeeting(UUID listId, UUID calendarEventId, String meetingName, Instant openedAt) {}

    public record AbsenceSignal(boolean hasThreeConsecutiveUnjustifiedAbsences, List<AbsenceMeeting> meetings) {}

    public record CollectiveSummaryRow(UUID memberId, String displayName, Counts counts, AbsenceSignal absenceSignal) {}

    public record HistoryEntry(UUID listId, UUID calendarEventId, String meetingName, Instant occurredAt,
                               String status, Instant confirmedAt, boolean legacy, boolean inApuration,
                               boolean presenceRecorded, HistoryParticipantStatus attendanceStatus,
                               HistoryListStatus listStatus, Outcome outcome, Instant confirmationDeadline,
                               ConfirmationWindowStatus confirmationWindowStatus, AccountingStatus accountingStatus,
                               NonApurationReason notCountedReason) {}

    public record ListUpdate(long version, ListStatus status, int qrVersion, Instant qrExpiresAt,
                             String action, Instant occurredAt) {}
}
