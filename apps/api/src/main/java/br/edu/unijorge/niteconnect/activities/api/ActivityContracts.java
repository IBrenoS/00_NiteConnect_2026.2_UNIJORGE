package br.edu.unijorge.niteconnect.activities.api;

import br.edu.unijorge.niteconnect.activities.domain.ActivityStatus;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.UUID;

public final class ActivityContracts {
    private ActivityContracts() {}
    public record Create(@NotBlank @Size(max=200) String title,@Size(max=10000) String description,
                         UUID projectId,LocalDate startOn,LocalDate dueOn,String priority,UUID primaryExecutorId,
                         @Size(max=1000) String reason) {}
    public record Update(@NotNull @PositiveOrZero Long expectedVersion,@Size(max=1000) String reason,
                         tools.jackson.databind.JsonNode title,tools.jackson.databind.JsonNode description,
                         tools.jackson.databind.JsonNode startOn,tools.jackson.databind.JsonNode dueOn,
                         tools.jackson.databind.JsonNode priority,tools.jackson.databind.JsonNode projectId) {}
    public record StatusChange(@NotNull ActivityStatus status,@NotNull @PositiveOrZero Long expectedVersion,
                               @Size(max=1000) String reason,Boolean confirmed) {}
    public record Assign(@NotNull UUID memberId,@NotNull @PositiveOrZero Long expectedVersion,
                         @Size(max=1000) String reason,Boolean confirmed) {}
    public record Command(@NotNull @PositiveOrZero Long expectedVersion,@Size(max=1000) String reason,Boolean confirmed) {}
    public record Delete(@NotNull @PositiveOrZero Long expectedVersion,@NotNull Boolean confirmed) {}
}
