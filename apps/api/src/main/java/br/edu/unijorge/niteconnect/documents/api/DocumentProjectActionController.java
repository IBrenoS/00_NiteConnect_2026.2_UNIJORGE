package br.edu.unijorge.niteconnect.documents.api;

import br.edu.unijorge.niteconnect.documents.application.DocumentProjectActionService;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/library/project-action-requests")
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentProjectActionController {
    private final DocumentProjectActionService requests;
    private final IdentityDirectory identities;
    public DocumentProjectActionController(DocumentProjectActionService requests,IdentityDirectory identities) {
        this.requests=requests;this.identities=identities;
    }
    public record NewRequest(UUID projectId,UUID resourceId,String resourceType,String action,String reason) {}
    public record Decision(boolean approve,String reason,boolean confirmed) {}
    @PostMapping public DocumentProjectActionService.Request create(@AuthenticationPrincipal Jwt jwt,@RequestBody NewRequest body) {
        return requests.create(identities.member(jwt),body.projectId(),body.resourceId(),body.resourceType(),body.action(),body.reason());
    }
    @GetMapping("/{id}") public DocumentProjectActionService.Request view(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        return requests.visible(identities.member(jwt),id);
    }
    @GetMapping public List<DocumentProjectActionService.Request> pending(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset,
            @RequestParam(required=false) UUID projectId) {
        return requests.pending(identities.member(jwt),projectId,limit,offset);
    }
    @PostMapping("/{id}/decision") public DocumentProjectActionService.Request decide(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,@RequestBody Decision body) {
        return requests.decide(identities.member(jwt),id,body.approve(),body.reason(),body.confirmed());
    }
}
