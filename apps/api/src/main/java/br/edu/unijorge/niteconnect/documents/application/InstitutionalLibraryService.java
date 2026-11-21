package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentSharingRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.InstitutionalLibraryRepository;
import br.edu.unijorge.niteconnect.members.application.MemberDirectory;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class InstitutionalLibraryService {
    private final AccessService access;
    private final MemberDirectory members;
    private final DocumentLibraryRepository folders;
    private final DocumentLibraryService library;
    private final InstitutionalLibraryRepository repository;
    private final DocumentSharingRepository sharing;
    private final br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository documents;
    private final DocumentCapabilityService capabilities;
    public InstitutionalLibraryService(AccessService access,MemberDirectory members,DocumentLibraryRepository folders,
            DocumentLibraryService library,InstitutionalLibraryRepository repository,DocumentSharingRepository sharing,
            br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository documents,DocumentCapabilityService capabilities) {
        this.access=access;this.members=members;this.folders=folders;this.library=library;this.repository=repository;this.sharing=sharing;
        this.documents=documents;this.capabilities=capabilities;
    }
    @Transactional
    public DocumentLibraryService.Listing browse(UUID actor,UUID folder,String search,String mimeType,String sortBy,
                                                String direction,String cursor,int limit) {
        access.requireAdministrator(actor);
        UUID root=folders.root("MATERIAIS").id();
        UUID selected=folder==null?root:folder;
        if(!folders.descendant(root,selected)) throw ApiException.notFound();
        return library.browse(actor,selected,search,mimeType,sortBy,direction,cursor,limit);
    }
    public record MemberEntry(UUID id,String type,String name,UUID parentId,Instant modifiedAt,UUID modifiedBy,
                              String modifiedByName,long size,String ownerKind,UUID projectId,
                              List<DocumentSharingRepository.EffectiveGrant> sharing,
                              String mimeType,br.edu.unijorge.niteconnect.documents.domain.DocumentCapabilities capabilities) {}
    public record MemberListing(UUID memberId,List<MemberEntry> items,int limit,int offset,boolean hasMore) {}

    @Transactional(readOnly=true)
    public MemberListing memberDocuments(UUID actor,UUID member,UUID parent,String type,int limit,int offset) {
        return memberDocuments(actor,member,parent,type,limit,offset,false);
    }
    @Transactional(readOnly=true)
    public MemberListing memberDocuments(UUID actor,UUID member,UUID parent,String type,int limit,int offset,boolean reportsOnly) {
        access.requireAdministrator(actor);
        members.require(member); // Historical institutional records remain available for inactive members.
        if(limit<1||limit>100||offset<0) throw ApiException.invalid("Paginação documental inválida");
        if(type!=null&&!Set.of("DOCUMENT","FOLDER").contains(type)) throw ApiException.invalid("Tipo documental inválido");
        var rows=repository.memberDocuments(member,parent,type,limit+1,offset,reportsOnly);
        var items=rows.stream().limit(limit).map(row->new MemberEntry(row.id(),row.type(),row.name(),row.parentId(),
                row.modifiedAt(),row.modifiedBy(),row.modifiedByName(),row.size(),row.ownerKind(),row.projectId(),
                sharing.effectiveGrants("DOCUMENT".equals(row.type())?row.id():null,
                        "FOLDER".equals(row.type())?row.id():null,actor,true),
                "DOCUMENT".equals(row.type())?documents.require(row.id()).mimeType():null,
                "DOCUMENT".equals(row.type())?capabilities.document(actor,documents.require(row.id())):capabilities.folder(actor,folders.folder(row.id())))).toList();
        return new MemberListing(member,items,limit,offset,rows.size()>limit);
    }
    @Transactional
    public void classify(UUID actor,UUID document,String classification) {
        access.requireAdministrator(actor);
        if(classification==null||!Set.of("GENERAL","REPORT").contains(classification))throw ApiException.invalid("Classificação documental inválida");
        capabilities.requireView(actor,documents.forUpdate(document));
        String previous=repository.classification(document);
        if(previous.equals(classification))return;
        repository.classify(document,classification,actor);
        folders.event(document,actor,"DOCUMENT_CLASSIFIED",previous+" -> "+classification);
    }
}
