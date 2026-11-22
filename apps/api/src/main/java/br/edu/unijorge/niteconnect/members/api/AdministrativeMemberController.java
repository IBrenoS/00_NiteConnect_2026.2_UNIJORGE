package br.edu.unijorge.niteconnect.members.api;

import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import br.edu.unijorge.niteconnect.members.application.AdministrativeMemberDirectory;
import br.edu.unijorge.niteconnect.members.domain.MemberStatus;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/administrative/members")
public class AdministrativeMemberController {
    private final AdministrativeMemberDirectory directory;
    private final IdentityDirectory identities;

    public AdministrativeMemberController(AdministrativeMemberDirectory directory, IdentityDirectory identities) {
        this.directory = directory; this.identities = identities;
    }

    @GetMapping
    PageResult<AdministrativeMemberDirectory.Summary> list(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) String q, @RequestParam(required = false) MemberStatus status,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return directory.list(identities.member(jwt), q, status, page, size);
    }

    @GetMapping("/{id}")
    AdministrativeMemberDirectory.Detail detail(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return directory.detail(identities.member(jwt), id);
    }

    @GetMapping("/{id}/history")
    PageResult<AdministrativeMemberDirectory.Event> history(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return directory.history(identities.member(jwt), id, page, size);
    }
}
