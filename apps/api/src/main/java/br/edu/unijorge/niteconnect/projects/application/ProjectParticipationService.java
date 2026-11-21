package br.edu.unijorge.niteconnect.projects.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.audit.application.AuditTrail;
import br.edu.unijorge.niteconnect.members.application.MemberDirectory;
import br.edu.unijorge.niteconnect.projects.domain.ProjectStatus;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import br.edu.unijorge.niteconnect.shared.security.AdministrativeTransactions;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Project discovery and membership request flows, kept separate from private workspace reads. */
@Service
public class ProjectParticipationService {
    private final JdbcTemplate jdbc;
    private final ProjectDirectory projects;
    private final AccessService access;
    private final MemberDirectory members;
    private final AdministrativeTransactions transactions;
    private final AuditTrail audit;

    public ProjectParticipationService(JdbcTemplate jdbc, ProjectDirectory projects, AccessService access,
                                       MemberDirectory members, AdministrativeTransactions transactions, AuditTrail audit) {
        this.jdbc = jdbc; this.projects = projects; this.access = access; this.members = members; this.transactions = transactions; this.audit = audit;
    }

    @Transactional(readOnly=true)
    public PageResult<CatalogProject> discover(UUID actor, String query, ProjectStatus status, Boolean accepting,
                                                String sort, int page, int size) {
        access.requireActive(actor); PageResult.validate(page, size);
        if (query != null && query.strip().length() > 160) throw ApiException.invalid("Pesquisa muito longa");
        if (sort != null && !List.of("name","status","updated").contains(sort)) throw ApiException.invalid("Ordenação inválida");
        String pattern = query == null || query.isBlank() ? null : "%" + escape(query.strip()) + "%";
        String where = " from nite_connect.projects p where (?::text is null or p.title ilike ? escape '!' or p.description ilike ? escape '!')"
                + " and (?::text is null or p.status=?) and (?::boolean is null or p.accepting_members=?)";
        Object[] filters = {pattern, pattern, pattern, status == null ? null : status.name(), status == null ? null : status.name(), accepting, accepting};
        long total = jdbc.queryForObject("select count(*)" + where, Long.class, filters);
        String order = switch (sort == null ? "name" : sort) {
            case "updated" -> "p.updated_at desc,p.id";
            case "status" -> "p.status,p.title,p.id";
            default -> "p.title,p.id";
        };
        var result = catalogProjection(actor, catalogRows(actor, where + " order by " + order + " limit ? offset ?",
                append(filters, size, (long) page * size)));
        return new PageResult<>(result, page, size, total);
    }

    @Transactional(readOnly=true)
    public CatalogProject presentation(UUID actor, UUID project) {
        access.requireActive(actor);
        var rows = catalogRows(actor, " from nite_connect.projects p where p.id=?", project);
        if (rows.isEmpty()) throw ApiException.notFound();
        return catalogProjection(actor, rows).getFirst();
    }

    private List<CatalogRow> catalogRows(UUID actor, String from, Object... parameters) {
        return jdbc.query("select p.id,p.title,p.description,p.status,p.accepting_members,p.starts_on,p.ends_on,"
                        + "exists(select 1 from nite_connect.project_memberships own where own.project_id=p.id and own.member_id=? and own.ended_at is null) participant,"
                        + "(select count(*) from nite_connect.project_memberships m join nite_connect.members active_member on active_member.id=m.member_id and active_member.status='ATIVO' where m.project_id=p.id and m.ended_at is null) team_size,"
                        + "(select l.member_id from nite_connect.project_leadership_history l join nite_connect.project_memberships m on m.id=l.membership_id and m.ended_at is null join nite_connect.members active_leader on active_leader.id=l.member_id and active_leader.status='ATIVO' where l.project_id=p.id and l.ended_at is null) leader_id"
                        + from,
                (rs, n) -> new CatalogRow(rs.getObject("id", UUID.class), rs.getString("title"), rs.getString("description"),
                        ProjectStatus.valueOf(rs.getString("status")), rs.getBoolean("accepting_members"),
                        rs.getObject("starts_on", java.time.LocalDate.class), rs.getObject("ends_on", java.time.LocalDate.class),
                        rs.getInt("team_size"), rs.getObject("leader_id", UUID.class), rs.getBoolean("participant")),
                append(new Object[]{actor}, parameters));
    }

    private List<CatalogProject> catalogProjection(UUID actor, List<CatalogRow> rows) {
        var names = members.names(rows.stream().map(CatalogRow::leaderId).filter(java.util.Objects::nonNull).distinct().toList());
        boolean admin = access.isAdministrator(actor);
        return rows.stream().map(row -> new CatalogProject(row.id(), row.title(), summary(row.description()), row.status(),
                null, row.leaderId() == null ? null : names.get(row.leaderId()), row.leaderId() == null,
                row.teamSize(), row.acceptingMembers(), row.startsOn(), row.endsOn(), capabilities(actor, admin, row)))
                .toList();
    }

    @Transactional(readOnly=true)
    public WorkspaceOverview overview(UUID actor, UUID project) {
        access.requireActive(actor);
        // Administrators may monitor without joining; all other nonparticipants see no project details.
        if (!access.isAdministrator(actor) && !projects.participates(project, actor)) throw ApiException.notFound();
        var p = projects.require(project); UUID leader = projects.leader(project);
        String leaderName = leader == null ? null : members.names(List.of(leader)).get(leader);
        int teamSize = jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and ended_at is null", Integer.class, project);
        long activityCount = jdbc.queryForObject("select count(*) from nite_connect.activities where project_id=?", Long.class, project);
        return new WorkspaceOverview(p.id(), p.title(), p.description(), p.status(), p.startsOn(), p.endsOn(),
                leader, leaderName, leader == null, teamSize, activityCount, p.version(),
                jdbc.queryForObject("select accepting_members from nite_connect.projects where id=?", Boolean.class, project),
                workspaceCapabilities(actor, project));
    }

    @Transactional
    public MembershipRequest request(UUID actor, UUID project, String message) {
        transactions.lock(); access.requireActive(actor); var p = projects.require(project);
        if (projects.participates(project, actor)) throw ApiException.conflict("Integrante já participa do projeto");
        if (p.status() == ProjectStatus.PAUSADO || projects.leader(project) == null) throw ApiException.conflict("Este projeto recebe manifestações de interesse");
        if (p.status() == ProjectStatus.CONCLUIDO || !jdbc.queryForObject("select accepting_members from nite_connect.projects where id=?", Boolean.class, project))
            throw ApiException.conflict("Projeto indisponível para novos pedidos");
        UUID existing = jdbc.query("select id from nite_connect.project_membership_requests where project_id=? and member_id=? and state='PENDENTE'",
                (rs, n) -> rs.getObject(1, UUID.class), project, actor).stream().findFirst().orElse(null);
        if (existing != null) throw ApiException.conflict("Já existe uma solicitação pendente");
        UUID id = UUID.randomUUID();
        jdbc.update("insert into nite_connect.project_membership_requests(id,project_id,member_id,message) values (?,?,?,?)", id, project, actor, normalize(message));
        UUID recipient = projects.leader(project);
        jdbc.update("insert into nite_connect.project_participation_notifications(id,source_key,recipient_id,project_id,request_id,event_type) values (?,?,?,?,?,'SOLICITACAO_RECEBIDA') on conflict(source_key) do nothing",
                UUID.randomUUID(), id + ":REQUESTED:" + recipient, recipient, project, id);
        return namedRequests(List.of(requireRequest(id))).getFirst();
    }

    @Transactional
    public MembershipRequest decide(UUID actor, UUID projectId, UUID requestId, boolean approve, String decisionMessage, long expectedVersion) {
        transactions.lock(); access.requireActive(actor);
        MembershipRequest request = requireRequest(requestId);
        if (!request.projectId().equals(projectId)) throw ApiException.notFound();
        requireDecision(actor, request.projectId());
        if (request.version() != expectedVersion) throw ApiException.conflict("Solicitação alterada; consulte a versão atual");
        if (!"PENDENTE".equals(request.state())) throw ApiException.conflict("Solicitação já decidida");
        var project = projects.require(request.projectId());
        if (approve) {
            if (project.status() == ProjectStatus.PAUSADO || project.status() == ProjectStatus.CONCLUIDO
                    || projects.leader(project.id()) == null || !jdbc.queryForObject("select accepting_members from nite_connect.projects where id=?", Boolean.class, project.id()))
                throw ApiException.conflict("Projeto não está disponível para ingresso");
            access.requireActive(request.memberId());
            if (projects.participates(project.id(), request.memberId())) throw ApiException.conflict("Integrante já participa do projeto");
            projects.join(actor, project.id(), request.memberId(), "Integrante", "Solicitação de ingresso aprovada");
            projects.touch(project.id(), project.version());
            int changed = jdbc.update("update nite_connect.project_membership_requests set state='APROVADA',decided_at=clock_timestamp(),decided_by=?,decision_message=?,version=version+1 where id=? and version=? and state='PENDENTE'",
                    actor, normalize(decisionMessage), requestId, expectedVersion);
            if (changed != 1) throw ApiException.conflict("Solicitação alterada; consulte a versão atual");
        } else {
            int changed = jdbc.update("update nite_connect.project_membership_requests set state='REJEITADA',decided_at=clock_timestamp(),decided_by=?,decision_message=?,version=version+1 where id=? and version=? and state='PENDENTE'",
                    actor, normalize(decisionMessage), requestId, expectedVersion);
            if (changed != 1) throw ApiException.conflict("Solicitação alterada; consulte a versão atual");
        }
        String event = approve ? "SOLICITACAO_APROVADA" : "SOLICITACAO_REJEITADA";
        jdbc.update("insert into nite_connect.project_participation_notifications(id,source_key,recipient_id,project_id,request_id,event_type) values (?,?,?,?,?,?) on conflict(source_key) do nothing",
                UUID.randomUUID(), requestId + ":" + event, request.memberId(), request.projectId(), requestId, event);
        audit.recordEntity(actor,"PROJECT",request.projectId(),event,request.state(),approve?"APROVADA":"REJEITADA",
                normalize(decisionMessage)==null?"Decisão de solicitação de participação":normalize(decisionMessage));
        return namedRequests(List.of(requireRequest(requestId))).getFirst();
    }

    @Transactional
    public MembershipRequest closeRequest(UUID actor,UUID projectId,UUID requestId,long expectedVersion){
        transactions.lock();access.requireActive(actor);MembershipRequest request=requireRequest(requestId);
        if(!request.projectId().equals(projectId))throw ApiException.notFound();requireDecision(actor,projectId);
        if(request.version()!=expectedVersion)throw ApiException.conflict("Solicitação alterada; consulte a versão atual");
        int changed=jdbc.update("update nite_connect.project_membership_requests set state='ENCERRADA',decided_at=clock_timestamp(),decided_by=?,version=version+1 where id=? and version=? and state='PENDENTE'",actor,requestId,expectedVersion);
        if(changed!=1)throw ApiException.conflict("Solicitação alterada; consulte a versão atual");
        audit.recordEntity(actor,"PROJECT",projectId,"PROJECT_MEMBERSHIP_REQUEST_CLOSED","PENDENTE","ENCERRADA","Solicitação encerrada pela gestão");
        return namedRequests(List.of(requireRequest(requestId))).getFirst();
    }

    @Transactional
    public InterestSignal interest(UUID actor, UUID project, String message) {
        transactions.lock(); access.requireActive(actor); var p = projects.require(project);
        if (projects.participates(project, actor)) throw ApiException.conflict("Integrante já participa do projeto");
        if (p.status() == ProjectStatus.CONCLUIDO) throw ApiException.conflict("Projetos concluídos estão disponíveis apenas para consulta resumida");
        int activeTeam = jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and ended_at is null",Integer.class,project);
        if (p.status() != ProjectStatus.PAUSADO && activeTeam > 0 && projects.leader(project) != null) throw ApiException.conflict("Projeto não está recebendo manifestações de interesse");
        var existing = jdbc.query("select id,created_at from nite_connect.project_interest_signals where project_id=? and member_id=? and withdrawn_at is null",
                (rs,n)->new InterestSignal(rs.getObject(1,UUID.class),project,actor,rs.getTimestamp(2).toInstant(),message),project,actor).stream().findFirst();
        if (existing.isPresent()) return existing.get();
        UUID id=UUID.randomUUID(); jdbc.update("insert into nite_connect.project_interest_signals(id,project_id,member_id,message) values (?,?,?,?)",id,project,actor,normalize(message));
        return jdbc.queryForObject("select id,project_id,member_id,created_at,message from nite_connect.project_interest_signals where id=?",
                (rs,n)->new InterestSignal(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getObject(3,UUID.class),rs.getTimestamp(4).toInstant(),rs.getString(5)),id);
    }

    @Transactional
    public void availability(UUID actor, UUID project, boolean accepting, long version) {
        transactions.lock(); access.requireActive(actor); var p=projects.require(project);
        if (!actor.equals(projects.leader(project)) && !access.isAdministrator(actor)) throw ApiException.forbidden();
        if (p.version()!=version) throw ApiException.conflict("Projeto alterado; consulte a versão atual");
        if (accepting && (p.status()==ProjectStatus.PAUSADO || p.status()==ProjectStatus.CONCLUIDO || projects.leader(project)==null))
            throw ApiException.conflict("Projeto não pode aceitar ingresso nesse estado");
        boolean before=jdbc.queryForObject("select accepting_members from nite_connect.projects where id=?",Boolean.class,project);
        int changed=jdbc.update("update nite_connect.projects set accepting_members=?,version=version+1,updated_at=clock_timestamp() where id=? and version=?",accepting,project,version);
        if(changed!=1)throw ApiException.conflict("Projeto alterado; consulte a versão atual");
        audit.recordEntity(actor,"PROJECT",project,"PROJECT_MEMBERSHIP_AVAILABILITY_CHANGED",Boolean.toString(before),Boolean.toString(accepting),"Disponibilidade de ingresso atualizada");
    }

    @Transactional(readOnly=true)
    public PageResult<MembershipRequest> requests(UUID actor, UUID project, int page, int size) {
        access.requireActive(actor); requireDecision(actor, project); PageResult.validate(page,size);
        String from=" from nite_connect.project_membership_requests where project_id=?";
        long total=jdbc.queryForObject("select count(*)"+from,Long.class,project);
        return new PageResult<>(namedRequests(jdbc.query("select *"+from+" order by requested_at desc,id limit ? offset ?",ProjectParticipationService::mapRequest,project,size,(long)page*size)),page,size,total);
    }

    @Transactional(readOnly=true)
    public PageResult<MembershipRequest> myRequests(UUID actor, int page, int size) {
        access.requireActive(actor); PageResult.validate(page,size); String from=" from nite_connect.project_membership_requests where member_id=?";
        long total=jdbc.queryForObject("select count(*)"+from,Long.class,actor);
        return new PageResult<>(namedRequests(jdbc.query("select *"+from+" order by requested_at desc,id limit ? offset ?",ProjectParticipationService::mapRequest,actor,size,(long)page*size)),page,size,total);
    }

    @Transactional(readOnly=true)
    public PageResult<InterestSignal> myInterests(UUID actor, int page, int size) {
        access.requireActive(actor); PageResult.validate(page,size);
        String from=" from nite_connect.project_interest_signals where member_id=? and withdrawn_at is null";
        long total=jdbc.queryForObject("select count(*)"+from,Long.class,actor);
        return new PageResult<>(jdbc.query("select id,project_id,member_id,created_at,message"+from+" order by created_at desc,id limit ? offset ?",
                (rs,n)->new InterestSignal(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getObject(3,UUID.class),rs.getTimestamp(4).toInstant(),rs.getString(5)),actor,size,(long)page*size),page,size,total);
    }

    @Transactional(readOnly=true)
    public PageResult<InterestSignal> interests(UUID actor, UUID project, int page, int size) {
        access.requireActive(actor); if (!access.isAdministrator(actor)) throw ApiException.forbidden(); PageResult.validate(page,size);
        String from=" from nite_connect.project_interest_signals where project_id=? and withdrawn_at is null";
        long total=jdbc.queryForObject("select count(*)"+from,Long.class,project);
        return new PageResult<>(jdbc.query("select id,project_id,member_id,created_at,message"+from+" order by created_at,id limit ? offset ?",
                (rs,n)->new InterestSignal(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getObject(3,UUID.class),rs.getTimestamp(4).toInstant(),rs.getString(5)),project,size,(long)page*size),page,size,total);
    }

    @Transactional(readOnly=true)
    public PageResult<ParticipationNotification> notifications(UUID actor,int page,int size){
        access.requireActive(actor);PageResult.validate(page,size);String from=" from nite_connect.project_participation_notifications where recipient_id=?";
        long total=jdbc.queryForObject("select count(*)"+from,Long.class,actor);
        return new PageResult<>(jdbc.query("select id,project_id,request_id,event_type,created_at,read_at"+from+" order by created_at desc,id limit ? offset ?",
                (rs,n)->new ParticipationNotification(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getObject(3,UUID.class),rs.getString(4),rs.getTimestamp(5).toInstant(),rs.getTimestamp(6)==null?null:rs.getTimestamp(6).toInstant()),actor,size,(long)page*size),page,size,total);
    }

    @Transactional
    public void markRead(UUID actor,UUID id){access.requireActive(actor);int changed=jdbc.update("update nite_connect.project_participation_notifications set read_at=coalesce(read_at,clock_timestamp()) where id=? and recipient_id=?",id,actor);if(changed==0)throw ApiException.notFound();}

    private Capabilities capabilities(UUID actor, boolean admin, CatalogRow row) {
        boolean leader=actor.equals(row.leaderId()), participant=row.participant();
        boolean request=!participant && row.acceptingMembers() && row.status()!=ProjectStatus.PAUSADO && row.status()!=ProjectStatus.CONCLUIDO && row.leaderId()!=null;
        boolean interest=!participant && row.status()!=ProjectStatus.CONCLUIDO && (row.status()==ProjectStatus.PAUSADO || row.leaderId()==null);
        return new Capabilities(true,request,interest,admin||leader,admin||participant,admin||participant,admin||participant,admin||leader,admin||leader);
    }
    private WorkspaceCapabilities workspaceCapabilities(UUID actor,UUID project){boolean admin=access.isAdministrator(actor),leader=actor.equals(projects.leader(project)),participant=projects.participates(project,actor);return new WorkspaceCapabilities(true,admin||leader,admin||participant,admin||participant,admin||leader,admin||leader,admin||leader,admin);}

    private List<MembershipRequest> namedRequests(List<MembershipRequest> requests) {
        var names=members.names(requests.stream().map(MembershipRequest::memberId).distinct().toList());
        return requests.stream().map(r->new MembershipRequest(r.id(),r.projectId(),r.memberId(),names.get(r.memberId()),r.message(),r.state(),r.requestedAt(),r.decidedAt(),r.decidedBy(),r.decisionMessage(),r.version())).toList();
    }
    private void requireDecision(UUID actor,UUID project){projects.require(project);if(!actor.equals(projects.leader(project))&&!access.isAdministrator(actor))throw ApiException.forbidden();}
    private MembershipRequest requireRequest(UUID id){return jdbc.query("select * from nite_connect.project_membership_requests where id=?",ProjectParticipationService::mapRequest,id).stream().findFirst().orElseThrow(ApiException::notFound);}
    private static MembershipRequest mapRequest(java.sql.ResultSet rs,int row)throws java.sql.SQLException{return new MembershipRequest(rs.getObject("id",UUID.class),rs.getObject("project_id",UUID.class),rs.getObject("member_id",UUID.class),null,rs.getString("message"),rs.getString("state"),rs.getTimestamp("requested_at").toInstant(),rs.getTimestamp("decided_at")==null?null:rs.getTimestamp("decided_at").toInstant(),rs.getObject("decided_by",UUID.class),rs.getString("decision_message"),rs.getLong("version"));}
    private static Object[] append(Object[] a,Object... b){Object[] out=java.util.Arrays.copyOf(a,a.length+b.length);System.arraycopy(b,0,out,a.length,b.length);return out;}
    private static String escape(String s){return s.replace("!","!!").replace("%","!%").replace("_","!_");}
    private static String normalize(String s){return s==null||s.isBlank()?null:s.strip();}
    private static String summary(String s){return s.length()<=280?s:s.substring(0,277)+"...";}

    private record CatalogRow(UUID id,String title,String description,ProjectStatus status,boolean acceptingMembers,java.time.LocalDate startsOn,java.time.LocalDate endsOn,int teamSize,UUID leaderId,boolean participant){}
    public record CatalogProject(UUID id,String name,String summary,ProjectStatus status,String image,String leaderName,boolean leadershipVacant,int memberCount,boolean acceptingMembers,java.time.LocalDate startsOn,java.time.LocalDate endsOn,Capabilities capabilities){}
    public record Capabilities(boolean canViewPresentation,boolean canRequestMembership,boolean canExpressInterest,boolean canDecideRequests,boolean canAccessWorkspace,boolean canViewActivities,boolean canViewDocuments,boolean canManageMembers,boolean canManageAvailability){}
    public record WorkspaceCapabilities(boolean canAccessWorkspace,boolean canManageMembers,boolean canViewActivities,boolean canViewDocuments,boolean canManageAvailability,boolean canDecideRequests,boolean canCreatePlanning,boolean canTransferLeadership){}
    public record WorkspaceOverview(UUID projectId,String name,String description,ProjectStatus status,java.time.LocalDate startsOn,java.time.LocalDate endsOn,UUID leaderId,String leaderName,boolean leadershipVacant,int memberCount,long activityCount,long version,boolean acceptingMembers,WorkspaceCapabilities capabilities){}
    public record MembershipRequest(UUID id,UUID projectId,UUID memberId,String memberName,String message,String state,Instant requestedAt,Instant decidedAt,UUID decidedBy,String decisionMessage,long version){}
    public record InterestSignal(UUID id,UUID projectId,UUID memberId,Instant createdAt,String message){}
    public record ParticipationNotification(UUID id,UUID projectId,UUID requestId,String type,Instant createdAt,Instant readAt){}
}
