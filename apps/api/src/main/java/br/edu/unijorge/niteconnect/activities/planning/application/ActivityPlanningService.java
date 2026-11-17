package br.edu.unijorge.niteconnect.activities.planning.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.application.ProjectAccess;
import br.edu.unijorge.niteconnect.activities.api.ActivityContracts;
import br.edu.unijorge.niteconnect.activities.application.ActivityService;
import br.edu.unijorge.niteconnect.activities.infrastructure.ActivityRepository;
import br.edu.unijorge.niteconnect.activities.infrastructure.ActivityRepository.Filter;
import br.edu.unijorge.niteconnect.activities.planning.api.ActivityPlanningContracts.*;
import br.edu.unijorge.niteconnect.activities.planning.domain.ActivityPlanning;
import br.edu.unijorge.niteconnect.activities.planning.domain.ActivityStatistics;
import br.edu.unijorge.niteconnect.activities.planning.infrastructure.ActivityPlanningRepository;
import br.edu.unijorge.niteconnect.audit.application.AuditTrail;
import br.edu.unijorge.niteconnect.projects.application.ProjectDirectory;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import br.edu.unijorge.niteconnect.shared.security.AdministrativeTransactions;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.LocalDate;
import java.util.*;

@Service
public class ActivityPlanningService {
    private final ActivityPlanningRepository plannings;
    private final ActivityRepository activities;
    private final ActivityService activityService;
    private final AccessService access;
    private final ProjectAccess projectAccess;
    private final ProjectDirectory projects;
    private final AdministrativeTransactions transactions;
    private final AuditTrail audit;
    private final Clock clock;
    private final tools.jackson.databind.ObjectMapper json;

    public ActivityPlanningService(ActivityPlanningRepository plannings,ActivityRepository activities,ActivityService activityService,
            AccessService access,ProjectAccess projectAccess,ProjectDirectory projects,AdministrativeTransactions transactions,AuditTrail audit,Clock clock,
            tools.jackson.databind.ObjectMapper json) {
        this.plannings=plannings;this.activities=activities;this.activityService=activityService;this.access=access;
        this.projectAccess=projectAccess;this.projects=projects;this.transactions=transactions;this.audit=audit;this.clock=clock;this.json=json;
    }

    @Transactional public View create(UUID actor,Create input) {
        transactions.lock();access.requireActive(actor);
        if(input.projectId()!=null) projectAccess.requireManage(actor,input.projectId());
        ActivityPlanning planning=plannings.create(actor,input.title(),input.description(),input.projectId());
        audit.recordEntity(actor,"ACTIVITY_PLANNING",planning.id(),"ACTIVITY_PLANNING_CREATED",null,snapshot(planning),"Agrupamento criado");
        return view(actor,planning);
    }

    @Transactional(readOnly=true) public PageResult<View> list(UUID actor,UUID projectId,String query,int page,int size) {
        access.requireActive(actor);
        if(query!=null&&(query.length()>160||query.strip().length()<2)) throw ApiException.invalid("Pesquisa deve conter de 2 a 160 caracteres");
        if(projectId!=null) projectAccess.requireRead(actor,projectId);
        var result=plannings.list(actor,access.isAdministrator(actor),projectAccessProjectIds(actor),projectId,query,page,size);
        return new PageResult<>(result.items().stream().map(p->view(actor,p)).toList(),page,size,result.total());
    }

    @Transactional(readOnly=true) public View read(UUID actor,UUID id) {
        access.requireActive(actor);ActivityPlanning planning=plannings.require(id);requireRead(actor,planning);return view(actor,planning);
    }

    @Transactional(readOnly=true) public Capabilities capabilities(UUID actor,UUID id) {
        access.requireActive(actor);ActivityPlanning planning=plannings.require(id);
        boolean owner=planning.createdBy().equals(actor);
        boolean canRead=canRead(actor,planning);
        boolean canManage=canManage(actor,planning);
        return new Capabilities(canRead,canRead&&canManage,canRead&&canManage,owner,planning.version());
    }

    @Transactional public View update(UUID actor,UUID id,Update input) {
        transactions.lock();access.requireActive(actor);ActivityPlanning current=plannings.lock(id);requireManage(actor,current);
        if(current.version()!=input.expectedVersion()) throw ApiException.conflict("Planejamento alterado; consulte a versão atual");
        String title=text(input.title(),current.title(),false);String description=text(input.description(),current.description(),true);
        plannings.update(id,title,description,input.expectedVersion());ActivityPlanning next=plannings.require(id);
        audit.recordEntity(actor,"ACTIVITY_PLANNING",id,"ACTIVITY_PLANNING_UPDATED",snapshot(current),snapshot(next),"Planejamento atualizado");
        return view(actor,next);
    }

    @Transactional public TaskCreated createTask(UUID actor,UUID id,CreateTask input) {
        transactions.lock();access.requireActive(actor);ActivityPlanning planning=plannings.lock(id);requireRead(actor,planning);requireManage(actor,planning);
        if(planning.version()!=input.expectedVersion()) throw ApiException.conflict("Planejamento alterado; consulte a versão atual");
        ActivityContracts.Create task=new ActivityContracts.Create(input.title(),input.description(),planning.projectId(),input.startOn(),input.dueOn(),input.priority(),input.primaryExecutorId(),input.reason());
        var created=activityService.create(actor,task);
        plannings.attachTask(created.id(),id,created.version());ActivityPlanning next=plannings.require(id);
        var attached=activities.require(created.id());
        activityService.record(actor,attached,"PLANNING_ATTACHED",null,"{\"planningId\":\""+id+"\"}","Tarefa vinculada ao planejamento");
        plannings.touch(id,planning.version());
        return new TaskCreated(activityService.read(actor,created.id()),next.version()+1);
    }

    @Transactional(readOnly=true) public PageResult<ActivityService.View> tasks(UUID actor,UUID id,Filter filter,int page,int size) {
        access.requireActive(actor);ActivityPlanning planning=plannings.require(id);requireRead(actor,planning);
        Filter scoped=new Filter(filter.status(),planning.projectId(),filter.executorId(),filter.dueFrom(),filter.dueTo(),filter.overdue(),filter.q(),
                filter.priority(),filter.startFrom(),filter.startTo(),filter.sort(),filter.direction(),id);
        if(planning.projectId()!=null) return activityService.projectList(actor,planning.projectId(),scoped,page,size);
        return activityService.list(actor,false,scoped,page,size);
    }

    @Transactional(readOnly=true) public ActivityStatistics planningStats(UUID actor,UUID id) {
        access.requireActive(actor);ActivityPlanning planning=plannings.require(id);requireRead(actor,planning);
        return plannings.planningStats(id,LocalDate.now(clock));
    }

    @Transactional(readOnly=true) public ActivityStatistics personalStats(UUID actor) {
        access.requireActive(actor);return plannings.personalStats(actor,access.isAdministrator(actor),projectAccessProjectIds(actor),LocalDate.now(clock));
    }

    @Transactional(readOnly=true) public ActivityStatistics projectStats(UUID actor,UUID projectId) {
        projectAccess.requireRead(actor,projectId);return plannings.projectStats(projectId,LocalDate.now(clock));
    }

    @Transactional(readOnly=true) public ActivityStatistics memberStats(UUID actor,UUID memberId,UUID projectId) {
        access.requireActive(actor);access.requireActive(memberId);
        if(projectId==null) {
            access.requireAdministrator(actor);
            return plannings.memberStats(memberId,LocalDate.now(clock));
        }
        projectAccess.requireRead(actor,projectId);
        return plannings.memberProjectStats(memberId,projectId,LocalDate.now(clock));
    }

    @Transactional public void delete(UUID actor,UUID id,Delete input) {
        transactions.lock();access.requireActive(actor);
        if(!Boolean.TRUE.equals(input.confirmed())) throw ApiException.invalid("Confirmação explícita obrigatória");
        ActivityPlanning planning=plannings.lock(id);
        if(!planning.createdBy().equals(actor)) throw ApiException.notFound();
        if(planning.version()!=input.expectedVersion()) throw ApiException.conflict("Planejamento alterado; consulte a versão atual");
        for(var task:plannings.tasksForUpdate(id)) {
            ActivityPlanningRepository.TaskRef locked=task;
            var detachedVersion=plannings.detachTask(locked.id(),locked.version());
            var detached=activities.require(locked.id());
            activityService.record(actor,detached,"PLANNING_DETACHED","{\"planningId\":\""+id+"\"}","{\"planningId\":null}","Tarefa desassociada pela exclusão do planejamento");
            if(detached.version()!=detachedVersion) throw ApiException.conflict("Tarefa alterada durante a desassociação");
        }
        plannings.delete(id,input.expectedVersion());
        audit.recordEntity(actor,"ACTIVITY_PLANNING",id,"ACTIVITY_PLANNING_DELETED",snapshot(planning),null,"Planejamento excluído permanentemente");
    }

    private View view(UUID actor,ActivityPlanning p) {
        boolean allowed=canRead(actor,p),manage=allowed&&canManage(actor,p);
        return new View(p.id(),p.title(),p.description(),p.projectId(),p.createdBy(),p.version(),p.createdAt(),p.updatedAt(),manage,manage,p.createdBy().equals(actor));
    }
    private void requireRead(UUID actor,ActivityPlanning p) { if(!canRead(actor,p)) throw ApiException.notFound(); }
    private boolean canRead(UUID actor,ActivityPlanning p) {
        if(p.projectId()!=null) {
            try { projectAccess.requireRead(actor,p.projectId());return true; }
            catch(ApiException denied) { if(denied.status()==org.springframework.http.HttpStatus.FORBIDDEN||denied.status()==org.springframework.http.HttpStatus.NOT_FOUND)return false;throw denied; }
        }
        return access.isAdministrator(actor)||p.createdBy().equals(actor);
    }
    private boolean canManage(UUID actor,ActivityPlanning p) {
        if(p.projectId()!=null) {
            try { projectAccess.requireManage(actor,p.projectId());return true; }
            catch(ApiException denied) { if(denied.status()==org.springframework.http.HttpStatus.FORBIDDEN||denied.status()==org.springframework.http.HttpStatus.NOT_FOUND)return false;throw denied; }
        }
        return access.isAdministrator(actor)||p.createdBy().equals(actor);
    }
    private void requireManage(UUID actor,ActivityPlanning p) { if(!canManage(actor,p)) throw ApiException.forbidden(); }
    private List<UUID> projectAccessProjectIds(UUID actor) { return access.isAdministrator(actor)?List.of():projects.currentProjectIds(actor); }
    private String text(tools.jackson.databind.JsonNode node,String current,boolean nullable) {
        if(node==null)return current;
        if(node.isNull()) { if(nullable)return "";throw ApiException.invalid("Título não pode ser removido"); }
        if(!node.isTextual())throw ApiException.invalid("Campo textual inválido");String value=node.textValue().strip();
        if(value.isEmpty()&&!nullable)throw ApiException.invalid("Título obrigatório");
        if(value.length()>10000)throw ApiException.invalid("Texto acima do limite permitido");return value;
    }
    private String snapshot(ActivityPlanning value) { return json.writeValueAsString(value); }
}
