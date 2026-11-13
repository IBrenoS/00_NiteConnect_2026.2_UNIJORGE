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

/** The folder tree is a single namespace. Permissions are always evaluated by the service. */
@Repository
public class DocumentLibraryRepository {
    private final JdbcTemplate jdbc;
    public DocumentLibraryRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }

    public record Folder(UUID id,UUID parentId,String name,String color,String kind,String systemKey,
                         UUID ownerId,String ownerName,UUID projectId,String projectTitle,
                         UUID createdBy,String createdByName,Instant createdAt,UUID modifiedBy,String modifiedByName,Instant modifiedAt) {}
    public record FileEntry(UUID id,UUID folderId,String title,String context,UUID ownerId,UUID projectId,
                            String mimeType,long revision,long size,String ownerName,String createdByName,
                            UUID createdBy,Instant createdAt,String modifiedByName,UUID modifiedBy,Instant modifiedAt,
                            String folderName,String sharedByName,Instant sharedAt,long sharedWithCount,
                            String lastOpenedByName,UUID lastOpenedBy,Instant lastOpenedAt) {}
    public record FilePage(List<FileEntry> items,long total,String nextCursor,boolean hasMore) {}
    public record Activity(UUID id,String action,String reason,UUID actorId,String actorName,Instant occurredAt) {}
    public record ActivityPage(List<Activity> items,boolean hasMore) {}
    public record Template(UUID id,String title,boolean autoAssign,boolean retired,UUID currentVersionId,int revision) {}
    public record Distribution(UUID memberId,UUID documentId,boolean created) {}

    private static final String FOLDER_COLUMNS="""
            select f.*,o.name owner_name,p.title project_title,c.name created_by_name,m.name modified_by_name
            from nite_connect.document_folders f
            left join nite_connect.members o on o.id=f.owner_id
            left join nite_connect.projects p on p.id=f.project_id
            left join nite_connect.members c on c.id=f.created_by
            left join nite_connect.members m on m.id=f.modified_by
            """;
    private static Folder folder(ResultSet rs,int row) throws SQLException {
        return new Folder(rs.getObject("id",UUID.class),rs.getObject("parent_id",UUID.class),rs.getString("name"),
                rs.getString("color"),rs.getString("kind"),rs.getString("system_key"),
                rs.getObject("owner_id",UUID.class),rs.getString("owner_name"),rs.getObject("project_id",UUID.class),rs.getString("project_title"),
                rs.getObject("created_by",UUID.class),rs.getString("created_by_name"),rs.getTimestamp("created_at").toInstant(),
                rs.getObject("modified_by",UUID.class),rs.getString("modified_by_name"),rs.getTimestamp("modified_at").toInstant());
    }
    private static final String FOLDER_SQL=FOLDER_COLUMNS+" where f.id=? and f.archived_at is null";
    public Folder folder(UUID id) {
        return jdbc.query(FOLDER_SQL,DocumentLibraryRepository::folder,id).stream().findFirst().orElseThrow(ApiException::notFound);
    }
    /** Idempotent roots also protect test fixtures that truncate the entire member graph. */
    public Folder root(String key) {
        String title=switch(key) {
            case "INTEGRANTES" -> "Integrantes";
            case "PROJETOS" -> "Projetos";
            case "MATERIAIS" -> "Materiais institucionais";
            case "MODELOS" -> "Modelos oficiais";
            default -> throw ApiException.invalid("Raiz institucional desconhecida");
        };
        var found=jdbc.query(FOLDER_COLUMNS+" where f.system_key=? and f.archived_at is null",DocumentLibraryRepository::folder,key);
        if(!found.isEmpty()) return found.getFirst();
        jdbc.update("insert into nite_connect.document_folders(id,name,kind,system_key) values (?,?,'ROOT',?) on conflict do nothing",
                UUID.randomUUID(),title,key);
        return jdbc.query(FOLDER_COLUMNS+" where f.system_key=? and f.archived_at is null",DocumentLibraryRepository::folder,key)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }
    public List<Folder> roots() {
        for(String key:List.of("INTEGRANTES","PROJETOS","MATERIAIS","MODELOS")) root(key);
        return jdbc.query(FOLDER_COLUMNS+" where f.parent_id is null and f.archived_at is null order by f.name,f.id",DocumentLibraryRepository::folder);
    }
    public List<Folder> children(UUID parent) {
        return jdbc.query(FOLDER_COLUMNS+" where f.parent_id=? and f.archived_at is null order by lower(f.name),f.id",DocumentLibraryRepository::folder,parent);
    }
    public Folder child(UUID parent,String name) {
        return jdbc.query(FOLDER_COLUMNS+" where f.parent_id=? and lower(btrim(f.name))=lower(btrim(?)) and f.archived_at is null",
                DocumentLibraryRepository::folder,parent,name).stream().findFirst().orElse(null);
    }
    public Folder personal(UUID member) {
        return jdbc.query(FOLDER_COLUMNS+" where f.owner_id=? and f.kind='PERSONAL' and f.archived_at is null",DocumentLibraryRepository::folder,member)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }
    public Folder project(UUID project) {
        return jdbc.query(FOLDER_COLUMNS+" where f.project_id=? and f.kind='PROJECT' and f.archived_at is null",DocumentLibraryRepository::folder,project)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }
    public Folder ensurePersonal(UUID member) {
        var existing=jdbc.query(FOLDER_COLUMNS+" where f.owner_id=? and f.kind='PERSONAL' and f.archived_at is null",
                DocumentLibraryRepository::folder,member);
        if(!existing.isEmpty()) return existing.getFirst();
        String name=jdbc.query("select name from nite_connect.members where id=? and status='ATIVO'",(rs,row)->rs.getString(1),member)
                .stream().findFirst().orElseThrow(ApiException::notFound);
        UUID root=root("INTEGRANTES").id();
        String safe=uniqueName(root,name,member);
        jdbc.update("insert into nite_connect.document_folders(id,parent_id,name,kind,owner_id) values (?,?,?,'PERSONAL',?) on conflict do nothing",
                UUID.randomUUID(),root,safe,member);
        return personal(member);
    }
    public Folder ensureProject(UUID project) {
        var existing=jdbc.query(FOLDER_COLUMNS+" where f.project_id=? and f.kind='PROJECT' and f.archived_at is null",
                DocumentLibraryRepository::folder,project);
        if(!existing.isEmpty()) return existing.getFirst();
        String title=jdbc.query("select title from nite_connect.projects where id=?",(rs,row)->rs.getString(1),project)
                .stream().findFirst().orElseThrow(ApiException::notFound);
        UUID root=root("PROJETOS").id();
        String safe=uniqueName(root,title,project);
        jdbc.update("insert into nite_connect.document_folders(id,parent_id,name,kind,project_id) values (?,?,?,'PROJECT',?) on conflict do nothing",
                UUID.randomUUID(),root,safe,project);
        return project(project);
    }
    private String uniqueName(UUID parent,String original,UUID id) {
        String name=original.strip();
        Boolean exists=jdbc.queryForObject("select exists(select 1 from nite_connect.document_folders where parent_id=? and lower(btrim(name))=lower(?) and archived_at is null)",Boolean.class,parent,name);
        return Boolean.TRUE.equals(exists)?name.substring(0,Math.min(170,name.length()))+" ("+id.toString().substring(0,8)+")":name.substring(0,Math.min(190,name.length()));
    }
    public boolean siblingExists(UUID parent,String name,UUID exclude) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from nite_connect.document_folders where parent_id is not distinct from ? and lower(btrim(name))=lower(btrim(?)) and archived_at is null and id<>?)",
                Boolean.class,parent,name,exclude));
    }
    public Folder addFolder(UUID parent,String name,String color,UUID actor) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into nite_connect.document_folders(id,parent_id,name,color,kind,created_by,modified_by) values (?,?,?,?,'CUSTOM',?,?)",
                id,parent,name,color,actor,actor);
        folderEvent(id,actor,"FOLDER_CREATED","Pasta criada");
        return folder(id);
    }
    public Folder updateFolder(UUID id,UUID parent,String name,String color,UUID actor) {
        jdbc.update("update nite_connect.document_folders set parent_id=?,name=?,color=?,modified_by=?,modified_at=clock_timestamp() where id=? and kind='CUSTOM' and archived_at is null",
                parent,name,color,actor,id);
        folderEvent(id,actor,"FOLDER_UPDATED","Pasta renomeada, recolorida ou movida");
        return folder(id);
    }
    public Folder renameRootFolder(UUID id,String name,String color,UUID actor) {
        jdbc.update("update nite_connect.document_folders set name=?,color=?,modified_by=?,modified_at=clock_timestamp() where id=? and kind='ROOT' and archived_at is null",
                name,color,actor,id);
        folderEvent(id,actor,"FOLDER_UPDATED","Raiz institucional renomeada ou recolorida");
        return folder(id);
    }
    public void renameProtectedFolder(UUID id,String name,String color,UUID actor) {
        jdbc.update("update nite_connect.document_folders set name=?,color=?,modified_by=?,modified_at=clock_timestamp() where id=? and kind in ('PERSONAL','PROJECT') and archived_at is null",
                name,color,actor,id);
        folderEvent(id,actor,"FOLDER_UPDATED","Pasta vinculada renomeada ou recolorida");
    }
    public boolean descendant(UUID ancestor,UUID possibleChild) {
        if(possibleChild==null) return false;
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                with recursive tree(id) as (
                  select id from nite_connect.document_folders where id=?
                  union all select f.id from nite_connect.document_folders f join tree t on f.parent_id=t.id
                ) select exists(select 1 from tree where id=?)
                """,Boolean.class,ancestor,possibleChild));
    }
    public void archiveFolder(UUID id,UUID actor) {
        jdbc.update("update nite_connect.document_folders set archived_at=clock_timestamp(),archive_batch_id=?,modified_by=?,modified_at=clock_timestamp() where id=? and kind='CUSTOM' and archived_at is null",UUID.randomUUID(),actor,id);
        folderEvent(id,actor,"FOLDER_ARCHIVED","Pasta vazia arquivada");
    }
    /** Explicit recursive archive; every affected row retains its immutable document versions. */
    public void archiveFolderTree(UUID root,UUID actor) {
        List<UUID> ids=jdbc.query("""
                with recursive subtree(id) as (
                    select id from nite_connect.document_folders where id=? and kind='CUSTOM' and archived_at is null
                    union all select f.id from nite_connect.document_folders f join subtree t on f.parent_id=t.id where f.archived_at is null
                ) select id from subtree
                """,(rs,row)->rs.getObject(1,UUID.class),root);
        if(ids.isEmpty()) throw ApiException.notFound();
        String placeholders=String.join(",",java.util.Collections.nCopies(ids.size(),"?"));
        var affected=jdbc.query("select id from nite_connect.documents where folder_id in ("+placeholders+") and archived_at is null",
                (rs,row)->rs.getObject(1,UUID.class),ids.toArray());
        UUID batch=UUID.randomUUID();
        jdbc.update("update nite_connect.documents set archived_at=clock_timestamp(),archive_batch_id=?,modified_by=?,modified_at=clock_timestamp() where folder_id in ("+placeholders+") and archived_at is null",
                join(batch,actor,ids));
        for(UUID document:affected) {
            jdbc.update("update nite_connect.document_wopi_sessions set revoked_at=clock_timestamp() where document_id=? and revoked_at is null",document);
            event(document,actor,"DOCUMENT_ARCHIVED","Arquivado com pasta "+root);
        }
        jdbc.update("update nite_connect.document_folders set archived_at=clock_timestamp(),archive_batch_id=?,modified_by=?,modified_at=clock_timestamp() where id in ("+placeholders+") and archived_at is null",
                join(batch,actor,ids));
        for(UUID folder:ids) folderEvent(folder,actor,"FOLDER_ARCHIVED","Arquivamento em grupo "+root);
    }
    private static Object[] join(UUID batch,UUID actor,List<UUID> ids) {
        var args=new java.util.ArrayList<Object>();args.add(batch);args.add(actor);args.addAll(ids);return args.toArray();
    }
    public void restoreFolderTree(UUID root,UUID actor) {
        record Archive(UUID parent,UUID batch) {}
        Archive info=jdbc.query("select parent_id,archive_batch_id from nite_connect.document_folders where id=? and kind='CUSTOM' and archived_at is not null",
                (rs,row)->new Archive(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class)),root)
                .stream().findFirst().orElseThrow(ApiException::notFound);
        if(info.batch()==null) throw ApiException.conflict("Recuperação de pasta sem identificador de arquivamento");
        if(info.parent()!=null) folder(info.parent()); // Archived/missing parents must be restored first.
        if(Boolean.TRUE.equals(jdbc.queryForObject("""
            select exists(select 1 from nite_connect.document_folders f
             join nite_connect.document_folders other on other.parent_id is not distinct from f.parent_id
               and lower(btrim(other.name))=lower(btrim(f.name)) and other.id<>f.id and other.archived_at is null
             where f.archive_batch_id=?)
            """,Boolean.class,info.batch()))) throw ApiException.conflict("Outra pasta ativa usa um dos nomes originais; renomeie-a antes de restaurar");
        jdbc.update("update nite_connect.document_folders set archived_at=null,archive_batch_id=null,modified_by=?,modified_at=clock_timestamp() where archive_batch_id=?",
                actor,info.batch());
        List<UUID> docs=jdbc.query("select id from nite_connect.documents where archive_batch_id=?",
                (rs,row)->rs.getObject(1,UUID.class),info.batch());
        jdbc.update("update nite_connect.documents set archived_at=null,archive_batch_id=null,modified_by=?,modified_at=clock_timestamp() where archive_batch_id=?",
                actor,info.batch());
        for(UUID doc:docs) event(doc,actor,"DOCUMENT_RESTORED","Restaurado com pasta "+root);
        folderEvent(root,actor,"FOLDER_RESTORED","Pasta e conteúdo restaurados");
    }
    public boolean hasContents(UUID folder) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from nite_connect.document_folders where parent_id=? and archived_at is null)
                    or exists(select 1 from nite_connect.documents where folder_id=? and archived_at is null)
                """,Boolean.class,folder,folder));
    }
    private static final String FILE_COLUMNS="""
            select d.id,d.folder_id,d.title,d.context,d.owner_id,d.project_id,d.mime_type,d.version,v.size,
                   o.name owner_name,c.name creator_name,d.created_by,d.created_at,m.name modifier_name,d.modified_by,d.modified_at,
                   f.name folder_name,sh.name shared_by_name,td.created_at shared_at,
                   (select count(*) from nite_connect.document_grants g where g.document_id=d.id and g.revoked_at is null) +
                   case when td.document_id is null then 0 else 1 end shared_with_count,
                   op.name last_opened_by_name,d.last_opened_by,d.last_opened_at
            from nite_connect.documents d
            join nite_connect.document_versions v on v.id=d.current_version_id
            join nite_connect.document_folders f on f.id=d.folder_id
            left join nite_connect.members o on o.id=d.owner_id
            join nite_connect.members c on c.id=d.created_by
            left join nite_connect.members m on m.id=d.modified_by
            left join nite_connect.document_template_distributions td on td.document_id=d.id
            left join nite_connect.members sh on sh.id=td.distributed_by
            left join nite_connect.members op on op.id=d.last_opened_by
            """;
    private static FileEntry file(ResultSet rs,int row) throws SQLException {
        return new FileEntry(rs.getObject("id",UUID.class),rs.getObject("folder_id",UUID.class),rs.getString("title"),
                rs.getString("context"),rs.getObject("owner_id",UUID.class),rs.getObject("project_id",UUID.class),
                rs.getString("mime_type"),rs.getLong("version"),rs.getLong("size"),rs.getString("owner_name"),
                rs.getString("creator_name"),rs.getObject("created_by",UUID.class),rs.getTimestamp("created_at").toInstant(),
                rs.getString("modifier_name"),rs.getObject("modified_by",UUID.class),rs.getTimestamp("modified_at").toInstant(),
                rs.getString("folder_name"),rs.getString("shared_by_name"),
                rs.getTimestamp("shared_at")==null?null:rs.getTimestamp("shared_at").toInstant(),rs.getLong("shared_with_count"),
                rs.getString("last_opened_by_name"),rs.getObject("last_opened_by",UUID.class),
                rs.getTimestamp("last_opened_at")==null?null:rs.getTimestamp("last_opened_at").toInstant());
    }
    public List<FileEntry> files(UUID folder) {
        return jdbc.query(FILE_COLUMNS+" where d.folder_id=? and d.archived_at is null order by lower(d.title),d.id limit 500",
                DocumentLibraryRepository::file,folder);
    }
    public FilePage filePage(UUID folder,String search,String mimeType,String sortBy,String direction,String cursor,int limit) {
        String key=switch(sortBy) {
            case "modifiedAt" -> "d.modified_at";
            case "createdAt" -> "d.created_at";
            case "size" -> "v.size";
            default -> "lower(d.title)";
        };
        String order="desc".equals(direction)?"desc":"asc";
        String sign="desc".equals(order)?"<":">";
        var params=new java.util.ArrayList<Object>();
        StringBuilder sql=new StringBuilder(FILE_COLUMNS).append(" where d.folder_id=? and d.archived_at is null");
        params.add(folder);
        if(search!=null&&!search.isBlank()) {
            sql.append(" and lower(d.title) like ? escape E'\\\\'");
            String escaped=search.toLowerCase(java.util.Locale.ROOT).replace("\\","\\\\").replace("%","\\%").replace("_","\\_");
            params.add("%"+escaped+"%");
        }
        if(mimeType!=null&&!mimeType.isBlank()) {sql.append(" and d.mime_type=?");params.add(mimeType);}
        if(cursor!=null) {
            String[] parts=cursor.split("\\n",-1);
            String value=parts[4];
            UUID id=UUID.fromString(parts[5]);
            if("createdAt".equals(sortBy)||"modifiedAt".equals(sortBy)) {
                sql.append(" and ("+key+sign+"cast(? as timestamptz) or ("+key+"=cast(? as timestamptz) and d.id"+sign+"?))");
                params.add(value);params.add(value);params.add(id);
            } else if("size".equals(sortBy)) {
                sql.append(" and ("+key+sign+"?::bigint or ("+key+"=?::bigint and d.id"+sign+"?))");
                params.add(Long.parseLong(value));params.add(Long.parseLong(value));params.add(id);
            } else {
                sql.append(" and ("+key+sign+"? or ("+key+"=? and d.id"+sign+"?))");
                params.add(value);params.add(value);params.add(id);
            }
        }
        long total=jdbc.queryForObject("select count(*) from nite_connect.documents d where d.folder_id=? and d.archived_at is null"+
                (search==null||search.isBlank()?"":" and lower(d.title) like ? escape E'\\\\'")+
                (mimeType==null||mimeType.isBlank()?"":" and d.mime_type=?"),Long.class,
                pageCountArgs(folder,search,mimeType));
        sql.append(" order by ").append(key).append(' ').append(order).append(",d.id ").append(order).append(" limit ?");
        params.add(limit+1);
        var rows=jdbc.query(sql.toString(),DocumentLibraryRepository::file,params.toArray());
        boolean more=rows.size()>limit;
        List<FileEntry> items=more?List.copyOf(rows.subList(0,limit)):List.copyOf(rows);
        String next=null;
        if(more&&!items.isEmpty()) {
            FileEntry last=items.getLast();
            String value=switch(sortBy) {
                case "createdAt" -> last.createdAt().toString();
                case "modifiedAt" -> last.modifiedAt().toString();
                case "size" -> Long.toString(last.size());
                default -> last.title().toLowerCase(java.util.Locale.ROOT);
            };
            next=String.join("\n",sortBy,direction,search==null?"":search,mimeType==null?"":mimeType,value,last.id().toString());
        }
        return new FilePage(items,total,next,more);
    }
    private static Object[] pageCountArgs(UUID folder,String search,String mimeType) {
        var args=new java.util.ArrayList<Object>();args.add(folder);
        if(search!=null&&!search.isBlank()) {
            String escaped=search.toLowerCase(java.util.Locale.ROOT).replace("\\","\\\\").replace("%","\\%").replace("_","\\_");
            args.add("%"+escaped+"%");
        }
        if(mimeType!=null&&!mimeType.isBlank()) args.add(mimeType);
        return args.toArray();
    }
    public FileEntry file(UUID id) {
        return jdbc.query(FILE_COLUMNS+" where d.id=? and d.archived_at is null",DocumentLibraryRepository::file,id)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }
    public boolean fileNameExists(UUID folder,String title,UUID excluded) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from nite_connect.documents where folder_id=? and lower(btrim(title))=lower(btrim(?)) and archived_at is null and id<>?)",
                Boolean.class,folder,title,excluded));
    }
    public ActivityPage documentActivity(UUID id,Instant before,UUID beforeId,int limit) {
        String sql="""
                with recursive ancestors(id,parent_id) as (
                  select f.id,f.parent_id from nite_connect.documents d join nite_connect.document_folders f on f.id=d.folder_id where d.id=?
                  union all select p.id,p.parent_id from ancestors a join nite_connect.document_folders p on p.id=a.parent_id
                ), events as (
                  select e.id,e.action,e.reason,e.actor_id,m.name actor_name,e.occurred_at
                  from nite_connect.document_events e join nite_connect.members m on m.id=e.actor_id where e.document_id=?
                  union all
                  select e.id,e.action,'Compartilhamento '||e.permission||' com '||r.name,e.actor_id,a.name,e.occurred_at
                  from nite_connect.document_share_events e join nite_connect.members a on a.id=e.actor_id
                    join nite_connect.members r on r.id=e.recipient_id
                  where e.document_id=? or e.folder_id in (select id from ancestors)
                ) select id,action,reason,actor_id,actor_name,occurred_at from events
                """+(before==null?"":" where (occurred_at,id)<(?,?)")+" order by occurred_at desc,id desc limit ?";
        var mapper=(org.springframework.jdbc.core.RowMapper<Activity>)(rs,row)->new Activity(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),
                rs.getObject(4,UUID.class),rs.getString(5),rs.getTimestamp(6).toInstant());
        List<Activity> rows=before==null?jdbc.query(sql,mapper,id,id,id,limit+1):jdbc.query(sql,mapper,id,id,id,Timestamp.from(before),beforeId,limit+1);
        return activityPage(rows,limit);
    }
    public ActivityPage folderActivity(UUID id,Instant before,UUID beforeId,int limit) {
        String sql="""
                select * from (
                  select e.id,e.action,e.reason,e.actor_id,m.name actor_name,e.occurred_at
                  from nite_connect.document_folder_events e join nite_connect.members m on m.id=e.actor_id where e.folder_id=?
                  union all
                  select e.id,e.action,'Compartilhamento '||e.permission||' com '||r.name,e.actor_id,a.name,e.occurred_at
                  from nite_connect.document_share_events e join nite_connect.members a on a.id=e.actor_id
                    join nite_connect.members r on r.id=e.recipient_id where e.folder_id=?
                ) events
                """+(before==null?"":" where (occurred_at,id)<(?,?)")+" order by occurred_at desc,id desc limit ?";
        var mapper=(org.springframework.jdbc.core.RowMapper<Activity>)(rs,row)->new Activity(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),
                rs.getObject(4,UUID.class),rs.getString(5),rs.getTimestamp(6).toInstant());
        List<Activity> rows=before==null?jdbc.query(sql,mapper,id,id,limit+1):jdbc.query(sql,mapper,id,id,Timestamp.from(before),beforeId,limit+1);
        return activityPage(rows,limit);
    }
    private static ActivityPage activityPage(List<Activity> rows,int limit) {
        boolean more=rows.size()>limit;
        return new ActivityPage(more?List.copyOf(rows.subList(0,limit)):List.copyOf(rows),more);
    }
    public record ArchivedItem(UUID id,String name,String type,UUID folderId,Instant archivedAt) {}
    /** Present top-level archived folders and standalone archived files to administrators. */
    public List<ArchivedItem> archivedItems() {
        var entries=new java.util.ArrayList<ArchivedItem>();
        entries.addAll(jdbc.query("""
                select f.id,f.name,f.parent_id,f.archived_at from nite_connect.document_folders f
                left join nite_connect.document_folders parent on parent.id=f.parent_id
                where f.kind='CUSTOM' and f.archived_at is not null
                  and (f.parent_id is null or parent.archived_at is null)
                order by f.archived_at desc,f.id limit 100
                """,(rs,row)->new ArchivedItem(rs.getObject(1,UUID.class),rs.getString(2),"FOLDER",
                rs.getObject(3,UUID.class),rs.getTimestamp(4).toInstant())));
        entries.addAll(jdbc.query("""
                select d.id,d.title,d.folder_id,d.archived_at from nite_connect.documents d
                join nite_connect.document_folders f on f.id=d.folder_id
                where d.archived_at is not null and f.archived_at is null
                order by d.archived_at desc,d.id limit 100
                """,(rs,row)->new ArchivedItem(rs.getObject(1,UUID.class),rs.getString(2),"DOCUMENT",
                rs.getObject(3,UUID.class),rs.getTimestamp(4).toInstant())));
        entries.sort(java.util.Comparator.comparing(ArchivedItem::archivedAt).reversed());
        return List.copyOf(entries);
    }
    public void moveFile(UUID id,UUID folder,String name,UUID actor) {
        jdbc.update("update nite_connect.documents set folder_id=?,title=?,modified_by=?,modified_at=clock_timestamp() where id=? and archived_at is null",
                folder,name,actor,id);
        jdbc.update("update nite_connect.document_wopi_sessions set revoked_at=clock_timestamp() where document_id=? and revoked_at is null",id);
        event(id,actor,"DOCUMENT_ORGANIZED","Pasta ou nome atualizado");
    }
    public void archiveFile(UUID id,UUID actor) {
        jdbc.update("update nite_connect.documents set archived_at=clock_timestamp(),modified_by=?,modified_at=clock_timestamp() where id=? and archived_at is null",actor,id);
        jdbc.update("update nite_connect.document_wopi_sessions set revoked_at=clock_timestamp() where document_id=? and revoked_at is null",id);
        event(id,actor,"DOCUMENT_ARCHIVED","Arquivamento recuperável");
    }
    public boolean archivedFileFolderMissing(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                select not exists(select 1 from nite_connect.document_folders f join nite_connect.documents d on d.folder_id=f.id
                 where d.id=? and f.archived_at is null and d.archived_at is not null)
                """,Boolean.class,id));
    }
    public void restoreFile(UUID id,UUID actor) {
        jdbc.update("update nite_connect.documents set archived_at=null,modified_by=?,modified_at=clock_timestamp() where id=? and archived_at is not null",actor,id);
        event(id,actor,"DOCUMENT_RESTORED","Restauração administrativa");
    }
    private void folderEvent(UUID folder,UUID actor,String action,String reason) {
        jdbc.update("insert into nite_connect.document_folder_events(id,folder_id,actor_id,action,reason) values (?,?,?,?,?)",
                UUID.randomUUID(),folder,actor,action,reason);
    }
    public void event(UUID id,UUID actor,String action,String reason) {
        jdbc.update("insert into nite_connect.document_events(id,document_id,actor_id,action,reason) values (?,?,?,?,?)",
                UUID.randomUUID(),id,actor,action,reason);
    }
    public UUID currentTemplateVersion(UUID template) {
        return jdbc.query("select id from nite_connect.document_template_versions where template_id=? order by revision desc limit 1",
                (rs,row)->rs.getObject(1,UUID.class),template).stream().findFirst().orElseThrow(ApiException::notFound);
    }
    public List<Template> templates() {
        return jdbc.query("""
                select t.id,t.title,t.auto_assign_on_join,t.retired_at,
                       (select v.id from nite_connect.document_template_versions v where v.template_id=t.id order by v.revision desc limit 1) current_version_id,
                       coalesce((select max(v.revision) from nite_connect.document_template_versions v where v.template_id=t.id),0) revision
                from nite_connect.document_templates t order by lower(t.title),t.id
                """,(rs,row)->new Template(rs.getObject(1,UUID.class),rs.getString(2),rs.getBoolean(3),rs.getTimestamp(4)!=null,
                rs.getObject(5,UUID.class),rs.getInt(6)));
    }
    public record TemplateVersion(UUID id,UUID templateId,int revision,UUID objectId,long size,String sha256) {}
    public TemplateVersion templateVersion(UUID id) {
        return jdbc.query("select id,template_id,revision,object_id,size,sha256 from nite_connect.document_template_versions where id=?",
                (rs,row)->new TemplateVersion(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getInt(3),rs.getObject(4,UUID.class),rs.getLong(5),rs.getString(6)),id)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }
    public UUID createTemplate(UUID actor,String title,boolean autoAssign,UUID object,long size,String sha) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into nite_connect.document_templates(id,title,official,created_by,auto_assign_on_join,version) values (?,?,true,?,?,1)",id,title,actor,autoAssign);
        jdbc.update("insert into nite_connect.document_template_versions(id,template_id,revision,object_id,size,sha256,created_by) values (?,?,1,?,?,?,?)",
                UUID.randomUUID(),id,object,size,sha,actor);
        return id;
    }
    public void updateTemplate(UUID actor,UUID id,UUID object,long size,String sha) {
        int revision=jdbc.queryForObject("select coalesce(max(revision),0) from nite_connect.document_template_versions where template_id=?",Integer.class,id)+1;
        jdbc.update("insert into nite_connect.document_template_versions(id,template_id,revision,object_id,size,sha256,created_by) values (?,?,?,?,?,?,?)",
                UUID.randomUUID(),id,revision,object,size,sha,actor);
        jdbc.update("update nite_connect.document_templates set version=version+1 where id=? and retired_at is null",id);
    }
    public void retireTemplate(UUID id) { jdbc.update("update nite_connect.document_templates set retired_at=clock_timestamp() where id=? and retired_at is null",id); }
    public List<TemplateVersion> joinTemplates() {
        return jdbc.query("""
                select v.id,v.template_id,v.revision,v.object_id,v.size,v.sha256
                from nite_connect.document_templates t join nite_connect.document_template_versions v on v.id=(
                  select id from nite_connect.document_template_versions where template_id=t.id order by revision desc limit 1)
                where t.official and t.auto_assign_on_join and t.retired_at is null
                """,(rs,row)->new TemplateVersion(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getInt(3),rs.getObject(4,UUID.class),rs.getLong(5),rs.getString(6)));
    }
    public UUID distributedDocument(UUID version,UUID member) {
        return jdbc.query("select document_id from nite_connect.document_template_distributions where template_version_id=? and recipient_id=?",
                (rs,row)->rs.getObject(1,UUID.class),version,member).stream().findFirst().orElse(null);
    }
    public void recordDistribution(UUID version,UUID member,UUID document,UUID actor) {
        jdbc.update("insert into nite_connect.document_template_distributions(id,template_version_id,recipient_id,document_id,distributed_by) values (?,?,?,?,?)",
                UUID.randomUUID(),version,member,document,actor);
    }
    public void giveEdit(UUID document,UUID member,UUID actor,boolean edit) {
        jdbc.update("update nite_connect.document_grants set revoked_at=clock_timestamp() where document_id=? and member_id=? and revoked_at is null",document,member);
        if(edit) jdbc.update("insert into nite_connect.document_grants(id,document_id,member_id,permission,can_edit,granted_by) values (?,?,?,'EDIT',true,?)",
                UUID.randomUUID(),document,member,actor);
        event(document,actor,edit?"EDIT_GRANTED":"EDIT_REVOKED","Permissão de projeto alterada");
        jdbc.update("update nite_connect.document_wopi_sessions set revoked_at=clock_timestamp() where document_id=? and actor_id=? and revoked_at is null",document,member);
    }
    public boolean canEdit(UUID document,UUID actor) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from nite_connect.document_grants where document_id=? and member_id=? and can_edit and revoked_at is null)",Boolean.class,document,actor));
    }
    public record Recipient(UUID id,String name) {}
    public List<Recipient> recipients() {
        return jdbc.query("select id,name from nite_connect.members where status='ATIVO' order by name,id",
                (rs,row)->new Recipient(rs.getObject(1,UUID.class),rs.getString(2)));
    }
    public List<Folder> subtree(UUID root) {
        return jdbc.query("""
                with recursive selected(id) as (
                  select id from nite_connect.document_folders where id=? and archived_at is null
                  union all select f.id from nite_connect.document_folders f join selected s on f.parent_id=s.id where f.archived_at is null
                ) select f.*,o.name owner_name,p.title project_title,c.name created_by_name,m.name modified_by_name
                  from nite_connect.document_folders f join selected s on s.id=f.id
                  left join nite_connect.members o on o.id=f.owner_id left join nite_connect.projects p on p.id=f.project_id
                  left join nite_connect.members c on c.id=f.created_by left join nite_connect.members m on m.id=f.modified_by
                  order by lower(f.name),f.id
                """,DocumentLibraryRepository::folder,root);
    }
    public List<Folder> folderTree() {
        return jdbc.query(FOLDER_COLUMNS+" where f.archived_at is null order by f.name,f.id",DocumentLibraryRepository::folder);
    }
    public List<UUID> activeMembers(UUID after,int limit) {
        String sql="select id from nite_connect.members where status='ATIVO'"+(after==null?"":" and id>?")+" order by id limit ?";
        return after==null?jdbc.query(sql,(rs,row)->rs.getObject(1,UUID.class),limit)
                :jdbc.query(sql,(rs,row)->rs.getObject(1,UUID.class),after,limit);
    }
    public List<UUID> projectsNeedingFolder(UUID after,int limit) {
        String sql="select p.id from nite_connect.projects p where not exists(select 1 from nite_connect.document_folders f where f.project_id=p.id and f.archived_at is null)"+
                (after==null?"":" and p.id>?")+" order by p.id limit ?";
        return after==null?jdbc.query(sql,(rs,row)->rs.getObject(1,UUID.class),limit)
                :jdbc.query(sql,(rs,row)->rs.getObject(1,UUID.class),after,limit);
    }

}
