package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository;
import br.edu.unijorge.niteconnect.documents.domain.DocxIntegrity;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.security.AdministrativeTransactions;
import br.edu.unijorge.niteconnect.access.application.AccessService;
import tools.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Structural operations share the document policy, advisory lock and existing content store. */
@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentLibraryOperationsService {
    private static final int MAX_ITEMS=100;
    private static final long MAX_BYTES=32L*1024*1024;
    private final DocumentLibraryRepository folders;
    private final DocumentRepository documents;
    private final DocumentLibraryService library;
    private final DocumentCoreService core;
    private final DocumentCapabilityService capabilities;
    private final DocumentObjectStore store;
    private final AccessService access;
    private final AdministrativeTransactions transactions;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    public DocumentLibraryOperationsService(DocumentLibraryRepository folders,DocumentRepository documents,
            DocumentLibraryService library,DocumentCoreService core,DocumentCapabilityService capabilities,
            DocumentObjectStore store,AccessService access,AdministrativeTransactions transactions,
            JdbcTemplate jdbc,ObjectMapper json) {
        this.folders=folders;this.documents=documents;this.library=library;this.core=core;
        this.capabilities=capabilities;this.store=store;this.access=access;
        this.transactions=transactions;this.jdbc=jdbc;this.json=json;
    }
    public record Resource(String type,UUID id,String name) {
        public Resource(String type,UUID id) {this(type,id,null);}
    }
    public record CopyResult(String type,UUID id,UUID sourceId) {}
    public record BatchRequest(String action,List<Resource> items,UUID destinationId) {}
    public record BatchResult(String action,List<CopyResult> items) {}
    public record Preview(String action,int items,long bytes,List<String> blockers) {}
    private record CopyPlan(List<DocumentLibraryRepository.Folder> tree,List<DocumentRepository.Document> files,long bytes) {}
    private record ZipFile(String path,DocumentRepository.Document document) {}
    private record ZipPlan(List<String> directories,List<ZipFile> files,long bytes) {}

    private static String safeName(String value) {
        if(value==null||value.isBlank()||value.strip().length()>190||value.contains("/")||value.contains("\\")
                ||value.equals(".")||value.equals("..")||value.chars().anyMatch(Character::isISOControl))
            throw ApiException.invalid("Nome inválido");
        return value.strip();
    }
    private static void bounded(int count,long bytes) {
        if(count>MAX_ITEMS||bytes>MAX_BYTES) throw ApiException.invalid("Operação excede 100 itens ou 32 MiB");
    }
    private static void checkExtension(String title,String mime) {
        String lower=title.toLowerCase(Locale.ROOT);
        boolean matches=switch(mime) {
            case "application/vnd.openxmlformats-officedocument.wordprocessingml.document" -> lower.endsWith(".docx");
            case "application/pdf" -> lower.endsWith(".pdf");
            case "image/png" -> lower.endsWith(".png");
            case "image/jpeg" -> lower.endsWith(".jpg")||lower.endsWith(".jpeg");
            default -> false;
        };
        if(!matches) throw ApiException.invalid("Extensão incompatível com o arquivo original");
    }
    private static List<Resource> unique(List<Resource> items) {
        if(items==null||items.isEmpty()||items.size()>MAX_ITEMS) throw ApiException.invalid("Selecione de 1 a 100 itens");
        LinkedHashSet<Resource> set=new LinkedHashSet<>();
        Set<String> ids=new HashSet<>();
        for(Resource item:items) {
            if(item==null||item.id()==null||!Set.of("DOCUMENT","FOLDER").contains(item.type()))
                throw ApiException.invalid("Item documental inválido");
            if(!ids.add(item.type()+":"+item.id())) throw ApiException.invalid("Item repetido no lote");
            set.add(item);
        }
        return List.copyOf(set);
    }
    private void requireCopy(UUID actor,Resource item) {
        if("DOCUMENT".equals(item.type())) {
            var doc=core.require(actor,item.id());
            if(!capabilities.document(actor,doc).canCopy()) throw ApiException.forbidden();
        } else {
            var folder=folders.folder(item.id());
            capabilities.requireView(actor,folder);
            if(!capabilities.folder(actor,folder).canCopy()) throw ApiException.forbidden();
        }
    }
    private CopyPlan plan(UUID actor,Resource source) {
        requireCopy(actor,source);
        if("DOCUMENT".equals(source.type())) {
            var doc=documents.require(source.id());
            bounded(1,doc.size());
            return new CopyPlan(List.of(),List.of(doc),doc.size());
        }
        if(folders.hasNonActiveDescendant(source.id())) throw ApiException.conflict("Subárvore contém item indisponível");
        var tree=new ArrayList<>(folders.subtree(source.id()));
        Map<UUID,DocumentLibraryRepository.Folder> byId=new HashMap<>();
        for(var folder:tree) byId.put(folder.id(),folder);
        tree.sort(Comparator.comparingInt(folder->depth(folder,byId)));
        List<DocumentRepository.Document> files=new ArrayList<>();
        long bytes=0;
        for(var folder:tree) {
            if(!capabilities.folder(actor,folder).canCopy()) throw ApiException.conflict("Subárvore sem autorização integral");
            for(UUID id:folders.activeSubtreeDocuments(List.of(folder.id()))) {
                var doc=documents.require(id);
                if(!capabilities.document(actor,doc).canCopy()) throw ApiException.conflict("Subárvore sem autorização integral");
                files.add(doc);bytes+=doc.size();bounded(tree.size()+files.size(),bytes);
            }
        }
        bounded(tree.size()+files.size(),bytes);
        return new CopyPlan(tree,List.copyOf(files),bytes);
    }
    private int depth(DocumentLibraryRepository.Folder folder,Map<UUID,DocumentLibraryRepository.Folder> tree) {
        int depth=0;
        for(UUID parent=folder.parentId();parent!=null&&tree.containsKey(parent);parent=tree.get(parent).parentId()) {
            if(++depth>63) throw ApiException.conflict("Hierarquia profunda demais");
        }
        return depth;
    }
    private void sameScope(UUID sourceFolder,UUID targetFolder) {
        var source=folders.folder(sourceFolder);
        var target=folders.folder(targetFolder);
        UUID sourceRoot=root(source),targetRoot=root(target);
        if(!sourceRoot.equals(targetRoot)) throw ApiException.conflict("Cópia entre escopos exige transferência específica");
    }
    private UUID root(DocumentLibraryRepository.Folder folder) {
        var current=folder;
        for(int depth=0;depth<64;depth++) {
            if(current.parentId()==null||"PERSONAL".equals(current.kind())||"PROJECT".equals(current.kind())) return current.id();
            current=folders.folder(current.parentId());
        }
        throw ApiException.conflict("Hierarquia profunda demais");
    }
    private void copyIdentity(String table,UUID target,UUID source) {
        jdbc.update("update nite_connect."+table+" n set space_owner_id=s.space_owner_id,resource_owner_kind=s.resource_owner_kind,"
                +"resource_owner_id=s.resource_owner_id,origin=s.origin,protection=s.protection,retention_hold=s.retention_hold,"
                +"protection_reason=s.protection_reason,protection_set_by=s.protection_set_by,"
                +"protection_revision=s.protection_revision,created_for=s.created_for,copied_from_id=s.id "
                +"from nite_connect."+table+" s where n.id=? and s.id=?",target,source);
    }
    private void compensate(UUID object,boolean asset) {
        if(TransactionSynchronizationManager.isSynchronizationActive())
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    if(status==STATUS_ROLLED_BACK) {
                        if(asset) store.deleteAssetOrphan(object); else store.deleteOrphan(object);
                    }
                }
            });
    }
    private UUID copyFile(UUID actor,DocumentRepository.Document source,UUID targetFolder,String title) {
        checkExtension(title,source.mimeType());
        if(folders.fileNameExists(targetFolder,title,new UUID(0,0))) throw ApiException.conflict("Nome de arquivo já utilizado");
        byte[] bytes=core.readVerified(source);
        UUID id=UUID.randomUUID(),object=UUID.randomUUID();
        try {
            if(source.storedAsAsset()) store.putAsset(object,bytes,source.mimeType()); else store.put(object,bytes);
        } catch(RuntimeException ex) {
            if(source.storedAsAsset()) store.deleteAssetOrphan(object); else store.deleteOrphan(object);
            throw ex;
        }
        compensate(object,source.storedAsAsset());
        var target=folders.folder(targetFolder);
        UUID scopeRoot=root(target);
        var root=folders.folder(scopeRoot);
        String context="PERSONAL".equals(root.kind())?"PERSONAL":"PROJECT".equals(root.kind())?"PROJECT":"ADMINISTRATIVE";
        documents.createInFolder(id,title,context,"PERSONAL".equals(context)?root.ownerId():null,
                "PROJECT".equals(context)?root.projectId():null,targetFolder,source.mimeType(),source.storedAsAsset(),
                object,bytes.length,DocxIntegrity.sha256(bytes),actor,null,false);
        copyIdentity("documents",id,source.id());
        folders.event(id,actor,"DOCUMENT_COPIED","Cópia de "+source.id());
        return id;
    }
    @Transactional
    public CopyResult copy(UUID actor,Resource source,UUID destination,String requestedName) {
        access.requireActive(actor);transactions.lock();
        CopyPlan plan=plan(actor,source);
        UUID sourceParent="DOCUMENT".equals(source.type())?plan.files().getFirst().folderId():folders.folder(source.id()).parentId();
        if(sourceParent==null) throw ApiException.conflict("Origem sem pasta ativa");
        UUID targetId=destination==null?sourceParent:destination;
        if(targetId==null) throw ApiException.invalid("Destino obrigatório");
        var target=folders.folder(targetId);
        capabilities.requireAdd(actor,target);
        sameScope(sourceParent,targetId);
        String title=safeName(requestedName==null?("DOCUMENT".equals(source.type())?plan.files().getFirst().title():plan.tree().getFirst().name()):requestedName);
        if("DOCUMENT".equals(source.type())) return new CopyResult("DOCUMENT",copyFile(actor,plan.files().getFirst(),targetId,title),source.id());
        if(folders.descendant(source.id(),targetId)) throw ApiException.conflict("Destino dentro da origem");
        if(folders.siblingExists(targetId,title,new UUID(0,0))) throw ApiException.conflict("Nome de pasta já utilizado");
        Map<UUID,UUID> mapped=new HashMap<>();
        for(var folder:plan.tree()) {
            UUID parent=folder.id().equals(source.id())?targetId:mapped.get(folder.parentId());
            if(parent==null) throw ApiException.conflict("Subárvore inválida");
            var created=folders.addFolder(parent,folder.id().equals(source.id())?title:folder.name(),folder.color(),actor,false);
            copyIdentity("document_folders",created.id(),folder.id());
            mapped.put(folder.id(),created.id());
            jdbc.update("insert into nite_connect.document_folder_events(id,folder_id,actor_id,action,reason) values (?,?,?,?,?)",
                    UUID.randomUUID(),created.id(),actor,"FOLDER_COPIED","Cópia de "+folder.id());
        }
        for(var file:plan.files()) copyFile(actor,file,mapped.get(file.folderId()),file.title());
        return new CopyResult("FOLDER",mapped.get(source.id()),source.id());
    }

    @Transactional(readOnly=true)
    public Preview preview(UUID actor,BatchRequest request) {
        access.requireActive(actor);
        if(request==null) throw ApiException.invalid("Lote obrigatório");
        List<Resource> items=unique(request.items());
        if(request.action()==null||!Set.of("COPY","MOVE","TRASH","RESTORE","FAVORITE","UNFAVORITE").contains(request.action()))
            throw ApiException.invalid("Ação inválida");
        if("MOVE".equals(request.action())&&request.destinationId()==null) throw ApiException.invalid("Destino obrigatório");
        if(request.destinationId()!=null&&Set.of("COPY","MOVE").contains(request.action()))
            capabilities.requireAdd(actor,folders.folder(request.destinationId()));
        List<String> blockers=new ArrayList<>();long bytes=0;int count=0;
        for(Resource item:items) {
            try {
                if("COPY".equals(request.action())) {var p=plan(actor,item);bytes+=p.bytes();count+=p.files().size()+p.tree().size();}
                else if("FAVORITE".equals(request.action())||"UNFAVORITE".equals(request.action())) {
                    if("DOCUMENT".equals(item.type())) capabilities.requireView(actor,documents.require(item.id()));
                    else capabilities.requireView(actor,folders.folder(item.id()));count++;
                } else if("RESTORE".equals(request.action())) {
                    var trash=folders.trashItem(item.id());
                    if(!item.type().equals(trash.type())) throw ApiException.invalid("Tipo incorreto");
                    if(!library.canRestoreTrash(actor,trash)) throw ApiException.forbidden();
                    count++;
                } else if("DOCUMENT".equals(item.type())) {
                    var doc=documents.require(item.id());
                    capabilities.requireView(actor,doc);
                    boolean allowed="MOVE".equals(request.action())?capabilities.document(actor,doc).canMove():capabilities.document(actor,doc).canDeleteToTrash();
                    if(!allowed) throw ApiException.forbidden();count++;bytes+=doc.size();
                } else {
                    var folder=folders.folder(item.id());
                    boolean allowed="MOVE".equals(request.action())?capabilities.folder(actor,folder).canMove():capabilities.folder(actor,folder).canDeleteToTrash();
                    if(!allowed) throw ApiException.forbidden();
                    if(folders.hasNonActiveDescendant(item.id())) throw ApiException.conflict("Subárvore indisponível");
                    for(var descendant:folders.subtree(item.id())) {
                        boolean childAllowed="MOVE".equals(request.action())?capabilities.folder(actor,descendant).canMove():capabilities.folder(actor,descendant).canDeleteToTrash();
                        if(!childAllowed) throw ApiException.conflict("Subárvore sem autorização integral");
                        count++;bounded(count,bytes);
                        for(UUID id:folders.activeSubtreeDocuments(List.of(descendant.id()))) {
                            var doc=documents.require(id);
                            boolean fileAllowed="MOVE".equals(request.action())?capabilities.document(actor,doc).canMove():capabilities.document(actor,doc).canDeleteToTrash();
                            if(!fileAllowed) throw ApiException.conflict("Subárvore sem autorização integral");
                            bytes+=doc.size();count++;bounded(count,bytes);
                        }
                    }
                }
                bounded(count,bytes);
            } catch(ApiException ex) {blockers.add(item.type()+":"+item.id()+":"+ex.status().value());}
        }
        if(blockers.isEmpty()&&Set.of("COPY","MOVE","TRASH").contains(request.action()))
            for(Resource parent:items) if("FOLDER".equals(parent.type()))
                for(Resource child:items) if(!parent.equals(child)) {
                    UUID childFolder="FOLDER".equals(child.type())?child.id():documents.require(child.id()).folderId();
                    if(childFolder!=null&&folders.descendant(parent.id(),childFolder))
                        throw ApiException.invalid("Lote contém pasta e descendente selecionados");
                }
        return new Preview(request.action(),count,bytes,List.copyOf(blockers));
    }
    @Transactional
    public BatchResult batch(UUID actor,String key,BatchRequest request) {
        access.requireActive(actor);
        if(request==null) throw ApiException.invalid("Lote obrigatório");
        if(key==null||key.isBlank()||key.length()>128) throw ApiException.invalid("Idempotency-Key obrigatória");
        transactions.lock();
        String fingerprint=DocxIntegrity.sha256(serialize(request));
        var prior=jdbc.query("select request_sha256,response_json::text from nite_connect.document_operation_receipts where actor_id=? and idempotency_key=?",
                (rs,row)->new String[]{rs.getString(1),rs.getString(2)},actor,key);
        if(!prior.isEmpty()) {
            if(!fingerprint.equals(prior.getFirst()[0])) throw ApiException.conflict("Idempotency-Key reutilizada com outra operação");
            return json.readValue(prior.getFirst()[1],BatchResult.class);
        }
        Preview preview=preview(actor,request);
        if(!preview.blockers().isEmpty()) throw ApiException.conflict("Lote contém itens não autorizados ou indisponíveis");
        List<CopyResult> results=new ArrayList<>();
        for(Resource item:unique(request.items())) {
            switch(request.action()) {
                case "COPY" -> results.add(copy(actor,item,request.destinationId(),item.name()));
                case "MOVE" -> {
                    if(request.destinationId()==null) throw ApiException.invalid("Destino obrigatório");
                    if("DOCUMENT".equals(item.type())) library.moveFile(actor,item.id(),new DocumentLibraryService.DocumentChange(request.destinationId(),null));
                    else library.changeFolder(actor,item.id(),new DocumentLibraryService.FolderChange(request.destinationId(),null,null,false));
                    results.add(new CopyResult(item.type(),item.id(),item.id()));
                }
                case "TRASH" -> {
                    if("DOCUMENT".equals(item.type())) library.trashFile(actor,item.id()); else library.trashFolder(actor,item.id(),true);
                    results.add(new CopyResult(item.type(),item.id(),item.id()));
                }
                case "RESTORE" -> {library.restoreTrash(actor,item.id());results.add(new CopyResult(item.type(),item.id(),item.id()));}
                case "FAVORITE","UNFAVORITE" -> {
                    favorite(actor,item,"FAVORITE".equals(request.action()));
                    results.add(new CopyResult(item.type(),item.id(),item.id()));
                }
                default -> throw ApiException.invalid("Ação inválida");
            }
        }
        BatchResult result=new BatchResult(request.action(),List.copyOf(results));
        jdbc.update("insert into nite_connect.document_operation_receipts(actor_id,idempotency_key,request_sha256,response_json) values (?,?,?,?::jsonb)",
                actor,key,fingerprint,new String(serialize(result),StandardCharsets.UTF_8));
        return result;
    }
    private byte[] serialize(Object value) {
        return json.writeValueAsBytes(value);
    }
    @Transactional
    public void favorite(UUID actor,Resource item,boolean add) {
        access.requireActive(actor);
        if(item==null||item.id()==null||!Set.of("DOCUMENT","FOLDER").contains(item.type())) throw ApiException.invalid("Item inválido");
        if(add) {
            if("DOCUMENT".equals(item.type())) core.require(actor,item.id()); else capabilities.requireView(actor,folders.folder(item.id()));
            jdbc.update("insert into nite_connect.document_favorites(id,member_id,document_id,folder_id) values (?,?,?,?) on conflict do nothing",
                    UUID.randomUUID(),actor,"DOCUMENT".equals(item.type())?item.id():null,"FOLDER".equals(item.type())?item.id():null);
        } else jdbc.update("delete from nite_connect.document_favorites where member_id=? and "+("DOCUMENT".equals(item.type())?"document_id":"folder_id")+"=?",actor,item.id());
    }
    @Transactional(readOnly=true)
    public List<Resource> favorites(UUID actor) {
        access.requireActive(actor);
        List<Resource> results=new ArrayList<>();
        var rows=jdbc.query("select document_id,folder_id from nite_connect.document_favorites where member_id=? order by created_at desc limit 500",
                (rs,row)->new Resource(rs.getObject(1,UUID.class)==null?"FOLDER":"DOCUMENT",
                        rs.getObject(1,UUID.class)==null?rs.getObject(2,UUID.class):rs.getObject(1,UUID.class)),actor);
        for(var row:rows) {
            try {
                if("DOCUMENT".equals(row.type())) capabilities.requireView(actor,documents.require(row.id()));
                else capabilities.requireView(actor,folders.folder(row.id()));
                results.add(row);
            } catch(ApiException ignored) { /* A preference never grants access. */ }
        }
        return List.copyOf(results);
    }

    private ZipPlan zipPlan(UUID actor,List<Resource> selected) {
        List<String> directories=new ArrayList<>();List<ZipFile> files=new ArrayList<>();
        long bytes=0;
        Set<String> paths=new HashSet<>();
        for(Resource resource:unique(selected)) {
            if("DOCUMENT".equals(resource.type())) {
                var doc=core.require(actor,resource.id());
                if(!capabilities.document(actor,doc).canDownload()) throw ApiException.forbidden();
                String path=safeName(doc.title());
                if(!paths.add(path.toLowerCase(Locale.ROOT))) throw ApiException.conflict("Nomes duplicados no ZIP");
                files.add(new ZipFile(path,doc));bytes+=doc.size();
            } else {
                var root=folders.folder(resource.id());
                capabilities.requireView(actor,root);
                if(folders.hasNonActiveDescendant(root.id())) throw ApiException.conflict("Subárvore contém item indisponível");
                var tree=new ArrayList<>(folders.subtree(root.id()));
                Map<UUID,DocumentLibraryRepository.Folder> byId=new HashMap<>();
                for(var folder:tree) byId.put(folder.id(),folder);
                tree.sort(Comparator.comparingInt(folder->depth(folder,byId)));
                Map<UUID,String> names=new HashMap<>();
                for(var folder:tree) {
                    capabilities.requireView(actor,folder);
                    String path=folder.id().equals(root.id())?safeName(folder.name()):names.get(folder.parentId())+"/"+safeName(folder.name());
                    names.put(folder.id(),path);directories.add(path+"/");
                    if(!paths.add((path+"/").toLowerCase(Locale.ROOT))) throw ApiException.conflict("Nomes duplicados no ZIP");
                    for(UUID id:folders.activeSubtreeDocuments(List.of(folder.id()))) {
                        var doc=core.require(actor,id);
                        if(!capabilities.document(actor,doc).canDownload()) throw ApiException.forbidden();
                        String filePath=path+"/"+safeName(doc.title());
                        if(!paths.add(filePath.toLowerCase(Locale.ROOT))) throw ApiException.conflict("Nomes duplicados no ZIP");
                        files.add(new ZipFile(filePath,doc));bytes+=doc.size();
                        bounded(files.size()+directories.size(),bytes);
                    }
                }
            }
            bounded(files.size()+directories.size(),bytes);
        }
        return new ZipPlan(List.copyOf(directories),List.copyOf(files),bytes);
    }
    @Transactional(readOnly=true)
    public StreamingResponseBody zip(UUID actor,List<Resource> selected) {
        ZipPlan plan=zipPlan(actor,selected);
        return output -> {
            long deadline=System.nanoTime()+30_000_000_000L;
            try(ZipOutputStream zip=new ZipOutputStream(output,StandardCharsets.UTF_8)) {
                for(String directory:plan.directories()) {zip.putNextEntry(new ZipEntry(directory));zip.closeEntry();}
                for(ZipFile file:plan.files()) {
                    if(System.nanoTime()>deadline) throw new IOException("Tempo de exportação excedido");
                    // Reauthorize when streaming starts; a revoked grant never receives new bytes.
                    var current=core.require(actor,file.document().id());
                    if(!capabilities.document(actor,current).canDownload()||!current.versionId().equals(file.document().versionId()))
                        throw ApiException.conflict("Documento alterado antes da exportação");
                    byte[] bytes=core.readVerified(current);
                    zip.putNextEntry(new ZipEntry(file.path()));zip.write(bytes);zip.closeEntry();
                }
            }
        };
    }
}
