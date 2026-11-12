package br.edu.unijorge.niteconnect.documents.api;

import br.edu.unijorge.niteconnect.documents.application.DocumentLibraryService;
import br.edu.unijorge.niteconnect.documents.application.DocumentLibraryService.*;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
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
import java.util.List;
import java.util.UUID;

/** All operations use the same document IDs and authorization boundaries as the WOPI editor. */
@RestController
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentLibraryController {
    private final DocumentLibraryService library;
    private final DocumentLibraryRepository folders;
    private final IdentityDirectory identities;
    public DocumentLibraryController(DocumentLibraryService library,DocumentLibraryRepository folders,IdentityDirectory identities) {
        this.library=library;this.folders=folders;this.identities=identities;
    }
    @GetMapping("/api/v1/me/library")
    Listing mine(@AuthenticationPrincipal Jwt jwt,@RequestParam(required=false) UUID folderId) {
        return library.mine(identities.member(jwt),folderId);
    }
    @GetMapping("/api/v1/library/recipients")
    List<DocumentLibraryRepository.Recipient> recipients(@AuthenticationPrincipal Jwt jwt) {
        return library.recipients(identities.member(jwt));
    }
    @GetMapping("/api/v1/library/archived")
    List<DocumentLibraryRepository.ArchivedItem> archived(@AuthenticationPrincipal Jwt jwt) {return library.archived(identities.member(jwt));}
    @GetMapping("/api/v1/library/tree")
    List<DocumentLibraryRepository.Folder> tree(@AuthenticationPrincipal Jwt jwt) {
        return library.tree(identities.member(jwt));
    }
    @GetMapping("/api/v1/library/roots")
    List<DocumentLibraryRepository.Folder> roots(@AuthenticationPrincipal Jwt jwt) {
        return library.roots(identities.member(jwt));
    }
    @GetMapping("/api/v1/library/folders/{id}")
    Listing folder(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        return library.browse(identities.member(jwt),id);
    }
    @GetMapping("/api/v1/projects/{id}/library")
    Listing project(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestParam(required=false) UUID folderId) {
        return library.project(identities.member(jwt),id,folderId);
    }
    @GetMapping("/api/v1/projects/{id}/library/tree")
    List<DocumentLibraryRepository.Folder> projectTree(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        return library.projectTree(identities.member(jwt),id);
    }
    public record CreateFolder(UUID parentId,String name,String color) {}
    @PostMapping("/api/v1/library/folders")
    @ResponseStatus(HttpStatus.CREATED)
    DocumentLibraryRepository.Folder createFolder(@AuthenticationPrincipal Jwt jwt,@RequestBody CreateFolder request) {
        return library.addFolder(identities.member(jwt),request.parentId(),request.name(),request.color()==null?"#D6A432":request.color());
    }
    @PatchMapping("/api/v1/library/folders/{id}")
    DocumentLibraryRepository.Folder updateFolder(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,
                                                  @RequestBody FolderChange request) {
        return library.changeFolder(identities.member(jwt),id,request);
    }
    @DeleteMapping("/api/v1/library/folders/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void archiveFolder(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestParam(defaultValue="false") boolean recursive) {
        library.archiveFolder(identities.member(jwt),id,recursive);
    }
    @PostMapping("/api/v1/library/folders/{id}/restore")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void restoreFolder(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        library.restoreFolder(identities.member(jwt),id);
    }
    @PostMapping(path="/api/v1/library/folders/{folderId}/files",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    DocumentLibraryRepository.FileEntry upload(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID folderId,
                                               @RequestParam String title,@RequestPart("file") MultipartFile file) throws IOException {
        if(file.getSize()>8*1024*1024) throw ApiException.invalid("Arquivo maior que 8 MiB");
        return library.upload(identities.member(jwt),folderId,title,file.getContentType(),file.getBytes());
    }
    @PatchMapping("/api/v1/library/documents/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void organizeDocument(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody DocumentChange request) {
        library.moveFile(identities.member(jwt),id,request);
    }
    @DeleteMapping("/api/v1/library/documents/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void archiveDocument(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        library.archiveFile(identities.member(jwt),id);
    }
    @PostMapping("/api/v1/library/documents/{id}/restore")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void restoreDocument(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        library.restoreFile(identities.member(jwt),id);
    }
    public record GrantEdit(boolean canEdit) {}
    @PutMapping("/api/v1/library/documents/{id}/edit-grants/{memberId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void grantEdit(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@PathVariable UUID memberId,@RequestBody GrantEdit input) {
        library.grantProjectEdit(identities.member(jwt),id,memberId,input.canEdit());
    }
    @GetMapping("/api/v1/library/templates")
    List<DocumentLibraryRepository.Template> templates(@AuthenticationPrincipal Jwt jwt) {
        return library.templates(identities.member(jwt));
    }
    @PostMapping(path="/api/v1/library/templates",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    UUID template(@AuthenticationPrincipal Jwt jwt,@RequestParam String title,
                  @RequestParam(defaultValue="false") boolean autoAssignOnJoin,@RequestPart("file") MultipartFile file) throws IOException {
        if(file.getSize()>8*1024*1024) throw ApiException.invalid("Modelo excede 8 MiB");
        return library.createTemplate(identities.member(jwt),title,autoAssignOnJoin,file.getBytes());
    }
    @PostMapping(path="/api/v1/library/templates/{id}/versions",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    void publishVersion(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestPart("file") MultipartFile file) throws IOException {
        if(file.getSize()>8*1024*1024) throw ApiException.invalid("Modelo excede 8 MiB");
        library.publishTemplateVersion(identities.member(jwt),id,file.getBytes());
    }
    @PostMapping("/api/v1/library/templates/{id}/retire")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void retire(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        library.retireTemplate(identities.member(jwt),id);
    }
    public record Recipients(List<UUID> memberIds) {}
    @PostMapping("/api/v1/library/templates/{id}/distribute")
    DistributionResult distribute(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody Recipients input) {
        return library.distribute(identities.member(jwt),id,input.memberIds());
    }
    @PostMapping("/api/v1/me/library/templates/{id}/create")
    DistributionResult ownCopy(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        return library.copyOwnTemplate(identities.member(jwt),id);
    }
    @PostMapping("/api/v1/library/provision-existing")
    public int provisionExisting(@AuthenticationPrincipal Jwt jwt) {return library.provisionExisting(identities.member(jwt));}
}
