package br.edu.unijorge.niteconnect.meetings.application;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Provider boundary for Teams meetings; tests replace this port, production uses Microsoft Graph. */
public interface MeetingProvider {
    Capabilities capabilities(String userAssertion);
    CreatedMeeting createMeeting(String userAssertion, CreateRequest request);
    UpdatedMeeting updateMeeting(String userAssertion, String eventId, UpdateRequest request);
    void cancelMeeting(String userAssertion, String eventId, String comment);
    default Optional<AttendanceReport> latestAttendanceReport(String userAssertion, String onlineMeetingId) {
        return Optional.empty();
    }

    record Capabilities(List<String> allowedOnlineMeetingProviders, String defaultOnlineMeetingProvider) {
        public Capabilities { allowedOnlineMeetingProviders = List.copyOf(allowedOnlineMeetingProviders); }
        public boolean supportsTeamsForBusiness() { return allowedOnlineMeetingProviders.contains("teamsForBusiness"); }
    }

    record Invitee(String name, String institutionalEmail) {}

    record CreateRequest(UUID transactionId, String title, Instant startsAt, Instant endsAt,
                         List<Invitee> invitees) {
        public CreateRequest { invitees = List.copyOf(invitees); }
    }

    record UpdateRequest(String title, Instant startsAt, Instant endsAt, List<Invitee> invitees) {
        public UpdateRequest { invitees = List.copyOf(invitees); }
    }

    record CreatedMeeting(String eventId, String onlineMeetingId, String joinUrl, String changeKey) {}

    record UpdatedMeeting(String changeKey) {}

    record AttendanceReport(String reportId, Instant startsAt, Instant endsAt,
                            List<AttendanceRecord> records) {
        public AttendanceReport { records = List.copyOf(records); }
    }

    record AttendanceRecord(String recordId, UUID tenantId, UUID objectId, Long durationSeconds,
                            List<AttendanceInterval> intervals) {
        public AttendanceRecord { intervals = List.copyOf(intervals); }
    }

    record AttendanceInterval(Instant joinedAt, Instant leftAt, Long durationSeconds) { }
}
