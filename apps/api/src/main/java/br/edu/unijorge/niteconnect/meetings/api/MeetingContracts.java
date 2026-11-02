package br.edu.unijorge.niteconnect.meetings.api;

import br.edu.unijorge.niteconnect.meetings.domain.CalendarResponseStatus;
import br.edu.unijorge.niteconnect.meetings.domain.MeetingInviteStatus;
import br.edu.unijorge.niteconnect.meetings.domain.MeetingMode;
import br.edu.unijorge.niteconnect.meetings.domain.MeetingStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class MeetingContracts {
    private MeetingContracts() { }

    public record Create(@NotNull MeetingMode mode,
                         @NotBlank @Size(max = 200) String title,
                         OffsetDateTime startsAt,
                         @Positive Integer plannedDurationMinutes,
                         @NotNull List<UUID> inviteeIds) { }

    public record Update(@Positive long expectedVersion,
                         @NotBlank @Size(max = 200) String title,
                         @NotNull OffsetDateTime startsAt,
                         @Positive int plannedDurationMinutes,
                         @NotNull List<UUID> inviteeIds) { }

    public record Cancel(@Positive long expectedVersion, @Size(max = 500) String comment) { }

    public record Respond(@Positive long expectedVersion, @NotNull MeetingInviteStatus response) { }

    public record Invitee(UUID memberId, String name, MeetingInviteStatus internalStatus,
                          CalendarResponseStatus calendarResponseStatus, Instant respondedAt, long version) { }

    public record MeetingView(UUID id, MeetingMode mode, MeetingStatus status, String title,
                              Instant startsAt, int plannedDurationMinutes, Instant plannedEndsAt,
                              Instant actualStartsAt, Instant actualEndsAt, Long actualDurationSeconds,
                              UUID organizerMemberId, String organizerName, List<Invitee> invitees,
                              long version, Instant createdAt, Instant updatedAt) {
        public MeetingView { invitees = List.copyOf(invitees); }
    }

    public record CreateOperationView(UUID meetingId, UUID operationId, MeetingStatus meetingStatus,
                                     String operationStatus, boolean retryable, Instant retryAfter) { }

    public record MutationOperationView(UUID meetingId, UUID operationId, String operationType,
                                        String operationStatus, boolean retryable, Instant retryAfter) { }

    public record Notification(UUID id, UUID meetingId, String type, String title, Instant startsAt,
                               Instant createdAt, Instant readAt) { }

    public record Attendance(String availabilityStatus, Instant actualStartsAt, Instant actualEndsAt,
                             Long actualDurationSeconds, Instant retrievedAt,
                             List<AttendanceParticipant> participants) {
        public Attendance { participants = List.copyOf(participants); }
    }

    public record AttendanceParticipant(UUID memberId, String name, Long attendanceSeconds) { }

    public record ShareLink(String path, String text) { }
}
