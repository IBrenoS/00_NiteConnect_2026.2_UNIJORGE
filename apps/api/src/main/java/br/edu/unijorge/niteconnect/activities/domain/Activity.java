package br.edu.unijorge.niteconnect.activities.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record Activity(UUID id, String title, String description, UUID projectId, ActivityStatus status,
                       LocalDate startOn, LocalDate dueOn, String priority, UUID createdBy, long version, Instant createdAt, Instant updatedAt,
                       Instant completedAt, UUID primaryExecutorId) {
    public Activity(UUID id,String title,String description,UUID projectId,ActivityStatus status,LocalDate dueOn,
                    UUID createdBy,long version,Instant createdAt,Instant updatedAt,Instant completedAt,UUID primaryExecutorId) {
        this(id,title,description,projectId,status,null,dueOn,null,createdBy,version,createdAt,updatedAt,completedAt,primaryExecutorId);
    }
    public boolean overdue(LocalDate today) { return dueOn != null && dueOn.isBefore(today) && !status.terminal(); }
}
