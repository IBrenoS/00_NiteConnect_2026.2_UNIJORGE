package br.edu.unijorge.niteconnect.activities.management.api;

import br.edu.unijorge.niteconnect.activities.domain.ActivityStatus;
import br.edu.unijorge.niteconnect.projects.domain.ProjectStatus;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class ActivityManagementContracts {
    private ActivityManagementContracts() {}

    public enum LinkKind { CREATED, EXECUTOR, COLLABORATOR }

    public record Item(UUID activityId, String title, UUID projectId, String projectTitle, ProjectStatus projectStatus,
                       UUID planningId, ActivityStatus status, String priority, LocalDate startOn, LocalDate dueOn,
                       UUID createdById, UUID primaryExecutorId, List<UUID> collaboratorIds, List<LinkKind> linkKinds,
                       long activeEvidenceCount, Instant createdAt, Instant completedAt, boolean overdue,
                       boolean attentionRequired) {}

    public record Summary(long total, long planned, long inProgress, long completed, long cancelled, long pending,
                          long overdue, long attentionRequired, long withEvidence, long completionDenominator,
                          double completionRate) {}

    public record Result(List<Item> items, int page, int size, long total, LocalDate asOfDate, Summary summary) {}
}
