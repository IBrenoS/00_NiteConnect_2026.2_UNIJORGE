package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentAutomationService {
    private static final Logger log=LoggerFactory.getLogger(DocumentAutomationService.class);
    private final JdbcTemplate jdbc;
    private final AccessService access;
    private final DocumentCapabilityService capabilities;
    private final DocumentLibraryRepository folders;
    private final DocumentRepository documents;
    private final TransactionTemplate transactions;
    public DocumentAutomationService(JdbcTemplate jdbc,AccessService access,DocumentCapabilityService capabilities,
            DocumentLibraryRepository folders,DocumentRepository documents,TransactionTemplate transactions) {
        this.jdbc=jdbc;this.access=access;this.capabilities=capabilities;this.folders=folders;
        this.documents=documents;this.transactions=transactions;
    }
    public record Rule(UUID id,UUID ownerId,String targetType,UUID targetId,String eventType,boolean enabled,Instant createdAt,Instant updatedAt) {}
    public record Delivery(UUID id,String eventType,UUID resourceId,String state,int attempts,String errorCode,Instant createdAt,Instant completedAt) {}
    public record Create(String targetType,UUID targetId,String eventType) {}
    public record Notification(UUID id,String eventType,String resourceType,UUID resourceId,Instant createdAt,Instant readAt) {}
    private record Pending(UUID id,UUID ruleId,UUID recipientId,String eventType,String resourceType,UUID resourceId) {}
    private static final String RULE_SQL="select id,owner_id,target_type,target_id,event_type,enabled,created_at,updated_at from nite_connect.document_automation_rules";
    private static Rule rule(java.sql.ResultSet rs,int row) throws java.sql.SQLException {
        return new Rule(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getString(3),rs.getObject(4,UUID.class),
                rs.getString(5),rs.getBoolean(6),rs.getTimestamp(7).toInstant(),rs.getTimestamp(8).toInstant());
    }
    public List<Rule> list(UUID actor) {
        access.requireActive(actor);
        return jdbc.query(RULE_SQL+" where owner_id=? and deleted_at is null order by created_at desc,id",DocumentAutomationService::rule,actor);
    }
    public List<String> availableEvents(UUID actor,String targetType,UUID targetId) {
        access.requireActive(actor);
        if("SELF".equals(targetType)&&actor.equals(targetId)) return List.of("DOCUMENT_SHARED_WITH_ME");
        if("FOLDER".equals(targetType)) {
            var folder=folders.folder(targetId);
            if(!capabilities.folder(actor,folder).canView()) throw ApiException.notFound();
            return actor.equals(folder.ownerId())||access.isAdministrator(actor)?List.of("NEW_FILE_IN_FOLDER"):List.of();
        }
        if("REQUEST".equals(targetType)) {
            return requestAuthorized(actor,targetId,true)?List.of("FILE_REQUEST_FULFILLED"):List.of();
        }
        throw ApiException.invalid("Alvo documental inválido");
    }
    private boolean requestAuthorized(UUID actor,UUID request,boolean openRequired) {
        List<UUID> destinations=jdbc.query("select target_folder_id from nite_connect.document_file_requests where id=? and requested_by=?"
                        +(openRequired?" and status='OPEN'":""),(rs,n)->rs.getObject(1,UUID.class),request,actor);
        if(destinations.isEmpty())return false;
        try {return capabilities.folder(actor,folders.folder(destinations.getFirst())).canAddChild();}
        catch(ApiException denied) {return false;}
    }
    @Transactional
    public Rule create(UUID actor,Create input) {
        access.requireActive(actor);
        if(input==null||input.targetId()==null||!("FOLDER".equals(input.targetType())&&"NEW_FILE_IN_FOLDER".equals(input.eventType())
                ||"REQUEST".equals(input.targetType())&&"FILE_REQUEST_FULFILLED".equals(input.eventType())
                ||"SELF".equals(input.targetType())&&"DOCUMENT_SHARED_WITH_ME".equals(input.eventType())))
            throw ApiException.invalid("Regra documental inválida");
        if(!availableEvents(actor,input.targetType(),input.targetId()).contains(input.eventType()))throw ApiException.forbidden();
        if(Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from nite_connect.document_automation_rules where owner_id=? and target_type=? and target_id=? and event_type=? and deleted_at is null)",
                Boolean.class,actor,input.targetType(),input.targetId(),input.eventType()))) throw ApiException.conflict("Esta automação já existe");
        UUID id=UUID.randomUUID();
        jdbc.update("insert into nite_connect.document_automation_rules(id,owner_id,target_type,target_id,event_type) values (?,?,?,?,?)",id,actor,input.targetType(),input.targetId(),input.eventType());
        audit(id,actor,"CREATED");
        return list(actor).stream().filter(rule->rule.id().equals(id)).findFirst().orElseThrow();
    }
    @Transactional
    public void setEnabled(UUID actor,UUID id,boolean enabled) {
        access.requireActive(actor);
        Rule rule=ownedForUpdate(actor,id);
        if(rule.enabled()==enabled)return;
        if(enabled&&!availableEvents(actor,rule.targetType(),rule.targetId()).contains(rule.eventType()))throw ApiException.forbidden();
        int changed=jdbc.update("update nite_connect.document_automation_rules set enabled=?,updated_at=clock_timestamp() where id=? and owner_id=? and deleted_at is null",enabled,id,actor);
        if(changed!=1)throw ApiException.notFound();
        audit(id,actor,enabled?"ENABLED":"DISABLED");
    }
    @Transactional
    public void remove(UUID actor,UUID id) {access.requireActive(actor);ownedForUpdate(actor,id);int changed=jdbc.update("update nite_connect.document_automation_rules set enabled=false,deleted_at=clock_timestamp(),updated_at=clock_timestamp() where id=? and owner_id=? and deleted_at is null",id,actor);if(changed!=1)throw ApiException.notFound();audit(id,actor,"REMOVED");}
    public List<Delivery> history(UUID actor,UUID rule) {
        access.requireActive(actor);
        owned(actor,rule);
        return jdbc.query("select id,event_type,resource_type,resource_id,state,attempts,error_code,created_at,completed_at from nite_connect.document_automation_deliveries where rule_id=? order by created_at desc,id desc limit 100",(rs,n)->new Delivery(rs.getObject(1,UUID.class),rs.getString(2),visible(actor,rs.getString(3),rs.getObject(4,UUID.class))?rs.getObject(4,UUID.class):null,rs.getString(5),rs.getInt(6),rs.getString(7),rs.getTimestamp(8).toInstant(),rs.getTimestamp(9)==null?null:rs.getTimestamp(9).toInstant()),rule);
    }
    private Rule owned(UUID actor,UUID id) {
        return jdbc.query(RULE_SQL+" where id=? and owner_id=? and deleted_at is null",DocumentAutomationService::rule,id,actor)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }
    private Rule ownedForUpdate(UUID actor,UUID id) {
        return jdbc.query(RULE_SQL+" where id=? and owner_id=? and deleted_at is null for update",DocumentAutomationService::rule,id,actor)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }
    private void audit(UUID rule,UUID actor,String action) {
        jdbc.update("insert into nite_connect.document_automation_rule_events(id,rule_id,actor_id,action) values (?,?,?,?)",UUID.randomUUID(),rule,actor,action);
    }
    private boolean visible(UUID actor,String type,UUID resource) {
        if(resource==null||type==null)return false;
        try {
            access.requireActive(actor);
            return "DOCUMENT".equals(type)?capabilities.document(actor,documents.require(resource)).canView()
                    :"FOLDER".equals(type)&&capabilities.folder(actor,folders.folder(resource)).canView();
        } catch(ApiException denied) {return false;}
    }
    public List<Notification> notifications(UUID actor) {
        access.requireActive(actor);
        return jdbc.query("select id,event_type,resource_type,resource_id,created_at,read_at from nite_connect.document_notifications where recipient_id=? order by created_at desc,id desc limit 100",
                (rs,n)->new Notification(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),rs.getObject(4,UUID.class),rs.getTimestamp(5).toInstant(),rs.getTimestamp(6)==null?null:rs.getTimestamp(6).toInstant()),actor)
                .stream().filter(item->visible(actor,item.resourceType(),item.resourceId())).toList();
    }
    @Transactional
    public void markRead(UUID actor,UUID id) {
        access.requireActive(actor);
        int changed=jdbc.update("update nite_connect.document_notifications set read_at=coalesce(read_at,clock_timestamp()) where id=? and recipient_id=?",id,actor);
        if(changed==0)throw ApiException.notFound();
    }

    /** Source events are already committed; this scheduled pass only writes small PostgreSQL records. */
    @Scheduled(fixedDelayString="${nite.documents.automation.poll-delay-ms:10000}")
    public void poll() {
        try {
            transactions.executeWithoutResult(status->discover());
            List<UUID> pending=jdbc.query("select id from nite_connect.document_automation_deliveries where state in ('PENDING','FAILED') and attempts<5 and next_attempt_at<=clock_timestamp() order by next_attempt_at,id limit 50",
                    (rs,n)->rs.getObject(1,UUID.class));
            for(UUID id:pending) {
                try {transactions.executeWithoutResult(status->deliver(id));}
                catch(RuntimeException failure) {
                    log.warn("Document automation delivery retry scheduled: {}",failure.getClass().getSimpleName());
                    transactions.executeWithoutResult(status->jdbc.update("update nite_connect.document_automation_deliveries set state='FAILED',attempts=attempts+1,error_code='PROCESSING_ERROR',next_attempt_at=clock_timestamp()+make_interval(mins => (1 << least(attempts,4))) where id=? and state in ('PENDING','FAILED')",id));
                }
            }
        } catch(RuntimeException failure) {log.warn("Document automation poll deferred: {}",failure.getClass().getSimpleName());}
    }
    private void discover() {
        jdbc.update("""
            insert into nite_connect.document_automation_deliveries(id,rule_id,event_key,event_type,resource_type,resource_id,recipient_id)
            select gen_random_uuid(),r.id,'new:'||r.id||':'||e.document_id,r.event_type,'DOCUMENT',e.document_id,r.owner_id
            from nite_connect.document_automation_rules r
            join nite_connect.documents d on d.folder_id=r.target_id
            join nite_connect.document_events e on e.document_id=d.id and e.action='DOCUMENT_CREATED' and e.occurred_at>=r.updated_at
            where r.enabled and r.deleted_at is null and r.target_type='FOLDER' and r.event_type='NEW_FILE_IN_FOLDER'
              and not exists(select 1 from nite_connect.document_automation_deliveries x where x.event_key='new:'||r.id||':'||e.document_id)
            order by e.occurred_at,e.id limit 100 on conflict(event_key) do nothing
            """);
        jdbc.update("""
            insert into nite_connect.document_automation_deliveries(id,rule_id,event_key,event_type,resource_type,resource_id,recipient_id)
            select gen_random_uuid(),r.id,'request:'||r.id||':'||e.document_id,r.event_type,'DOCUMENT',e.document_id,r.owner_id
            from nite_connect.document_automation_rules r
            join nite_connect.document_file_request_events e on e.request_id=r.target_id and e.action='UPLOADED' and e.occurred_at>=r.updated_at
            where r.enabled and r.deleted_at is null and r.target_type='REQUEST' and r.event_type='FILE_REQUEST_FULFILLED'
              and not exists(select 1 from nite_connect.document_automation_deliveries x where x.event_key='request:'||r.id||':'||e.document_id)
            order by e.occurred_at,e.id limit 100 on conflict(event_key) do nothing
            """);
        jdbc.update("""
            insert into nite_connect.document_automation_deliveries(id,rule_id,event_key,event_type,resource_type,resource_id,recipient_id)
            select gen_random_uuid(),r.id,'share:'||r.id||':'||coalesce(e.document_id,e.folder_id),r.event_type,
                   case when e.document_id is null then 'FOLDER' else 'DOCUMENT' end,coalesce(e.document_id,e.folder_id),r.owner_id
            from nite_connect.document_automation_rules r
            join nite_connect.document_share_events e on e.recipient_id=r.owner_id and e.action='SHARE_GRANTED' and e.occurred_at>=r.updated_at
            where r.enabled and r.deleted_at is null and r.target_type='SELF' and r.target_id=r.owner_id and r.event_type='DOCUMENT_SHARED_WITH_ME'
              and not exists(select 1 from nite_connect.document_automation_deliveries x where x.event_key='share:'||r.id||':'||coalesce(e.document_id,e.folder_id))
            order by e.occurred_at,e.id limit 100 on conflict(event_key) do nothing
            """);
    }
    private void deliver(UUID id) {
        List<Pending> found=jdbc.query("""
            select d.id,d.rule_id,d.recipient_id,d.event_type,d.resource_type,d.resource_id
            from nite_connect.document_automation_deliveries d
            where d.id=? and d.state in ('PENDING','FAILED') and d.attempts<5 and d.next_attempt_at<=clock_timestamp()
            for update skip locked
            """,(rs,n)->new Pending(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getObject(3,UUID.class),rs.getString(4),rs.getString(5),rs.getObject(6,UUID.class)),id);
        if(found.isEmpty())return;
        Pending item=found.getFirst();
        boolean allowed=false;
        try {
            Rule rule=owned(item.recipientId(),item.ruleId());
            allowed=rule.enabled()&&("REQUEST".equals(rule.targetType())
                    ?requestAuthorized(item.recipientId(),rule.targetId(),false)
                    :availableEvents(item.recipientId(),rule.targetType(),rule.targetId()).contains(rule.eventType()))
                    &&visible(item.recipientId(),item.resourceType(),item.resourceId());
            if(allowed&&"DOCUMENT_SHARED_WITH_ME".equals(item.eventType()))
                allowed=Boolean.TRUE.equals(jdbc.queryForObject("""
                    select exists(select 1 from nite_connect.document_grants where member_id=? and revoked_at is null
                      and ((?='DOCUMENT' and document_id=?) or (?='FOLDER' and folder_id=?)))
                    """,Boolean.class,item.recipientId(),item.resourceType(),item.resourceId(),item.resourceType(),item.resourceId()));
            if(allowed&&"DOCUMENT_SHARED_WITH_ME".equals(item.eventType())&&"DOCUMENT".equals(item.resourceType()))
                allowed=!Boolean.TRUE.equals(jdbc.queryForObject("""
                    with recursive ancestors(id,parent_id) as (
                      select f.id,f.parent_id from nite_connect.documents d
                      join nite_connect.document_folders f on f.id=d.folder_id where d.id=?
                      union all select parent.id,parent.parent_id from nite_connect.document_folders parent
                      join ancestors child on parent.id=child.parent_id
                    ) select exists(select 1 from nite_connect.document_grants g
                      where g.member_id=? and g.revoked_at is null and g.folder_id in (select id from ancestors))
                    """,Boolean.class,item.resourceId(),item.recipientId()));
        } catch(ApiException denied) {allowed=false;}
        if(!allowed) {
            jdbc.update("update nite_connect.document_automation_deliveries set state='SKIPPED',attempts=attempts+1,error_code='ACCESS_REVOKED',completed_at=clock_timestamp() where id=?",id);
            return;
        }
        jdbc.update("insert into nite_connect.document_notifications(id,delivery_id,recipient_id,event_type,resource_type,resource_id) values (?,?,?,?,?,?) on conflict(delivery_id) do nothing",
                UUID.randomUUID(),id,item.recipientId(),item.eventType(),item.resourceType(),item.resourceId());
        jdbc.update("update nite_connect.document_automation_deliveries set state='DELIVERED',attempts=attempts+1,error_code=null,completed_at=clock_timestamp() where id=?",id);
    }
}
