package br.edu.unijorge.niteconnect.documents.api;

import br.edu.unijorge.niteconnect.documents.application.DocumentCoreService;
import br.edu.unijorge.niteconnect.documents.application.DocumentWopiService;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.util.List;
import java.util.UUID;

@RestController
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentController {
    private final DocumentCoreService service;
    private final DocumentWopiService wopi;
    private final IdentityDirectory identities;
    public DocumentController(DocumentCoreService service,DocumentWopiService wopi,IdentityDirectory identities) {
        this.service=service;this.wopi=wopi;this.identities=identities;
    }
    @PostMapping(path="/api/v1/me/documents",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    DocumentCoreService.Summary create(@AuthenticationPrincipal Jwt jwt,
                                        @RequestParam(value="title",required=false) String title,
                                        @RequestPart("file") MultipartFile file) throws IOException {
        if(file.getSize()>br.edu.unijorge.niteconnect.documents.domain.DocxIntegrity.MAX_BYTES)
            throw ApiException.invalid("DOCX excede 8 MiB");
        return service.create(identities.member(jwt),title,file.getBytes());
    }
    @GetMapping("/api/v1/me/documents")
    List<DocumentCoreService.Summary> own(@AuthenticationPrincipal Jwt jwt) {
        return service.own(identities.member(jwt));
    }
    @GetMapping("/api/v1/documents/{id}")
    DocumentCoreService.Summary details(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        var doc=service.require(identities.member(jwt),id);
        return new DocumentCoreService.Summary(doc.id(),doc.title(),doc.version(),doc.size(),doc.sha256());
    }
    @GetMapping("/api/v1/documents/{id}/download")
    ResponseEntity<byte[]> download(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        var doc=service.require(identities.member(jwt),id);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
                .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(doc.title(),java.nio.charset.StandardCharsets.UTF_8).build().toString())
                .body(service.readVerified(doc));
    }
    @PostMapping("/api/v1/documents/{id}/editor-session")
    DocumentWopiService.Launch launch(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        return wopi.launch(identities.member(jwt),id);
    }
}
