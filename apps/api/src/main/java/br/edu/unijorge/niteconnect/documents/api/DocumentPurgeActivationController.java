package br.edu.unijorge.niteconnect.documents.api;

import br.edu.unijorge.niteconnect.documents.application.DocumentPurgeActivationService;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/library/purge-activation")
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentPurgeActivationController {
    private final DocumentPurgeActivationService activation;
    private final IdentityDirectory identities;
    public DocumentPurgeActivationController(DocumentPurgeActivationService activation,IdentityDirectory identities) {
        this.activation=activation;this.identities=identities;
    }
    @GetMapping public DocumentPurgeActivationService.Activation current(@AuthenticationPrincipal Jwt jwt) {
        return activation.current(identities.member(jwt));
    }
    @PostMapping public DocumentPurgeActivationService.Activation change(@AuthenticationPrincipal Jwt jwt,
            @RequestBody DocumentPurgeActivationService.Activation input) {
        return activation.change(identities.member(jwt),input);
    }
}
