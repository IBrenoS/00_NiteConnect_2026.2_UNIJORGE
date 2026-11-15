package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.UUID;

@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentPurgeActivationService {
    private final JdbcTemplate jdbc;
    private final AccessService access;
    public DocumentPurgeActivationService(JdbcTemplate jdbc,AccessService access) {this.jdbc=jdbc;this.access=access;}
    public record Activation(boolean enabled,boolean versioningVerified,boolean backupVerified,
            boolean reconciliationVerified,boolean permissionsVerified,boolean recoveryVerified,
            UUID changedBy,Instant changedAt,String reason) {}
    private static final org.springframework.jdbc.core.RowMapper<Activation> MAPPER=(rs,row)->new Activation(
            rs.getBoolean("enabled"),rs.getBoolean("versioning_verified"),rs.getBoolean("backup_verified"),
            rs.getBoolean("reconciliation_verified"),rs.getBoolean("permissions_verified"),rs.getBoolean("recovery_verified"),
            rs.getObject("changed_by",UUID.class),rs.getTimestamp("changed_at")==null?null:rs.getTimestamp("changed_at").toInstant(),
            rs.getString("reason"));
    public Activation current(UUID actor) {
        access.requireAdministrator(actor);
        return jdbc.queryForObject("select * from nite_connect.document_purge_activation where id=true",MAPPER);
    }
    @Transactional
    public Activation change(UUID actor,Activation input) {
        access.requireAdministrator(actor);
        if(input.reason()==null||input.reason().isBlank()||input.reason().length()>1000)
            throw ApiException.invalid("Motivo obrigatório (máximo 1000 caracteres)");
        if(input.enabled()) {
            if(!input.versioningVerified()||!input.backupVerified()||!input.reconciliationVerified()
                    ||!input.permissionsVerified()||!input.recoveryVerified())
                throw ApiException.conflict("Homologação técnica incompleta");
            boolean policy=Boolean.TRUE.equals(jdbc.queryForObject("""
                    select exists(select 1 from nite_connect.document_retention_policies
                      where policy_key='NITE_DOCUMENTS' and enabled and minimum_trash_days=30
                        and effective_from<=clock_timestamp() and (effective_until is null or effective_until>clock_timestamp()))
                    """,Boolean.class));
            if(!policy) throw ApiException.conflict("Política interna de 30 dias ainda não está vigente");
        }
        jdbc.update("""
                update nite_connect.document_purge_activation set enabled=?,versioning_verified=?,backup_verified=?,
                  reconciliation_verified=?,permissions_verified=?,recovery_verified=?,changed_by=?,changed_at=clock_timestamp(),reason=?
                where id=true
                """,input.enabled(),input.versioningVerified(),input.backupVerified(),input.reconciliationVerified(),
                input.permissionsVerified(),input.recoveryVerified(),actor,input.reason().strip());
        jdbc.update("""
                insert into nite_connect.document_purge_activation_events(id,actor_id,enabled,reason,versioning_verified,
                  backup_verified,reconciliation_verified,permissions_verified,recovery_verified)
                values (?,?,?,?,?,?,?,?,?)
                """,UUID.randomUUID(),actor,input.enabled(),input.reason().strip(),input.versioningVerified(),
                input.backupVerified(),input.reconciliationVerified(),input.permissionsVerified(),input.recoveryVerified());
        return current(actor);
    }
}
