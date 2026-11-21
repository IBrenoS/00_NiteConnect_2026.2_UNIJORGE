package br.edu.unijorge.niteconnect.documents.infrastructure;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Read perspective over existing resources and grants, never a second document catalog. */
@Repository
public class InstitutionalLibraryRepository {
    private final JdbcTemplate jdbc;
    public InstitutionalLibraryRepository(JdbcTemplate jdbc) {this.jdbc=jdbc;}
    public record Entry(UUID id,String type,String name,UUID parentId,Instant modifiedAt,UUID modifiedBy,
                        String modifiedByName,long size,String ownerKind,UUID projectId) {}

    public List<Entry> memberDocuments(UUID member,UUID parent,String type,int limit,int offset) {
        return memberDocuments(member,parent,type,limit,offset,false);
    }
    public List<Entry> memberDocuments(UUID member,UUID parent,String type,int limit,int offset,boolean reportsOnly) {
        return jdbc.query("""
                with recursive ancestry(target_id,id,parent_id,depth) as (
                  select id,id,parent_id,0 from nite_connect.document_folders
                    where lifecycle_state='ACTIVE' and archived_at is null
                  union all
                  select a.target_id,p.id,p.parent_id,a.depth+1 from ancestry a
                    join nite_connect.document_folders p on p.id=a.parent_id
                    where p.lifecycle_state='ACTIVE' and p.archived_at is null and a.depth<63
                ), resources as (
                  select f.id,'FOLDER' type,f.name,f.parent_id,f.modified_at,f.modified_by,
                    coalesce((select sum(v.size) from nite_connect.documents d
                      join nite_connect.document_versions v on v.id=d.current_version_id
                      join ancestry a on a.target_id=d.folder_id and a.id=f.id
                      where d.lifecycle_state='ACTIVE' and d.archived_at is null and (not ? or d.classification='REPORT')),0) size,
                    f.resource_owner_kind owner_kind,f.resource_owner_id,
                    (select p.project_id from ancestry a join nite_connect.document_folders p on p.id=a.id
                      where a.target_id=f.id and p.kind='PROJECT' limit 1) location_project_id,
                    f.created_for,f.id ancestry_id
                  from nite_connect.document_folders f
                  where f.kind='CUSTOM' and f.resource_owner_kind in ('INSTITUTION','PROJECT')
                    and f.lifecycle_state='ACTIVE' and f.archived_at is null
                  union all
                  select d.id,'DOCUMENT',d.title,d.folder_id,d.modified_at,d.modified_by,coalesce(v.size,0),
                    d.resource_owner_kind,d.resource_owner_id,d.project_id,d.created_for,d.folder_id
                  from nite_connect.documents d left join nite_connect.document_versions v on v.id=d.current_version_id
                  where d.resource_owner_kind in ('INSTITUTION','PROJECT')
                    and d.lifecycle_state='ACTIVE' and d.archived_at is null
                ), classified as (
                  select d.id,d.folder_id from nite_connect.documents d
                  where d.classification='REPORT' and d.space_owner_id is null
                    and d.resource_owner_kind in ('INSTITUTION','PROJECT')
                    and d.lifecycle_state='ACTIVE' and d.archived_at is null
                    and (d.created_for=? or exists(select 1 from nite_connect.document_grants g
                      where g.member_id=? and g.revoked_at is null and (g.document_id=d.id
                        or g.folder_id in (select a.id from ancestry a where a.target_id=d.folder_id))))
                ), eligible as (
                  select r.* from resources r
                  where (r.created_for=? or exists (
                    select 1 from nite_connect.document_grants g where g.member_id=? and g.revoked_at is null
                    and ((r.type='DOCUMENT' and g.document_id=r.id)
                      or g.folder_id in (select a.id from ancestry a where a.target_id=r.ancestry_id))
                  )) and (not ? or r.id in (select id from classified)
                    or (r.type='FOLDER' and exists(select 1 from classified d join ancestry a on a.target_id=d.folder_id where a.id=r.id)))
                )
                select r.*,m.name modified_by_name from eligible r
                  left join nite_connect.members m on m.id=r.modified_by
                where (?::uuid is null or r.parent_id=?) and (?::varchar is null or r.type=?)
                  and (?::uuid is not null or not ? or not exists(select 1 from eligible p where p.id=r.parent_id))
                order by lower(r.name),r.id limit ? offset ?
                """,(rs,row)->new Entry(rs.getObject("id",UUID.class),rs.getString("type"),rs.getString("name"),
                rs.getObject("parent_id",UUID.class),rs.getTimestamp("modified_at").toInstant(),rs.getObject("modified_by",UUID.class),
                rs.getString("modified_by_name"),rs.getLong("size"),rs.getString("owner_kind"),
                rs.getObject("location_project_id",UUID.class)),
                reportsOnly,member,member,member,member,reportsOnly,parent,parent,type,type,parent,reportsOnly,limit,offset);
    }
    public String classification(UUID id) {
        return jdbc.query("select classification from nite_connect.documents where id=? and lifecycle_state='ACTIVE' and archived_at is null and space_owner_id is null and resource_owner_kind in ('INSTITUTION','PROJECT')",
                (rs,row)->rs.getString(1),id).stream().findFirst().orElseThrow(()->br.edu.unijorge.niteconnect.shared.api.ApiException.conflict("Classificação disponível somente para documentos institucionais fora do espaço pessoal"));
    }
    public void classify(UUID id,String classification,UUID actor) {
        jdbc.update("update nite_connect.documents set classification=?,modified_by=?,modified_at=clock_timestamp() where id=?",classification,actor,id);
    }
}
