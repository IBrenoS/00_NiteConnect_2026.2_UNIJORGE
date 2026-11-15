package br.edu.unijorge.niteconnect.documents.api;

import br.edu.unijorge.niteconnect.documents.application.DocumentFileRequestService;
import br.edu.unijorge.niteconnect.documents.domain.DocxIntegrity;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.util.UUID;

@RestController
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentFileRequestController {
    private final DocumentFileRequestService requests;
    private final IdentityDirectory identities;
    public DocumentFileRequestController(DocumentFileRequestService requests,IdentityDirectory identities) {
        this.requests=requests;this.identities=identities;
    }
    @PostMapping("/api/v1/file-requests")
    @ResponseStatus(HttpStatus.CREATED)
    DocumentFileRequestService.View create(@AuthenticationPrincipal Jwt jwt,@RequestBody DocumentFileRequestService.Create input) {
        return requests.create(identities.member(jwt),input);
    }
    @GetMapping("/api/v1/me/file-requests")
    DocumentFileRequestService.Page list(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue="REQUESTED") String role,@RequestParam(defaultValue="50") int limit,
            @RequestParam(defaultValue="0") int offset) {
        return requests.list(identities.member(jwt),role,limit,offset);
    }
    @GetMapping("/api/v1/file-requests/{id}")
    DocumentFileRequestService.View get(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        return requests.get(identities.member(jwt),id);
    }
    @PostMapping("/api/v1/file-requests/{id}/cancel")
    DocumentFileRequestService.View cancel(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        return requests.cancel(identities.member(jwt),id);
    }
    @PostMapping(path="/api/v1/file-requests/{id}/uploads",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    DocumentFileRequestService.Upload upload(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,
            @RequestParam String title,@RequestPart("file") MultipartFile file) throws IOException {
        if(file.getSize()>DocxIntegrity.MAX_BYTES) throw ApiException.invalid("Arquivo acima de 8 MiB");
        return requests.upload(identities.member(jwt),id,title,file.getContentType(),file.getBytes());
    }
}
