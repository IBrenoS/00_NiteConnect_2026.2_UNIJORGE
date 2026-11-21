package br.edu.unijorge.niteconnect.documents.api;

import br.edu.unijorge.niteconnect.documents.application.DocumentLibraryService;
import br.edu.unijorge.niteconnect.documents.application.InstitutionalLibraryService;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class InstitutionalLibraryController {
    private final InstitutionalLibraryService library;
    private final IdentityDirectory identities;
    public InstitutionalLibraryController(InstitutionalLibraryService library,IdentityDirectory identities) {
        this.library=library;this.identities=identities;
    }
    @GetMapping("/api/v1/library/institutional")
    DocumentLibraryService.Listing browse(@AuthenticationPrincipal Jwt jwt,@RequestParam(required=false) UUID folderId,
            @RequestParam(required=false) String search,@RequestParam(required=false) String mimeType,
            @RequestParam(defaultValue="name") String sortBy,@RequestParam(defaultValue="asc") String direction,
            @RequestParam(required=false) String cursor,@RequestParam(defaultValue="50") int limit) {
        return library.browse(identities.member(jwt),folderId,search,mimeType,sortBy,direction,cursor,limit);
    }
    @GetMapping("/api/v1/library/members/{memberId}/documents")
    InstitutionalLibraryService.MemberListing memberDocuments(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID memberId,
            @RequestParam(required=false) UUID parentId,@RequestParam(required=false) String type,
            @RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset,
            @RequestParam(defaultValue="false") boolean reportsOnly) {
        return library.memberDocuments(identities.member(jwt),memberId,parentId,type,limit,offset,reportsOnly);
    }
    public record ClassificationInput(String classification) {}
    @PutMapping("/api/v1/library/documents/{id}/classification")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    void classify(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody ClassificationInput input) {
        library.classify(identities.member(jwt),id,input.classification());
    }
}
