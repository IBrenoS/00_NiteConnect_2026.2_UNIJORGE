package br.edu.unijorge.niteconnect.documents.api;

import br.edu.unijorge.niteconnect.documents.application.DocumentAutomationService;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;

@RestController
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentAutomationController {
    private final DocumentAutomationService automations;
    private final IdentityDirectory identities;
    public DocumentAutomationController(DocumentAutomationService automations,IdentityDirectory identities) {this.automations=automations;this.identities=identities;}
    @GetMapping("/api/v1/me/document-automations")
    List<DocumentAutomationService.Rule> list(@AuthenticationPrincipal Jwt jwt) {return automations.list(identities.member(jwt));}
    @GetMapping("/api/v1/me/document-automations/options")
    List<String> options(@AuthenticationPrincipal Jwt jwt,@RequestParam String targetType,@RequestParam UUID targetId) {
        return automations.availableEvents(identities.member(jwt),targetType,targetId);
    }
    @PostMapping("/api/v1/me/document-automations")
    @ResponseStatus(HttpStatus.CREATED)
    DocumentAutomationService.Rule create(@AuthenticationPrincipal Jwt jwt,@RequestBody DocumentAutomationService.Create input) {return automations.create(identities.member(jwt),input);}
    @PatchMapping("/api/v1/me/document-automations/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void setEnabled(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody Toggle input) {automations.setEnabled(identities.member(jwt),id,input.enabled());}
    @DeleteMapping("/api/v1/me/document-automations/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {automations.remove(identities.member(jwt),id);}
    @GetMapping("/api/v1/me/document-automations/{id}/history")
    List<DocumentAutomationService.Delivery> history(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {return automations.history(identities.member(jwt),id);}
    @GetMapping("/api/v1/me/document-notifications")
    List<DocumentAutomationService.Notification> notifications(@AuthenticationPrincipal Jwt jwt) {return automations.notifications(identities.member(jwt));}
    @PostMapping("/api/v1/me/document-notifications/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void markRead(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {automations.markRead(identities.member(jwt),id);}
    public record Toggle(boolean enabled) {}
}
