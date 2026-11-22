package br.edu.unijorge.niteconnect.members.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.audit.application.AuditTrail;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import br.edu.unijorge.niteconnect.members.domain.Member;
import br.edu.unijorge.niteconnect.members.domain.MemberStatus;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import br.edu.unijorge.niteconnect.shared.security.AdministrativeTransactions;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
public class MemberAdministration {
    private final MemberDirectory members;
    private final AccessService access;
    private final AuditTrail audit;
    private final IdentityDirectory identities;
    private final AdministrativeTransactions transactions;
    private final JdbcTemplate jdbc;

    public MemberAdministration(MemberDirectory members, AccessService access, AuditTrail audit,
                                IdentityDirectory identities, AdministrativeTransactions transactions, JdbcTemplate jdbc) {
        this.members = members; this.access = access; this.audit = audit; this.identities = identities;
        this.transactions = transactions; this.jdbc = jdbc;
    }
    @Transactional(readOnly = true)
    public PageResult<Member> list(UUID actor, int page, int size, MemberStatus status) {
        access.requireAdministrator(actor);
        return members.list(page, size, status);
    }
    @Transactional(readOnly = true)
    public Member read(UUID actor, UUID target) {
        access.requireActive(actor);
        if (!actor.equals(target) && !access.isAdministrator(actor)) throw ApiException.notFound();
        return members.require(target);
    }
    @Transactional
    public Member create(UUID actor, String name, String email) {
        transactions.lock(); access.requireAdministrator(actor);
        Member member = members.create(name, email, MemberStatus.PENDENTE_INGRESSO);
        recordStatus(actor, member.id(), null, member.status(), "Cadastro administrativo");
        audit.record(actor, member.id(), "MEMBER_CREATED", null, member.status().name(), "Cadastro administrativo");
        return member;
    }
    @Transactional
    public Member update(UUID actor, UUID target, String name, String email, long version, String reason) {
        transactions.lock(); access.requireAdministrator(actor);
        Member before = members.require(target);
        if (!before.institutionalEmail().equalsIgnoreCase(email.strip()))
            throw ApiException.invalid("E-mail institucional vinculado ao Entra não pode ser alterado pela gestão");
        Member after = members.update(target, name, email, version);
        audit.record(actor, target, "MEMBER_UPDATED", before.name() + " <" + before.institutionalEmail() + ">",
                after.name() + " <" + after.institutionalEmail() + ">", reason);
        return after;
    }
    @Transactional
    public Member changeStatus(UUID actor, UUID target, MemberStatus next, long version, String reason) {
        transactions.lock(); access.requireAdministrator(actor);
        Member before = members.require(target);
        members.checkVersion(before, version);
        if (next == before.status()) throw ApiException.conflict("Integrante já possui a situação solicitada");
        if (before.status() == MemberStatus.PENDENTE_INGRESSO || next == MemberStatus.PENDENTE_INGRESSO) {
            throw ApiException.conflict("Ingresso pendente deve ser concluído por convite autorizado");
        }
        if (next == MemberStatus.ATIVO && !identities.hasIdentity(target)) throw ApiException.conflict("Identidade institucional não vinculada");
        if (before.status() == MemberStatus.ATIVO && next != MemberStatus.ATIVO) access.ensureAnotherAdministrator(target);
        Member after = members.status(target, next, version);
        recordStatus(actor, target, before.status(), next, reason);
        audit.record(actor, target, "MEMBER_STATUS_CHANGED", before.status().name(), next.name(), reason);
        return after;
    }
    @Transactional(readOnly = true)
    public PageResult<StatusEvent> history(UUID actor, UUID target, int page, int size) {
        access.requireAdministrator(actor); members.require(target); PageResult.validate(page, size);
        return new PageResult<>(jdbc.query("select * from nite_connect.member_status_history where member_id=? order by occurred_at desc,id limit ? offset ?",
                (rs, row) -> new StatusEvent(rs.getObject("id", UUID.class), rs.getObject("actor_id", UUID.class),
                        rs.getString("previous_status"), rs.getString("new_status"), rs.getString("reason"), rs.getTimestamp("occurred_at").toInstant()),
                target, size, (long) page * size), page, size,
                jdbc.queryForObject("select count(*) from nite_connect.member_status_history where member_id=?", Long.class, target));
    }
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public void recordStatus(UUID actor, UUID target, MemberStatus before, MemberStatus after, String reason) {
        jdbc.update("insert into nite_connect.member_status_history(id,member_id,actor_id,previous_status,new_status,reason) values (?,?,?,?,?,?)",
                UUID.randomUUID(), target, actor, before == null ? null : before.name(), after.name(), reason);
    }
    public record StatusEvent(UUID id, UUID actorId, String previousStatus, String newStatus, String reason, Instant occurredAt) {}
}
