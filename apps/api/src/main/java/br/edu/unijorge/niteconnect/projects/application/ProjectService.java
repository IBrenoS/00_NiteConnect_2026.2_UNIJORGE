package br.edu.unijorge.niteconnect.projects.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.application.ProjectAccess;
import br.edu.unijorge.niteconnect.audit.application.AuditTrail;
import br.edu.unijorge.niteconnect.members.application.MemberDirectory;
import br.edu.unijorge.niteconnect.members.domain.MemberStatus;
import br.edu.unijorge.niteconnect.projects.domain.Project;
import br.edu.unijorge.niteconnect.projects.domain.ProjectStatus;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import br.edu.unijorge.niteconnect.shared.security.AdministrativeTransactions;
import br.edu.unijorge.niteconnect.documents.application.DocumentObjectStore;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import java.time.LocalDate;
import java.util.Objects;
import java.util.List;
import java.util.UUID;

@Service
public class ProjectService {
    private final ProjectDirectory projects;
    private final AccessService access;
    private final ProjectAccess permissions;
    private final MemberDirectory members;
    private final AuditTrail audit;
    private final AdministrativeTransactions transactions;
    private final ObjectProvider<DocumentObjectStore> objectStores;
    public ProjectService(ProjectDirectory projects, AccessService access, ProjectAccess permissions, MemberDirectory members,
                          AuditTrail audit, AdministrativeTransactions transactions, ObjectProvider<DocumentObjectStore> objectStores) {
        this.projects = projects; this.access = access; this.permissions = permissions; this.members = members;
        this.audit = audit; this.transactions = transactions; this.objectStores = objectStores;
    }
    @Transactional(readOnly=true)
    public PageResult<Project> list(UUID actor, boolean ownOnly, ProjectStatus status, int page, int size) {
        access.requireActive(actor);
        return projects.list(!ownOnly && access.isAdministrator(actor) ? null : actor, status, page, size);
    }
    @Transactional(readOnly=true)
    public Project read(UUID actor, UUID id) { permissions.requireRead(actor, id); return projects.require(id); }
    @Transactional
    public Project create(UUID actor, String title, String description, LocalDate start, LocalDate end, String reason) {
        return create(actor,title,description,start,end,ProjectStatus.PLANEJAMENTO,reason);
    }
    @Transactional
    public Project create(UUID actor, String title, String description, LocalDate start, LocalDate end, ProjectStatus initialStatus, String reason) {
        transactions.lock(); access.requireAdministrator(actor);
        if (initialStatus == null || initialStatus == ProjectStatus.CONCLUIDO) throw br.edu.unijorge.niteconnect.shared.api.ApiException.invalid("Situação inicial inválida");
        return createRecorded(actor, title, description, start, end, null, initialStatus, reason);
    }
    /** Explicit proposal-module integration contract; joins the caller's transaction and lock. */
    @Transactional(propagation=Propagation.MANDATORY)
    public Project fromProposal(UUID actor, UUID proposal, String title, String description, String reason) {
        transactions.lock(); access.requireAdministrator(actor);
        return createRecorded(actor, title, description, null, null, proposal, ProjectStatus.PLANEJAMENTO, reason);
    }
    private Project createRecorded(UUID actor, String title, String description, LocalDate start, LocalDate end, UUID proposal, ProjectStatus status, String reason) {
        Project result = projects.create(actor, title, description, start, end, proposal, status);
        String recordedReason = reason == null || reason.isBlank() ? "Criação institucional de projeto" : reason;
        projects.recordStatus(actor, result.id(), null, result.status(), recordedReason);
        audit.recordEntity(actor, "PROJECT", result.id(), "PROJECT_CREATED", null, result.toString(), recordedReason);
        return result;
    }

    @Transactional
    public Project createWithCover(UUID actor, String title, String description, LocalDate start, LocalDate end,
                                   ProjectStatus initialStatus, byte[] image, String declaredType) {
        Project created = create(actor,title,description,start,end,initialStatus,null);
        return replaceCover(actor,created.id(),image,declaredType,created.version());
    }

    @Transactional
    public Project replaceCover(UUID actor, UUID id, byte[] image, String declaredType, long version) {
        transactions.lock(); permissions.requireManage(actor,id); Project project=projects.require(id); projects.checkVersion(project,version);
        String type=imageType(image);
        if(!type.equals(declaredType)) throw br.edu.unijorge.niteconnect.shared.api.ApiException.invalid("O formato da imagem não corresponde ao arquivo");
        validateImage(image);
        DocumentObjectStore store=objectStore(); UUID fresh=UUID.randomUUID();
        try { store.putAsset(fresh,image,type); }
        catch(RuntimeException ex){store.deleteAssetOrphan(fresh);throw ex;}
        UUID old;
        try { old=projects.replaceCover(id,fresh,type,version); }
        catch(RuntimeException ex){store.deleteAssetOrphan(fresh);throw ex;}
        afterCoverCompletion(store,fresh,old);
        audit.recordEntity(actor,"PROJECT",id,"PROJECT_COVER_REPLACED",old==null?null:old.toString(),fresh.toString(),"Imagem de capa atualizada");
        return projects.require(id);
    }

    @Transactional
    public Project removeCover(UUID actor,UUID id,long version) {
        transactions.lock();permissions.requireManage(actor,id);Project project=projects.require(id);projects.checkVersion(project,version);
        UUID old=projects.removeCover(id,version); if(old!=null) afterCoverCompletion(objectStore(),null,old);
        audit.recordEntity(actor,"PROJECT",id,"PROJECT_COVER_REMOVED",old==null?null:old.toString(),null,"Imagem de capa removida");
        return projects.require(id);
    }

    @Transactional(readOnly=true)
    public CoverImage image(UUID actor,UUID id) {
        access.requireActive(actor); projects.require(id); UUID object=projects.coverObject(id); if(object==null) throw br.edu.unijorge.niteconnect.shared.api.ApiException.notFound();
        return new CoverImage(objectStore().getAsset(object),projects.coverContentType(id));
    }
    public record CoverImage(byte[] bytes,String contentType) {}

    private DocumentObjectStore objectStore() {
        DocumentObjectStore store=objectStores.getIfAvailable();
        if(store==null) throw new br.edu.unijorge.niteconnect.shared.api.ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Armazenamento de imagens indisponível");
        return store;
    }
    private static String imageType(byte[] bytes) {
        if(bytes==null||bytes.length==0||bytes.length>2*1024*1024) throw br.edu.unijorge.niteconnect.shared.api.ApiException.invalid("Imagem deve ter até 2 MiB");
        if(bytes.length>=3&&(bytes[0]&255)==255&&(bytes[1]&255)==216&&(bytes[2]&255)==255) return "image/jpeg";
        if(bytes.length>=8&&(bytes[0]&255)==137&&bytes[1]==80&&bytes[2]==78&&bytes[3]==71&&bytes[4]==13&&bytes[5]==10&&bytes[6]==26&&bytes[7]==10) return "image/png";
        throw br.edu.unijorge.niteconnect.shared.api.ApiException.invalid("Use uma imagem JPEG ou PNG válida");
    }
    private static void validateImage(byte[] bytes) {
        try(var input=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers=ImageIO.getImageReaders(input); if(!readers.hasNext()) throw br.edu.unijorge.niteconnect.shared.api.ApiException.invalid("Imagem inválida");
            var reader=readers.next(); try { reader.setInput(input,true,true); int w=reader.getWidth(0),h=reader.getHeight(0); if(w<1||h<1||w>4096||h>4096) throw br.edu.unijorge.niteconnect.shared.api.ApiException.invalid("Imagem deve ter até 4096 pixels por lado"); }
            finally {reader.dispose();}
        } catch(IOException|IllegalArgumentException ex){throw br.edu.unijorge.niteconnect.shared.api.ApiException.invalid("Imagem inválida");}
    }
    private static void afterCoverCompletion(DocumentObjectStore store,UUID fresh,UUID old) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){
            @Override public void afterCompletion(int status){if(status==STATUS_COMMITTED&&old!=null)store.deleteAssetOrphan(old);if(status!=STATUS_COMMITTED&&fresh!=null)store.deleteAssetOrphan(fresh);}
        });
    }
    @Transactional
    public Project update(UUID actor, UUID id, String title, String description, LocalDate start, LocalDate end, long version, String reason) {
        transactions.lock(); permissions.requireManage(actor, id);
        Project before = projects.require(id);
        Project after = projects.update(id, title, description, start, end, version);
        audit.recordEntity(actor, "PROJECT", id, "PROJECT_UPDATED", before.toString(), after.toString(), reason);
        return after;
    }
    @Transactional
    public Project changeStatus(UUID actor, UUID id, ProjectStatus next, long version, String reason) {
        transactions.lock(); access.requireAdministrator(actor);
        Project before = projects.require(id); projects.checkVersion(before, version);
        if (!before.status().canTransitionTo(next)) throw ApiException.conflict("Transição de projeto não permitida");
        Project after = projects.status(id, next, version);
        projects.recordStatus(actor, id, before.status(), next, reason);
        audit.recordEntity(actor, "PROJECT", id, "PROJECT_STATUS_CHANGED", before.status().name(), next.name(), reason);
        return after;
    }
    @Transactional(readOnly=true)
    public PageResult<ProjectDirectory.StatusEvent> history(UUID actor, UUID id, int page, int size) {
        permissions.requireManage(actor, id); return projects.history(id, page, size);
    }
    @Transactional(readOnly=true)
    public PageResult<TeamMember> team(UUID actor, UUID id, int page, int size) {
        permissions.requireRead(actor, id);
        var result = projects.team(id, page, size);
        var names = members.names(result.items().stream().map(ProjectDirectory.TeamMember::memberId).toList());
        List<TeamMember> items = result.items().stream().map(item -> new TeamMember(item.id(), item.memberId(),
                names.get(item.memberId()), item.responsibility(), item.startedAt())).toList();
        return new PageResult<>(items, result.page(), result.size(), result.total());
    }
    @Transactional(readOnly=true)
    public PageResult<MemberDirectory.Candidate> candidates(UUID actor, UUID id, String query, int page, int size) {
        permissions.requireManage(actor, id);
        return members.candidates(id, query, page, size);
    }
    @Transactional(readOnly=true)
    public PageResult<ProjectDirectory.Participation> participationHistory(UUID actor, UUID id, int page, int size) {
        permissions.requireManage(actor, id); return projects.participationHistory(id, page, size);
    }
    @Transactional(readOnly=true)
    public PageResult<ProjectDirectory.PersonalParticipation> personalHistory(UUID actor, int page, int size) {
        access.requireActive(actor); return projects.personalHistory(actor, page, size);
    }
    @Transactional(readOnly=true)
    public PageResult<ProjectDirectory.PersonalLeadership> personalLeadershipHistory(UUID actor, int page, int size) {
        access.requireActive(actor); return projects.personalLeadershipHistory(actor, page, size);
    }
    @Transactional
    public ProjectDirectory.Participation join(UUID actor, UUID project, UUID member, String responsibility, long version, String reason) {
        transactions.lock(); permissions.requireManage(actor, project);
        projects.checkVersion(projects.require(project), version); access.requireActive(member);
        if (projects.participates(project, member)) throw ApiException.conflict("Participação já vigente");
        var participation = projects.join(actor, project, member, responsibility, reason);
        projects.touch(project, version);
        audit.recordEntity(actor, "PROJECT", project, "PROJECT_MEMBER_JOINED", null, participation.toString(), reason);
        return participation;
    }
    @Transactional
    public void end(UUID actor, UUID project, UUID member, long version, String reason) {
        transactions.lock(); permissions.requireManage(actor, project);
        projects.checkVersion(projects.require(project), version);
        var participation = projects.currentParticipation(project, member);
        if (member.equals(projects.leader(project))) throw ApiException.conflict("Encerre ou transfira a liderança antes da saída");
        projects.end(actor, participation, reason); projects.touch(project, version);
        audit.recordEntity(actor, "PROJECT", project, "PROJECT_MEMBER_LEFT", participation.toString(), null, reason);
    }
    @Transactional(readOnly=true)
    public Leadership leadership(UUID actor, UUID project) {
        permissions.requireRead(actor, project); return currentLeadership(project);
    }
    private Leadership currentLeadership(UUID project) {
        UUID leader = projects.leader(project);
        return new Leadership(leader, leader != null && members.require(leader).status() == MemberStatus.ATIVO);
    }
    @Transactional
    public Leadership transfer(UUID actor, UUID project, UUID target, long version, String reason) {
        transactions.lock(); access.requireAdministrator(actor);
        projects.checkVersion(projects.require(project), version);
        UUID before = projects.leader(project);
        if (Objects.equals(before, target)) throw ApiException.conflict("Liderança já possui a configuração solicitada");
        ProjectDirectory.Participation membership = null;
        if (target != null) {
            access.requireActive(target);
            if (!access.canLeadProject(target)) throw ApiException.conflict("Integrante sem papel institucional elegível para liderança");
            membership = projects.currentParticipation(project, target);
        }
        projects.transfer(actor, project, membership, reason); projects.touch(project, version);
        audit.recordEntity(actor, "PROJECT", project, "PROJECT_LEADERSHIP_TRANSFERRED",
                before == null ? null : before.toString(), target == null ? null : target.toString(), reason);
        return currentLeadership(project);
    }
    @Transactional(readOnly=true)
    public PageResult<ProjectDirectory.LeadershipPeriod> leadershipHistory(UUID actor, UUID project, int page, int size) {
        permissions.requireManage(actor, project); return projects.leadershipHistory(project, page, size);
    }
    public record Leadership(UUID memberId, boolean effective) {}
    public record TeamMember(UUID id, UUID memberId, String memberName, String responsibility, java.time.Instant startedAt) {}
}
