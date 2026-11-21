package br.edu.unijorge.niteconnect.documents.infrastructure;

import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public class DocumentPurgeRepository {
    private final JdbcTemplate jdbc;
    private final DocumentLibraryRepository library;

    public DocumentPurgeRepository(JdbcTemplate jdbc,DocumentLibraryRepository library) {
        this.jdbc=jdbc;this.library=library;
    }

    public record Operation(UUID id,UUID actorId,String operationType,String status,int itemCount,long estimatedBytes,
                            Instant requestedAt,Instant startedAt,Instant finishedAt,String resultCode) {}
    public record Progress(Operation operation,long objectCount,long purgedObjects,long pendingObjects,
                           long retryingObjects,long blockedObjects,long failedObjects,long removedBytes,List<Preview> items) {}
    public record Preview(UUID resourceId,String resourceType,String decision,String reasonCode,int itemCount,long estimatedBytes) {}
    public record PurgeObject(UUID id,UUID operationItemId,UUID objectId,String storageKind) {}
    public record PolicyEligibility(UUID policyId,boolean eligible,String reasonCode) {}
    public record AutomaticCandidate(UUID id,Instant deletedAt) {}
    private static final org.springframework.jdbc.core.RowMapper<Operation> OPERATION=(rs,row)->mapOperation(rs);
    private static Operation mapOperation(ResultSet rs) throws SQLException {
        return new Operation(rs.getObject("id",UUID.class),rs.getObject("actor_id",UUID.class),rs.getString("operation_type"),
                rs.getString("status"),rs.getInt("item_count"),rs.getLong("estimated_bytes"),rs.getTimestamp("requested_at").toInstant(),
                rs.getTimestamp("started_at")==null?null:rs.getTimestamp("started_at").toInstant(),
                rs.getTimestamp("finished_at")==null?null:rs.getTimestamp("finished_at").toInstant(),rs.getString("result_code"));
    }

    public DocumentLibraryRepository.TrashItem trashItem(UUID id) { return library.trashItem(id); }

    public List<DocumentLibraryRepository.TrashItem> trashItems(UUID spaceOwner,boolean administrative,int limit) {
        return library.trash(spaceOwner,null,administrative,null,"deletedAt","desc",limit,0);
    }

    public List<DocumentLibraryRepository.TrashItem> trashBatchItems(UUID batchId) {
        List<UUID> documents=jdbc.query("select id from nite_connect.documents where trash_batch_id=? and lifecycle_state='TRASHED' order by id",
                (rs,row)->rs.getObject(1,UUID.class),batchId);
        List<UUID> folders=jdbc.query("select id from nite_connect.document_folders where trash_batch_id=? and lifecycle_state='TRASHED' order by id",
                (rs,row)->rs.getObject(1,UUID.class),batchId);
        long total=jdbc.queryForObject("select (select count(*) from nite_connect.documents where trash_batch_id=?)+(select count(*) from nite_connect.document_folders where trash_batch_id=?)",
                Long.class,batchId,batchId);
        if(total>5_000) throw ApiException.conflict("Subárvore excede o limite operacional de 5.000 recursos");
        if(total!=documents.size()+folders.size()) throw ApiException.conflict("Subárvore contém recursos fora da Lixeira");
        return java.util.stream.Stream.concat(documents.stream().map(library::trashItem),folders.stream().map(library::trashItem)).toList();
    }

    public Preview preview(DocumentLibraryRepository.TrashItem item,String reason) {
        int count=1;
        long bytes=item.size();
        if("FOLDER".equals(item.type())) {
            long[] stats=jdbc.queryForObject("""
                    select count(*)::integer,coalesce(sum(v.size),0)::bigint
                    from nite_connect.documents d join nite_connect.document_versions v on v.id=d.current_version_id
                    where d.trash_batch_id=?
                    """,(rs,row)->new long[]{rs.getLong(1),rs.getLong(2)},item.batchId());
            count+=Math.toIntExact(item.subtreeItems());
            bytes=Math.max(bytes,stats[1]);
        }
        return new Preview(item.id(),item.type(),"ELIGIBLE".equals(reason)?"ELIGIBLE":"BLOCKED",reason,count,bytes);
    }

    public PolicyEligibility policyEligibility(DocumentLibraryRepository.TrashItem item) {
        return policyEligibility(item,true);
    }

    public PolicyEligibility policyEligibility(DocumentLibraryRepository.TrashItem item,boolean enforceThirtyDays) {
        boolean released=jdbc.query("select enabled from nite_connect.document_purge_activation where id=true",
                (rs,row)->rs.getBoolean(1)).stream().findFirst().orElse(false);
        if(!released) return new PolicyEligibility(null,false,"OPERATIONAL_RELEASE_REQUIRED");
        var policy=jdbc.query("""
                select p.id,p.minimum_trash_days,p.policy_hash
                from nite_connect.document_retention_policies p
                where p.enabled and p.policy_key='NITE_DOCUMENTS' and p.minimum_trash_days=30
                  and exists(select 1 from nite_connect.document_purge_activation a where a.id=true and a.enabled)
                  and p.approved_by is not null and p.approved_at is not null
                  and p.effective_from<=clock_timestamp() and (p.effective_until is null or p.effective_until>clock_timestamp())
                  and (p.scope='GLOBAL' or p.scope='PERSONAL')
                order by case when p.scope='PERSONAL' then 0 else 1 end,p.version desc limit 1
                """,(rs,row)->new Object[]{rs.getObject(1,UUID.class),rs.getObject(2,Integer.class),rs.getString(3)}).stream().findFirst();
        if(policy.isEmpty()) return new PolicyEligibility(null,false,"POLICY_NOT_APPROVED");
        UUID policyId=(UUID)policy.get()[0];
        Integer retentionDays=(Integer)policy.get()[1];
        if(retentionDays==null) return new PolicyEligibility(policyId,false,"RETENTION_NOT_CONFIGURED");
        boolean oldEnough=Boolean.TRUE.equals(jdbc.queryForObject("select ?::timestamptz + make_interval(days => ?) <= clock_timestamp()",
                Boolean.class,java.sql.Timestamp.from(item.deletedAt()),retentionDays));
        if(enforceThirtyDays&&!oldEnough) return new PolicyEligibility(policyId,false,"RETENTION_PERIOD");
        boolean referenced=Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from nite_connect.diaries d where d.document_id=? and ?='DOCUMENT')
                  or exists(select 1 from nite_connect.document_template_distributions d where d.document_id=? and ?='DOCUMENT')
                """,Boolean.class,item.id(),item.type(),item.id(),item.type()));
        if(referenced) return new PolicyEligibility(policyId,false,"PRESERVATION_REFERENCE");
        return new PolicyEligibility(policyId,true,null);
    }

    /** Queues the fully validated set atomically; bytes are only claimed and deleted after commit. */
    public Operation queueRequest(UUID actor,String idempotencyKey,String operationType,List<DocumentLibraryRepository.TrashItem> items,UUID policyId) {
        if(items.isEmpty()) throw ApiException.conflict("Não há recursos na operação");
        if(!List.of("ITEM","EMPTY","AUTO").contains(operationType)) throw ApiException.invalid("Tipo de descarte inválido");
        var previous=jdbc.query("select * from nite_connect.document_purge_operations where actor_id=? and idempotency_key=?",
                OPERATION,actor,idempotencyKey).stream().findFirst();
        if(previous.isPresent()) {
            if(!operationType.equals(previous.get().operationType())) throw ApiException.conflict("Chave de idempotência já utilizada em outra operação");
            boolean matches=items.stream().allMatch(item->Boolean.TRUE.equals(jdbc.queryForObject("""
                    select exists(select 1 from nite_connect.document_purge_operation_items where operation_id=? and resource_id=? and resource_type=?)
                    """,Boolean.class,previous.get().id(),item.id(),item.type())));
            if(!matches||previous.get().itemCount()!=items.size()) throw ApiException.conflict("Chave de idempotência já utilizada em outra solicitação");
            return previous.get();
        }
        List<UUID> documentIds=items.stream().filter(item->"DOCUMENT".equals(item.type())).map(DocumentLibraryRepository.TrashItem::id).toList();
        if(hasExternalReferences(documentIds)) throw ApiException.conflict("Há referências documentais fora do lote; descarte bloqueado");
        UUID operation=UUID.randomUUID();
        long estimatedBytes=0;
        for(var item:items) if("DOCUMENT".equals(item.type())) {
            estimatedBytes+=jdbc.queryForObject("select coalesce(sum(size),0)::bigint from nite_connect.document_versions where document_id=?",Long.class,item.id());
            estimatedBytes+=jdbc.queryForObject("select coalesce(sum(p.size),0)::bigint from nite_connect.document_pdfs p join nite_connect.document_versions v on v.id=p.version_id where v.document_id=?",Long.class,item.id());
        }
        int inserted=jdbc.update("""
                insert into nite_connect.document_purge_operations(id,actor_id,operation_type,status,idempotency_key,policy_id,item_count,estimated_bytes,initiated_by_system)
                values (?,?,?,'PENDING',?,?,?,?,?) on conflict(actor_id,idempotency_key) do nothing
                """,operation,actor,operationType,idempotencyKey,policyId,items.size(),estimatedBytes,"AUTO".equals(operationType));
        if(inserted==0) {
            Operation existing=jdbc.query("select * from nite_connect.document_purge_operations where actor_id=? and idempotency_key=?",
                    OPERATION,actor,idempotencyKey).stream().findFirst().orElseThrow();
            boolean matches=items.stream().allMatch(item->Boolean.TRUE.equals(jdbc.queryForObject("""
                    select exists(select 1 from nite_connect.document_purge_operation_items where operation_id=? and resource_id=? and resource_type=?)
                    """,Boolean.class,existing.id(),item.id(),item.type())));
            if(!matches) throw ApiException.conflict("Chave de idempotência já utilizada em outra solicitação");
            return existing;
        }
        for(var item:items) {
            String table="DOCUMENT".equals(item.type())?"documents":"document_folders";
            int changed=jdbc.update("update nite_connect."+table+" set lifecycle_state='PURGE_PENDING',purge_operation_id=? where id=? and lifecycle_state='TRASHED' and archived_at is null",operation,item.id());
            if(changed!=1) throw ApiException.conflict("O recurso mudou de estado durante a solicitação");
            UUID operationItem=UUID.randomUUID();
            jdbc.update("insert into nite_connect.document_purge_operation_items(id,operation_id,resource_id,resource_type,state,estimated_bytes) values (?,?,?,?,'PENDING',?)",
                    operationItem,operation,item.id(),item.type(),"DOCUMENT".equals(item.type())?jdbc.queryForObject("select coalesce(sum(size),0)::bigint from nite_connect.document_versions where document_id=?",Long.class,item.id()):0L);
            if("DOCUMENT".equals(item.type())) {
                jdbc.update("""
                        insert into nite_connect.document_purge_objects(id,operation_id,operation_item_id,object_id,storage_kind,estimated_bytes,state)
                        select gen_random_uuid(),?,?,v.object_id,case when d.stored_as_asset then 'ASSET' else 'DOCUMENT' end,v.size,'PENDING'
                        from nite_connect.document_versions v join nite_connect.documents d on d.id=v.document_id where d.id=?
                        on conflict(operation_id,storage_kind,object_id) do nothing
                        """,operation,operationItem,item.id());
                jdbc.update("""
                        insert into nite_connect.document_purge_objects(id,operation_id,operation_item_id,object_id,storage_kind,estimated_bytes,state)
                        select gen_random_uuid(),?,?,p.object_id,'ASSET',p.size,'PENDING'
                        from nite_connect.document_pdfs p join nite_connect.document_versions v on v.id=p.version_id where v.document_id=?
                        on conflict(operation_id,storage_kind,object_id) do nothing
                        """,operation,operationItem,item.id());
                jdbc.update("insert into nite_connect.document_events(id,document_id,actor_id,action,reason) values (?,?,?,'PURGE_QUEUED','Descarte aprovado por política vigente')",
                        UUID.randomUUID(),item.id(),actor);
            } else jdbc.update("insert into nite_connect.document_folder_events(id,folder_id,actor_id,action,reason) values (?,?,?,'PURGE_QUEUED','Descarte aprovado por política vigente')",
                    UUID.randomUUID(),item.id(),actor);
        }
        return operation(operation);
    }

    private boolean hasExternalReferences(List<UUID> documentIds) {
        if(documentIds.isEmpty()) return false;
        String marks=String.join(",",java.util.Collections.nCopies(documentIds.size(),"?"));
        String sql="""
                select exists(select 1 from nite_connect.document_versions v where v.document_id in (%s)
                  and (exists(select 1 from nite_connect.document_versions other where other.object_id=v.object_id and other.document_id not in (%s))
                    or exists(select 1 from nite_connect.document_template_versions t where t.object_id=v.object_id)))
                """.formatted(marks,marks);
        Object[] args=java.util.stream.Stream.concat(documentIds.stream(),documentIds.stream()).toArray();
        return Boolean.TRUE.equals(jdbc.queryForObject(sql,Boolean.class,args));
    }

    /** The request and its audit event commit together; this does not transition the resource or enqueue bytes. */
    public Operation recordBlockedRequest(UUID actor,String idempotencyKey,DocumentLibraryRepository.TrashItem item,
                                          String reason,int count,long estimatedBytes) {
        var previous=jdbc.query("select * from nite_connect.document_purge_operations where actor_id=? and idempotency_key=?",
                OPERATION,actor,idempotencyKey).stream().findFirst();
        if(previous.isPresent()) {
            if(!"ITEM".equals(previous.get().operationType())) throw ApiException.conflict("Chave de idempotência já utilizada em outra operação");
            boolean same=Boolean.TRUE.equals(jdbc.queryForObject("""
                    select exists(select 1 from nite_connect.document_purge_operation_items
                      where operation_id=? and resource_id=? and resource_type=?)
                    """,Boolean.class,previous.get().id(),item.id(),item.type()));
            if(!same) throw ApiException.conflict("Chave de idempotência já utilizada em outra solicitação");
            return previous.get();
        }
        UUID operation=UUID.randomUUID();
        jdbc.update("""
                insert into nite_connect.document_purge_operations(id,actor_id,operation_type,status,idempotency_key,item_count,estimated_bytes,result_code)
                values (?,?,?,'BLOCKED_POLICY',?,?,?,?)
                on conflict(actor_id,idempotency_key) do nothing
                """,operation,actor,"ITEM",idempotencyKey,count,estimatedBytes,reason);
        Operation stored=jdbc.query("select * from nite_connect.document_purge_operations where actor_id=? and idempotency_key=?",
                OPERATION,actor,idempotencyKey).stream().findFirst().orElseThrow();
        if(!stored.id().equals(operation)) {
            boolean same=Boolean.TRUE.equals(jdbc.queryForObject("""
                    select exists(select 1 from nite_connect.document_purge_operation_items
                      where operation_id=? and resource_id=? and resource_type=?)
                    """,Boolean.class,stored.id(),item.id(),item.type()));
            if(!same) throw ApiException.conflict("Chave de idempotência já utilizada em outra solicitação");
            return stored;
        }
        jdbc.update("""
                insert into nite_connect.document_purge_operation_items(id,operation_id,resource_id,resource_type,state,reason_code,estimated_bytes)
                values (?,?,?,?,'BLOCKED',?,?)
                """,UUID.randomUUID(),operation,item.id(),item.type(),reason,estimatedBytes);
        if("DOCUMENT".equals(item.type())) jdbc.update("""
                insert into nite_connect.document_events(id,document_id,actor_id,action,reason)
                values (?,?,?,'PURGE_REQUEST_BLOCKED',?)
                """,UUID.randomUUID(),item.id(),actor,reason);
        else jdbc.update("""
                insert into nite_connect.document_folder_events(id,folder_id,actor_id,action,reason)
                values (?,?,?,'PURGE_REQUEST_BLOCKED',?)
                """,UUID.randomUUID(),item.id(),actor,reason);
        return stored;
    }

    public Operation recordBlockedEmptyRequest(UUID actor,String idempotencyKey,List<Preview> items) {
        var previous=jdbc.query("select * from nite_connect.document_purge_operations where actor_id=? and idempotency_key=?",
                OPERATION,actor,idempotencyKey).stream().findFirst();
        if(previous.isPresent()) {
            if(!"EMPTY".equals(previous.get().operationType())) throw ApiException.conflict("Chave de idempotência já utilizada em outra solicitação");
            boolean same=items.stream().allMatch(item->Boolean.TRUE.equals(jdbc.queryForObject("""
                    select exists(select 1 from nite_connect.document_purge_operation_items
                      where operation_id=? and resource_id=? and resource_type=?)
                    """,Boolean.class,previous.get().id(),item.resourceId(),item.resourceType())));
            long stored=jdbc.queryForObject("select count(*) from nite_connect.document_purge_operation_items where operation_id=?",Long.class,previous.get().id());
            if(!same||stored!=items.size()) throw ApiException.conflict("Chave de idempotência já utilizada em outra seleção da Lixeira");
            return previous.get();
        }
        UUID operation=UUID.randomUUID();
        int count=items.stream().mapToInt(Preview::itemCount).sum();
        long bytes=items.stream().mapToLong(Preview::estimatedBytes).sum();
        jdbc.update("""
                insert into nite_connect.document_purge_operations(id,actor_id,operation_type,status,idempotency_key,item_count,estimated_bytes,result_code)
                values (?,?,'EMPTY','BLOCKED_POLICY',?,?,?,?)
                on conflict(actor_id,idempotency_key) do nothing
                """,operation,actor,count,bytes,items.isEmpty()?"POLICY_NOT_APPROVED":items.getFirst().reasonCode());
        Operation stored=jdbc.query("select * from nite_connect.document_purge_operations where actor_id=? and idempotency_key=?",
                OPERATION,actor,idempotencyKey).stream().findFirst().orElseThrow();
        if(!stored.id().equals(operation)) {
            if(!"EMPTY".equals(stored.operationType())) throw ApiException.conflict("Chave de idempotência já utilizada em outra solicitação");
            boolean same=items.stream().allMatch(item->Boolean.TRUE.equals(jdbc.queryForObject("""
                    select exists(select 1 from nite_connect.document_purge_operation_items
                      where operation_id=? and resource_id=? and resource_type=?)
                    """,Boolean.class,stored.id(),item.resourceId(),item.resourceType())));
            long storedCount=jdbc.queryForObject("select count(*) from nite_connect.document_purge_operation_items where operation_id=?",Long.class,stored.id());
            if(!same||storedCount!=items.size()) throw ApiException.conflict("Chave de idempotência já utilizada em outra seleção da Lixeira");
            return stored;
        }
        for(Preview item:items) jdbc.update("""
                insert into nite_connect.document_purge_operation_items(id,operation_id,resource_id,resource_type,state,reason_code,estimated_bytes)
                values (?,?,?,?,'BLOCKED',?,?) on conflict(operation_id,resource_type,resource_id) do nothing
                """,UUID.randomUUID(),operation,item.resourceId(),item.resourceType(),item.reasonCode(),item.estimatedBytes());
        return stored;
    }

    public Operation operation(UUID operationId) {
        return jdbc.query("select * from nite_connect.document_purge_operations where id=?",OPERATION,operationId)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }

    public Operation visibleOperation(UUID operationId,UUID actor,boolean administrator) {
        Operation operation=operation(operationId);
        if(!administrator&&!operation.actorId().equals(actor)) throw ApiException.notFound();
        return operation;
    }

    public Progress progress(UUID operationId,UUID actor,boolean administrator) {
        Operation operation=visibleOperation(operationId,actor,administrator);
        long[] counts=jdbc.queryForObject("""
                select count(*)::bigint,
                  count(*) filter(where o.state='PURGED')::bigint,
                  count(*) filter(where o.state in ('PENDING','PROCESSING'))::bigint,
                  count(*) filter(where o.state='RETRY')::bigint,
                  count(*) filter(where o.state='BLOCKED_REFERENCE')::bigint,
                  count(*) filter(where o.state='FAILED')::bigint,
                  coalesce(sum(o.estimated_bytes) filter(where o.state='PURGED'),0)::bigint
                from nite_connect.document_purge_objects o where o.operation_id=?
                """,(rs,row)->new long[]{rs.getLong(1),rs.getLong(2),rs.getLong(3),rs.getLong(4),rs.getLong(5),rs.getLong(6),rs.getLong(7)},operationId);
        return new Progress(operation,counts[0],counts[1],counts[2],counts[3],counts[4],counts[5],counts[6],operationItems(operationId));
    }

    public List<Preview> operationItems(UUID operationId) {
        return jdbc.query("""
                select resource_id,resource_type,state,reason_code,estimated_bytes from nite_connect.document_purge_operation_items
                where operation_id=? order by resource_type,resource_id
                """,(rs,row)->new Preview(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),rs.getString(4),1,rs.getLong(5)),operationId);
    }

    public boolean hasApprovedPolicy(UUID operationId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from nite_connect.document_purge_operations o
                  join nite_connect.document_retention_policies p on p.id=o.policy_id
                  where o.id=? and p.enabled and p.policy_key='NITE_DOCUMENTS' and p.minimum_trash_days=30
                    and exists(select 1 from nite_connect.document_purge_activation a where a.id=true and a.enabled)
                    and p.approved_by is not null and p.approved_at is not null
                    and p.effective_from<=clock_timestamp() and (p.effective_until is null or p.effective_until>clock_timestamp()))
                """,Boolean.class,operationId));
    }

    public UUID policyApprover(UUID policyId) {
        return jdbc.query("select approved_by from nite_connect.document_retention_policies where id=? and enabled and policy_key='NITE_DOCUMENTS'",
                (rs,row)->rs.getObject(1,UUID.class),policyId).stream().findFirst().orElseThrow(ApiException::notFound);
    }

    @org.springframework.transaction.annotation.Transactional
    public List<AutomaticCandidate> scanAutomatic(int limit) {
        var cursor=jdbc.queryForObject("select last_deleted_at,last_resource_id from nite_connect.document_purge_scan_state where id=true for update",
                (rs,row)->new Object[]{rs.getTimestamp(1).toInstant(),rs.getObject(2,UUID.class)});
        var rows=jdbc.query("""
                select id,deleted_at from (
                  select d.id,d.deleted_at from nite_connect.documents d
                    left join nite_connect.document_folders parent on parent.id=d.folder_id
                    where d.lifecycle_state='TRASHED' and d.archived_at is null
                      and (parent.id is null or parent.trash_batch_id is distinct from d.trash_batch_id)
                  union all
                  select f.id,f.deleted_at from nite_connect.document_folders f
                    left join nite_connect.document_folders parent on parent.id=f.parent_id
                    where f.lifecycle_state='TRASHED' and f.archived_at is null
                      and (parent.id is null or parent.trash_batch_id is distinct from f.trash_batch_id)
                ) roots where deleted_at<=clock_timestamp()-interval '30 days'
                  and (deleted_at,id)>(?::timestamptz,?::uuid)
                order by deleted_at,id limit ?
                """,(rs,row)->new AutomaticCandidate(rs.getObject(1,UUID.class),rs.getTimestamp(2).toInstant()),
                java.sql.Timestamp.from((Instant)cursor[0]),cursor[1],limit);
        if(rows.isEmpty()) jdbc.update("""
                update nite_connect.document_purge_scan_state set last_deleted_at='1970-01-01T00:00:00Z',
                  last_resource_id='00000000-0000-0000-0000-000000000000',updated_at=clock_timestamp() where id=true
                """);
        else jdbc.update("update nite_connect.document_purge_scan_state set last_deleted_at=?,last_resource_id=?,updated_at=clock_timestamp() where id=true",
                java.sql.Timestamp.from(rows.getLast().deletedAt()),rows.getLast().id());
        return rows;
    }

    public boolean operationResourcesStillEligible(UUID operationId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from nite_connect.document_purge_operations o
                  join nite_connect.document_retention_policies p on p.id=o.policy_id
                  where o.id=? and p.enabled and p.policy_key='NITE_DOCUMENTS' and p.approved_by is not null and p.approved_at is not null
                    and exists(select 1 from nite_connect.document_purge_activation a where a.id=true and a.enabled)
                    and p.minimum_trash_days=30 and p.scope='GLOBAL'
                    and p.effective_from<=clock_timestamp() and (p.effective_until is null or p.effective_until>clock_timestamp())
                    and not exists(
                      select 1 from nite_connect.document_purge_operation_items i
                      left join nite_connect.documents d on i.resource_type='DOCUMENT' and d.id=i.resource_id
                      left join nite_connect.document_folders f on i.resource_type='FOLDER' and f.id=i.resource_id
                      where i.operation_id=o.id and (i.resource_type='DOCUMENT' and
                        (d.id is null or d.lifecycle_state<>'PURGE_PENDING' or d.archived_at is not null
                          or d.retention_hold or d.resource_owner_kind='UNKNOWN'
                          or not ((d.resource_owner_kind='MEMBER' and d.protection='NONE' and d.space_owner_id=d.created_by
                              and (o.operation_type='AUTO' or (d.space_owner_id=o.actor_id and exists
                                (select 1 from nite_connect.members m where m.id=o.actor_id and m.status='ATIVO'))))
                            or (d.resource_owner_kind in ('INSTITUTION','PROJECT') and exists
                              (select 1 from nite_connect.role_assignments r join nite_connect.members m on m.id=r.member_id
                                where r.member_id=o.actor_id and m.status='ATIVO')))
                          or ((o.operation_type='AUTO' or (d.resource_owner_kind='INSTITUTION' and d.space_owner_id is null))
                            and d.deleted_at+make_interval(days=>30)>clock_timestamp()))
                        or i.resource_type='FOLDER' and
                        (f.id is null or f.lifecycle_state<>'PURGE_PENDING' or f.archived_at is not null
                          or f.retention_hold or f.resource_owner_kind='UNKNOWN'
                          or not ((f.resource_owner_kind='MEMBER' and f.protection='NONE' and f.space_owner_id=f.created_by
                              and (o.operation_type='AUTO' or (f.space_owner_id=o.actor_id and exists
                                (select 1 from nite_connect.members m where m.id=o.actor_id and m.status='ATIVO'))))
                            or (f.resource_owner_kind in ('INSTITUTION','PROJECT') and exists
                              (select 1 from nite_connect.role_assignments r join nite_connect.members m on m.id=r.member_id
                                where r.member_id=o.actor_id and m.status='ATIVO')))
                          or ((o.operation_type='AUTO' or (f.resource_owner_kind='INSTITUTION' and f.space_owner_id is null))
                            and f.deleted_at+make_interval(days=>30)>clock_timestamp()))
                    )))
                """,Boolean.class,operationId));
    }

    public void blockRemainingObjects(UUID operationId,String reasonCode) {
        jdbc.update("""
                update nite_connect.document_purge_objects o set state='BLOCKED_REFERENCE',last_error_code=?
                from nite_connect.document_purge_operation_items i where i.id=o.operation_item_id and i.operation_id=?
                  and o.state in ('PENDING','RETRY')
                """,reasonCode,operationId);
        jdbc.update("update nite_connect.document_purge_operations set status='PARTIAL',started_at=coalesce(started_at,clock_timestamp()),result_code=? where id=? and status in ('PENDING','PROCESSING','PARTIAL')",
                reasonCode,operationId);
    }

    /** Claims one object durably. The S3 call is deliberately made by the caller after this statement commits. */
    public java.util.Optional<PurgeObject> claimObject(UUID operationId) {
        var claimed=jdbc.query("""
                update nite_connect.document_purge_objects o set state='PROCESSING',attempts=attempts+1,last_attempt_at=clock_timestamp()
                where o.id=(select po.id from nite_connect.document_purge_objects po
                  join nite_connect.document_purge_operation_items i on i.id=po.operation_item_id
                  where i.operation_id=? and po.state in ('PENDING','RETRY') order by po.id for update of po skip locked limit 1)
                returning o.id,o.operation_item_id,o.object_id,o.storage_kind
                """,(rs,row)->new PurgeObject(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getObject(3,UUID.class),rs.getString(4)),operationId)
                .stream().findFirst();
        if(claimed.isPresent()) jdbc.update("update nite_connect.document_purge_operations set status='PROCESSING',started_at=coalesce(started_at,clock_timestamp()) where id=? and status in ('PENDING','PARTIAL','PROCESSING')",operationId);
        return claimed;
    }

    public void recoverStaleObjects(UUID operationId,java.time.Instant staleBefore) {
        jdbc.update("""
                update nite_connect.document_purge_objects o set state='RETRY',last_error_code='WORKER_INTERRUPTED'
                from nite_connect.document_purge_operation_items i
                where i.id=o.operation_item_id and i.operation_id=? and o.state='PROCESSING' and o.last_attempt_at<?
                """,operationId,java.sql.Timestamp.from(staleBefore));
    }

    public void requeueResolvedReferences(UUID operationId) {
        var blocked=jdbc.query("""
                select o.id,o.operation_item_id,o.object_id,o.storage_kind from nite_connect.document_purge_objects o
                join nite_connect.document_purge_operation_items i on i.id=o.operation_item_id
                where i.operation_id=? and o.state='BLOCKED_REFERENCE'
                """,(rs,row)->new PurgeObject(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getObject(3,UUID.class),rs.getString(4)),operationId);
        for(PurgeObject object:blocked) if(!hasExternalReference(object)) jdbc.update("""
                update nite_connect.document_purge_objects set state='RETRY',last_error_code=null
                where id=? and state='BLOCKED_REFERENCE'
                """,object.id());
    }

    public List<UUID> pendingOperations(int limit) {
        return jdbc.query("""
                select o.id from nite_connect.document_purge_operations o
                where o.status in ('PENDING','PARTIAL','PROCESSING') and exists(select 1 from nite_connect.document_retention_policies p
                  where p.id=o.policy_id and p.enabled and p.policy_key='NITE_DOCUMENTS' and p.minimum_trash_days=30
                    and exists(select 1 from nite_connect.document_purge_activation a where a.id=true and a.enabled)
                    and p.approved_by is not null and p.approved_at is not null
                    and p.effective_from<=clock_timestamp() and (p.effective_until is null or p.effective_until>clock_timestamp()))
                order by o.requested_at,o.id limit ?
                """,(rs,row)->rs.getObject(1,UUID.class),limit);
    }

    public boolean hasExternalReference(PurgeObject object) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(
                  select 1 from nite_connect.document_versions v join nite_connect.documents d on d.id=v.document_id
                  where v.object_id=(select object_id from nite_connect.document_purge_objects where id=?)
                    and not exists(select 1 from nite_connect.document_purge_operation_items i
                      where i.operation_id=(select operation_id from nite_connect.document_purge_operation_items where id=?)
                        and i.resource_type='DOCUMENT' and i.resource_id=d.id)
                ) or exists(select 1 from nite_connect.document_template_versions v
                  where v.object_id=(select object_id from nite_connect.document_purge_objects where id=?))
                or exists(select 1 from nite_connect.document_pdfs pdf
                  join nite_connect.document_versions v on v.id=pdf.version_id
                  where pdf.object_id=(select object_id from nite_connect.document_purge_objects where id=?)
                    and not exists(select 1 from nite_connect.document_purge_operation_items i
                      where i.operation_id=(select operation_id from nite_connect.document_purge_operation_items where id=?)
                        and i.resource_type='DOCUMENT' and i.resource_id=v.document_id))
                or exists(select 1 from nite_connect.document_purge_operation_items i
                  join nite_connect.diaries d on d.document_id=i.resource_id
                  where i.id=? and i.resource_type='DOCUMENT')
                or exists(select 1 from nite_connect.document_purge_operation_items i
                  join nite_connect.document_template_distributions d on d.document_id=i.resource_id
                  where i.id=? and i.resource_type='DOCUMENT')
                """,Boolean.class,object.id(),object.operationItemId(),object.id(),object.id(),object.operationItemId(),object.operationItemId(),object.operationItemId()));
    }

    public void finishObject(UUID objectId,String state,String errorCode) {
        jdbc.update("update nite_connect.document_purge_objects set state=?,purged_at=case when ?='PURGED' then clock_timestamp() end,last_error_code=? where id=? and state='PROCESSING'",
                state,state,errorCode,objectId);
    }

    public void finishOperationIfDone(UUID operationId) {
        boolean pending=Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from nite_connect.document_purge_objects o join nite_connect.document_purge_operation_items i on i.id=o.operation_item_id
                  where i.operation_id=? and o.state in ('PENDING','PROCESSING','RETRY'))
                """,Boolean.class,operationId));
        boolean blocked=Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from nite_connect.document_purge_objects o join nite_connect.document_purge_operation_items i on i.id=o.operation_item_id
                  where i.operation_id=? and o.state in ('BLOCKED_REFERENCE','FAILED'))
                """,Boolean.class,operationId));
        if(pending) {
            jdbc.update("update nite_connect.document_purge_operations set status='PARTIAL',started_at=coalesce(started_at,clock_timestamp()) where id=? and status in ('PENDING','PROCESSING','PARTIAL')",operationId);
            return;
        }
        if(blocked) {
            jdbc.update("update nite_connect.document_purge_operations set status='PARTIAL',started_at=coalesce(started_at,clock_timestamp()),result_code='REFERENCE_OR_OBJECT_BLOCKED' where id=? and status in ('PENDING','PROCESSING','PARTIAL')",operationId);
            jdbc.update("update nite_connect.document_purge_operation_items i set state='PARTIAL' where i.operation_id=? and exists(select 1 from nite_connect.document_purge_objects o where o.operation_item_id=i.id and o.state in ('BLOCKED_REFERENCE','FAILED'))",operationId);
            return;
        }
        jdbc.update("update nite_connect.document_purge_operation_items set state='PURGED' where operation_id=? and state in ('PENDING','PROCESSING','PARTIAL')",operationId);
        jdbc.update("""
                update nite_connect.documents d set lifecycle_state='PURGED',purged_at=clock_timestamp(),purge_operation_id=?
                where exists(select 1 from nite_connect.document_purge_operation_items i where i.operation_id=? and i.resource_type='DOCUMENT' and i.resource_id=d.id)
                  and d.lifecycle_state='PURGE_PENDING'
                """,operationId,operationId);
        jdbc.update("""
                update nite_connect.document_folders f set lifecycle_state='PURGED',purged_at=clock_timestamp(),purge_operation_id=?
                where exists(select 1 from nite_connect.document_purge_operation_items i where i.operation_id=? and i.resource_type='FOLDER' and i.resource_id=f.id)
                  and f.lifecycle_state='PURGE_PENDING'
                """,operationId,operationId);
        jdbc.update("""
                insert into nite_connect.document_purge_tombstones(id,operation_id,resource_id,resource_type,actor_id,policy_id,policy_hash,object_count,removed_bytes)
                select gen_random_uuid(),o.id,i.resource_id,i.resource_type,o.actor_id,o.policy_id,p.policy_hash,
                  (select count(*) from nite_connect.document_purge_objects x where x.operation_item_id=i.id and x.state='PURGED'),
                  (select coalesce(sum(x.estimated_bytes),0) from nite_connect.document_purge_objects x where x.operation_item_id=i.id and x.state='PURGED')
                from nite_connect.document_purge_operation_items i join nite_connect.document_purge_operations o on o.id=i.operation_id
                  left join nite_connect.document_retention_policies p on p.id=o.policy_id
                where o.id=? and not exists(select 1 from nite_connect.document_purge_tombstones t where t.resource_id=i.resource_id and t.resource_type=i.resource_type)
                """,operationId);
        jdbc.update("update nite_connect.document_purge_operations set status='COMPLETED',finished_at=clock_timestamp(),result_code='PURGED' where id=? and status in ('PENDING','PROCESSING','PARTIAL')",operationId);
    }
}
