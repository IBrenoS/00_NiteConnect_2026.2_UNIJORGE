package br.edu.unijorge.niteconnect.activities.planning.api;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.UUID;
import java.util.List;
import br.edu.unijorge.niteconnect.activities.domain.ActivityStatus;

public final class ActivityPlanningContracts {
    private ActivityPlanningContracts() {}
    public record Create(@NotBlank @Size(max=200) String title,@Size(max=10000) String description,UUID projectId) {}
    public record Update(@NotNull @PositiveOrZero Long expectedVersion,tools.jackson.databind.JsonNode title,
                         tools.jackson.databind.JsonNode description) {}
    public record CreateTask(@NotBlank @Size(max=200) String title,@Size(max=10000) String description,
                             java.time.LocalDate startOn,java.time.LocalDate dueOn,String priority,UUID primaryExecutorId,
                             @NotNull @PositiveOrZero Long expectedVersion,@Size(max=1000) String reason,
                             ActivityStatus status,List<@NotNull UUID> collaboratorIds,Boolean confirmed) {}
    public record UpdateTask(@NotNull @PositiveOrZero Long expectedVersion,
                             tools.jackson.databind.JsonNode title,tools.jackson.databind.JsonNode description,
                             tools.jackson.databind.JsonNode startOn,tools.jackson.databind.JsonNode dueOn,
                             tools.jackson.databind.JsonNode priority,UUID primaryExecutorId,ActivityStatus status,
                             List<@NotNull UUID> collaboratorIds,Boolean confirmed,@Size(max=1000) String reason) {}
    public record Delete(@NotNull @PositiveOrZero Long expectedVersion,@NotNull Boolean confirmed) {}
    public record View(UUID id,String title,String description,UUID projectId,UUID createdBy,long version,
                       Instant createdAt,Instant updatedAt,boolean canEdit,boolean canCreateTasks,boolean canDelete) {}
    public record Capabilities(boolean canRead,boolean canEdit,boolean canCreateTasks,boolean canDelete,long version) {}
    public record TaskCreated(br.edu.unijorge.niteconnect.activities.application.ActivityService.View activity,long planningVersion) {}
}
