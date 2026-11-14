package br.edu.unijorge.niteconnect.documents.infrastructure;

import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.Collections;
import java.util.UUID;

@Repository
public class DocumentSharingRepository {
    private final JdbcTemplate jdbc;

    public DocumentSharingRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }

    public record Share(UUID id,UUID documentId,UUID folderId,UUID memberId,String memberName,String permission,
                        UUID grantedBy,String grantedByName,Instant createdAt,Instant revokedAt) {
        public String targetType() { return documentId==null?"FOLDER":"DOCUMENT"; }
    }
    public record SharedItem(UUID grantId,UUID id,String type,String name,String permission,UUID ownerId,
                             String ownerName,UUID sharedBy,String sharedByName,Instant sharedAt,Instant modifiedAt,
                             Instant createdAt,String mimeType,Long size,String createdByName,String modifiedByName) {}
    public record SharedPage(List<SharedItem> items,boolean hasMore) {}
    public record Recipient(UUID id,String name) {}

    private static Share share(ResultSet rs,int row) throws SQLException {
        Timestamp revoked=rs.getTimestamp("revoked_at");
        return new Share(rs.getObject("id",UUID.class),rs.getObject("document_id",UUID.class),
                rs.getObject("folder_id",UUID.class),rs.getObject("member_id",UUID.class),rs.getString("member_name"),
                rs.getString("permission"),rs.getObject("granted_by",UUID.class),rs.getString("granted_by_name"),
                rs.getTimestamp("created_at").toInstant(),revoked==null?null:revoked.toInstant());
    }
    private static final String SHARE_COLUMNS="""
            select g.id,g.document_id,g.folder_id,g.member_id,m.name member_name,g.permission,
                   g.granted_by,issuer.name granted_by_name,g.created_at,g.revoked_at
            from nite_connect.document_grants g
            join nite_connect.members m on m.id=g.member_id
            join nite_connect.members issuer on issuer.id=g.granted_by
            """;

    public String documentPermission(UUID document,UUID member) {
        return jdbc.query("""
                with recursive ancestors(id,parent_id,depth) as (
                  select f.id,f.parent_id,0 from nite_connect.documents d join nite_connect.document_folders f on f.id=d.folder_id
                  where d.id=? and d.archived_at is null and f.archived_at is null
                  union all select p.id,p.parent_id,a.depth+1 from ancestors a
                    join nite_connect.document_folders p on p.id=a.parent_id and p.archived_at is null where a.depth<63
                )
                select g.permission from nite_connect.document_grants g
                join nite_connect.members m on m.id=g.member_id and m.status='ATIVO'
                where g.member_id=? and g.revoked_at is null and
                  (g.document_id=? or g.folder_id in (select id from ancestors))
                order by case g.permission when 'EDIT' then 2 else 1 end desc limit 1
                """,(rs,row)->rs.getString(1),document,member,document).stream().findFirst().orElse(null);
    }
    public String folderPermission(UUID folder,UUID member) {
        return jdbc.query("""
                with recursive ancestors(id,parent_id,depth) as (
                  select id,parent_id,0 from nite_connect.document_folders where id=? and archived_at is null
                  union all select p.id,p.parent_id,a.depth+1 from ancestors a
                    join nite_connect.document_folders p on p.id=a.parent_id and p.archived_at is null where a.depth<63
                )
                select g.permission from nite_connect.document_grants g
                join nite_connect.members m on m.id=g.member_id and m.status='ATIVO'
                where g.member_id=? and g.folder_id in (select id from ancestors) and g.revoked_at is null
                order by case g.permission when 'EDIT' then 2 else 1 end desc limit 1
                """,(rs,row)->rs.getString(1),folder,member).stream().findFirst().orElse(null);
    }
    public Map<UUID,String> folderPermissions(List<UUID> folderIds,UUID member) {
        if(folderIds.isEmpty()) return Map.of();
        String placeholders=String.join(",",Collections.nCopies(folderIds.size(),"?"));
        Object[] args=new Object[folderIds.size()+1];
        for(int index=0;index<folderIds.size();index++) args[index]=folderIds.get(index);
        args[folderIds.size()]=member;
        Map<UUID,String> result=new LinkedHashMap<>();
        jdbc.query("""
                with recursive ancestors(target_id,id,parent_id,depth) as (
                  select f.id,f.id,f.parent_id,0 from nite_connect.document_folders f where f.id in (%s)
                  union all select a.target_id,p.id,p.parent_id,a.depth+1 from ancestors a
                    join nite_connect.document_folders p on p.id=a.parent_id and p.archived_at is null where a.depth<63
                )
                select a.target_id,case max(case g.permission when 'EDIT' then 2 else 1 end) when 2 then 'EDIT' else 'VIEW' end permission
                from ancestors a join nite_connect.document_grants g on g.folder_id=a.id and g.member_id=? and g.revoked_at is null
                join nite_connect.members m on m.id=g.member_id and m.status='ATIVO'
                group by a.target_id
                """.formatted(placeholders),(rs,row)->Map.entry(rs.getObject(1,UUID.class),rs.getString(2)),args)
                .forEach(entry->result.put(entry.getKey(),entry.getValue()));
        return Map.copyOf(result);
    }
    public Map<UUID,String> documentPermissions(List<UUID> documentIds,UUID member) {
        if(documentIds.isEmpty()) return Map.of();
        String placeholders=String.join(",",Collections.nCopies(documentIds.size(),"?"));
        Object[] args=new Object[documentIds.size()+1];
        for(int index=0;index<documentIds.size();index++) args[index]=documentIds.get(index);
        args[documentIds.size()]=member;
        Map<UUID,String> result=new LinkedHashMap<>();
        jdbc.query("""
                with recursive ancestors(target_id,id,parent_id,depth) as (
                  select d.id,f.id,f.parent_id,0 from nite_connect.documents d
                    join nite_connect.document_folders f on f.id=d.folder_id
                  where d.id in (%s) and d.archived_at is null
                  union all select a.target_id,p.id,p.parent_id,a.depth+1 from ancestors a
                    join nite_connect.document_folders p on p.id=a.parent_id and p.archived_at is null where a.depth<63
                )
                select a.target_id,case max(case g.permission when 'EDIT' then 2 else 1 end) when 2 then 'EDIT' else 'VIEW' end permission
                from ancestors a join nite_connect.document_grants g
                  on g.member_id=? and g.revoked_at is null and (g.document_id=a.target_id or g.folder_id=a.id)
                join nite_connect.members m on m.id=g.member_id and m.status='ATIVO'
                group by a.target_id
                """.formatted(placeholders),(rs,row)->Map.entry(rs.getObject(1,UUID.class),rs.getString(2)),args)
                .forEach(entry->result.put(entry.getKey(),entry.getValue()));
        return Map.copyOf(result);
    }
    /** Returns the outermost shared ancestor, the boundary within which parent links may be shown. */
    public UUID sharedBoundary(UUID folder,UUID member) {
        return jdbc.query("""
                with recursive ancestors(id,parent_id,depth) as (
                  select id,parent_id,0 from nite_connect.document_folders where id=? and archived_at is null
                  union all select p.id,p.parent_id,a.depth+1 from ancestors a
                    join nite_connect.document_folders p on p.id=a.parent_id and p.archived_at is null where a.depth<63
                )
                select a.id from ancestors a join nite_connect.document_grants g on g.folder_id=a.id
                join nite_connect.members m on m.id=g.member_id and m.status='ATIVO'
                where g.member_id=? and g.revoked_at is null order by a.depth desc limit 1
                """,(rs,row)->rs.getObject(1,UUID.class),folder,member).stream().findFirst().orElse(null);
    }
    public boolean hasFolderGrantOnPath(UUID folder) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                with recursive ancestors(id,parent_id) as (
                  select id,parent_id from nite_connect.document_folders where id=? and archived_at is null
                  union all select p.id,p.parent_id from ancestors a join nite_connect.document_folders p on p.id=a.parent_id and p.archived_at is null
                ) select exists(select 1 from nite_connect.document_grants g join ancestors a on a.id=g.folder_id
                    join nite_connect.members m on m.id=g.member_id and m.status='ATIVO' where g.revoked_at is null)
                """,Boolean.class,folder));
    }
    public boolean hasDirectDocumentGrant(UUID document) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from nite_connect.document_grants g join nite_connect.members m on m.id=g.member_id and m.status='ATIVO' where g.document_id=? and g.revoked_at is null)",Boolean.class,document));
    }
    public boolean hasGrantInFolderSubtree(UUID folder) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                with recursive tree(id) as (
                  select id from nite_connect.document_folders where id=? and archived_at is null
                  union all select f.id from nite_connect.document_folders f join tree t on f.parent_id=t.id where f.archived_at is null
                ) select exists(
                    select 1 from nite_connect.document_grants g join nite_connect.members m on m.id=g.member_id and m.status='ATIVO'
                      where g.revoked_at is null and (g.folder_id in (select id from tree) or g.document_id in (
                        select d.id from nite_connect.documents d join tree t on t.id=d.folder_id and d.archived_at is null)))
                """,Boolean.class,folder));
    }

    public Share grant(UUID document,UUID folder,UUID member,String permission,UUID actor) {
        if(permission==null || !List.of("VIEW","EDIT").contains(permission)) throw ApiException.invalid("Permissão documental inválida");
        UUID id=UUID.randomUUID();
        jdbc.update("""
                insert into nite_connect.document_grants(id,document_id,folder_id,member_id,permission,can_edit,granted_by)
                values (?,?,?,?,?,?,?)
                """,id,document,folder,member,permission,"EDIT".equals(permission),actor);
        event(document,folder,actor,member,"SHARE_GRANTED",permission);
        return require(id);
    }
    public Share change(UUID id,String permission,UUID actor) {
        Share old=requireActive(id);
        if(old.permission().equals(permission)) return old;
        lockAffected(old.documentId(),old.folderId());
        jdbc.update("update nite_connect.document_grants set revoked_at=clock_timestamp() where id=? and revoked_at is null",id);
        revokeSessions(old.documentId(),old.folderId(),old.memberId());
        UUID next=UUID.randomUUID();
        jdbc.update("""
                insert into nite_connect.document_grants(id,document_id,folder_id,member_id,permission,can_edit,granted_by)
                values (?,?,?,?,?,?,?)
                """,next,old.documentId(),old.folderId(),old.memberId(),permission,"EDIT".equals(permission),actor);
        event(old.documentId(),old.folderId(),actor,old.memberId(),"SHARE_CHANGED",permission);
        return require(next);
    }
    public void revoke(UUID id,UUID actor) {
        Share old=requireActive(id);
        lockAffected(old.documentId(),old.folderId());
        jdbc.update("update nite_connect.document_grants set revoked_at=clock_timestamp() where id=? and revoked_at is null",id);
        revokeSessions(old.documentId(),old.folderId(),old.memberId());
        event(old.documentId(),old.folderId(),actor,old.memberId(),"SHARE_REVOKED",old.permission());
    }
    private void lockAffected(UUID document,UUID folder) {
        List<UUID> ids=document!=null?List.of(document):jdbc.query("""
                with recursive tree(id) as (
                  select id from nite_connect.document_folders where id=? and archived_at is null
                  union all select f.id from nite_connect.document_folders f join tree t on f.parent_id=t.id where f.archived_at is null
                ) select d.id from nite_connect.documents d join tree t on t.id=d.folder_id
                  where d.archived_at is null order by d.id
                """,(rs,row)->rs.getObject(1,UUID.class),folder);
        for(UUID id:ids) jdbc.query("select id from nite_connect.documents where id=? for update",(rs,row)->rs.getObject(1,UUID.class),id);
    }
    private void revokeSessions(UUID document,UUID folder,UUID recipient) {
        if(document!=null) {
            jdbc.update("update nite_connect.document_wopi_sessions set revoked_at=clock_timestamp() where document_id=? and actor_id=? and revoked_at is null",document,recipient);
            jdbc.update("delete from nite_connect.document_wopi_locks where document_id=? and actor_id=?",document,recipient);
            return;
        }
        jdbc.update("""
                with recursive tree(id) as (
                  select id from nite_connect.document_folders where id=?
                  union all select f.id from nite_connect.document_folders f join tree t on f.parent_id=t.id
                ) update nite_connect.document_wopi_sessions s set revoked_at=clock_timestamp()
                  where s.actor_id=? and s.revoked_at is null and s.document_id in
                    (select d.id from nite_connect.documents d join tree t on t.id=d.folder_id)
                """,folder,recipient);
        jdbc.update("""
                with recursive tree(id) as (
                  select id from nite_connect.document_folders where id=?
                  union all select f.id from nite_connect.document_folders f join tree t on f.parent_id=t.id
                ) delete from nite_connect.document_wopi_locks l where l.actor_id=? and l.document_id in
                    (select d.id from nite_connect.documents d join tree t on t.id=d.folder_id)
                """,folder,recipient);
    }
    private void event(UUID document,UUID folder,UUID actor,UUID recipient,String action,String permission) {
        jdbc.update("""
                insert into nite_connect.document_share_events(id,document_id,folder_id,actor_id,recipient_id,action,permission)
                values (?,?,?,?,?,?,?)
                """,UUID.randomUUID(),document,folder,actor,recipient,action,permission);
    }
    public Share require(UUID id) {
        return jdbc.query(SHARE_COLUMNS+" where g.id=?",DocumentSharingRepository::share,id).stream().findFirst().orElseThrow(ApiException::notFound);
    }
    public Share requireActive(UUID id) {
        return jdbc.query(SHARE_COLUMNS+" where g.id=? and g.revoked_at is null",DocumentSharingRepository::share,id)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }
    public List<Share> shares(UUID document,UUID folder) {
        return jdbc.query(SHARE_COLUMNS+" where g.revoked_at is null and g.document_id is not distinct from ? and g.folder_id is not distinct from ? order by g.created_at,g.id",
                DocumentSharingRepository::share,document,folder);
    }
    public List<Recipient> recipients(UUID actor,String search,int limit) {
        return jdbc.query("""
                select id,name from nite_connect.members where status='ATIVO' and id<>?
                  and lower(name) like ? escape E'\\\\'
                order by lower(name),id limit ?
                """,(rs,row)->new Recipient(rs.getObject(1,UUID.class),rs.getString(2)),actor,"%"+
                search.toLowerCase(java.util.Locale.ROOT).replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%",limit);
    }
    public SharedPage received(UUID member,String search,String mimeType,String sortBy,String direction,
                               String afterKey,UUID afterId,int limit) {
        String sortExpression=switch(sortBy) {
            case "name" -> "lower(name)";
            case "modifiedAt" -> "coalesce(modified_at,shared_at)";
            case "createdAt" -> "created_at";
            case "size" -> "coalesce(size,-1)";
            default -> "shared_at";
        };
        String comparison="asc".equals(direction)?">":"<";
        String cursorClause=afterKey==null?"": "and ("+sortExpression+",grant_id) "+comparison+" (?,?)";
        Object cursorKey=afterKey==null?null:switch(sortBy) {
            case "name" -> afterKey.toLowerCase(java.util.Locale.ROOT);
            case "size" -> Long.parseLong(afterKey);
            default -> Timestamp.from(Instant.parse(afterKey));
        };
        String sql="""
                with received as (
                  select g.id grant_id,d.id,'DOCUMENT' item_type,d.title name,g.permission,d.owner_id,o.name owner_name,
                         g.granted_by,s.name shared_by_name,g.created_at shared_at,d.modified_at,d.created_at,
                         d.mime_type,v.size,creator.name created_by_name,modifier.name modified_by_name
                  from nite_connect.document_grants g join nite_connect.documents d on d.id=g.document_id and d.archived_at is null
                  join nite_connect.document_versions v on v.id=d.current_version_id
                  left join nite_connect.members o on o.id=d.owner_id join nite_connect.members s on s.id=g.granted_by
                  left join nite_connect.members creator on creator.id=d.created_by left join nite_connect.members modifier on modifier.id=d.modified_by
                  where g.member_id=? and g.revoked_at is null and g.document_id is not null and not exists (
                    with recursive ancestors(id,parent_id) as (
                      select f.id,f.parent_id from nite_connect.document_folders f where f.id=d.folder_id and f.archived_at is null
                      union all select p.id,p.parent_id from ancestors a join nite_connect.document_folders p on p.id=a.parent_id and p.archived_at is null
                    ) select 1 from ancestors a join nite_connect.document_grants inherited on inherited.folder_id=a.id
                      where inherited.member_id=g.member_id and inherited.revoked_at is null)
                  union all
                  select g.id grant_id,f.id,'FOLDER',f.name,g.permission,f.owner_id,o.name,
                         g.granted_by,s.name,g.created_at,f.modified_at,f.created_at,null::varchar,null::bigint,creator.name,modifier.name
                  from nite_connect.document_grants g join nite_connect.document_folders f on f.id=g.folder_id and f.archived_at is null
                  left join nite_connect.members o on o.id=f.owner_id join nite_connect.members s on s.id=g.granted_by
                  left join nite_connect.members creator on creator.id=f.created_by left join nite_connect.members modifier on modifier.id=f.modified_by
                  where g.member_id=? and g.revoked_at is null and g.folder_id is not null and not exists (
                    with recursive ancestors(id,parent_id) as (
                      select parent.id,parent.parent_id from nite_connect.document_folders current
                        join nite_connect.document_folders parent on parent.id=current.parent_id
                      where current.id=f.id and parent.archived_at is null
                      union all select p.id,p.parent_id from ancestors a join nite_connect.document_folders p on p.id=a.parent_id and p.archived_at is null
                    ) select 1 from ancestors a join nite_connect.document_grants inherited on inherited.folder_id=a.id
                      where inherited.member_id=g.member_id and inherited.revoked_at is null)
                )
                select * from received where (?='' or lower(name) like ? escape E'\\\\')
                  and (?='' or item_type='FOLDER' or mime_type=?) %s
                order by %s %s,grant_id %s limit ?
                """.formatted(cursorClause,sortExpression,direction,direction);
        String searchPattern=search==null||search.isEmpty()?"":"%"+search.toLowerCase(java.util.Locale.ROOT)
                .replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
        List<Object> args=new ArrayList<>(List.of(member,member,search==null?"":search,searchPattern,mimeType==null?"":mimeType,mimeType==null?"":mimeType));
        // Empty strings disable the optional filters without relying on ambiguous PostgreSQL null typing.
        if(afterKey!=null) {args.add(cursorKey);args.add(afterId);}
        args.add(limit+1);
        List<SharedItem> rows=jdbc.query(sql,(rs,row)->new SharedItem(rs.getObject("grant_id",UUID.class),rs.getObject("id",UUID.class),
                rs.getString("item_type"),rs.getString("name"),rs.getString("permission"),rs.getObject("owner_id",UUID.class),
                rs.getString("owner_name"),rs.getObject("granted_by",UUID.class),rs.getString("shared_by_name"),
                rs.getTimestamp("shared_at").toInstant(),rs.getTimestamp("modified_at").toInstant(),rs.getTimestamp("created_at").toInstant(),
                rs.getString("mime_type"),rs.getObject("size",Long.class),rs.getString("created_by_name"),rs.getString("modified_by_name")),args.toArray());
        boolean more=rows.size()>limit;
        return new SharedPage(more?List.copyOf(rows.subList(0,limit)):List.copyOf(rows),more);
    }
    public record ShareActivity(UUID id,UUID actorId,String actorName,UUID recipientId,String recipientName,String action,
                                String permission,Instant occurredAt) {}
    public List<ShareActivity> activities(UUID document,UUID folder) {
        return jdbc.query("""
                select e.id,e.actor_id,a.name actor_name,e.recipient_id,r.name recipient_name,e.action,e.permission,e.occurred_at
                from nite_connect.document_share_events e join nite_connect.members a on a.id=e.actor_id
                join nite_connect.members r on r.id=e.recipient_id
                where e.document_id is not distinct from ? and e.folder_id is not distinct from ?
                order by e.occurred_at desc,e.id desc
                """,(rs,row)->new ShareActivity(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getString(3),
                rs.getObject(4,UUID.class),rs.getString(5),rs.getString(6),rs.getString(7),rs.getTimestamp(8).toInstant()),document,folder);
    }
}
