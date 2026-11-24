package br.edu.unijorge.niteconnect.access.application;

import br.edu.unijorge.niteconnect.access.domain.GlobalRole;
import br.edu.unijorge.niteconnect.audit.application.AuditTrail;
import br.edu.unijorge.niteconnect.members.application.MemberDirectory;
import br.edu.unijorge.niteconnect.members.domain.Member;
import br.edu.unijorge.niteconnect.members.domain.MemberStatus;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.security.AdministrativeTransactions;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class AccessService {
    private static final Logger log = LoggerFactory.getLogger(AccessService.class);
    private final JdbcTemplate jdbc;
    private final MemberDirectory members;
    private final AuditTrail audit;
    private final AdministrativeTransactions transactions;

    public AccessService(JdbcTemplate jdbc, MemberDirectory members, AuditTrail audit, AdministrativeTransactions transactions) {
        this.jdbc = jdbc; this.members = members; this.audit = audit; this.transactions = transactions;
    }
    public Member requireActive(UUID id) {
        Member member = members.require(id);
        if (member.status() != MemberStatus.ATIVO) {
            log.warn("NITE authorization denied: member is not active");
            throw ApiException.forbidden();
        }
        return member;
    }
    public boolean isAdministrator(UUID id) {
        return institutionalRoles(id).stream().anyMatch(GlobalRole::grantsGlobalAdministration);
    }
    public boolean canLeadProject(UUID id) {
        return institutionalRoles(id).stream().anyMatch(GlobalRole::qualifiesForProjectLeadership);
    }
    public void requireAdministrator(UUID id) {
        requireActive(id);
        if (!isAdministrator(id)) {
            log.warn("NITE authorization denied: administrative role is missing");
            throw ApiException.forbidden();
        }
    }
    public List<String> effectiveRoles(UUID id) {
        requireActive(id);
        List<String> roles = new ArrayList<>();
        roles.add("INTEGRANTE");
        institutionalRoles(id).forEach(role -> roles.add(role.name()));
        return List.copyOf(roles);
    }
    public List<GlobalRole> institutionalRoles(UUID id) {
        return jdbc.query("select role from nite_connect.role_assignments where member_id=? order by role",
                (rs, row) -> GlobalRole.valueOf(rs.getString(1)), id);
    }
    public void ensureAnotherAdministrator(UUID target) {
        if (!isAdministrator(target)) return;
        boolean another = jdbc.query("select distinct member_id from nite_connect.role_assignments where member_id<>? and role in ('GESTOR_GERAL','COORDENADOR')",
                        (rs, row) -> rs.getObject(1, UUID.class), target).stream()
                .anyMatch(id -> members.require(id).status() == MemberStatus.ATIVO);
        if (!another) throw ApiException.conflict("É necessário preservar um administrador ativo");
    }
    @Transactional
    public List<String> grant(UUID actor, UUID target, GlobalRole role, long expectedVersion, String reason) {
        transactions.lock();
        requireAdministrator(actor);
        return grantAuthorized(actor, target, role, expectedVersion, reason);
    }
    /** Authorization for this role was recorded when the invitation was created. */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public List<String> grantInvitedInitialRole(UUID inviter, UUID target, GlobalRole role, long expectedVersion, UUID invitation) {
        return grantAuthorized(inviter, target, role, expectedVersion, "Papel inicial do convite " + invitation);
    }
    private List<String> grantAuthorized(UUID actor, UUID target, GlobalRole role, long expectedVersion, String reason) {
        requireActive(target);
        members.checkVersion(members.require(target), expectedVersion);
        if (institutionalRoles(target).contains(role)) throw ApiException.conflict("Papel já atribuído");
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,?,?,?)",
                target, role.name(), actor, reason);
        members.touch(target, expectedVersion);
        audit.record(actor, target, "ROLE_GRANTED", null, role.name(), reason);
        return effectiveRoles(target);
    }
    @Transactional
    public void revoke(UUID actor, UUID target, GlobalRole role, long expectedVersion, String reason) {
        transactions.lock();
        requireAdministrator(actor);
        Member member = members.require(target);
        members.checkVersion(member, expectedVersion);
        List<GlobalRole> roles = institutionalRoles(target);
        if (!roles.contains(role)) throw ApiException.notFound();
        if (role.grantsGlobalAdministration() && member.status() == MemberStatus.ATIVO
                && roles.stream().filter(GlobalRole::grantsGlobalAdministration).count() == 1) ensureAnotherAdministrator(target);
        if (roles.stream().filter(GlobalRole::qualifiesForProjectLeadership).count() == 1
                && Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from nite_connect.project_leadership_history where member_id=? and ended_at is null)", Boolean.class, target))) {
            throw ApiException.conflict("Encerre ou transfira as lideranças vigentes antes de revogar o papel");
        }
        jdbc.update("delete from nite_connect.role_assignments where member_id=? and role=?", target, role.name());
        members.touch(target, expectedVersion);
        audit.record(actor, target, "ROLE_REVOKED", role.name(), null, reason);
    }
    /** Used only by the local, one-shot bootstrap transaction. */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public void initialGlobalAdministrator(UUID member, GlobalRole role, String reason) {
        if (!role.grantsGlobalAdministration()) throw ApiException.invalid("Papel inicial deve conceder administração global");
        if (jdbc.queryForObject("select count(*) from nite_connect.role_assignments", Long.class) != 0) {
            throw ApiException.conflict("Provisionamento inicial já realizado");
        }
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,?,?,?)",
                member, role.name(), member, reason);
        audit.record(member, member, "ROLE_GRANTED", null, role.name(), reason);
    }
}
