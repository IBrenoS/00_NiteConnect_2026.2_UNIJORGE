package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentRetentionPolicyService {
    private static final String KEY="NITE_DOCUMENTS";
    private final JdbcTemplate jdbc;
    private final AccessService access;

    public DocumentRetentionPolicyService(JdbcTemplate jdbc,AccessService access) {
        this.jdbc=jdbc;this.access=access;
    }
    public record Policy(UUID id,int version,boolean enabled,int days,UUID createdBy,Instant createdAt,
                         UUID approvedBy,Instant approvedAt,Instant effectiveFrom,String creationReason,String approvalReason) {}
    private static final org.springframework.jdbc.core.RowMapper<Policy> MAPPER=(rs,row)->new Policy(
            rs.getObject("id",UUID.class),rs.getInt("version"),rs.getBoolean("enabled"),rs.getInt("minimum_trash_days"),
            rs.getObject("created_by",UUID.class),rs.getTimestamp("created_at").toInstant(),
            rs.getObject("approved_by",UUID.class),rs.getTimestamp("approved_at")==null?null:rs.getTimestamp("approved_at").toInstant(),
            rs.getTimestamp("effective_from")==null?null:rs.getTimestamp("effective_from").toInstant(),
            rs.getString("creation_reason"),rs.getString("approval_reason"));

    public List<Policy> list(UUID actor) {
        access.requireAdministrator(actor);
        return jdbc.query("select * from nite_connect.document_retention_policies where policy_key=? order by version desc",MAPPER,KEY);
    }
    @Transactional
    public Policy draft(UUID actor,String reason) {
        access.requireAdministrator(actor);
        String checked=reason(reason);
        jdbc.execute("select pg_advisory_xact_lock(hashtext('NITE_DOCUMENTS_POLICY'))");
        // The policy is fixed by the approved contract; revisions capture a new version and rationale.
        Integer version=jdbc.queryForObject("select coalesce(max(version),0)+1 from nite_connect.document_retention_policies where policy_key=?",Integer.class,KEY);
        UUID id=UUID.randomUUID();
        UUID previous=jdbc.query("select id from nite_connect.document_retention_policies where policy_key=? order by version desc limit 1",
                (rs,row)->rs.getObject(1,UUID.class),KEY).stream().findFirst().orElse(null);
        jdbc.update("""
                insert into nite_connect.document_retention_policies
                (id,policy_key,version,scope,minimum_trash_days,enabled,policy_hash,created_by,creation_reason,supersedes_id)
                values (?,? ,?,'GLOBAL',30,false,?,?,?,?)
                """,id,KEY,version,hash(KEY+":"+version+":GLOBAL:30"),actor,checked,previous);
        event(id,actor,"CREATED",checked);
        return require(id);
    }
    @Transactional
    public Policy approve(UUID actor,UUID id,String reason) {
        access.requireAdministrator(actor);
        String checked=reason(reason);
        jdbc.execute("select pg_advisory_xact_lock(hashtext('NITE_DOCUMENTS_POLICY'))");
        Policy policy=require(id);
        if(policy.enabled()||policy.approvedAt()!=null) throw ApiException.conflict("Versão da política já decidida");
        Integer latest=jdbc.queryForObject("select max(version) from nite_connect.document_retention_policies where policy_key=?",Integer.class,KEY);
        if(policy.version()!=latest) throw ApiException.conflict("Somente a versão mais recente pode entrar em vigor");
        var superseded=jdbc.query("select id from nite_connect.document_retention_policies where policy_key=? and enabled",
                (rs,row)->rs.getObject(1,UUID.class),KEY);
        jdbc.update("update nite_connect.document_retention_policies set enabled=false,effective_until=clock_timestamp() where policy_key=? and enabled",KEY);
        for(UUID prior:superseded) event(prior,actor,"SUPERSEDED",checked);
        jdbc.update("""
                update nite_connect.document_retention_policies set enabled=true,approved_by=?,approved_at=clock_timestamp(),
                  effective_from=clock_timestamp(),approval_reason=? where id=? and enabled=false and approved_at is null
                """,actor,checked,id);
        event(id,actor,"APPROVED",checked);
        return require(id);
    }
    private Policy require(UUID id) {
        return jdbc.query("select * from nite_connect.document_retention_policies where id=? and policy_key=?",MAPPER,id,KEY)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }
    private void event(UUID policy,UUID actor,String action,String reason) {
        jdbc.update("insert into nite_connect.document_retention_policy_events(id,policy_id,actor_id,action,reason) values (?,?,?,?,?)",
                UUID.randomUUID(),policy,actor,action,reason);
    }
    private static String reason(String value) {
        if(value==null||value.isBlank()||value.length()>1000) throw ApiException.invalid("Motivo obrigatório (máximo 1000 caracteres)");
        return value.strip();
    }
    private static String hash(String value) {
        try {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}
        catch(NoSuchAlgorithmException impossible) {throw new IllegalStateException(impossible);}
    }
}
