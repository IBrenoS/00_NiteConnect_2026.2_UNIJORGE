package br.edu.unijorge.niteconnect.documents.infrastructure;

import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public class DocumentRepository {
    private final JdbcTemplate jdbc;
    public DocumentRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Document(UUID id, String title, UUID ownerId, String context, long version,
                           UUID versionId, UUID objectId, long size, String sha256, Instant versionAt, UUID folderId, UUID projectId, String mimeType, boolean storedAsAsset) {}
    public record Session(UUID documentId, UUID actorId, UUID sourceVersionId, boolean canWrite, Instant expiresAt) {}
    public record WopiLock(String value, Instant expiresAt,UUID actorId) {}

    private static Document map(ResultSet rs, int row) throws SQLException {
        return new Document(rs.getObject("id", UUID.class), rs.getString("title"),
                rs.getObject("owner_id", UUID.class), rs.getString("context"), rs.getLong("version"),
                rs.getObject("version_id", UUID.class), rs.getObject("object_id", UUID.class),
                rs.getLong("size"), rs.getString("sha256"), rs.getTimestamp("version_at").toInstant(),
                rs.getObject("folder_id", UUID.class), rs.getObject("project_id",UUID.class),rs.getString("mime_type"),rs.getBoolean("stored_as_asset"));
    }
    private static final String SELECT = """
            select d.id, d.title, d.owner_id, d.context, d.version,
                   v.id version_id, v.object_id, v.size, v.sha256, v.created_at version_at, d.folder_id, d.project_id, d.mime_type, d.stored_as_asset
            from nite_connect.documents d join nite_connect.document_versions v on v.id=d.current_version_id
            where d.id=? and d.archived_at is null
            """;

    public Document require(UUID id) {
        return jdbc.query(SELECT, DocumentRepository::map, id).stream().findFirst().orElseThrow(ApiException::notFound);
    }
    /** Serialized with other writers; a WOPI lock alone is not an SQL write barrier. */
    public Document forUpdate(UUID id) {
        return jdbc.query(SELECT + " for update of d", DocumentRepository::map, id)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }
    public List<Document> own(UUID owner) {
        return jdbc.query("""
                select d.id, d.title, d.owner_id, d.context, d.version,
                       v.id version_id, v.object_id, v.size, v.sha256, v.created_at version_at, d.folder_id, d.project_id, d.mime_type, d.stored_as_asset
                from nite_connect.documents d join nite_connect.document_versions v on v.id=d.current_version_id
                where d.context='PERSONAL' and d.owner_id=? and d.archived_at is null
                order by d.created_at desc,d.id
                """, DocumentRepository::map, owner);
    }
    public void create(UUID id, String title, UUID owner, UUID object, long size, String hash) {
        createInFolder(id,title,"PERSONAL",owner,null,null,"application/vnd.openxmlformats-officedocument.wordprocessingml.document",false,object,size,hash,owner,null);
    }
    public void createInFolder(UUID id,String title,String context,UUID owner,UUID project,UUID folder,String mime,boolean asset,UUID object,long size,String hash,UUID actor,UUID templateVersion) {
        UUID version = UUID.randomUUID();
        jdbc.update("""
                insert into nite_connect.documents(id,title,context,owner_id,project_id,folder_id,mime_type,stored_as_asset,template_version_id,official,version,created_by,modified_by)
                values (?,?,?,?,?,?,?,?,?,false,0,?,?)
                """, id, title, context, owner, project, folder, mime, asset, templateVersion, actor, actor);
        jdbc.update("""
                insert into nite_connect.document_versions
                (id,document_id,revision,object_id,size,sha256,status,created_by) values (?,?,1,?, ?,?,'AVAILABLE',?)
                """, version,id,object,size,hash,actor);
        jdbc.update("update nite_connect.documents set current_version_id=?, version=1 where id=?",version,id);
        event(id, actor, "DOCUMENT_CREATED", version, "Documento criado na biblioteca");
    }
    public UUID promote(Document before, UUID objectId, long size, String hash, UUID actor) {
        UUID versionId = UUID.randomUUID();
        long revision = before.version()+1;
        jdbc.update("""
                insert into nite_connect.document_versions
                (id,document_id,revision,object_id,size,sha256,status,based_on,created_by)
                values (?,?,?,?,? ,?,'AVAILABLE',?,?)
                """, versionId,before.id(),revision,objectId,size,hash,before.versionId(),actor);
        int updated=jdbc.update("""
                update nite_connect.documents set current_version_id=?,version=?,modified_by=?,modified_at=clock_timestamp() where id=? and version=?
                """,versionId,revision,actor,before.id(),before.version());
        if(updated!=1) throw ApiException.conflict("Documento alterado durante salvamento");
        event(before.id(),actor,"WOPI_SAVED",versionId,"Conteúdo DOCX persistido");
        return versionId;
    }
    private void event(UUID document, UUID actor, String action, UUID reference, String reason) {
        jdbc.update("""
                insert into nite_connect.document_events(id,document_id,actor_id,action,reference_id,reason)
                values (?,?,?,?,?,?)
                """,UUID.randomUUID(),document,actor,action,reference,reason);
    }
    public void createSession(UUID document,UUID actor,UUID sourceVersion, String tokenHash,boolean canWrite,
                              Instant issued,Instant expires) {
        jdbc.update("""
                insert into nite_connect.document_wopi_sessions
                (id,document_id,actor_id,source_version_id,token_sha256,can_write,issued_at,expires_at)
                values (?,?,?,?,?,?,?,?)
                """, UUID.randomUUID(),document,actor,sourceVersion,tokenHash,
                canWrite,Timestamp.from(issued),Timestamp.from(expires));
    }
    public void advanceSession(UUID document,String tokenHash,UUID sourceVersion,UUID newVersion) {
        int updated=jdbc.update("""
                update nite_connect.document_wopi_sessions set source_version_id=?
                where document_id=? and token_sha256=? and source_version_id=? and revoked_at is null
                """, newVersion, document, tokenHash, sourceVersion);
        if(updated!=1) throw ApiException.conflict("Sessão de edição alterada; abra o documento novamente");
    }
    public void recordOpened(UUID document,UUID actor) {
        jdbc.update("update nite_connect.documents set last_opened_at=clock_timestamp(),last_opened_by=? where id=? and archived_at is null",actor,document);
    }
    public Session session(UUID document, String sha256, Instant now) {
        return jdbc.query("""
                select document_id,actor_id,source_version_id,can_write,expires_at from nite_connect.document_wopi_sessions
                where document_id=? and token_sha256=? and revoked_at is null and expires_at>?
                """,(rs,row)->new Session(rs.getObject("document_id",UUID.class),rs.getObject("actor_id",UUID.class),
                rs.getObject("source_version_id",UUID.class),rs.getBoolean("can_write"),
                rs.getTimestamp("expires_at").toInstant()), document,sha256,Timestamp.from(now))
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }
    public WopiLock lock(UUID document, Instant now) {
        return jdbc.query("""
                select lock_value,expires_at,actor_id from nite_connect.document_wopi_locks
                where document_id=? and expires_at>?
                """,(rs,row)->new WopiLock(rs.getString(1),rs.getTimestamp(2).toInstant(),rs.getObject(3,UUID.class)),document,Timestamp.from(now))
                .stream().findFirst().orElse(null);
    }
    public boolean lockOrRefresh(UUID doc,UUID actor,String requested, Instant now, Instant expires) {
        int changed=jdbc.update("""
                insert into nite_connect.document_wopi_locks(document_id,actor_id,lock_value,expires_at,changed_at)
                values (?,?,?,?,?) on conflict(document_id) do update
                set actor_id=excluded.actor_id,lock_value=excluded.lock_value,expires_at=excluded.expires_at,changed_at=excluded.changed_at
                where nite_connect.document_wopi_locks.expires_at<=?
                   or (nite_connect.document_wopi_locks.lock_value=? and nite_connect.document_wopi_locks.actor_id=excluded.actor_id)
                """,doc,actor,requested,Timestamp.from(expires),Timestamp.from(now),Timestamp.from(now),requested);
        return changed==1;
    }
    public boolean refresh(UUID doc,UUID actor,String requested,Instant now,Instant expires) {
        return jdbc.update("""
                update nite_connect.document_wopi_locks set expires_at=?,changed_at=?
                where document_id=? and actor_id=? and lock_value=? and expires_at>?
                """,Timestamp.from(expires),Timestamp.from(now),doc,actor,requested,Timestamp.from(now))==1;
    }
    public boolean relock(UUID doc,UUID actor,String oldLock,String newLock,Instant now,Instant expires) {
        return jdbc.update("""
                update nite_connect.document_wopi_locks set lock_value=?,expires_at=?,changed_at=?
                where document_id=? and actor_id=? and lock_value=? and expires_at>?
                """,newLock,Timestamp.from(expires),Timestamp.from(now),doc,actor,oldLock,Timestamp.from(now))==1;
    }
    public boolean unlock(UUID doc,UUID actor,String requested,Instant now) {
        return jdbc.update("delete from nite_connect.document_wopi_locks where document_id=? and actor_id=? and lock_value=? and expires_at>?",
                doc,actor,requested,Timestamp.from(now))==1;
    }
}
