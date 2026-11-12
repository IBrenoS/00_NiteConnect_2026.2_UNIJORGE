package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.application.ProjectAccess;
import br.edu.unijorge.niteconnect.documents.domain.DocxIntegrity;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository.*;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository.Document;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.security.AdministrativeTransactions;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Shared namespace: personal, project and institutional views reference the same documents. */
@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentLibraryService {
    public static final String DOCX="application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    private final DocumentLibraryRepository folders;
    private final DocumentRepository documents;
    private final DocumentCoreService core;
    private final DocumentObjectStore store;
    private final AccessService access;
    private final ProjectAccess projects;
    private final AdministrativeTransactions transactions;
    public DocumentLibraryService(DocumentLibraryRepository folders,DocumentRepository documents,DocumentCoreService core,
                                  DocumentObjectStore store,AccessService access,ProjectAccess projects,AdministrativeTransactions transactions) {
        this.folders=folders;this.documents=documents;this.core=core;this.store=store;
        this.access=access;this.projects=projects;this.transactions=transactions;
    }
    public record Listing(Folder folder,List<Folder> folders,List<FileEntry> files) {}
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
            if(current.parentId()==null) return new Scope("ADMINISTRATIVE",null);
            current=folders.folder(current.parentId());
        }
        throw ApiException.conflict("Profundidade máxima da biblioteca excedida");
    }
    private void requireRead(UUID actor,Folder folder) {
        access.requireActive(actor);
        if(access.isAdministrator(actor)) return;
        Scope scope=scope(folder);
        switch(scope.kind()) {
            case "PERSONAL" -> { if(!actor.equals(scope.subject())) throw ApiException.notFound(); }
            case "PROJECT" -> projects.requireRead(actor,scope.subject());
            default -> throw ApiException.notFound();
        }
    }
    private void requireManage(UUID actor,Folder folder) {
        access.requireActive(actor);
        if(access.isAdministrator(actor)) return;
        Scope scope=scope(folder);
        if("PROJECT".equals(scope.kind())) {projects.requireManage(actor,scope.subject());return;}
        throw ApiException.forbidden();
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
    public Listing mine(UUID actor,UUID folderId) {
        access.requireActive(actor);
        Folder personal=folders.ensurePersonal(actor);
        Folder selected=folderId==null?personal:folders.folder(folderId);
        if(!scope(selected).equals(new Scope("PERSONAL",actor))) throw ApiException.notFound();
        return listing(actor,selected);
    }
    @Transactional
    public List<Folder> projectTree(UUID actor,UUID projectId) {
        projects.requireRead(actor,projectId);
        return folders.subtree(folders.ensureProject(projectId).id());
    }
    @Transactional(readOnly=true)
    public Listing browse(UUID actor,UUID folderId) {return listing(actor,folders.folder(folderId));}
    @Transactional
    public Listing project(UUID actor,UUID projectId,UUID folderId) {
        projects.requireRead(actor,projectId);
        Folder home=folders.ensureProject(projectId);
        Folder selected=folderId==null?home:folders.folder(folderId);
        if(!scope(selected).equals(new Scope("PROJECT",projectId))) throw ApiException.notFound();
        return listing(actor,selected);
    }
    private Listing listing(UUID actor,Folder folder) {
        requireRead(actor,folder);
        return new Listing(folder,folders.children(folder.id()),folders.files(folder.id()));
    }
    @Transactional
    public Folder addFolder(UUID actor,UUID parentId,String name,String color) {
        Folder parent=parentId==null?null:folders.folder(parentId);
        if(parent==null) access.requireAdministrator(actor); else requireManage(actor,parent);
        String clean=name(name);
        String tint=color(color);
        transactions.lock();
        if(folders.siblingExists(parentId,clean,new UUID(0,0))) throw ApiException.conflict("Já existe uma pasta com esse nome neste local");
        return folders.addFolder(parentId,clean,tint,actor);
    }
    @Transactional
    public Folder changeFolder(UUID actor,UUID id,FolderChange change) {
        Folder folder=folders.folder(id);
        requireManage(actor,folder);
        if("PROJECT".equals(folder.kind()) && !access.isAdministrator(actor))
            throw ApiException.forbidden(); // The project directory name is institutional metadata, not a team subfolder.
        String name=change.name()==null?folder.name():name(change.name());
        String tint=change.color()==null?folder.color():color(change.color());
        UUID destination=Boolean.TRUE.equals(change.moveToRoot())?null:change.parentId()==null?folder.parentId():change.parentId();
        if("ROOT".equals(folder.kind()) && destination!=null) throw ApiException.conflict("Raízes institucionais não podem ser movidas");
        if(!"CUSTOM".equals(folder.kind()) && !Objects.equals(destination,folder.parentId()))
            throw ApiException.conflict("Pastas vinculadas a integrante ou projeto não podem mudar de área");
        if(destination!=null) {
            Folder target=folders.folder(destination);requireManage(actor,target);
            if(folders.descendant(id,destination)) throw ApiException.conflict("Uma pasta não pode ser movida para dentro de si mesma");
            if(!scope(folder).equals(scope(target)) && folders.hasContents(id))
                throw ApiException.conflict("Mova ou arquive o conteúdo antes de alterar o contexto da pasta");
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
        Folder folder=folders.folder(folderId);requireRead(actor,folder);
        Scope scope=scope(folder);
        if(!("PERSONAL".equals(scope.kind()) && actor.equals(scope.subject()))) requireManage(actor,folder);
        String name=name(title);
        String mime=validateFile(name,contentType,data);
        UUID id=UUID.randomUUID(), object=UUID.randomUUID();
        boolean asset=!DOCX.equals(mime);
        if(asset) store.putAsset(object,data,mime); else store.put(object,data);
        try {
            documents.createInFolder(id,name,scope.kind(),"PERSONAL".equals(scope.kind())?scope.subject():null,
                    "PROJECT".equals(scope.kind())?scope.subject():null,folderId,mime,asset,object,data.length,
                    DocxIntegrity.sha256(data),actor,null);
        } catch(RuntimeException ex) {if(asset) store.deleteAssetOrphan(object); else store.deleteOrphan(object);throw ex;}
        return folders.file(id);
    }
    @Transactional
    public void moveFile(UUID actor,UUID id,DocumentChange change) {
        Document doc=core.require(actor,id);
        Folder target=folders.folder(change.folderId());
        requireManage(actor,target);
        Folder old=folders.folder(doc.folderId());
        requireManage(actor,old);
        Scope before=scope(old), after=scope(target);
        if(!before.equals(after)) throw ApiException.conflict("Movimentações entre contextos exigem transferência institucional específica");
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
        access.requireActive(member);
        projects.requireRead(member,doc.projectId());
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
    @Transactional
    public int provisionExisting(UUID actor) {
        access.requireAdministrator(actor);
        transactions.lock();
        // Limit work per call so a large roster cannot monopolize a transaction.
        int count=0;
        for(UUID member:folders.activeMembers()) {provision(member);count++;}
        for(UUID project:folders.projectsNeedingFolder()) folders.ensureProject(project);
        return count;
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
