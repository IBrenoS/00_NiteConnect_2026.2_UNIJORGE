package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.application.ProjectAccess;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentSharingRepository;
import br.edu.unijorge.niteconnect.documents.domain.DocxIntegrity;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository.Document;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.UUID;

@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentCoreService {
    private final DocumentRepository repository;
    private final DocumentObjectStore store;
    private final AccessService access;
    private final ProjectAccess projects;
    private final DocumentLibraryRepository library;
    private final DocumentSharingRepository sharing;

    public DocumentCoreService(DocumentRepository repository,DocumentObjectStore store,AccessService access,ProjectAccess projects,DocumentLibraryRepository library,DocumentSharingRepository sharing) {
        this.repository=repository;this.store=store;this.access=access;this.projects=projects;this.library=library;this.sharing=sharing;
    }
    public record Summary(UUID id,String title,long revision,long size,String sha256) {
        static Summary of(Document d) {return new Summary(d.id(),d.title(),d.version(),d.size(),d.sha256());}
    }
    public void requireAccess(UUID actor, Document document) {
        access.requireActive(actor);
        if(access.isAdministrator(actor)) return;
        switch(document.context()) {
            case "PERSONAL" -> {if(!actor.equals(document.ownerId())&&sharing.documentPermission(document.id(),actor)==null) throw ApiException.notFound();}
            case "PROJECT" -> {
                try {projects.requireRead(actor,document.projectId());}
                catch(ApiException ex) {if(sharing.documentPermission(document.id(),actor)==null) throw ex;}
            }
            default -> {if(sharing.documentPermission(document.id(),actor)==null) throw ApiException.notFound();}
        }
    }
    public boolean canWrite(UUID actor,Document document) {
        requireAccess(actor,document);
        if(access.isAdministrator(actor)) return true;
        String permission=sharing.documentPermission(document.id(),actor);
        return switch(document.context()) {
            case "PERSONAL" -> actor.equals(document.ownerId())||"EDIT".equals(permission);
            case "PROJECT" -> {
                try {projects.requireManage(actor,document.projectId());yield true;}
                catch(ApiException ex) {yield "EDIT".equals(permission)||library.canEdit(document.id(),actor);}
            }
            default -> "EDIT".equals(permission);
        };
    }
    public void requireWrite(UUID actor,Document document) {
        if(!canWrite(actor,document)) throw ApiException.forbidden();
    }
    public boolean canReadProjectContext(UUID actor,UUID projectId) {
        access.requireActive(actor);
        if(access.isAdministrator(actor)) return true;
        try {projects.requireRead(actor,projectId);return true;}
        catch(ApiException ex) {return false;}
    }
    public String friendlyName(UUID actor) {
        return access.requireActive(actor).name();
    }
    @Transactional(readOnly=true)
    public Document require(UUID actor,UUID id) {
        Document doc=repository.require(id);
        requireAccess(actor,doc);
        return doc;
    }
    @Transactional(readOnly=true)
    public List<Summary> own(UUID actor) {
        access.requireActive(actor);
        return repository.own(actor).stream().map(Summary::of).toList();
    }
    @Transactional
    public Summary create(UUID actor,String title,byte[] data) {return create(actor,title,data,null);}
    @Transactional
    public Summary create(UUID actor,String title,byte[] data,UUID folderId) {
        access.requireActive(actor);
        DocxIntegrity.validate(data);
        String name = title == null || title.isBlank() ? "Relatório Individual.docx" : title.strip();
        if (name.length() > 190 || name.contains("/") || name.contains("\\") || name.chars().anyMatch(Character::isISOControl)) {
            throw ApiException.invalid("Nome de documento inválido");
        }
        if(!name.toLowerCase(java.util.Locale.ROOT).endsWith(".docx")) name += ".docx";
        String hash=DocxIntegrity.sha256(data);
        UUID objectId=UUID.randomUUID();
        UUID id=UUID.randomUUID();
        store.put(objectId,data);
        try {
            UUID target=folderId==null?library.ensurePersonal(actor).id():folderId;
            if(folderId!=null) {
                var current=library.folder(folderId);
                boolean within=false;
                for(int i=0;i<64;i++) {
                    if("PERSONAL".equals(current.kind())) {within=actor.equals(current.ownerId());break;}
                    if(current.parentId()==null) break;
                    current=library.folder(current.parentId());
                }
                if(!within) throw ApiException.notFound();
            }
            repository.createInFolder(id,name,"PERSONAL",actor,null,target,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",false,objectId,data.length,hash,actor,null);
        } catch(RuntimeException ex) {
            store.deleteOrphan(objectId);
            throw ex;
        }
        return Summary.of(repository.require(id));
    }
    @Transactional(readOnly=true)
    public byte[] read(UUID actor,UUID id) {
        Document doc=require(actor,id);
        return readVerified(doc);
    }
    public byte[] readVerified(Document doc) {
        byte[] bytes=doc.storedAsAsset()?store.getAsset(doc.objectId()):store.get(doc.objectId());
        if(bytes.length!=doc.size() || !DocxIntegrity.sha256(bytes).equals(doc.sha256())) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Integridade do documento não confirmada");
        }
        return bytes;
    }
}
