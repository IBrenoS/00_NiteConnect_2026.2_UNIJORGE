package br.edu.unijorge.niteconnect.documents.api;

import br.edu.unijorge.niteconnect.documents.application.DocumentRetentionPolicyService;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/library/retention-policies")
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentRetentionPolicyController {
    private final DocumentRetentionPolicyService policies;
    private final IdentityDirectory identities;
    public DocumentRetentionPolicyController(DocumentRetentionPolicyService policies,IdentityDirectory identities) {
        this.policies=policies;this.identities=identities;
    }
    public record Reason(String reason) {}
    @GetMapping public List<DocumentRetentionPolicyService.Policy> list(@AuthenticationPrincipal Jwt jwt) {
        return policies.list(identities.member(jwt));
    }
    @PostMapping public DocumentRetentionPolicyService.Policy draft(@AuthenticationPrincipal Jwt jwt,@RequestBody Reason body) {
        return policies.draft(identities.member(jwt),body.reason());
    }
    @PostMapping("/{id}/approval") public DocumentRetentionPolicyService.Policy approve(
            @AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody Reason body) {
        return policies.approve(identities.member(jwt),id,body.reason());
    }
}
