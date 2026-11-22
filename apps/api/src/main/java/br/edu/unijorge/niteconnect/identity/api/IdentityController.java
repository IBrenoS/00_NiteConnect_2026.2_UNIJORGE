package br.edu.unijorge.niteconnect.identity.api;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import br.edu.unijorge.niteconnect.members.domain.Member;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.List;
import java.util.UUID;

@RestController
public class IdentityController {
    private final IdentityDirectory identities;
    private final AccessService access;
    private final JdbcTemplate jdbc;
    public IdentityController(IdentityDirectory identities, AccessService access, JdbcTemplate jdbc) {
        this.identities = identities; this.access = access; this.jdbc = jdbc;
    }
    @GetMapping("/api/v1/me") @Transactional(readOnly=true)
    Me me(@AuthenticationPrincipal Jwt jwt) {
        UUID member = identities.member(jwt);
        return new Me(access.requireActive(member), access.effectiveRoles(member));
    }
    @PostMapping("/api/v1/me/access") @ResponseStatus(HttpStatus.NO_CONTENT)
    void recordAccess(@AuthenticationPrincipal Jwt jwt) {
        UUID member = identities.member(jwt);
        access.requireActive(member);
        jdbc.update("update nite_connect.members set last_access_at=current_timestamp where id=? and (last_access_at is null or last_access_at<current_timestamp-interval '5 minutes')", member);
    }
    public record Me(Member member, List<String> roles) {}
}
