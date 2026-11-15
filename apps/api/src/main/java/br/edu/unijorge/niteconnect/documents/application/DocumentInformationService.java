package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.documents.domain.DocumentCapabilities;
import br.edu.unijorge.niteconnect.documents.domain.DocumentIdentity;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentIdentityRepository;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.UUID;

@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentInformationService {
    private final DocumentLibraryRepository folders;
    private final DocumentLibraryService library;
    private final DocumentCapabilityService capabilities;
    private final DocumentIdentityRepository identities;
    private final DocumentCoreService core;
    private final JdbcTemplate jdbc;
    public DocumentInformationService(DocumentLibraryRepository folders,DocumentLibraryService library,
            DocumentCapabilityService capabilities,DocumentIdentityRepository identities,DocumentCoreService core,JdbcTemplate jdbc) {
        this.folders=folders;this.library=library;this.capabilities=capabilities;this.identities=identities;this.core=core;this.jdbc=jdbc;
    }
    public record Information(UUID id,String type,String name,String extension,String mimeType,long size,
            UUID parentId,String parentName,DocumentIdentity identity,UUID createdBy,Instant createdAt,
            UUID modifiedBy,Instant modifiedAt,String lifecycleState,long folderCount,long fileCount,
            DocumentCapabilities capabilities,DocumentLibraryService.AccessInfo access,
            DocumentLibraryService.ActivityListing activity) {}
    public record Link(UUID id,String type,String url,String apiPath) {}
    private static String extension(String name) {
        int dot=name.lastIndexOf('.');
        return dot<0?"":name.substring(dot+1).toLowerCase(java.util.Locale.ROOT);
    }
    private UUID visibleParent(UUID actor,UUID parent) {
        if(parent==null) return null;
        try {
            var folder=folders.folder(parent);
            return capabilities.folder(actor,folder).canView()?parent:null;
        } catch(ApiException ignored) {return null;}
    }
    @Transactional(readOnly=true)
    public Information document(UUID actor,UUID id) {
        var file=library.documentDetails(actor,id);
        UUID parent=visibleParent(actor,file.folderId());
        String parentName=parent==null?null:file.folderName();
        return new Information(id,"DOCUMENT",file.title(),extension(file.title()),file.mimeType(),file.size(),
                parent,parentName,file.identity(),file.createdBy(),file.createdAt(),file.modifiedBy(),file.modifiedAt(),
                "ACTIVE",0,0,file.capabilities(),library.accessInfo(actor,"DOCUMENT",id),
                library.documentActivity(actor,id,null,20));
    }
    @Transactional(readOnly=true)
    public Information folder(UUID actor,UUID id) {
        var folder=folders.folder(id);
        capabilities.requireView(actor,folder);
        var identity=folderIdentity(actor,folder);
        UUID parent=visibleParent(actor,folder.parentId());
        String parentName=parent==null?null:folders.folder(parent).name();
        long[] totals=jdbc.queryForObject("""
                with recursive tree(id,depth) as (
                  select id,0 from nite_connect.document_folders where id=? and lifecycle_state='ACTIVE' and archived_at is null
                  union all select f.id,t.depth+1 from nite_connect.document_folders f join tree t on f.parent_id=t.id
                    where f.lifecycle_state='ACTIVE' and f.archived_at is null and t.depth<63
                ) select (select count(*)-1 from tree),
                    (select count(*) from nite_connect.documents d join tree t on t.id=d.folder_id
                     where d.lifecycle_state='ACTIVE' and d.archived_at is null),
                    (select coalesce(sum(v.size),0) from nite_connect.documents d join tree t on t.id=d.folder_id
                     join nite_connect.document_versions v on v.id=d.current_version_id
                     where d.lifecycle_state='ACTIVE' and d.archived_at is null)
                """,(rs,index)->new long[]{rs.getLong(1),rs.getLong(2),rs.getLong(3)},id);
        return new Information(id,"FOLDER",folder.name(),"",null,totals[2],parent,parentName,identity,
                folder.createdBy(),folder.createdAt(),folder.modifiedBy(),folder.modifiedAt(),"ACTIVE",totals[0],totals[1],
                capabilities.folder(actor,folder),library.accessInfo(actor,"FOLDER",id),library.folderActivity(actor,id,null,20));
    }
    private DocumentIdentity folderIdentity(UUID actor,DocumentLibraryRepository.Folder folder) {
        var identity=identities.folder(folder.id());
        var current=folder;
        for(int depth=0;depth<64;depth++) {
            if("PROJECT".equals(current.kind())&& !core.canReadProjectContext(actor,current.projectId()))
                return identity.withoutOwnerIdentifier();
            if(current.parentId()==null) return identity;
            current=folders.folder(current.parentId());
        }
        throw ApiException.conflict("Hierarquia profunda demais");
    }
    @Transactional(readOnly=true)
    public Link link(UUID actor,String type,UUID id) {
        if("DOCUMENT".equals(type)) {
            library.documentDetails(actor,id);
            return new Link(id,type,"/documentos/"+id,"/api/v1/library/documents/"+id);
        }
        if("FOLDER".equals(type)) {
            var folder=folders.folder(id);capabilities.requireView(actor,folder);
            String view=actor.equals(identities.folder(id).spaceOwnerId())?"personal":"shared";
            return new Link(id,type,"/documentos?view="+view+"&folder="+id,"/api/v1/library/folders/"+id);
        }
        throw ApiException.invalid("Tipo documental inválido");
    }
}
