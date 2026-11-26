package br.edu.unijorge.niteconnect.projects.api;

import br.edu.unijorge.niteconnect.projects.domain.ProjectStatus;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.UUID;

public final class ProjectContracts {
    private ProjectContracts() {}
    public record Create(@NotBlank @Size(max=200) String title, @NotBlank @Size(max=10000) String description,
                         LocalDate startsOn, LocalDate endsOn, ProjectStatus initialStatus,
                         @Size(max=1000) @Pattern(regexp="(?s).*\\S.*") String reason) {}
    public record Update(@NotBlank @Size(max=200) String title, @NotBlank @Size(max=10000) String description,
                         LocalDate startsOn, LocalDate endsOn, @NotNull @PositiveOrZero Long expectedVersion,
                         @Size(max=1000) String reason) {}
    public record StatusChange(@NotNull ProjectStatus status, @NotNull @PositiveOrZero Long expectedVersion,
                               @Size(max=1000) String reason) {}
    public record Join(@NotNull UUID memberId, @NotBlank @Size(max=200) String responsibility,
                       @NotNull @PositiveOrZero Long expectedVersion, @Size(max=1000) String reason) {}
    public record End(@NotNull @PositiveOrZero Long expectedVersion, @Size(max=1000) String reason) {}
    /** memberId null requests an explicit administrative vacancy. */
    public record Transfer(UUID memberId, @NotNull @PositiveOrZero Long expectedVersion,
                           @Size(max=1000) String reason) {}
    public record MembershipRequest(@Size(max=2000) String message) {}
    public record MembershipDecision(@NotNull Boolean approve, @Size(max=2000) String message,
                                     @NotNull @PositiveOrZero Long expectedVersion) {}
    public record Availability(@NotNull Boolean acceptingMembers, @NotNull @PositiveOrZero Long expectedVersion) {}
    public record RequestClosure(@NotNull @PositiveOrZero Long expectedVersion) {}
    public record CoverImage(@NotNull @PositiveOrZero Long expectedVersion) {}
}
