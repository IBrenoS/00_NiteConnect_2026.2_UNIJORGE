package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.documents.domain.DocxIntegrity;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.security.AdministrativeTransactions;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/** A request is a narrow, revocable upload capability, never a folder grant. */
@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentFileRequestService {
    private static final int MAX_RECIPIENTS=50;
    private static final int MAX_UPLOADS=100;
    private static final long MAX_BYTES=32L*1024*1024;
    private final JdbcTemplate jdbc;
    private final AccessService access;
    private final DocumentCapabilityService capabilities;
    private final DocumentLibraryRepository folders;
    private final DocumentLibraryService library;
    private final AdministrativeTransactions transactions;
    public DocumentFileRequestService(JdbcTemplate jdbc,AccessService access,DocumentCapabilityService capabilities,
            DocumentLibraryRepository folders,DocumentLibraryService library,AdministrativeTransactions transactions) {
        this.jdbc=jdbc;this.access=access;this.capabilities=capabilities;
        this.folders=folders;this.library=library;this.transactions=transactions;
    }
    public record Create(UUID targetFolderId,List<UUID> recipientIds,Instant dueAt) {}
    public record Upload(UUID documentId,String name,long size,UUID uploadedBy,Instant uploadedAt) {}
    public record Event(String action,UUID actorId,Instant occurredAt,UUID documentId) {}
    public record View(UUID id,UUID requestedBy,UUID targetFolderId,String targetFolderName,List<UUID> recipientIds,
                       String status,Instant dueAt,Instant createdAt,Instant cancelledAt,List<Upload> uploads,List<Event> events) {}
    public record Page(List<View> items,int limit,int offset,boolean hasMore) {}
    private record Row(UUID id,UUID requester,UUID folder,String name,String status,Instant due,Instant created,Instant cancelled) {}
    private static Row map(ResultSet rs,int row) throws SQLException {
        Timestamp due=rs.getTimestamp("due_at"),cancelled=rs.getTimestamp("cancelled_at");
        return new Row(rs.getObject("id",UUID.class),rs.getObject("requested_by",UUID.class),
                rs.getObject("target_folder_id",UUID.class),rs.getString("target_name"),rs.getString("status"),
                due==null?null:due.toInstant(),rs.getTimestamp("created_at").toInstant(),
                cancelled==null?null:cancelled.toInstant());
    }
    private static final String SELECT="""
            select r.*,f.name target_name from nite_connect.document_file_requests r
            join nite_connect.document_folders f on f.id=r.target_folder_id
            """;
    private Row row(UUID id) {
        return jdbc.query(SELECT+" where r.id=?",DocumentFileRequestService::map,id)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }
    private boolean recipient(UUID request,UUID actor) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from nite_connect.document_file_request_recipients where request_id=? and member_id=?)",
                Boolean.class,request,actor));
    }
    private View visible(UUID actor,Row row) {
        boolean requester=actor.equals(row.requester());
        if(!requester&&!recipient(row.id(),actor)) throw ApiException.notFound();
        String state="OPEN".equals(row.status())&&row.due()!=null&&!row.due().isAfter(Instant.now())?"EXPIRED":row.status();
        List<UUID> recipients=requester?jdbc.query("select member_id from nite_connect.document_file_request_recipients where request_id=? order by member_id",
                (rs,index)->rs.getObject(1,UUID.class),row.id()):List.of(actor);
        List<Upload> uploads=jdbc.query("""
                select u.document_id,d.title,v.size,u.uploaded_by,u.created_at
                from nite_connect.document_file_request_uploads u
                join nite_connect.documents d on d.id=u.document_id
                join nite_connect.document_versions v on v.id=d.current_version_id
                where u.request_id=? and (? or u.uploaded_by=?)
                order by u.created_at desc,u.id desc limit 100
                """,(rs,index)->new Upload(rs.getObject(1,UUID.class),rs.getString(2),rs.getLong(3),
                rs.getObject(4,UUID.class),rs.getTimestamp(5).toInstant()),row.id(),requester,actor);
        List<Event> events=jdbc.query("""
                select action,actor_id,occurred_at,document_id from nite_connect.document_file_request_events
                where request_id=? and (? or actor_id=? or action in ('CREATED','CANCELLED'))
                order by occurred_at desc,id desc limit 100
                """,(rs,index)->new Event(rs.getString(1),rs.getObject(2,UUID.class),rs.getTimestamp(3).toInstant(),
                rs.getObject(4,UUID.class)),row.id(),requester,actor);
        return new View(row.id(),row.requester(),requester?row.folder():null,requester?row.name():null,
                recipients,state,row.due(),row.created(),row.cancelled(),uploads,events);
    }
    private void event(UUID id,UUID actor,String action,UUID document) {
        jdbc.update("insert into nite_connect.document_file_request_events(id,request_id,actor_id,action,document_id) values (?,?,?,?,?)",
                UUID.randomUUID(),id,actor,action,document);
    }
    @Transactional
    public View create(UUID actor,Create input) {
        access.requireActive(actor);
        if(input==null||input.targetFolderId()==null||input.recipientIds()==null||input.recipientIds().isEmpty()
                ||input.recipientIds().size()>MAX_RECIPIENTS) throw ApiException.invalid("Destino e 1 a 50 destinatários são obrigatórios");
        if(input.dueAt()!=null&&!input.dueAt().isAfter(Instant.now())) throw ApiException.invalid("Prazo deve estar no futuro");
        LinkedHashSet<UUID> recipients=new LinkedHashSet<>(input.recipientIds());
        if(recipients.size()!=input.recipientIds().size()||recipients.contains(null)) throw ApiException.invalid("Destinatários repetidos ou inválidos");
        var folder=folders.folder(input.targetFolderId());
        capabilities.requireAdd(actor,folder);
        for(UUID member:recipients) access.requireActive(member);
        transactions.lock();
        UUID id=UUID.randomUUID();
        jdbc.update("insert into nite_connect.document_file_requests(id,requested_by,target_folder_id,due_at) values (?,?,?,?)",
                id,actor,input.targetFolderId(),input.dueAt()==null?null:Timestamp.from(input.dueAt()));
        for(UUID member:recipients) jdbc.update("insert into nite_connect.document_file_request_recipients(request_id,member_id) values (?,?)",id,member);
        event(id,actor,"CREATED",null);
        return visible(actor,row(id));
    }
    @Transactional(readOnly=true)
    public View get(UUID actor,UUID id) {
        access.requireActive(actor);
        return visible(actor,row(id));
    }
    @Transactional(readOnly=true)
    public Page list(UUID actor,String role,int limit,int offset) {
        access.requireActive(actor);
        if(limit<1||limit>100||offset<0) throw ApiException.invalid("Paginação inválida");
        if(!Set.of("REQUESTED","RECEIVED").contains(role)) throw ApiException.invalid("Perspectiva inválida");
        String condition="REQUESTED".equals(role)?"r.requested_by=?":"exists(select 1 from nite_connect.document_file_request_recipients x where x.request_id=r.id and x.member_id=?)";
        var rows=jdbc.query(SELECT+" where "+condition+" order by r.created_at desc,r.id desc limit ? offset ?",
                DocumentFileRequestService::map,actor,limit+1,offset);
        return new Page(rows.stream().limit(limit).map(row->visible(actor,row)).toList(),limit,offset,rows.size()>limit);
    }
    @Transactional
    public View cancel(UUID actor,UUID id) {
        access.requireActive(actor);transactions.lock();
        Row current=row(id);
        if(!actor.equals(current.requester())) throw ApiException.notFound();
        if(!"OPEN".equals(current.status())) throw ApiException.conflict("Solicitação já encerrada");
        jdbc.update("update nite_connect.document_file_requests set status='CANCELLED',cancelled_by=?,cancelled_at=clock_timestamp() where id=? and status='OPEN'",actor,id);
        event(id,actor,"CANCELLED",null);
        return visible(actor,row(id));
    }
    @Transactional
    public Upload upload(UUID actor,UUID id,String title,String mime,byte[] bytes) {
        access.requireActive(actor);transactions.lock();
        Row request=row(id);
        if(!recipient(id,actor)) throw ApiException.notFound();
        if(!"OPEN".equals(request.status())||request.due()!=null&&!request.due().isAfter(Instant.now()))
            throw ApiException.conflict("Solicitação encerrada");
        capabilities.requireAdd(request.requester(),folders.folder(request.folder()));
        if(bytes==null||bytes.length==0||bytes.length>DocxIntegrity.MAX_BYTES) throw ApiException.invalid("Arquivo inválido ou acima de 8 MiB");
        String clean=title==null?"":title.strip();
        if(clean.isEmpty()||clean.length()>190||clean.contains("/")||clean.contains("\\")||clean.chars().anyMatch(Character::isISOControl))
            throw ApiException.invalid("Nome inválido");
        String hash=DocxIntegrity.sha256(bytes);
        var prior=jdbc.query("""
                select u.document_id,d.title,v.size,v.sha256,u.created_at from nite_connect.document_file_request_uploads u
                join nite_connect.documents d on d.id=u.document_id and d.lifecycle_state='ACTIVE'
                join nite_connect.document_versions v on v.id=d.current_version_id
                where u.request_id=? and u.uploaded_by=? and lower(btrim(d.title))=lower(btrim(?))
                """,(rs,index)->new Object[]{rs.getObject(1,UUID.class),rs.getString(2),rs.getLong(3),rs.getString(4),rs.getTimestamp(5).toInstant()},id,actor,clean);
        if(!prior.isEmpty()) {
            Object[] existing=prior.getFirst();
            if((long)existing[2]==bytes.length&&hash.equals(existing[3]))
                return new Upload((UUID)existing[0],(String)existing[1],bytes.length,actor,(Instant)existing[4]);
            throw ApiException.conflict("Arquivo com esse nome já enviado à solicitação");
        }
        Long count=jdbc.queryForObject("select count(*) from nite_connect.document_file_request_uploads where request_id=?",Long.class,id);
        Long size=jdbc.queryForObject("""
                select coalesce(sum(v.size),0) from nite_connect.document_file_request_uploads u
                join nite_connect.documents d on d.id=u.document_id
                join nite_connect.document_versions v on v.id=d.current_version_id where u.request_id=?
                """,Long.class,id);
        if(count==null||size==null||count>=MAX_UPLOADS||size+bytes.length>MAX_BYTES)
            throw ApiException.invalid("Solicitação excede 100 arquivos ou 32 MiB");
        UUID document=library.uploadRequested(actor,request.requester(),request.folder(),id,clean,mime,bytes);
        jdbc.update("insert into nite_connect.document_file_request_uploads(id,request_id,document_id,uploaded_by) values (?,?,?,?)",
                UUID.randomUUID(),id,document,actor);
        event(id,actor,"UPLOADED",document);
        return new Upload(document,clean,bytes.length,actor,Instant.now());
    }
}
