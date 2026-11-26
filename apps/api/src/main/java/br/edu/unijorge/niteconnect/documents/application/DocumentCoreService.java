package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.application.ProjectAccess;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentSharingRepository;
import br.edu.unijorge.niteconnect.documents.domain.DocxIntegrity;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository.Document;
import br.edu.unijorge.niteconnect.documents.domain.DocumentIdentity;
import br.edu.unijorge.niteconnect.documents.domain.DocumentCapabilities;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentIdentityRepository;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.List;
import java.time.Instant;
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
    private final DocumentCapabilityService capabilities;
    private final DocumentIdentityRepository identities;

    public DocumentCoreService(DocumentRepository repository,DocumentObjectStore store,AccessService access,ProjectAccess projects,DocumentLibraryRepository library,DocumentSharingRepository sharing,DocumentCapabilityService capabilities,DocumentIdentityRepository identities) {
        this.repository=repository;this.store=store;this.access=access;this.projects=projects;this.library=library;this.sharing=sharing;this.capabilities=capabilities;this.identities=identities;
    }
    public record Summary(UUID id,String title,long revision,long size,String sha256,DocumentIdentity identity,DocumentCapabilities capabilities) {
        public Summary(UUID id,String title,long revision,long size,String sha256) {
            this(id,title,revision,size,sha256,null,null);
        }
    }
    public Summary summary(UUID actor,Document d) {
        var identity=identities.document(d.id());
        if("PROJECT".equals(d.context())&&!canReadProjectContext(actor,d.projectId()))
            identity=identity.withoutOwnerIdentifier();
        return new Summary(d.id(),d.title(),d.version(),d.size(),d.sha256(),identity,capabilities.document(actor,d));
    }
    public void requireAccess(UUID actor, Document document) {
        capabilities.requireView(actor,document);
    }
    public boolean canWrite(UUID actor,Document document) {
        requireAccess(actor,document);
        return capabilities.document(actor,document).canEdit();
    }
    public void requireWrite(UUID actor,Document document) {
        if(!canWrite(actor,document)) throw ApiException.forbidden();
    }
    public boolean canReadProjectContext(UUID actor,UUID projectId) {
        access.requireActive(actor);
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
        return repository.own(actor).stream().map(d->summary(actor,d)).toList();
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
            capabilities.requireAdd(actor,library.folder(target));
            repository.createInFolder(id,name,"PERSONAL",actor,null,target,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",false,objectId,data.length,hash,actor,null);
        } catch(RuntimeException ex) {
            store.deleteOrphan(objectId);
            throw ex;
        }
        return summary(actor,repository.require(id));
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
    public record VersionInfo(UUID id,int revision,long size,UUID createdBy,Instant createdAt,boolean current) {
        static VersionInfo from(DocumentRepository.Version version) {
            return new VersionInfo(version.id(),version.revision(),version.size(),version.createdBy(),
                    version.createdAt(),version.current());
        }
    }
    public record VersionPage(List<VersionInfo> items,Integer nextBeforeRevision,boolean hasMore) {}
    @Transactional(readOnly=true)
    public VersionPage versions(UUID actor,UUID id,Integer beforeRevision,int limit) {
        Document doc=require(actor,id);
        if(limit<1||limit>100||beforeRevision!=null&&beforeRevision<1) throw ApiException.invalid("Paginação de versões inválida");
        var rows=repository.versions(doc.id(),beforeRevision,limit+1);
        boolean more=rows.size()>limit;
        var items=more?rows.subList(0,limit):rows;
        return new VersionPage(items.stream().map(VersionInfo::from).toList(),more?items.getLast().revision():null,more);
    }
    @Transactional(readOnly=true)
    public byte[] readVersion(UUID actor,UUID id,UUID versionId) {
        Document doc=require(actor,id);
        if(!capabilities.document(actor,doc).canDownload()) throw ApiException.forbidden();
        return readVersionVerified(doc,repository.version(id,versionId));
    }
    private byte[] readVersionVerified(Document doc,DocumentRepository.Version version) {
        byte[] bytes=doc.storedAsAsset()?store.getAsset(version.objectId()):store.get(version.objectId());
        if(bytes.length!=version.size()||!DocxIntegrity.sha256(bytes).equals(version.sha256()))
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Integridade da versão não confirmada");
        return bytes;
    }
    @Transactional
    public DocumentRepository.Version restoreVersion(UUID actor,UUID id,UUID versionId) {
        access.requireActive(actor);
        Document current=repository.forUpdate(id);
        capabilities.requireView(actor,current);
        if(!capabilities.document(actor,current).canEdit()) throw ApiException.forbidden();
        if(repository.lock(id,java.time.Instant.now())!=null) throw ApiException.conflict("Documento bloqueado para edição");
        DocumentRepository.Version selected=repository.version(id,versionId);
        byte[] bytes=readVersionVerified(current,selected);
        UUID object=UUID.randomUUID();
        try {
            if(current.storedAsAsset()) store.putAsset(object,bytes,current.mimeType()); else store.put(object,bytes);
        } catch(RuntimeException ex) {
            if(current.storedAsAsset()) store.deleteAssetOrphan(object); else store.deleteOrphan(object);
            throw ex;
        }
        if(TransactionSynchronizationManager.isSynchronizationActive())
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    if(status==STATUS_ROLLED_BACK) {
                        if(current.storedAsAsset()) store.deleteAssetOrphan(object); else store.deleteOrphan(object);
                    }
                }
            });
        UUID created=repository.restoreVersion(current,object,bytes.length,DocxIntegrity.sha256(bytes),actor,selected.id());
        return repository.version(id,created);
    }
}
