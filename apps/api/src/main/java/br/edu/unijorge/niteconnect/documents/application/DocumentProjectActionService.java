package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.application.ProjectAccess;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentIdentityRepository;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentProjectActionService {
    private final JdbcTemplate jdbc;
    private final AccessService access;
    private final ProjectAccess projects;
    private final DocumentIdentityRepository identities;
    private final DocumentLibraryService library;
    private final DocumentPurgeService purge;
    public DocumentProjectActionService(JdbcTemplate jdbc,AccessService access,ProjectAccess projects,
            DocumentIdentityRepository identities,DocumentLibraryService library,DocumentPurgeService purge) {
        this.jdbc=jdbc;this.access=access;this.projects=projects;this.identities=identities;this.library=library;this.purge=purge;
    }
    public record Request(UUID id,UUID projectId,UUID resourceId,String resourceType,String action,
                          UUID requestedBy,String reason,String status,Instant requestedAt,UUID decidedBy,
                          Instant decidedAt,String decisionReason,UUID purgeOperationId) {}
    private static final org.springframework.jdbc.core.RowMapper<Request> MAPPER=(rs,row)->new Request(
            rs.getObject("id",UUID.class),rs.getObject("project_id",UUID.class),rs.getObject("resource_id",UUID.class),
            rs.getString("resource_type"),rs.getString("action"),rs.getObject("requested_by",UUID.class),
            rs.getString("reason"),rs.getString("status"),rs.getTimestamp("requested_at").toInstant(),
            rs.getObject("decided_by",UUID.class),rs.getTimestamp("decided_at")==null?null:rs.getTimestamp("decided_at").toInstant(),
            rs.getString("decision_reason"),rs.getObject("purge_operation_id",UUID.class));
    @Transactional
    public Request create(UUID actor,UUID project,UUID target,String type,String action,String reason) {
        projects.requireManage(actor,project);
        if(!Set.of("DOCUMENT","FOLDER").contains(type)||!Set.of("TRASH","PURGE").contains(action))
            throw ApiException.invalid("Tipo ou ação documental inválida");
        requireProjectTarget(project,target,type,action);
        String checked=reason(reason);
        UUID id=UUID.randomUUID();
        jdbc.update("""
                insert into nite_connect.document_project_action_requests
                (id,project_id,resource_id,resource_type,action,requested_by,reason)
                values (?,?,?,?,?,?,?)
                """,id,project,target,type,action,actor,checked);
        return require(id);
    }
    public Request visible(UUID actor,UUID id) {
        access.requireActive(actor);
        Request request=require(id);
        if(!access.isAdministrator(actor)&&!actor.equals(request.requestedBy())) throw ApiException.notFound();
        return request;
    }
    public List<Request> pending(UUID actor,int limit) {
        return pending(actor,null,limit,0);
    }
    public List<Request> pending(UUID actor,UUID projectId,int limit,int offset) {
        access.requireAdministrator(actor);
        if(limit<1||limit>100||offset<0) throw ApiException.invalid("Paginação inválida");
        if(projectId!=null) projects.requireRead(actor,projectId);
        return jdbc.query("""
                select * from nite_connect.document_project_action_requests
                where status='PENDING' and (cast(? as uuid) is null or project_id=cast(? as uuid))
                order by requested_at,id limit ? offset ?
                """,MAPPER,projectId,projectId,limit,offset);
    }
    @Transactional
    public Request decide(UUID actor,UUID id,boolean approve,String reason,boolean confirmed) {
        access.requireAdministrator(actor);
        Request request=jdbc.query("select * from nite_connect.document_project_action_requests where id=? for update",MAPPER,id)
                .stream().findFirst().orElseThrow(ApiException::notFound);
        if(!"PENDING".equals(request.status())) throw ApiException.conflict("Solicitação já decidida");
        String checked=reason(reason);
        if(approve&&!confirmed) throw ApiException.invalid("Confirmação explícita obrigatória");
        UUID operationId=null;
        if(approve) {
            requireProjectTarget(request.projectId(),request.resourceId(),request.resourceType(),request.action());
            if("TRASH".equals(request.action())) {
                if("DOCUMENT".equals(request.resourceType())) library.trashFile(actor,request.resourceId());
                else library.trashFolder(actor,request.resourceId(),true);
            } else {
                var preview=purge.preview(actor,request.resourceId());
                if(!"ELIGIBLE".equals(preview.reasonCode())) throw ApiException.conflict("Descarte bloqueado: "+preview.reasonCode());
                var operation=purge.request(actor,request.resourceId(),"project-request:"+id);
                if(!"PENDING".equals(operation.status())) throw ApiException.conflict("Descarte não foi enfileirado");
                operationId=operation.id();
            }
        }
        int changed=jdbc.update("""
                update nite_connect.document_project_action_requests set status=?,decided_by=?,decided_at=clock_timestamp(),
                  decision_reason=?,purge_operation_id=? where id=? and status='PENDING'
                """,approve?"APPROVED":"REJECTED",actor,checked,operationId,id);
        if(changed!=1) throw ApiException.conflict("Solicitação já decidida");
        return require(id);
    }
    private void requireProjectTarget(UUID project,UUID target,String type,String action) {
        var identity="DOCUMENT".equals(type)?identities.document(target):identities.folder(target);
        if(!"PROJECT".equals(identity.resourceOwnerKind())||!project.equals(identity.resourceOwnerId())) throw ApiException.notFound();
        String table="DOCUMENT".equals(type)?"documents":"document_folders";
        String expected="TRASH".equals(action)?"ACTIVE":"TRASHED";
        boolean valid=Boolean.TRUE.equals(jdbc.queryForObject(
                "select exists(select 1 from nite_connect."+table+" where id=? and lifecycle_state=? and archived_at is null)",Boolean.class,target,expected));
        if(!valid) throw ApiException.conflict("Estado do recurso mudou");
        if("FOLDER".equals(type)&&"TRASH".equals(action)) {
            String kind=jdbc.queryForObject("select kind from nite_connect.document_folders where id=?",String.class,target);
            if(!"CUSTOM".equals(kind)) throw ApiException.forbidden();
        }
    }
    private Request require(UUID id) {
        return jdbc.query("select * from nite_connect.document_project_action_requests where id=?",MAPPER,id)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }
    private static String reason(String value) {
        if(value==null||value.isBlank()||value.length()>1000) throw ApiException.invalid("Motivo obrigatório (máximo 1000 caracteres)");
        return value.strip();
    }
}
