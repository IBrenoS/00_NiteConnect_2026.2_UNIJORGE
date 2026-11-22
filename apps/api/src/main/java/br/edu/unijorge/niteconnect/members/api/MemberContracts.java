package br.edu.unijorge.niteconnect.members.api;

import br.edu.unijorge.niteconnect.access.domain.GlobalRole;
import br.edu.unijorge.niteconnect.members.domain.MemberStatus;
import jakarta.validation.constraints.*;

public final class MemberContracts {
    private MemberContracts() {}
    public record Create(@NotBlank @Size(max=160) String name,
                         @NotBlank @Email @Size(max=254) String institutionalEmail) {}
    public record Update(@NotBlank @Size(max=160) String name,
                         @NotBlank @Email @Size(max=254) String institutionalEmail,
                         @NotNull @PositiveOrZero Long expectedVersion, @NotBlank @Size(max=1000) String reason) {}
    public record StatusChange(@NotNull MemberStatus status, @NotNull @PositiveOrZero Long expectedVersion,
                               @NotBlank @Size(max=1000) String reason) {}
    public record RoleGrant(@NotNull GlobalRole role, @NotNull @PositiveOrZero Long expectedVersion,
                            @Size(max=1000) @Pattern(regexp="(?s).*\\S.*") String reason) {}
    public record RoleRevoke(@NotNull @PositiveOrZero Long expectedVersion,
                             @Size(max=1000) @Pattern(regexp="(?s).*\\S.*") String reason) {}
}
