package br.edu.unijorge.niteconnect.members.api;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.domain.GlobalRole;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import br.edu.unijorge.niteconnect.members.application.MemberAdministration;
import br.edu.unijorge.niteconnect.members.domain.Member;
import br.edu.unijorge.niteconnect.members.domain.MemberStatus;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/members")
public class MemberController {
    private final MemberAdministration members;
    private final IdentityDirectory identities;
    private final AccessService access;
    public MemberController(MemberAdministration members, IdentityDirectory identities, AccessService access) {
        this.members = members; this.identities = identities; this.access = access;
    }
    @GetMapping
    PageResult<Member> list(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue="0") int page,
                            @RequestParam(defaultValue="20") int size, @RequestParam(required=false) MemberStatus status) {
        return members.list(identities.member(jwt), page, size, status);
    }
    @GetMapping("/{id}")
    Member read(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return members.read(identities.member(jwt), id); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    Member create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody MemberContracts.Create input) {
        return members.create(identities.member(jwt), input.name(), input.institutionalEmail());
    }
    @PatchMapping("/{id}")
    Member update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody MemberContracts.Update input) {
        return members.update(identities.member(jwt), id, input.name(), input.institutionalEmail(), input.expectedVersion(), input.reason());
    }
    @PatchMapping("/{id}/status")
    Member status(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody MemberContracts.StatusChange input) {
        return members.changeStatus(identities.member(jwt), id, input.status(), input.expectedVersion(), input.reason());
    }
    @PostMapping("/{id}/roles")
    List<String> grant(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody MemberContracts.RoleGrant input) {
        return access.grant(identities.member(jwt), id, input.role(), input.expectedVersion(), input.reason());
    }
    @DeleteMapping("/{id}/roles/{role}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void revoke(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable GlobalRole role,
                @Valid @RequestBody MemberContracts.RoleRevoke input) {
        access.revoke(identities.member(jwt), id, role, input.expectedVersion(), input.reason());
    }
}
