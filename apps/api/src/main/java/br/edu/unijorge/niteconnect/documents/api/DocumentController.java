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
                                        @RequestParam(value="folderId",required=false) UUID folderId,
                                        @RequestPart("file") MultipartFile file) throws IOException {
        if(file.getSize()>br.edu.unijorge.niteconnect.documents.domain.DocxIntegrity.MAX_BYTES)
            throw ApiException.invalid("DOCX excede 8 MiB");
        return service.create(identities.member(jwt),title,file.getBytes(),folderId);
    }
    @GetMapping("/api/v1/me/documents")
    List<DocumentCoreService.Summary> own(@AuthenticationPrincipal Jwt jwt) {
        return service.own(identities.member(jwt));
    }
    @GetMapping("/api/v1/documents/{id}")
    DocumentCoreService.Summary details(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        UUID actor=identities.member(jwt);
        return service.summary(actor,service.require(actor,id));
    }
    @GetMapping("/api/v1/documents/{id}/download")
    ResponseEntity<byte[]> download(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        var doc=service.require(identities.member(jwt),id);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(doc.mimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(doc.title(),java.nio.charset.StandardCharsets.UTF_8).build().toString())
                .body(service.readVerified(doc));
    }
    @GetMapping("/api/v1/documents/{id}/versions")
    DocumentCoreService.VersionPage versions(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,
            @RequestParam(required=false) Integer beforeRevision,@RequestParam(defaultValue="50") int limit) {
        return service.versions(identities.member(jwt),id,beforeRevision,limit);
    }
    @GetMapping("/api/v1/documents/{id}/versions/{versionId}/download")
    ResponseEntity<byte[]> downloadVersion(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@PathVariable UUID versionId) {
        UUID actor=identities.member(jwt);
        var doc=service.require(actor,id);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(doc.mimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(doc.title(),java.nio.charset.StandardCharsets.UTF_8).build().toString())
                .body(service.readVersion(actor,id,versionId));
    }
    @PostMapping("/api/v1/documents/{id}/versions/{versionId}/restore")
    DocumentCoreService.Summary restoreVersion(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@PathVariable UUID versionId) {
        UUID actor=identities.member(jwt);
        service.restoreVersion(actor,id,versionId);
        return service.summary(actor,service.require(actor,id));
    }
    @PostMapping("/api/v1/documents/{id}/editor-session")
    DocumentWopiService.Launch launch(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        return wopi.launch(identities.member(jwt),id);
    }
}
