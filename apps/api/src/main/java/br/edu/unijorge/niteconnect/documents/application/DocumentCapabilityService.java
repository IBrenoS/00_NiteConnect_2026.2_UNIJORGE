package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.application.ProjectAccess;
import br.edu.unijorge.niteconnect.documents.domain.DocumentCapabilities;
import br.edu.unijorge.niteconnect.documents.domain.DocumentIdentity;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentIdentityRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentSharingRepository;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** One authorization policy for content, tree mutations, WOPI and API projections. */
@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentCapabilityService {
    private final AccessService access;
    private final ProjectAccess projects;
    private final DocumentSharingRepository sharing;
    private final DocumentLibraryRepository folders;
    private final DocumentIdentityRepository identities;
    public DocumentCapabilityService(AccessService access,ProjectAccess projects,DocumentSharingRepository sharing,
                                     DocumentLibraryRepository folders,DocumentIdentityRepository identities) {
        this.access=access;this.projects=projects;this.sharing=sharing;this.folders=folders;this.identities=identities;
    }
    private record Scope(String kind,UUID subject) {}
    private Scope scope(DocumentLibraryRepository.Folder folder) {
        var current=folder;
        for(int depth=0;depth<64;depth++) {
            if("PERSONAL".equals(current.kind())) return new Scope("PERSONAL",current.ownerId());
            if("PROJECT".equals(current.kind())) return new Scope("PROJECT",current.projectId());
            if(current.parentId()==null) return new Scope("INSTITUTION",current.id());
            current=folders.folder(current.parentId());
        }
        throw ApiException.conflict("Profundidade máxima da biblioteca excedida");
    }
    private boolean projectRead(UUID actor,UUID project) {
        try {projects.requireRead(actor,project);return true;} catch(ApiException ex) {return false;}
    }
    private boolean projectManage(UUID actor,UUID project) {
        try {projects.requireManage(actor,project);return true;} catch(ApiException ex) {return false;}
    }
    private boolean active(UUID actor) {
        try {access.requireActive(actor);return true;} catch(ApiException ex) {return false;}
    }
    public DocumentCapabilities document(UUID actor,DocumentRepository.Document document) {
        DocumentIdentity identity=identities.document(document.id());
        boolean isActive=active(actor);
        boolean admin=isActive&&access.isAdministrator(actor);
        String grant=isActive?sharing.documentPermission(document.id(),actor):null;
        boolean ownerSpace=isActive&&"PERSONAL".equals(document.context())&&actor.equals(identity.spaceOwnerId());
        boolean projectOperational=!"PROJECT".equals(document.context())||projectRead(actor,document.projectId());
        boolean projectReader=isActive&&"PROJECT".equals(document.context())&&projectRead(actor,document.projectId());
        boolean projectManager=isActive&&"PROJECT".equals(document.context())&&projectManage(actor,document.projectId());
        boolean view=admin||ownerSpace||projectReader||grant!=null;
        boolean edit=view&&projectOperational&&(admin||ownerSpace||projectManager||"EDIT".equals(grant)
                ||("PROJECT".equals(document.context())&&folders.canEdit(document.id(),actor)));
        boolean own=identity.ownedAndCreatedBy(actor);
        boolean manage=view&&projectOperational&&(admin||projectManager||(ownerSpace&&own&&!identity.protectedResource()));
        boolean share=view&&projectOperational&&(admin||projectManager||(ownerSpace&&own&&!identity.protectedResource()));
        boolean organize=manage&&(!identity.protectedResource()||admin);
        boolean archive=view&&projectOperational&&(admin||projectManager);
        boolean institutional=admin&&("INSTITUTION".equals(identity.resourceOwnerKind())
                ||"PROJECT".equals(identity.resourceOwnerKind()));
        boolean trash=view&&projectOperational&&!identity.retentionHold()&&!"UNKNOWN".equals(identity.resourceOwnerKind())
                &&((ownerSpace&&own&&!identity.protectedResource())||institutional);
        boolean copy=view&&projectOperational&&!identity.retentionHold()&&!"UNKNOWN".equals(identity.resourceOwnerKind())
                &&(admin||projectManager||(ownerSpace&&own&&!identity.protectedResource()));
        return result(isActive,view,view,edit,false,organize,organize,copy,share,
                trash,false,false,archive,false,false,identity,grant,ownerSpace);
    }
    public DocumentCapabilities folder(UUID actor,DocumentLibraryRepository.Folder folder) {
        DocumentIdentity identity=identities.folder(folder.id());
        Scope scope=scope(folder);
        boolean isActive=active(actor);
        boolean admin=isActive&&access.isAdministrator(actor);
        String grant=isActive?sharing.folderPermission(folder.id(),actor):null;
        boolean ownerSpace=isActive&&"PERSONAL".equals(scope.kind())&&actor.equals(scope.subject());
        boolean projectOperational=!"PROJECT".equals(scope.kind())||projectRead(actor,scope.subject());
        boolean projectReader=isActive&&"PROJECT".equals(scope.kind())&&projectRead(actor,scope.subject());
        boolean projectManager=isActive&&"PROJECT".equals(scope.kind())&&projectManage(actor,scope.subject());
        boolean view=admin||ownerSpace||projectReader||grant!=null;
        boolean structural=!"CUSTOM".equals(folder.kind());
        boolean add=view&&projectOperational&&(admin||ownerSpace||projectManager
                ||("EDIT".equals(grant)&&!"INSTITUTION".equals(scope.kind())))
                &&(structural||!identity.protectedResource()||admin);
        boolean own=identity.ownedAndCreatedBy(actor);
        boolean rename=view&&projectOperational&&(admin||!structural&&(projectManager||(ownerSpace&&own&&!identity.protectedResource())));
        boolean move=view&&projectOperational&&!structural&&(admin||projectManager||(ownerSpace&&own&&!identity.protectedResource()))
                &&(!ownerSpace||admin||!folders.restrictedPersonalDescendant(folder.id(),actor));
        boolean share=view&&projectOperational&&(admin||projectManager||(ownerSpace&&(
                "PERSONAL".equals(folder.kind()) || own&&!identity.protectedResource())));
        boolean archive=view&&projectOperational&&!structural&&(admin||projectManager);
        boolean institutional=admin&&("INSTITUTION".equals(identity.resourceOwnerKind())
                ||"PROJECT".equals(identity.resourceOwnerKind()));
        boolean trash=view&&projectOperational&&!structural&&!identity.retentionHold()&&!"UNKNOWN".equals(identity.resourceOwnerKind())
                &&((ownerSpace&&own&&!identity.protectedResource())||institutional);
        boolean copy=view&&projectOperational&&!structural&&!identity.retentionHold()&&!"UNKNOWN".equals(identity.resourceOwnerKind())
                &&(admin||projectManager||(ownerSpace&&own&&!identity.protectedResource()));
        return result(isActive,view,false,false,add,rename,move,copy,share,
                trash,false,false,archive,false,true,identity,grant,ownerSpace);
    }
    private static DocumentCapabilities result(boolean active,boolean view,boolean download,boolean edit,
                                               boolean add,boolean rename,boolean move,boolean copy,boolean share,
                                               boolean trash,boolean restore,boolean purge,boolean archive,boolean protection,boolean folder,
                                               DocumentIdentity identity,String grant,boolean ownerSpace) {
        Map<String,String> reasons=new HashMap<>();
        String reason=!active?"OUT_OF_SCOPE":!view?"OUT_OF_SCOPE":identity.retentionHold()?"HELD":
                identity.protectedResource()?"PROTECTED":"UNKNOWN".equals(identity.resourceOwnerKind())?"NOT_CREATOR":
                grant!=null&&!ownerSpace?"GRANT_ONLY":"NOT_CREATOR";
        if(!view) reasons.put("canView",reason);
        if(!download) reasons.put("canDownload",folder?"STATE":reason);
        if(!edit) reasons.put("canEdit",folder?"STATE":reason);
        if(!add) reasons.put("canAddChild",folder?reason:"STATE");
        if(!rename) reasons.put("canRename",reason);
        if(!move) reasons.put("canMove",reason);
        if(!copy) reasons.put("canCopy",folder&&identity.protectedResource()?"PROTECTED":reason);
        if(!share) reasons.put("canShare",reason);
        if(!trash) reasons.put("canDeleteToTrash",identity.retentionHold()?"HELD":reason);
        if(!restore) reasons.put("canRestore","STATE");
        reasons.put("canPermanentlyDelete","STATE");
        if(!archive) reasons.put("canArchiveInstitutionally",reason);
        if(!protection) reasons.put("canManageProtection","STATE");
        return new DocumentCapabilities(1,view,download,edit,add,rename,move,copy,share,trash,restore,purge,archive,protection,reasons);
    }
    public void requireView(UUID actor,DocumentRepository.Document document) {
        access.requireActive(actor);
        if(!document(actor,document).canView()) throw ApiException.notFound();
    }
    public void requireEdit(UUID actor,DocumentRepository.Document document) {
        requireView(actor,document);
        if(!document(actor,document).canEdit()) throw ApiException.forbidden();
    }
    public void requireView(UUID actor,DocumentLibraryRepository.Folder folder) {
        access.requireActive(actor);
        if(!folder(actor,folder).canView()) throw ApiException.notFound();
    }
    public void requireAdd(UUID actor,DocumentLibraryRepository.Folder folder) {
        requireView(actor,folder);
        if(!folder(actor,folder).canAddChild()) throw ApiException.forbidden();
    }

    /** Fail-closed purge authority for a trashed resource; policy/hold/reference checks are mandatory inputs. */
    public String purgeDeniedReason(UUID actor,DocumentLibraryRepository.TrashItem item,boolean policyEligible,boolean workerEnabled) {
        return purgeDeniedReason(actor,item,policyEligible,workerEnabled,false);
    }
    public String purgeDeniedReason(UUID actor,DocumentLibraryRepository.TrashItem item,boolean policyEligible,
                                    boolean workerEnabled,boolean voluntaryPersonal) {
        if(!active(actor)) return "INACTIVE_MEMBER";
        if(item.retentionHold()) return "HOLD";
        if("UNKNOWN".equals(item.resourceOwnerKind())) return "OWNER_UNKNOWN";
        boolean ownPersonalContent=actor.equals(item.spaceOwnerId())&&actor.equals(item.createdBy())
                &&"MEMBER".equals(item.resourceOwnerKind())&&"NONE".equals(item.protection());
        boolean institutionalAuthority=access.isAdministrator(actor)
                &&("INSTITUTION".equals(item.resourceOwnerKind())||"PROJECT".equals(item.resourceOwnerKind()));
        if(!ownPersonalContent&&!institutionalAuthority) return "OUT_OF_SCOPE";
        if(voluntaryPersonal&&!ownPersonalContent) return "OUT_OF_SCOPE";
        if(!policyEligible) return "POLICY_NOT_APPROVED";
        if(!workerEnabled) return "PROCESSING_DISABLED";
        return "";
    }
    public String automaticPurgeDeniedReason(UUID policyAuthority,DocumentLibraryRepository.TrashItem item) {
        if(item.retentionHold()) return "HOLD";
        if("UNKNOWN".equals(item.resourceOwnerKind())) return "OWNER_UNKNOWN";
        if("MEMBER".equals(item.resourceOwnerKind()))
            return item.spaceOwnerId()!=null&&item.spaceOwnerId().equals(item.createdBy())
                    &&"NONE".equals(item.protection())?"":"OUT_OF_SCOPE";
        if(("INSTITUTION".equals(item.resourceOwnerKind())||"PROJECT".equals(item.resourceOwnerKind()))
                &&active(policyAuthority)&&access.isAdministrator(policyAuthority)) return "";
        return "OUT_OF_SCOPE";
    }
}
