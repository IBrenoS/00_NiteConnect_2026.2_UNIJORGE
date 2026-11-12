package br.edu.unijorge.niteconnect.members.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.audit.application.AuditTrail;
import br.edu.unijorge.niteconnect.identity.application.EntraProperties;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import br.edu.unijorge.niteconnect.members.domain.Member;
import br.edu.unijorge.niteconnect.members.domain.MemberStatus;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import br.edu.unijorge.niteconnect.shared.security.AdministrativeTransactions;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.ObjectProvider;
import br.edu.unijorge.niteconnect.documents.application.DocumentLibraryService;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
@ConditionalOnProperty(name="nite.entra.enabled", havingValue="true")
public class InvitationService {
    private final JdbcTemplate jdbc;
    private final MemberDirectory members;
    private final MemberAdministration administration;
    private final AccessService access;
    private final IdentityDirectory identities;
    private final EntraProperties entra;
    private final AuditTrail audit;
    private final AdministrativeTransactions transactions;
    private final ObjectProvider<DocumentLibraryService> documentLibrary;

    private static final RowMapper<Invitation> MAPPER = (rs, row) -> new Invitation(rs.getObject("id", UUID.class),
            rs.getObject("member_id", UUID.class), rs.getObject("tenant_id", UUID.class), rs.getObject("object_id", UUID.class),
            rs.getObject("created_by", UUID.class), rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("expires_at").toInstant(),
            rs.getTimestamp("accepted_at") == null ? null : rs.getTimestamp("accepted_at").toInstant(),
            rs.getTimestamp("revoked_at") == null ? null : rs.getTimestamp("revoked_at").toInstant());

    public InvitationService(JdbcTemplate jdbc, MemberDirectory members, MemberAdministration administration,
            AccessService access, IdentityDirectory identities, EntraProperties entra, AuditTrail audit, AdministrativeTransactions transactions,
            ObjectProvider<DocumentLibraryService> documentLibrary) {
        this.jdbc=jdbc; this.members=members; this.administration=administration; this.access=access;
        this.identities=identities; this.entra=entra; this.audit=audit; this.transactions=transactions;this.documentLibrary=documentLibrary;
    }
    @Transactional
    public Invitation create(UUID actor, UUID target, UUID object, Instant expiresAt, String reason) {
        transactions.lock(); access.requireAdministrator(actor);
        Member member = members.require(target);
        if (member.status() != MemberStatus.PENDENTE_INGRESSO || identities.hasIdentity(target)
                || identities.identityExists(entra.tenantId(), object)) throw ApiException.conflict("Cadastro ou identidade já vinculados");
        if (!expiresAt.isAfter(Instant.now())) throw ApiException.invalid("Expiração deve ser futura");
        UUID id = UUID.randomUUID();
        jdbc.update("insert into nite_connect.invitations(id,member_id,tenant_id,object_id,created_by,expires_at) values (?,?,?,?,?,?)",
                id, target, entra.tenantId(), object, actor, java.sql.Timestamp.from(expiresAt));
        audit.record(actor, target, "INVITATION_CREATED", null, id.toString(), reason);
        return require(id);
    }
    @Transactional(readOnly=true)
    public PageResult<Invitation> list(UUID actor, int page, int size) {
        access.requireAdministrator(actor); PageResult.validate(page,size);
        return new PageResult<>(jdbc.query("select * from nite_connect.invitations order by created_at desc,id limit ? offset ?", MAPPER,
                size, (long) page*size), page, size, jdbc.queryForObject("select count(*) from nite_connect.invitations", Long.class));
    }
    @Transactional
    public Member accept(UUID id, UUID tenant, UUID object) {
        transactions.lock();
        Invitation invitation = require(id);
        if (!invitation.tenantId().equals(tenant) || !invitation.objectId().equals(object)) throw ApiException.notFound();
        Member member = members.require(invitation.memberId());
        if (invitation.acceptedAt() != null) {
            // Replays never reactivate a suspended member or bind a different account.
            if (member.status() != MemberStatus.ATIVO) throw ApiException.forbidden();
            DocumentLibraryService library=documentLibrary.getIfAvailable();
            if(library!=null) library.provision(member.id());
            return member;
        }
        if (invitation.revokedAt() != null || !invitation.expiresAt().isAfter(Instant.now())) throw ApiException.conflict("Convite revogado ou expirado");
        if (member.status() != MemberStatus.PENDENTE_INGRESSO) throw ApiException.conflict("Ingresso incompatível com a situação atual");
        identities.link(tenant, object, member.id());
        Member activated = members.status(member.id(), MemberStatus.ATIVO, member.version());
        jdbc.update("update nite_connect.invitations set accepted_at=current_timestamp where id=?", id);
        administration.recordStatus(member.id(), member.id(), member.status(), MemberStatus.ATIVO, "Aceite de convite autorizado");
        audit.record(member.id(), member.id(), "INVITATION_ACCEPTED", member.status().name(), MemberStatus.ATIVO.name(), "Aceite de convite autorizado");
        DocumentLibraryService library=documentLibrary.getIfAvailable();
        if(library!=null) library.provision(activated.id());
        return activated;
    }
    @Transactional
    public void revoke(UUID actor, UUID id, String reason) {
        transactions.lock(); access.requireAdministrator(actor);
        Invitation invitation = require(id);
        if (invitation.acceptedAt() != null) throw ApiException.conflict("Convite já aceito; altere a situação do integrante");
        if (invitation.revokedAt() != null) return;
        jdbc.update("update nite_connect.invitations set revoked_at=current_timestamp where id=?", id);
        audit.record(actor, invitation.memberId(), "INVITATION_REVOKED", id.toString(), null, reason);
    }
    private Invitation require(UUID id) {
        return jdbc.query("select * from nite_connect.invitations where id=?", MAPPER, id).stream().findFirst().orElseThrow(ApiException::notFound);
    }
    public record Invitation(UUID id, UUID memberId, UUID tenantId, UUID objectId, UUID createdBy,
                             Instant createdAt, Instant expiresAt, Instant acceptedAt, Instant revokedAt) {}
}
