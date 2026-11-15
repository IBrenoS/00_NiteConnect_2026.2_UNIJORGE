package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.documents.domain.DocumentCapabilities;
import br.edu.unijorge.niteconnect.documents.domain.DocumentIdentity;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository;
import br.edu.unijorge.niteconnect.projects.application.ProjectDirectory;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/** Server-side search across authorized personal, project and granted resources. */
@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentSearchService {
    private final NamedParameterJdbcTemplate jdbc;
    private final AccessService access;
    private final ProjectDirectory projects;
    private final DocumentCapabilityService capabilities;
    private final DocumentRepository documents;
    private final DocumentLibraryRepository folders;
    public DocumentSearchService(NamedParameterJdbcTemplate jdbc,AccessService access,ProjectDirectory projects,
            DocumentCapabilityService capabilities,DocumentRepository documents,DocumentLibraryRepository folders) {
        this.jdbc=jdbc;this.access=access;this.projects=projects;this.capabilities=capabilities;
        this.documents=documents;this.folders=folders;
    }
    public record Filter(String search,String type,String mimeType,Instant modifiedFrom,Instant modifiedTo,
                         UUID createdBy,UUID modifiedBy,String ownerKind,UUID ownerId,String origin,
                         String shared,String permission,String sortBy,String direction) {}
    public record Item(UUID id,String type,String name,String mimeType,Long size,Instant createdAt,Instant modifiedAt,
                       DocumentIdentity identity,DocumentCapabilities capabilities) {}
    public record Page(List<Item> items,String nextCursor,boolean hasMore) {}
    private record Candidate(UUID id,String type,String name,String mimeType,Long size,Instant createdAt,Instant modifiedAt,
                             DocumentIdentity identity) {}
    private record Cursor(String key,UUID id,String type) {}
    private static Candidate candidate(ResultSet rs,int row) throws SQLException {
        DocumentIdentity identity=new DocumentIdentity(rs.getObject("space_owner_id",UUID.class),rs.getString("resource_owner_kind"),
                rs.getObject("resource_owner_id",UUID.class),rs.getObject("created_by",UUID.class),
                rs.getObject("modified_by",UUID.class),rs.getObject("created_for",UUID.class),rs.getString("origin"),
                rs.getString("protection"),rs.getBoolean("retention_hold"),rs.getString("protection_reason"),
                rs.getObject("protection_set_by",UUID.class),rs.getInt("protection_revision"));
        return new Candidate(rs.getObject("id",UUID.class),rs.getString("type"),rs.getString("name"),rs.getString("mime_type"),
                rs.getObject("size",Long.class),rs.getTimestamp("created_at").toInstant(),rs.getTimestamp("modified_at").toInstant(),identity);
    }
    private static String value(Candidate row,String sort) {
        return switch(sort) {
            case "name" -> row.name().toLowerCase(Locale.ROOT);
            case "size" -> String.valueOf(row.size()==null?-1:row.size());
            case "createdAt" -> row.createdAt().toString();
            default -> row.modifiedAt().toString();
        };
    }
    private static Object keyValue(String key,String sort) {
        return switch(sort) {
            case "name" -> key;
            case "size" -> Long.parseLong(key);
            default -> Timestamp.from(Instant.parse(key));
        };
    }
    private static String fingerprint(Filter filter) {
        return br.edu.unijorge.niteconnect.documents.domain.DocxIntegrity.sha256(filter.toString().getBytes(StandardCharsets.UTF_8));
    }
    private static Cursor parseCursor(String cursor,Filter filter) {
        if(cursor==null||cursor.isBlank()) return null;
        try {
            String[] parts=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8).split("\\n",-1);
            if(parts.length!=4||!parts[0].equals(fingerprint(filter))) throw ApiException.invalid("Cursor de pesquisa inválido");
            keyValue(parts[1],filter.sortBy());
            return new Cursor(parts[1],UUID.fromString(parts[2]),parts[3]);
        } catch(IllegalArgumentException ex) {throw ApiException.invalid("Cursor de pesquisa inválido");}
    }
    private static String encode(Cursor cursor,Filter filter) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(String.join("\n",fingerprint(filter),cursor.key(),
                cursor.id().toString(),cursor.type()).getBytes(StandardCharsets.UTF_8));
    }
    private static Filter normalize(Filter input) {
        if(input==null) input=new Filter(null,null,null,null,null,null,null,null,null,null,null,null,null,null);
        String search=input.search()==null?"":input.search().strip();
        if(search.length()>120||search.chars().anyMatch(Character::isISOControl)) throw ApiException.invalid("Pesquisa inválida");
        String type=input.type()==null?"":input.type();
        String mime=input.mimeType()==null?"":input.mimeType();
        String ownerKind=input.ownerKind()==null?"":input.ownerKind();
        String origin=input.origin()==null?"":input.origin();
        String shared=input.shared()==null?"":input.shared();
        String permission=input.permission()==null?"":input.permission();
        String sort=input.sortBy()==null?"modifiedAt":input.sortBy();
        String direction=input.direction()==null?"desc":input.direction().toLowerCase(Locale.ROOT);
        if(!type.isEmpty()&&!Set.of("DOCUMENT","FOLDER").contains(type)
                ||!mime.isEmpty()&&!Set.of(DocumentLibraryService.DOCX,"application/pdf","image/png","image/jpeg").contains(mime)
                ||!ownerKind.isEmpty()&&!Set.of("MEMBER","PROJECT","INSTITUTION","UNKNOWN").contains(ownerKind)
                ||!shared.isEmpty()&&!Set.of("SHARED","NOT_SHARED").contains(shared)
                ||!permission.isEmpty()&&!Set.of("VIEW","EDIT").contains(permission)
                ||!Set.of("name","size","createdAt","modifiedAt").contains(sort)
                ||!Set.of("asc","desc").contains(direction)
                ||input.modifiedFrom()!=null&&input.modifiedTo()!=null&&input.modifiedFrom().isAfter(input.modifiedTo()))
            throw ApiException.invalid("Filtro documental inválido");
        return new Filter(search,type,mime,input.modifiedFrom(),input.modifiedTo(),input.createdBy(),input.modifiedBy(),
                ownerKind,input.ownerId(),origin,shared,permission,sort,direction);
    }
    private static final String CANDIDATES="""
            with candidates as (
              select d.id,'DOCUMENT'::text type,d.title name,d.mime_type,v.size,d.created_at,d.modified_at,
                d.space_owner_id,d.resource_owner_kind,d.resource_owner_id,d.created_by,d.modified_by,d.created_for,
                d.origin,d.protection,d.retention_hold,d.protection_reason,d.protection_set_by,d.protection_revision,
                exists(select 1 from nite_connect.document_grants g where g.document_id=d.id and g.revoked_at is null) directly_shared
              from nite_connect.documents d join nite_connect.document_versions v on v.id=d.current_version_id
              where d.lifecycle_state='ACTIVE' and d.archived_at is null
                and (:admin or d.context='PERSONAL' and d.space_owner_id=:actor or d.context='PROJECT' and d.project_id in (:projects)
                  or exists (
                    with recursive ancestors(id,parent_id,depth) as (
                      select f.id,f.parent_id,0 from nite_connect.document_folders f where f.id=d.folder_id and f.lifecycle_state='ACTIVE' and f.archived_at is null
                      union all select p.id,p.parent_id,a.depth+1 from ancestors a join nite_connect.document_folders p on p.id=a.parent_id
                        where p.lifecycle_state='ACTIVE' and p.archived_at is null and a.depth<63
                    ) select 1 from nite_connect.document_grants g
                      where g.member_id=:actor and g.revoked_at is null and (g.document_id=d.id or g.folder_id in (select id from ancestors))
                  ))
              union all
              select f.id,'FOLDER'::text,f.name,null::varchar,null::bigint,f.created_at,f.modified_at,
                f.space_owner_id,f.resource_owner_kind,f.resource_owner_id,f.created_by,f.modified_by,f.created_for,
                f.origin,f.protection,f.retention_hold,f.protection_reason,f.protection_set_by,f.protection_revision,
                exists(select 1 from nite_connect.document_grants g where g.folder_id=f.id and g.revoked_at is null)
              from nite_connect.document_folders f where f.lifecycle_state='ACTIVE' and f.archived_at is null
                and (:admin or f.space_owner_id=:actor or f.resource_owner_kind='PROJECT' and f.resource_owner_id in (:projects)
                  or exists (
                    with recursive ancestors(id,parent_id,depth) as (
                      select f.id,f.parent_id,0
                      union all select p.id,p.parent_id,a.depth+1 from ancestors a join nite_connect.document_folders p on p.id=a.parent_id
                        where p.lifecycle_state='ACTIVE' and p.archived_at is null and a.depth<63
                    ) select 1 from nite_connect.document_grants g where g.member_id=:actor and g.revoked_at is null
                         and g.folder_id in (select id from ancestors)
                  ))
            ) select * from candidates where (:type='' or type=:type)
              and (:mime='' or mime_type=:mime)
              and (:search='' or lower(name) like :pattern escape E'\\\\')
              and (:modifiedFrom::timestamptz is null or modified_at>=:modifiedFrom)
              and (:modifiedTo::timestamptz is null or modified_at<=:modifiedTo)
              and (:createdBy::uuid is null or created_by=:createdBy)
              and (:modifiedBy::uuid is null or modified_by=:modifiedBy)
              and (:ownerKind='' or resource_owner_kind=:ownerKind)
              and (:ownerId::uuid is null or resource_owner_id=:ownerId)
              and (:origin='' or origin=:origin)
              and (:shared='' or (:shared='SHARED')=directly_shared)
            """;
    @Transactional(readOnly=true)
    public Page search(UUID actor,Filter input,String cursor,int limit) {
        access.requireActive(actor);
        if(limit<1||limit>100) throw ApiException.invalid("Limite deve estar entre 1 e 100");
        Filter filter=normalize(input);
        Cursor after=parseCursor(cursor,filter);
        String key=switch(filter.sortBy()) {
            case "name" -> "lower(name)";
            case "size" -> "coalesce(size,-1)";
            case "createdAt" -> "created_at";
            default -> "modified_at";
        };
        String direction=filter.direction();
        String comparator="asc".equals(direction)?">":"<";
        List<UUID> projectIds=projects.currentProjectIds(actor);
        boolean administrator=access.isAdministrator(actor);
        var params=new MapSqlParameterSource()
                .addValue("admin",administrator).addValue("actor",actor)
                .addValue("projects",projectIds.isEmpty()?List.of(new UUID(0,0)):projectIds)
                .addValue("type",filter.type()).addValue("mime",filter.mimeType()).addValue("search",filter.search())
                .addValue("pattern","%"+filter.search().toLowerCase(Locale.ROOT).replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%")
                .addValue("modifiedFrom",filter.modifiedFrom()==null?null:Timestamp.from(filter.modifiedFrom()))
                .addValue("modifiedTo",filter.modifiedTo()==null?null:Timestamp.from(filter.modifiedTo()))
                .addValue("createdBy",filter.createdBy()).addValue("modifiedBy",filter.modifiedBy())
                .addValue("ownerKind",filter.ownerKind()).addValue("ownerId",filter.ownerId())
                .addValue("origin",filter.origin()).addValue("shared",filter.shared());
        List<Item> items=new ArrayList<>();boolean more=false;
        for(int scan=0;scan<20&&items.size()<=limit;scan++) {
            params.addValue("cursorKey",after==null?null:keyValue(after.key(),filter.sortBy()))
                    .addValue("cursorId",after==null?null:after.id()).addValue("cursorType",after==null?null:after.type());
            String sql=CANDIDATES+(after==null?"":" and ("+key+",id,type) "+comparator+" (:cursorKey,:cursorId,:cursorType)")
                    +" order by "+key+" "+direction+",id "+direction+",type "+direction+" limit 101";
            List<Candidate> rows=jdbc.query(sql,params,DocumentSearchService::candidate);
            for(Candidate candidate:rows) {
                after=new Cursor(value(candidate,filter.sortBy()),candidate.id(),candidate.type());
                DocumentCapabilities effective="DOCUMENT".equals(candidate.type())
                        ?capabilities.document(actor,documents.require(candidate.id()))
                        :capabilities.folder(actor,folders.folder(candidate.id()));
                if(!effective.canView()||"EDIT".equals(filter.permission())&&!effective.canEdit()
                        ||"VIEW".equals(filter.permission())&&effective.canEdit()) continue;
                DocumentIdentity identity=candidate.identity();
                if("PROJECT".equals(identity.resourceOwnerKind())&&!administrator
                        &&!projectIds.contains(identity.resourceOwnerId())) identity=identity.withoutOwnerIdentifier();
                items.add(new Item(candidate.id(),candidate.type(),candidate.name(),candidate.mimeType(),candidate.size(),
                        candidate.createdAt(),candidate.modifiedAt(),identity,effective));
                if(items.size()>limit) {more=true;break;}
            }
            if(more||rows.size()<101) break;
        }
        List<Item> visible=items.stream().limit(limit).toList();
        String next=null;
        if(more&&!visible.isEmpty()) {
            Item last=visible.getLast();
            next=encode(new Cursor(switch(filter.sortBy()) {
                case "name" -> last.name().toLowerCase(Locale.ROOT);
                case "size" -> String.valueOf(last.size()==null?-1:last.size());
                case "createdAt" -> last.createdAt().toString();
                default -> last.modifiedAt().toString();
            },last.id(),last.type()),filter);
        }
        return new Page(visible,next,more);
    }
}
