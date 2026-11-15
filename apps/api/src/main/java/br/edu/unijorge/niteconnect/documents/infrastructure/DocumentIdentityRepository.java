package br.edu.unijorge.niteconnect.documents.infrastructure;

import br.edu.unijorge.niteconnect.documents.domain.DocumentIdentity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.UUID;

@Repository
public class DocumentIdentityRepository {
    private final JdbcTemplate jdbc;
    public DocumentIdentityRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    private static DocumentIdentity map(ResultSet rs,int row) throws SQLException {
        return new DocumentIdentity(rs.getObject("space_owner_id",UUID.class),rs.getString("resource_owner_kind"),
                rs.getObject("resource_owner_id",UUID.class),rs.getObject("created_by",UUID.class),
                rs.getObject("modified_by",UUID.class),rs.getObject("created_for",UUID.class),
                rs.getString("origin"),rs.getString("protection"),rs.getBoolean("retention_hold"),
                rs.getString("protection_reason"),rs.getObject("protection_set_by",UUID.class),rs.getInt("protection_revision"));
    }
    public DocumentIdentity document(UUID id) {
        return jdbc.query("select * from nite_connect.documents where id=? and archived_at is null and lifecycle_state='ACTIVE'",DocumentIdentityRepository::map,id)
                .stream().findFirst().orElseThrow(br.edu.unijorge.niteconnect.shared.api.ApiException::notFound);
    }
    public DocumentIdentity folder(UUID id) {
        return jdbc.query("select * from nite_connect.document_folders where id=? and archived_at is null and lifecycle_state='ACTIVE'",DocumentIdentityRepository::map,id)
                .stream().findFirst().orElseThrow(br.edu.unijorge.niteconnect.shared.api.ApiException::notFound);
    }
    public void createdDocument(UUID id,String context,UUID holder,UUID project,UUID actor,UUID templateVersion,boolean institutional) {
        String kind,origin,protection;
        UUID owner;
        if(templateVersion!=null) { kind="INSTITUTION";owner=null;origin="INSTITUTIONAL_DISTRIBUTION";protection="OFFICIAL"; }
        else if(institutional) {kind="INSTITUTION";owner=null;origin="INSTITUTIONAL_RECORD";protection="ADMINISTRATIVE";}
        else if("PERSONAL".equals(context)) {
            kind="MEMBER";owner=actor;origin="PERSONAL_CREATED";protection="NONE";
        } else if("PROJECT".equals(context)) {
            kind="PROJECT";owner=project;origin="PROJECT_CREATED";protection="NONE";
        } else {kind="INSTITUTION";owner=null;origin="INSTITUTIONAL_RECORD";protection="ADMINISTRATIVE";}
        jdbc.update("""
                update nite_connect.documents set space_owner_id=?,resource_owner_kind=?,resource_owner_id=?,
                    origin=?,protection=?,created_for=?,protection_reason=?,protection_set_by=?,protection_revision=? where id=?
                """, "PERSONAL".equals(context)?holder:null,kind,owner,origin,protection,
                "PERSONAL".equals(context)&&!actor.equals(holder)?holder:null,
                "NONE".equals(protection)?null:"INSTITUTIONAL_DISTRIBUTION".equals(origin)?"Modelo oficial distribuído":"Conteúdo institucional",
                "NONE".equals(protection)?null:actor,"NONE".equals(protection)?0:1,id);
    }
    public void createdFolder(UUID id,UUID parent,UUID actor,boolean institutional) {
        if(parent==null) {
            jdbc.update("update nite_connect.document_folders set resource_owner_kind='INSTITUTION',origin='INSTITUTIONAL_RECORD',protection='ADMINISTRATIVE',protection_reason='Pasta institucional',protection_set_by=?,protection_revision=1 where id=?",actor,id);
            return;
        }
        DocumentIdentity parentIdentity=folder(parent);
        boolean personal=parentIdentity.spaceOwnerId()!=null;
        String kind=institutional?"INSTITUTION":personal?"MEMBER":parentIdentity.resourceOwnerKind();
        UUID owner=institutional?null:personal?actor:parentIdentity.resourceOwnerId();
        if("UNKNOWN".equals(kind)) owner=null;
        jdbc.update("""
                update nite_connect.document_folders set space_owner_id=?,resource_owner_kind=?,resource_owner_id=?,
                    origin=?,protection=?,created_for=?,protection_reason=?,protection_set_by=?,protection_revision=? where id=?
                """,parentIdentity.spaceOwnerId(),kind,owner,
                institutional?"INSTITUTIONAL_RECORD":personal?"PERSONAL_CREATED":"PROJECT".equals(kind)?"PROJECT_CREATED":"INSTITUTIONAL_RECORD",
                institutional?"ADMINISTRATIVE":"NONE",personal&&!actor.equals(parentIdentity.spaceOwnerId())
                        ?parentIdentity.spaceOwnerId():null,institutional?"Pasta criada pela gestão":null,
                institutional?actor:null,institutional?1:0,id);
    }
    public void markRequestedUpload(UUID document,UUID requester) {
        jdbc.update("update nite_connect.documents set origin='FILE_REQUEST_UPLOAD',created_for=? where id=? and lifecycle_state='ACTIVE'",
                requester,document);
    }
}
