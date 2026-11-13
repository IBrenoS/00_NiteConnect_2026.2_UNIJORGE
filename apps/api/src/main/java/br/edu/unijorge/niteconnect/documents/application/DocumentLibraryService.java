package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.application.ProjectAccess;
import br.edu.unijorge.niteconnect.documents.domain.DocxIntegrity;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository.*;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentSharingRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentSharingRepository.Share;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentSharingRepository.SharedItem;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository.Document;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.security.AdministrativeTransactions;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.*;

/** Shared namespace: personal, project and institutional views reference the same documents. */
@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentLibraryService {
    public static final String DOCX="application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    private final DocumentLibraryRepository folders;
    private final DocumentRepository documents;
    private final DocumentSharingRepository sharing;
    private final DocumentCoreService core;
    private final DocumentObjectStore store;
    private final AccessService access;
    private final ProjectAccess projects;
    private final AdministrativeTransactions transactions;
    private final TransactionTemplate provisioningTransaction;
    public DocumentLibraryService(DocumentLibraryRepository folders,DocumentRepository documents,DocumentCoreService core,
                                  DocumentSharingRepository sharing,DocumentObjectStore store,AccessService access,ProjectAccess projects,AdministrativeTransactions transactions,
                                  PlatformTransactionManager transactionManager) {
        this.folders=folders;this.documents=documents;this.core=core;this.sharing=sharing;this.store=store;
        this.access=access;this.projects=projects;this.transactions=transactions;
        this.provisioningTransaction=new TransactionTemplate(transactionManager);
    }
    public record Listing(Folder folder,List<Folder> folders,List<FileEntry> files,long totalFiles,String nextCursor,boolean hasMore) {}
    public record ActivityListing(List<Activity> items,String nextCursor,boolean hasMore) {}
    public record FolderChange(UUID parentId,String name,String color,Boolean moveToRoot) {}
    public record DocumentChange(UUID folderId,String title) {}
    public record DistributionResult(int created,int alreadyPresent,List<Distribution> items) {}
    private record Scope(String kind,UUID subject) {}

    private Scope scope(Folder folder) {
        Set<UUID> visited=new HashSet<>();
        Folder current=folder;
        for(int depth=0;depth<64;depth++) {
            if(!visited.add(current.id())) throw ApiException.conflict("Ciclo na hierarquia de pastas");
            if("PERSONAL".equals(current.kind())) return new Scope("PERSONAL",current.ownerId());
            if("PROJECT".equals(current.kind())) return new Scope("PROJECT",current.projectId());
            if(current.parentId()==null) return new Scope("ADMINISTRATIVE",current.id());
            current=folders.folder(current.parentId());
        }
        throw ApiException.conflict("Profundidade máxima da biblioteca excedida");
    }
    private void requireRead(UUID actor,Folder folder) {
        access.requireActive(actor);
        if(access.isAdministrator(actor)) return;
        Scope scope=scope(folder);
        switch(scope.kind()) {
            case "PERSONAL" -> { if(!actor.equals(scope.subject())&&sharing.folderPermission(folder.id(),actor)==null) throw ApiException.notFound(); }
            case "PROJECT" -> {
                try {projects.requireRead(actor,scope.subject());}
                catch(ApiException ex) {if(sharing.folderPermission(folder.id(),actor)==null) throw ex;}
            }
            default -> {if(sharing.folderPermission(folder.id(),actor)==null) throw ApiException.notFound();}
        }
    }
    private void requireManage(UUID actor,Folder folder) {
        access.requireActive(actor);
        if(access.isAdministrator(actor)) return;
        Scope scope=scope(folder);
        if("PROJECT".equals(scope.kind())) {projects.requireManage(actor,scope.subject());return;}
        throw ApiException.forbidden();
    }
    /** Members may organize only custom folders and documents in their own personal tree. */
    private void requireOrganize(UUID actor,Folder folder) {
        access.requireActive(actor);
        if(access.isAdministrator(actor)) return;
        Scope scope=scope(folder);
        if("PERSONAL".equals(scope.kind())) {
            if(!actor.equals(scope.subject())) throw ApiException.notFound();
            return;
        }
        if("PROJECT".equals(scope.kind())) {projects.requireManage(actor,scope.subject());return;}
        throw ApiException.forbidden();
    }
    private void requireAddContent(UUID actor,Folder folder) {
        access.requireActive(actor);
        if(access.isAdministrator(actor)) return;
        Scope scope=scope(folder);
        if("PERSONAL".equals(scope.kind())) {
            if(actor.equals(scope.subject())||"EDIT".equals(sharing.folderPermission(folder.id(),actor))) return;
            throw ApiException.notFound();
        }
        if("PROJECT".equals(scope.kind())) {
            try {projects.requireManage(actor,scope.subject());return;}
            catch(ApiException ex) {if("EDIT".equals(sharing.folderPermission(folder.id(),actor))) return;throw ex;}
        }
        throw ApiException.forbidden();
    }
    private UUID scopeRoot(Folder folder) {
        Scope current=scope(folder);
        if("PERSONAL".equals(current.kind())) return folders.personal(current.subject()).id();
        if("PROJECT".equals(current.kind())) return folders.project(current.subject()).id();
        Folder root=folder;
        while(root.parentId()!=null) root=folders.folder(root.parentId());
        return root.id();
    }
    public void requirePersonalTarget(UUID actor,UUID folderId) {
        if(folderId==null) return;
        Scope subject=scope(folders.folder(folderId));
        if(!"PERSONAL".equals(subject.kind()) || !actor.equals(subject.subject())) throw ApiException.notFound();
        access.requireActive(actor);
    }
    @Transactional(readOnly=true)
    public List<DocumentLibraryRepository.Recipient> recipients(UUID actor) {
        access.requireAdministrator(actor);return folders.recipients();
    }
    @Transactional
    public List<Folder> tree(UUID actor) {access.requireAdministrator(actor);folders.roots();return folders.folderTree();}
    @Transactional
    public List<Folder> roots(UUID actor) {access.requireAdministrator(actor);return folders.roots();}
    @Transactional
    public Listing mine(UUID actor,UUID folderId,String search,String mimeType,String sortBy,String direction,String cursor,int limit) {
        access.requireActive(actor);
        Folder personal=folders.ensurePersonal(actor);
        Folder selected=folderId==null?personal:folders.folder(folderId);
        if(!scope(selected).equals(new Scope("PERSONAL",actor))) throw ApiException.notFound();
        return listing(actor,selected,search,mimeType,sortBy,direction,cursor,limit);
    }
    @Transactional
    public List<Folder> projectTree(UUID actor,UUID projectId) {
        projects.requireRead(actor,projectId);
        return folders.subtree(folders.ensureProject(projectId).id());
    }
    @Transactional(readOnly=true)
    public Listing browse(UUID actor,UUID folderId,String search,String mimeType,String sortBy,String direction,String cursor,int limit) {
        return listing(actor,folders.folder(folderId),search,mimeType,sortBy,direction,cursor,limit);
    }
    @Transactional
    public Listing project(UUID actor,UUID projectId,UUID folderId,String search,String mimeType,String sortBy,String direction,String cursor,int limit) {
        projects.requireRead(actor,projectId);
        Folder home=folders.ensureProject(projectId);
        Folder selected=folderId==null?home:folders.folder(folderId);
        if(!scope(selected).equals(new Scope("PROJECT",projectId))) throw ApiException.notFound();
        return listing(actor,selected,search,mimeType,sortBy,direction,cursor,limit);
    }
    private Listing listing(UUID actor,Folder folder,String search,String mimeType,String sortBy,String direction,String cursor,int limit) {
        requireRead(actor,folder);
        String normalizedSort=sortBy==null||sortBy.isBlank()?"name":sortBy;
        String normalizedDirection=direction==null||direction.isBlank()?"asc":direction.toLowerCase(Locale.ROOT);
        if(!Set.of("name","modifiedAt","createdAt","size").contains(normalizedSort)) throw ApiException.invalid("Ordenação documental inválida");
        if(!Set.of("asc","desc").contains(normalizedDirection)) throw ApiException.invalid("Direção de ordenação inválida");
        if(limit<1||limit>500) throw ApiException.invalid("O limite deve estar entre 1 e 500");
        String normalizedSearch=search==null||search.isBlank()?null:search.strip();
        if(normalizedSearch!=null&&(normalizedSearch.length()>120||normalizedSearch.chars().anyMatch(Character::isISOControl)))
            throw ApiException.invalid("Termo de pesquisa inválido");
        String normalizedMime=mimeType==null||mimeType.isBlank()?null:mimeType;
        if(normalizedMime!=null&&!Set.of(DOCX,"application/pdf","image/png","image/jpeg").contains(normalizedMime))
            throw ApiException.invalid("Filtro de tipo documental inválido");
        String rawCursor=decodeCursor(folder.id(),normalizedSort,normalizedDirection,normalizedSearch,normalizedMime,cursor);
        FilePage page=folders.filePage(folder.id(),normalizedSearch,normalizedMime,normalizedSort,normalizedDirection,rawCursor,limit);
        String next=page.nextCursor()==null?null:Base64.getUrlEncoder().withoutPadding().encodeToString(
                (folder.id()+"\n"+page.nextCursor()).getBytes(StandardCharsets.UTF_8));
        Folder visible=folder;
        UUID boundary=sharing.sharedBoundary(folder.id(),actor);
        if(boundary!=null) {
            UUID parent=folder.id().equals(boundary)?null:folder.parentId();
            visible=new Folder(folder.id(),parent,folder.name(),folder.color(),folder.kind(),folder.systemKey(),folder.ownerId(),
                    folder.ownerName(),folder.projectId(),folder.projectTitle(),folder.createdBy(),folder.createdByName(),folder.createdAt(),
                    folder.modifiedBy(),folder.modifiedByName(),folder.modifiedAt());
        }
        return new Listing(visible,folders.children(folder.id()),page.items(),page.total(),next,page.hasMore());
    }
    @Transactional(readOnly=true)
    public FileEntry documentDetails(UUID actor,UUID id) {
        Document document=core.require(actor,id);
        FileEntry file=folders.file(id);
        if("PROJECT".equals(document.context())&&!access.isAdministrator(actor)) {
            try {projects.requireRead(actor,document.projectId());}
            catch(ApiException ex) {
                return new FileEntry(file.id(),null,file.title(),file.context(),file.ownerId(),null,file.mimeType(),file.revision(),file.size(),
                        file.ownerName(),file.createdByName(),file.createdBy(),file.createdAt(),file.modifiedByName(),file.modifiedBy(),file.modifiedAt(),
                        null,file.sharedByName(),file.sharedAt(),file.sharedWithCount(),file.lastOpenedByName(),file.lastOpenedBy(),file.lastOpenedAt());
            }
        }
        return file;
    }
    @Transactional(readOnly=true)
    public ActivityListing documentActivity(UUID actor,UUID id,String cursor,int limit) {
        core.require(actor,id);
        return activityListing("document",id,cursor,limit,(before,beforeId,pageSize)->folders.documentActivity(id,before,beforeId,pageSize));
    }
    @Transactional(readOnly=true)
    public ActivityListing folderActivity(UUID actor,UUID id,String cursor,int limit) {
        Folder folder=folders.folder(id);
        requireRead(actor,folder);
        return activityListing("folder",id,cursor,limit,(before,beforeId,pageSize)->folders.folderActivity(id,before,beforeId,pageSize));
    }
    public record SharedListing(List<SharedItem> items,String nextCursor,boolean hasMore) {}
    private record ShareCursor(java.time.Instant at,UUID grantId) {}
    @Transactional(readOnly=true)
    public SharedListing sharedWithMe(UUID actor,String cursor,int limit) {
        access.requireActive(actor);
        if(limit<1||limit>100) throw ApiException.invalid("O limite deve estar entre 1 e 100");
        ShareCursor after=decodeShareCursor(cursor);
        var page=sharing.received(actor,after==null?null:after.at(),after==null?null:after.grantId(),limit);
        String next=null;
        if(page.hasMore()&&!page.items().isEmpty()) {
            SharedItem last=page.items().getLast();
            next=Base64.getUrlEncoder().withoutPadding().encodeToString((last.sharedAt()+"\n"+last.grantId()).getBytes(StandardCharsets.UTF_8));
        }
        return new SharedListing(page.items(),next,page.hasMore());
    }
    private static ShareCursor decodeShareCursor(String cursor) {
        if(cursor==null||cursor.isBlank()) return null;
        try {
            String[] parts=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8).split("\\n",-1);
            if(parts.length!=2) throw ApiException.invalid("Cursor de compartilhamentos inválido");
            return new ShareCursor(java.time.Instant.parse(parts[0]),UUID.fromString(parts[1]));
        } catch(IllegalArgumentException ex) {throw ApiException.invalid("Cursor de compartilhamentos inválido");}
    }
    @Transactional(readOnly=true)
    public List<DocumentSharingRepository.Recipient> shareRecipients(UUID actor,String search,int limit) {
        access.requireActive(actor);
        if(search==null||search.strip().length()<2||search.strip().length()>120||search.chars().anyMatch(Character::isISOControl))
            throw ApiException.invalid("Informe ao menos dois caracteres para localizar integrantes ativos");
        if(limit<1||limit>50) throw ApiException.invalid("O limite deve estar entre 1 e 50");
        return sharing.recipients(actor,search.strip(),limit);
    }
    private void requireShareManage(UUID actor,Folder folder) {
        access.requireActive(actor);
        if(access.isAdministrator(actor)) return;
        Scope scope=scope(folder);
        if("PERSONAL".equals(scope.kind())) {
            if(actor.equals(scope.subject())) return;
            throw ApiException.notFound();
        }
        if("PROJECT".equals(scope.kind())) {projects.requireManage(actor,scope.subject());return;}
        throw ApiException.forbidden();
    }
    private void requireShareManage(UUID actor,Document document) {
        access.requireActive(actor);
        if(access.isAdministrator(actor)) return;
        if("PERSONAL".equals(document.context())) {
            if(actor.equals(document.ownerId())) return;
            throw ApiException.notFound();
        }
        if("PROJECT".equals(document.context())) {projects.requireManage(actor,document.projectId());return;}
        throw ApiException.forbidden();
    }
    private void validateRecipient(UUID recipient,String targetKind,UUID projectId) {
        access.requireActive(recipient);
        if("FOLDER".equals(targetKind)&&projectId!=null) projects.requireRead(recipient,projectId);
    }
    @Transactional
    public Share shareDocument(UUID actor,UUID id,UUID member,String permission) {
        Document document=core.require(actor,id);
        requireShareManage(actor,document);
        validateRecipient(member,"DOCUMENT",document.projectId());
        if(permission==null||!Set.of("VIEW","EDIT").contains(permission)) throw ApiException.invalid("Permissão documental inválida");
        transactions.lock();
        if(sharing.shares(id,null).stream().anyMatch(share->share.memberId().equals(member)))
            throw ApiException.conflict("Este integrante já possui compartilhamento direto ativo");
        return sharing.grant(id,null,member,permission,actor);
    }
    @Transactional(readOnly=true)
    public List<Share> documentShares(UUID actor,UUID id) {
        Document document=core.require(actor,id);requireShareManage(actor,document);
        return sharing.shares(id,null);
    }
    @Transactional
    public Share shareFolder(UUID actor,UUID id,UUID member,String permission) {
        Folder folder=folders.folder(id);requireShareManage(actor,folder);
        Scope scope=scope(folder);
        validateRecipient(member,"FOLDER","PROJECT".equals(scope.kind())?scope.subject():null);
        if(permission==null||!Set.of("VIEW","EDIT").contains(permission)) throw ApiException.invalid("Permissão documental inválida");
        transactions.lock();
        if(sharing.shares(null,id).stream().anyMatch(share->share.memberId().equals(member)))
            throw ApiException.conflict("Este integrante já possui compartilhamento direto ativo");
        return sharing.grant(null,id,member,permission,actor);
    }
    @Transactional(readOnly=true)
    public List<Share> folderShares(UUID actor,UUID id) {
        Folder folder=folders.folder(id);requireShareManage(actor,folder);
        return sharing.shares(null,id);
    }
    private Share authorizeShareChange(UUID actor,UUID id) {
        Share share=sharing.requireActive(id);
        if(share.documentId()!=null) requireShareManage(actor,documents.require(share.documentId()));
        else requireShareManage(actor,folders.folder(share.folderId()));
        return share;
    }
    @Transactional
    public Share changeShare(UUID actor,UUID id,String permission) {
        Share share=authorizeShareChange(actor,id);
        if(permission==null||!Set.of("VIEW","EDIT").contains(permission)) throw ApiException.invalid("Permissão documental inválida");
        access.requireActive(share.memberId());transactions.lock();
        return sharing.change(id,permission,actor);
    }
    @Transactional
    public void revokeShare(UUID actor,UUID id) {
        authorizeShareChange(actor,id);transactions.lock();sharing.revoke(id,actor);
    }
    @FunctionalInterface private interface ActivityQuery {ActivityPage query(java.time.Instant before,UUID beforeId,int limit);}
    private record ActivityCursor(java.time.Instant occurredAt,UUID id) {}
    private ActivityListing activityListing(String kind,UUID entity,String cursor,int limit,ActivityQuery query) {
        if(limit<1||limit>100) throw ApiException.invalid("O limite do histórico deve estar entre 1 e 100");
        ActivityCursor after=decodeActivityCursor(kind,entity,cursor);
        ActivityPage page=query.query(after==null?null:after.occurredAt(),after==null?null:after.id(),limit);
        String next=null;
        if(page.hasMore()&&!page.items().isEmpty()) {
            Activity last=page.items().getLast();
            String token=kind+"\n"+entity+"\n"+last.occurredAt()+"\n"+last.id();
            next=Base64.getUrlEncoder().withoutPadding().encodeToString(token.getBytes(StandardCharsets.UTF_8));
        }
        return new ActivityListing(page.items(),next,page.hasMore());
    }
    private static ActivityCursor decodeActivityCursor(String kind,UUID entity,String cursor) {
        if(cursor==null||cursor.isBlank()) return null;
        try {
            String[] parts=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8).split("\\n",-1);
            if(parts.length!=4||!parts[0].equals(kind)||!parts[1].equals(entity.toString()))
                throw ApiException.invalid("Cursor incompatível com este histórico");
            return new ActivityCursor(java.time.Instant.parse(parts[2]),UUID.fromString(parts[3]));
        } catch(IllegalArgumentException ex) {throw ApiException.invalid("Cursor de histórico inválido");}
    }
    private static String decodeCursor(UUID folder,String sort,String direction,String search,String mimeType,String cursor) {
        if(cursor==null||cursor.isBlank()) return null;
        try {
            String decoded=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8);
            String[] parts=decoded.split("\\n",7);
            if(parts.length!=7||!parts[0].equals(folder.toString())||!parts[1].equals(sort)||!parts[2].equals(direction)
                    ||!parts[3].equals(search==null?"":search)||!parts[4].equals(mimeType==null?"":mimeType))
                throw ApiException.invalid("Cursor incompatível com os filtros desta consulta");
            UUID.fromString(parts[6]);
            return String.join("\n",parts[1],parts[2],parts[3],parts[4],parts[5],parts[6]);
        } catch(IllegalArgumentException ex) {throw ApiException.invalid("Cursor de paginação inválido");}
    }
    @Transactional
    public Folder addFolder(UUID actor,UUID parentId,String name,String color) {
        Folder parent=parentId==null?null:folders.folder(parentId);
        if(parent==null) access.requireAdministrator(actor); else requireAddContent(actor,parent);
        String clean=name(name);
        String tint=color(color);
        transactions.lock();
        if(folders.siblingExists(parentId,clean,new UUID(0,0))) throw ApiException.conflict("Já existe uma pasta com esse nome neste local");
        return folders.addFolder(parentId,clean,tint,actor);
    }
    @Transactional
    public Folder changeFolder(UUID actor,UUID id,FolderChange change) {
        Folder folder=folders.folder(id);
        requireOrganize(actor,folder);
        if(!access.isAdministrator(actor) && !"CUSTOM".equals(folder.kind())) throw ApiException.forbidden();
        if("PROJECT".equals(folder.kind()) && !access.isAdministrator(actor))
            throw ApiException.forbidden(); // The project directory name is institutional metadata, not a team subfolder.
        String name=change.name()==null?folder.name():name(change.name());
        String tint=change.color()==null?folder.color():color(change.color());
        UUID destination=Boolean.TRUE.equals(change.moveToRoot())?scopeRoot(folder):change.parentId()==null?folder.parentId():change.parentId();
        if("ROOT".equals(folder.kind()) && destination!=null) throw ApiException.conflict("Raízes institucionais não podem ser movidas");
        if(!"CUSTOM".equals(folder.kind()) && !Objects.equals(destination,folder.parentId()))
            throw ApiException.conflict("Pastas vinculadas a integrante ou projeto não podem mudar de área");
        if(destination!=null) {
            Folder target=folders.folder(destination);requireOrganize(actor,target);
            if(folders.descendant(id,destination)) throw ApiException.conflict("Uma pasta não pode ser movida para dentro de si mesma");
            if(!scope(folder).equals(scope(target)))
                throw ApiException.conflict("Pastas não podem ser movidas para outro contexto documental");
            if(!Objects.equals(destination,folder.parentId())&&(sharing.hasGrantInFolderSubtree(id)||sharing.hasFolderGrantOnPath(folder.id())||sharing.hasFolderGrantOnPath(target.id())))
                throw ApiException.conflict("Revise os compartilhamentos antes de mover conteúdo entre limites compartilhados");
        }
        transactions.lock();
        if(folders.siblingExists(destination,name,id)) throw ApiException.conflict("Já existe uma pasta com esse nome neste local");
        if("ROOT".equals(folder.kind())) return folders.renameRootFolder(id,name,tint,actor);
        if(!"CUSTOM".equals(folder.kind())) {
            folders.renameProtectedFolder(id,name,tint,actor);
            return folders.folder(id);
        }
        return folders.updateFolder(id,destination,name,tint,actor);
    }
    @Transactional
    public void archiveFolder(UUID actor,UUID id,boolean recursive) {
        Folder folder=folders.folder(id); requireManage(actor,folder);
        if(!"CUSTOM".equals(folder.kind())) throw ApiException.conflict("Pasta estrutural protegida");
        transactions.lock();
        if(!recursive && folders.hasContents(id)) throw ApiException.conflict("Pasta não está vazia; confirme o arquivamento com conteúdo");
        if(recursive) folders.archiveFolderTree(id,actor);
        else folders.archiveFolder(id,actor);
    }
    @Transactional(readOnly=true)
    public List<ArchivedItem> archived(UUID actor) {access.requireAdministrator(actor);return folders.archivedItems();}
    @Transactional
    public void restoreFolder(UUID actor,UUID id) {
        access.requireAdministrator(actor);
        transactions.lock();
        folders.restoreFolderTree(id,actor);
    }
    @Transactional
    public FileEntry upload(UUID actor,UUID folderId,String title,String contentType,byte[] data) {
        Folder folder=folders.folder(folderId);requireAddContent(actor,folder);
        Scope scope=scope(folder);
        if("PROJECT".equals(scope.kind())) {
            try {projects.requireManage(actor,scope.subject());}
            catch(ApiException ex) {if(!"EDIT".equals(sharing.folderPermission(folder.id(),actor))) throw ex;}
        }
        String name=name(title);
        String mime=validateFile(name,contentType,data);
        UUID id=UUID.randomUUID(), object=UUID.randomUUID();
        boolean asset=!DOCX.equals(mime);
        if(asset) store.putAsset(object,data,mime); else store.put(object,data);
        cleanupObjectAfterRollback(object,asset);
        if(folders.fileNameExists(folderId,name,new UUID(0,0))) throw ApiException.conflict("Já existe um arquivo com esse nome nesta pasta");
        documents.createInFolder(id,name,scope.kind(),"PERSONAL".equals(scope.kind())?scope.subject():null,
                "PROJECT".equals(scope.kind())?scope.subject():null,folderId,mime,asset,object,data.length,
                DocxIntegrity.sha256(data),actor,null);
        return folders.file(id);
    }
    @Transactional
    public List<FileEntry> uploadTree(UUID actor,UUID folderId,List<org.springframework.web.multipart.MultipartFile> files,List<String> paths) {
        if(files==null||paths==null||files.isEmpty()||files.size()!=paths.size()||files.size()>100)
            throw ApiException.invalid("Envie de 1 a 100 arquivos com um caminho para cada item");
        long total=0;
        for(var file:files) {
            if(file.isEmpty()||file.getSize()>DocxIntegrity.MAX_BYTES) throw ApiException.invalid("Cada arquivo deve ter até 8 MiB e não pode estar vazio");
            total+=file.getSize();
        }
        if(total>32L*1024*1024) throw ApiException.invalid("O lote não pode exceder 32 MiB");
        Folder home=folders.folder(folderId);
        requireAddContent(actor,home);
        Scope original=scope(home);
        Set<String> destinations=new HashSet<>();
        List<FileEntry> created=new ArrayList<>();
        for(int index=0;index<files.size();index++) {
            String[] segments=pathSegments(paths.get(index));
            Folder parent=home;
            for(int position=0;position<segments.length-1;position++) {
                String folderName=name(segments[position]);
                Folder child=folders.child(parent.id(),folderName);
                if(child==null) {
                    requireAddContent(actor,parent);
                    transactions.lock();
                    if(folders.siblingExists(parent.id(),folderName,new UUID(0,0))) throw ApiException.conflict("Conflito de nome de pasta no lote");
                    child=folders.addFolder(parent.id(),folderName,"#D6A432",actor);
                }
                if(!scope(child).equals(original)) throw ApiException.conflict("O caminho do lote ultrapassa o escopo documental");
                parent=child;
            }
            String title=name(segments[segments.length-1]);
            String destination=parent.id()+"/"+title.toLowerCase(Locale.ROOT);
            if(!destinations.add(destination)||folders.fileNameExists(parent.id(),title,new UUID(0,0)))
                throw ApiException.conflict("Já existe um arquivo com esse nome nesta pasta");
            try {created.add(upload(actor,parent.id(),title,files.get(index).getContentType(),files.get(index).getBytes()));}
            catch(java.io.IOException ex) {throw new IllegalArgumentException("Não foi possível ler um arquivo do lote",ex);}
        }
        return List.copyOf(created);
    }
    private static String[] pathSegments(String path) {
        if(path==null||path.isBlank()||path.startsWith("/")||path.startsWith("\\")||path.contains("\\")||path.chars().anyMatch(Character::isISOControl))
            throw ApiException.invalid("Caminho de arquivo inválido");
        String[] parts=path.split("/",-1);
        if(parts.length==0||Arrays.stream(parts).anyMatch(part->part.isBlank()||part.equals(".")||part.equals("..")))
            throw ApiException.invalid("Caminho de arquivo inválido");
        return parts;
    }
    private void cleanupObjectAfterRollback(UUID object,boolean asset) {
        if(!TransactionSynchronizationManager.isSynchronizationActive()) return;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if(status==STATUS_ROLLED_BACK) {
                    if(asset) store.deleteAssetOrphan(object); else store.deleteOrphan(object);
                }
            }
        });
    }
    @Transactional
    public void moveFile(UUID actor,UUID id,DocumentChange change) {
        Document doc=core.require(actor,id);
        Folder target=folders.folder(change.folderId()==null?doc.folderId():change.folderId());
        requireOrganize(actor,target);
        Folder old=folders.folder(doc.folderId());
        requireOrganize(actor,old);
        Scope before=scope(old), after=scope(target);
        if(!before.equals(after)) throw ApiException.conflict("Movimentações entre contextos exigem transferência institucional específica");
        if(!target.id().equals(old.id())&&(sharing.hasFolderGrantOnPath(target.id())||sharing.hasDirectDocumentGrant(doc.id())))
            throw ApiException.conflict("Não é possível mover um documento para uma pasta compartilhada");
        String title=change.title()==null?doc.title():name(change.title());
        String requiredExtension=switch(doc.mimeType()) {
            case DOCX -> ".docx";
            case "application/pdf" -> ".pdf";
            case "image/png" -> ".png";
            case "image/jpeg" -> ".jpg";
            default -> throw ApiException.invalid("Tipo documental não suportado");
        };
        String lower=title.toLowerCase(Locale.ROOT);
        if(!lower.endsWith(requiredExtension) && !(requiredExtension.equals(".jpg")&&lower.endsWith(".jpeg")))
            throw ApiException.invalid("A extensão deve corresponder ao formato original do arquivo");
        if(folders.fileNameExists(target.id(),title,id)) throw ApiException.conflict("Já existe um arquivo com esse nome nesta pasta");
        folders.moveFile(id,target.id(),title,actor);
    }
    @Transactional
    public void archiveFile(UUID actor,UUID id) {
        Document doc=core.require(actor,id);
        requireManage(actor,folders.folder(doc.folderId()));
        folders.archiveFile(id,actor);
    }
    @Transactional
    public void restoreFile(UUID actor,UUID id) {
        access.requireAdministrator(actor);
        if(folders.archivedFileFolderMissing(id)) throw ApiException.conflict("A pasta original não está ativa");
        folders.restoreFile(id,actor);
    }
    @Transactional
    public void grantProjectEdit(UUID actor,UUID id,UUID member,boolean canEdit) {
        Document doc=core.require(actor,id);
        if(!"PROJECT".equals(doc.context())) throw ApiException.invalid("Permissões individuais de edição pertencem a documentos de projeto");
        projects.requireManage(actor,doc.projectId());
        if(canEdit) {access.requireActive(member);projects.requireRead(member,doc.projectId());}
        transactions.lock();
        folders.giveEdit(id,member,actor,canEdit);
    }
    @Transactional
    public UUID createTemplate(UUID actor,String title,boolean autoAssign,byte[] docx) {
        access.requireAdministrator(actor);
        String clean=name(title);DocxIntegrity.validate(docx);
        UUID object=UUID.randomUUID();store.put(object,docx);
        try {return folders.createTemplate(actor,clean,autoAssign,object,docx.length,DocxIntegrity.sha256(docx));}
        catch(RuntimeException ex) {store.deleteOrphan(object);throw ex;}
    }
    @Transactional
    public void publishTemplateVersion(UUID actor,UUID id,byte[] docx) {
        access.requireAdministrator(actor);
        transactions.lock();
        if(folders.templates().stream().noneMatch(t->t.id().equals(id) && !t.retired())) throw ApiException.notFound();
        DocxIntegrity.validate(docx);
        UUID object=UUID.randomUUID();store.put(object,docx);
        try {folders.updateTemplate(actor,id,object,docx.length,DocxIntegrity.sha256(docx));}
        catch(RuntimeException ex) {store.deleteOrphan(object);throw ex;}
    }
    @Transactional(readOnly=true)
    public List<Template> templates(UUID actor) {access.requireActive(actor);return folders.templates().stream().filter(t->!t.retired()||access.isAdministrator(actor)).toList();}
    @Transactional
    public void retireTemplate(UUID actor,UUID id) {access.requireAdministrator(actor);folders.retireTemplate(id);}
    @Transactional
    public DistributionResult distribute(UUID actor,UUID templateId,List<UUID> members) {
        access.requireAdministrator(actor);
        if(members==null || members.isEmpty() || members.size()>100 || new HashSet<>(members).size()!=members.size())
            throw ApiException.invalid("Selecione de 1 a 100 integrantes únicos");
        Template template=folders.templates().stream().filter(t->t.id().equals(templateId)&&!t.retired()).findFirst().orElseThrow(ApiException::notFound);
        TemplateVersion version=folders.templateVersion(template.currentVersionId());
        transactions.lock();
        var result=new ArrayList<Distribution>();
        for(UUID member:members) {access.requireActive(member);result.add(copyTemplate(actor,member,template.title(),version));}
        return new DistributionResult((int)result.stream().filter(Distribution::created).count(),(int)result.stream().filter(d->!d.created()).count(),List.copyOf(result));
    }
    @Transactional
    public DistributionResult copyOwnTemplate(UUID actor,UUID templateId) {
        access.requireActive(actor);
        transactions.lock();
        Template template=folders.templates().stream().filter(t->t.id().equals(templateId)&&!t.retired()).findFirst().orElseThrow(ApiException::notFound);
        var item=copyTemplate(actor,actor,template.title(),folders.templateVersion(template.currentVersionId()));
        return new DistributionResult(item.created()?1:0,item.created()?0:1,List.of(item));
    }
    private Distribution copyTemplate(UUID issuer,UUID member,String title,TemplateVersion version) {
        UUID current=folders.distributedDocument(version.id(),member);
        if(current!=null) return new Distribution(member,current,false);
        Folder personal=folders.ensurePersonal(member);
        byte[] source=store.get(version.objectId());
        if(source.length!=version.size()||!DocxIntegrity.sha256(source).equals(version.sha256()))
            throw ApiException.conflict("Versão do modelo sem integridade confirmada");
        UUID object=UUID.randomUUID(), id=UUID.randomUUID();store.put(object,source);
        try {
            String clean=title.toLowerCase(Locale.ROOT).endsWith(".docx")?title:title+".docx";
            documents.createInFolder(id,clean,"PERSONAL",member,null,personal.id(),DOCX,false,object,source.length,
                    version.sha256(),issuer,version.id());
            folders.recordDistribution(version.id(),member,id,issuer);
        }catch(RuntimeException ex){store.deleteOrphan(object);throw ex;}
        return new Distribution(member,id,true);
    }
    /** Called from invitation acceptance and safe to rerun for already active members. */
    @Transactional
    public void provision(UUID member) {
        access.requireActive(member);
        transactions.lock();
        folders.ensurePersonal(member);
        for(TemplateVersion version:folders.joinTemplates()) {
            Template template=folders.templates().stream().filter(t->t.id().equals(version.templateId())).findFirst().orElseThrow(ApiException::notFound);
            copyTemplate(member,member,template.title(),version);
        }
    }
    public int provisionExisting(UUID actor) {
        access.requireAdministrator(actor);
        UUID afterMemberId=null,afterProjectId=null;
        int provisionedMembers=0;
        boolean hasMore;
        do {
            UUID memberCursor=afterMemberId,projectCursor=afterProjectId;
            ProvisionBatch batch=Objects.requireNonNull(provisioningTransaction.execute(status->
                    provisionExistingBatch(actor,memberCursor,projectCursor,100)));
            provisionedMembers+=batch.membersProcessed();
            afterMemberId=batch.nextMemberId();afterProjectId=batch.nextProjectId();
            hasMore=batch.hasMore();
        } while(hasMore);
        return provisionedMembers;
    }
    public record ProvisionBatch(int membersProcessed,int projectsProcessed,UUID nextMemberId,UUID nextProjectId,boolean hasMore) {
        public int processed() {return membersProcessed+projectsProcessed;}
    }
    @Transactional
    public ProvisionBatch provisionExistingBatch(UUID actor,UUID afterMemberId,UUID afterProjectId,int limit) {
        access.requireAdministrator(actor);
        transactions.lock();
        if(limit<1||limit>100) throw ApiException.invalid("O lote deve conter entre 1 e 100 registros por tipo");
        List<UUID> members=folders.activeMembers(afterMemberId,limit+1);
        List<UUID> projects=folders.projectsNeedingFolder(afterProjectId,limit+1);
        boolean moreMembers=members.size()>limit,moreProjects=projects.size()>limit;
        List<UUID> memberBatch=members.stream().limit(limit).toList();
        List<UUID> projectBatch=projects.stream().limit(limit).toList();
        for(UUID member:memberBatch) provision(member);
        for(UUID project:projectBatch) folders.ensureProject(project);
        UUID nextMember=memberBatch.isEmpty()?afterMemberId:memberBatch.getLast();
        UUID nextProject=projectBatch.isEmpty()?afterProjectId:projectBatch.getLast();
        return new ProvisionBatch(memberBatch.size(),projectBatch.size(),nextMember,nextProject,moreMembers||moreProjects);
    }
    private static String name(String name) {
        if(name==null||name.isBlank()||name.strip().length()>190||name.contains("/")||name.contains("\\")||name.chars().anyMatch(Character::isISOControl))
            throw ApiException.invalid("Nome de arquivo ou pasta inválido");
        return name.strip();
    }
    private static String color(String color) {
        if(color==null||!color.matches("#[0-9a-fA-F]{6}")) throw ApiException.invalid("Cor de pasta inválida");
        return color.toUpperCase(Locale.ROOT);
    }
    private static String validateFile(String title,String mime,byte[] bytes) {
        if(bytes==null||bytes.length==0||bytes.length>DocxIntegrity.MAX_BYTES) throw ApiException.invalid("Arquivo inválido ou maior que 8 MiB");
        String lower=title.toLowerCase(Locale.ROOT);
        if(lower.endsWith(".docx")) {DocxIntegrity.validate(bytes);return DOCX;}
        if(lower.endsWith(".pdf") && bytes.length>=5 && new String(bytes,0,5,StandardCharsets.US_ASCII).equals("%PDF-")) return "application/pdf";
        if(lower.endsWith(".png") && bytes.length>=8 && bytes[0]==(byte)137 && bytes[1]==80 && bytes[2]==78 && bytes[3]==71) return "image/png";
        if((lower.endsWith(".jpg")||lower.endsWith(".jpeg")) && bytes.length>=4 && bytes[0]==(byte)0xff && bytes[1]==(byte)0xd8 && bytes[2]==(byte)0xff) return "image/jpeg";
        throw ApiException.invalid("Formato não suportado. Envie DOCX, PDF, PNG ou JPEG válido");
    }
}
