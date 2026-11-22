package br.edu.unijorge.niteconnect.dashboard.api;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class DashboardContracts {
    private DashboardContracts() {}
    public record Unavailable(String indicator, String reason) {}
    public record Distribution(long total,long planned,long inProgress,long completed,long cancelled,
                               long overdue,long attentionRequired,long dueSoon) {}
    public record Count(String situation,long total) {}
    public record Current(Distribution activities,List<Count> projects,List<Count> projectHealth) {}
    public record Evolution(LocalDate day,String source,String event,long total) {}
    public record Task(UUID activityId,String title,String priority,LocalDate dueOn,UUID projectId,
                       List<String> linkKinds,boolean overdue,boolean dueSoon,String href) {}
    public record Highlights<T>(long total,List<T> items) {}
    public record Project(UUID projectId,String title,String situation,boolean leader,long openActivities,String href) {}
    public record Commitment(UUID id,String source,String title,Instant startsAt,String href) {}
    public record Risk(UUID projectId,String title,String health,int maxOverdueDays,String reason,String href) {}
    public record Administrative(long pendingProposals,long pendingInvitations,long failedInvitations,long openAttendanceLists) {}
    public record Overview(String context,Instant generatedAt,LocalDate asOfDate,String timeZone,LocalDate from,LocalDate to,
                           Current current,Highlights<Risk> risks,List<Evolution> evolution,Highlights<Task> actions,
                           Highlights<Project> projects,Highlights<Commitment> commitments,
                           Administrative administrative,List<Unavailable> unavailable) {}
}
