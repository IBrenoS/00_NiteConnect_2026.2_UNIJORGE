package br.edu.unijorge.niteconnect.documents.api;

import br.edu.unijorge.niteconnect.documents.application.DocumentPurgeService;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentPurgeRepository;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentPurgeController {
    private final DocumentPurgeService purge;
    private final IdentityDirectory identities;

    public DocumentPurgeController(DocumentPurgeService purge,IdentityDirectory identities) {
        this.purge=purge;this.identities=identities;
    }

    @PostMapping("/api/v1/me/trash/{id}/purge/preview")
    DocumentPurgeRepository.Preview preview(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        return purge.preview(identities.member(jwt),id);
    }

    @PostMapping("/api/v1/me/trash/{id}/purge")
    DocumentPurgeRepository.Operation request(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,
                                               @RequestHeader("Idempotency-Key") String idempotencyKey,
                                               @RequestHeader("X-Confirm-Purge") boolean confirmed) {
        if(!confirmed) throw br.edu.unijorge.niteconnect.shared.api.ApiException.invalid("Confirmação explícita obrigatória");
        return purge.request(identities.member(jwt),id,idempotencyKey);
    }

    @GetMapping("/api/v1/me/trash/purge-operations/{operationId}")
    DocumentPurgeRepository.Progress progress(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID operationId) {
        return purge.progress(identities.member(jwt),operationId);
    }

    @PostMapping("/api/v1/me/trash/empty/preview")
    DocumentPurgeService.EmptyPreview previewEmpty(@AuthenticationPrincipal Jwt jwt,
                                                    @RequestParam(defaultValue="100") int limit) {
        return purge.previewEmpty(identities.member(jwt),limit);
    }

    @PostMapping("/api/v1/me/trash/empty")
    DocumentPurgeRepository.Operation requestEmpty(@AuthenticationPrincipal Jwt jwt,
                                                    @RequestHeader("Idempotency-Key") String idempotencyKey,
                                                    @RequestHeader("X-Confirm-Purge") boolean confirmed) {
        if(!confirmed) throw br.edu.unijorge.niteconnect.shared.api.ApiException.invalid("Confirmação explícita obrigatória");
        return purge.requestEmpty(identities.member(jwt),idempotencyKey);
    }
}
