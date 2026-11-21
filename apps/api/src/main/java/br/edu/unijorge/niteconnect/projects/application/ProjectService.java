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
    public ProjectService(ProjectDirectory projects, AccessService access, ProjectAccess permissions, MemberDirectory members,
                          AuditTrail audit, AdministrativeTransactions transactions) {
        this.projects = projects; this.access = access; this.permissions = permissions; this.members = members;
        this.audit = audit; this.transactions = transactions;
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
        transactions.lock(); access.requireAdministrator(actor);
        return createRecorded(actor, title, description, start, end, null, reason);
    }
    /** Explicit proposal-module integration contract; joins the caller's transaction and lock. */
    @Transactional(propagation=Propagation.MANDATORY)
    public Project fromProposal(UUID actor, UUID proposal, String title, String description, String reason) {
        transactions.lock(); access.requireAdministrator(actor);
        return createRecorded(actor, title, description, null, null, proposal, reason);
    }
    private Project createRecorded(UUID actor, String title, String description, LocalDate start, LocalDate end, UUID proposal, String reason) {
        Project result = projects.create(actor, title, description, start, end, proposal);
        projects.recordStatus(actor, result.id(), null, result.status(), reason);
        audit.recordEntity(actor, "PROJECT", result.id(), "PROJECT_CREATED", null, result.toString(), reason);
        return result;
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
