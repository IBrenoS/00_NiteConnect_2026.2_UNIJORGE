package br.edu.unijorge.niteconnect.members.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.domain.GlobalRole;
import br.edu.unijorge.niteconnect.audit.application.AuditTrail;
import br.edu.unijorge.niteconnect.documents.application.DocumentLibraryService;
import br.edu.unijorge.niteconnect.identity.application.EntraProperties;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import br.edu.unijorge.niteconnect.members.domain.Member;
import br.edu.unijorge.niteconnect.members.domain.MemberStatus;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import br.edu.unijorge.niteconnect.shared.security.AdministrativeTransactions;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import tools.jackson.databind.ObjectMapper;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

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
    private final InvitationMailSender mail;
    private final ObjectMapper json;

    private static final RowMapper<Invitation> MAPPER = (rs, row) -> new Invitation(
            rs.getObject("id", UUID.class), rs.getObject("member_id", UUID.class), rs.getString("name"),
            rs.getString("institutional_email"), rs.getObject("tenant_id", UUID.class),
            rs.getObject("object_id", UUID.class), rs.getObject("created_by", UUID.class),
            rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("expires_at").toInstant(),
            rs.getTimestamp("accepted_at") == null ? null : rs.getTimestamp("accepted_at").toInstant(),
            rs.getTimestamp("revoked_at") == null ? null : rs.getTimestamp("revoked_at").toInstant(),
            InitialRole.valueOf(rs.getString("initial_role")), rs.getString("message"),
            rs.getString("send_state"), rs.getString("provider_message_id"), rs.getInt("send_attempts"),
            rs.getString("send_error_code"), rs.getTimestamp("last_send_at") == null ? null : rs.getTimestamp("last_send_at").toInstant());

    public InvitationService(JdbcTemplate jdbc, MemberDirectory members, MemberAdministration administration,
            AccessService access, IdentityDirectory identities, EntraProperties entra, AuditTrail audit,
            AdministrativeTransactions transactions, ObjectProvider<DocumentLibraryService> documentLibrary,
            InvitationMailSender mail, ObjectMapper json) {
        this.jdbc=jdbc; this.members=members; this.administration=administration; this.access=access;
        this.identities=identities; this.entra=entra; this.audit=audit; this.transactions=transactions;
        this.documentLibrary=documentLibrary; this.mail=mail; this.json=json;
    }

    @Transactional
    public Invitation create(UUID actor, String name, String email, InitialRole role) {
        access.requireAdministrator(actor);
        MemberDirectory.validate(name, email);
        if (role == null) throw ApiException.invalid("Papel inicial é obrigatório");
        Instant issuedAt = Instant.now();
        Instant expiresAt = issuedAt.plusSeconds(3 * 24 * 3600L);
        String normalized = MemberDirectory.normalizeEmail(email);
        transactions.lock(); access.requireAdministrator(actor);
        if (!expiresAt.isAfter(Instant.now())) throw ApiException.invalid("Expiração deve ser futura");
        Member member = jdbc.query("select id from nite_connect.members where institutional_email=?",
                (rs, row) -> members.require(rs.getObject(1, UUID.class)), normalized).stream().findFirst().orElse(null);
        if (member == null) {
            member = members.create(name, normalized, MemberStatus.PENDENTE_INGRESSO);
            administration.recordStatus(actor, member.id(), null, member.status(), "Cadastro por convite");
            audit.record(actor, member.id(), "MEMBER_CREATED", null, member.status().name(), "Cadastro por convite");
        } else if (member.status() != MemberStatus.PENDENTE_INGRESSO || identities.hasIdentity(member.id())) {
            throw ApiException.conflict("Cadastro ou identidade já vinculados");
        } else if (!member.name().equals(name.strip())) {
            member = members.update(member.id(), name, normalized, member.version());
        }
        if (Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from nite_connect.invitations where member_id=? and accepted_at is null and revoked_at is null and expires_at>current_timestamp)", Boolean.class, member.id())))
            throw ApiException.conflict("Já existe convite pendente para este e-mail");
        jdbc.update("update nite_connect.invitations set revoked_at=current_timestamp where member_id=? and accepted_at is null and revoked_at is null and expires_at<=current_timestamp", member.id());
        UUID id = UUID.randomUUID();
        jdbc.update("insert into nite_connect.invitations(id,member_id,tenant_id,object_id,created_by,expires_at,initial_role) values (?,?,?,?,?,?,?)",
                id, member.id(), entra.tenantId(), null, actor, Timestamp.from(expiresAt), role.name());
        audit.record(actor, member.id(), "INVITATION_CREATED", null, id.toString(), "Convite institucional criado");
        return require(id);
    }

    @Transactional(readOnly=true)
    public PageResult<Invitation> list(UUID actor, int page, int size, String state, String query) {
        access.requireAdministrator(actor); PageResult.validate(page,size);
        String filter = switch (state == null ? "ALL" : state) {
            case "ALL" -> "";
            case "PENDING" -> " and i.accepted_at is null and i.revoked_at is null and i.expires_at>current_timestamp and i.send_state not in ('FAILED','BOUNCED','SUPPRESSED','PROVIDER_FAILED')";
            case "ACCEPTED" -> " and i.accepted_at is not null";
            case "EXPIRED" -> " and i.accepted_at is null and i.revoked_at is null and i.expires_at<=current_timestamp";
            case "REVOKED" -> " and i.revoked_at is not null";
            case "SEND_FAILED" -> " and i.send_state in ('FAILED','BOUNCED','SUPPRESSED','PROVIDER_FAILED') and i.accepted_at is null and i.revoked_at is null and i.expires_at>current_timestamp";
            default -> throw ApiException.invalid("Situação de convite inválida");
        };
        String term = query == null ? "" : query.strip();
        if (term.length() > 160) throw ApiException.invalid("Pesquisa deve ter até 160 caracteres");
        String escaped = "%" + term.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        String from = " from nite_connect.invitations i join nite_connect.members m on m.id=i.member_id where true" + filter
                + " and (m.name ilike ? escape '!' or m.institutional_email ilike ? escape '!')";
        return new PageResult<>(jdbc.query("select i.*,m.name,m.institutional_email" + from + " order by i.created_at desc,i.id limit ? offset ?", MAPPER,
                escaped, escaped, size, (long) page*size), page, size, jdbc.queryForObject("select count(*)" + from, Long.class, escaped, escaped));
    }

    @Transactional
    public Invitation dispatch(UUID actor, UUID id) {
        transactions.lock(); access.requireAdministrator(actor);
        Invitation invitation = require(id);
        if (invitation.acceptedAt() != null || invitation.revokedAt() != null || !invitation.expiresAt().isAfter(Instant.now()))
            throw ApiException.conflict("Convite não está disponível para envio");
        if (invitation.providerMessageId() != null) return invitation;
        if (invitation.lastSendAt() != null && invitation.lastSendAt().isBefore(Instant.now().minusSeconds(23 * 3600L))
                && ("TRANSPORT_ERROR".equals(invitation.sendErrorCode()) || "INTERRUPTED".equals(invitation.sendErrorCode())
                    || invitation.sendErrorCode() != null && invitation.sendErrorCode().matches("HTTP_5\\d\\d")))
            throw ApiException.conflict("Resultado do envio incerto fora da janela de repetição segura; revogue e crie novo convite");
        InvitationMailSender.SendResult result = mail.send(id, invitation.name(), invitation.email(),
                invitation.initialRole().name(), null, invitation.expiresAt());
        jdbc.update("update nite_connect.invitations set send_state=?,provider_message_id=?,send_error_code=?,send_attempts=send_attempts+1,last_send_at=current_timestamp where id=?",
                result.errorCode() == null ? "ACCEPTED_BY_PROVIDER" : "FAILED", result.providerId(), result.errorCode(), id);
        audit.record(actor, invitation.memberId(), result.errorCode() == null ? "INVITATION_SEND_ACCEPTED" : "INVITATION_SEND_FAILED",
                null, id.toString(), "Tentativa de envio do convite");
        return require(id);
    }

    @Transactional
    public void recordDeliveryEvent(byte[] body) {
        String state;
        String messageId;
        String recipient;
        Instant occurredAt;
        String type;
        try {
            var event = json.readTree(body);
            type = event.path("type").asText("");
            state = switch (type) {
                case "email.delivery_delayed" -> "DELIVERY_DELAYED";
                case "email.delivered" -> "DELIVERED";
                case "email.bounced" -> "BOUNCED";
                case "email.suppressed" -> "SUPPRESSED";
                case "email.failed" -> "PROVIDER_FAILED";
                default -> null;
            };
            if (state == null) return;
            var data = event.path("data");
            messageId = data.path("email_id").asText("");
            var recipients = data.path("to");
            if (messageId.isBlank() || messageId.length() > 128 || !recipients.isArray() || recipients.size() != 1) return;
            recipient = recipients.get(0).asText("");
            if (recipient.isBlank()) return;
            occurredAt = Instant.parse(event.path("created_at").asText());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Evento inválido");
        }
        jdbc.update("""
                update nite_connect.invitations i set send_state=?,send_error_code=?,last_delivery_event_at=?
                from nite_connect.members m
                where i.member_id=m.id and i.provider_message_id=? and lower(m.institutional_email)=lower(?)
                  and i.send_state<>? and (i.last_delivery_event_at is null or i.last_delivery_event_at<=?)
                """, state, switch (state) {
                    case "BOUNCED", "SUPPRESSED", "PROVIDER_FAILED" -> type.toUpperCase().replace('.', '_');
                    default -> null;
                }, Timestamp.from(occurredAt), messageId, recipient, state, Timestamp.from(occurredAt));
    }

    @Transactional
    public Member accept(UUID id, Jwt jwt) {
        transactions.lock();
        Invitation invitation = require(id);
        UUID tenant = identities.tenant(jwt), object = identities.object(jwt);
        if (!entra.tenantId().equals(tenant) || !invitation.tenantId().equals(tenant)) throw ApiException.notFound();
        if (invitation.objectId() != null && !invitation.objectId().equals(object)) throw ApiException.notFound();
        Member member = members.require(invitation.memberId());
        if (invitation.objectId() == null && !matchesInvitedEmail(jwt, invitation.email())) throw ApiException.notFound();
        if (invitation.acceptedAt() != null) {
            if (member.status() != MemberStatus.ATIVO || identities.memberForIdentity(tenant, object).filter(member.id()::equals).isEmpty())
                throw ApiException.forbidden();
            return member;
        }
        if (invitation.revokedAt() != null || !invitation.expiresAt().isAfter(Instant.now())) throw ApiException.conflict("Convite revogado ou expirado");
        if (member.status() != MemberStatus.PENDENTE_INGRESSO || identities.hasIdentity(member.id()) || identities.identityExists(tenant, object))
            throw ApiException.conflict("Ingresso incompatível com a identidade ou situação atual");
        identities.link(tenant, object, member.id());
        Member activated = members.status(member.id(), MemberStatus.ATIVO, member.version());
        jdbc.update("update nite_connect.invitations set object_id=?,accepted_at=current_timestamp where id=?", object, id);
        administration.recordStatus(member.id(), member.id(), member.status(), MemberStatus.ATIVO, "Aceite de convite autorizado");
        audit.record(member.id(), member.id(), "INVITATION_ACCEPTED", member.status().name(), MemberStatus.ATIVO.name(), "Aceite de convite autorizado");
        if (invitation.initialRole() != InitialRole.INTEGRANTE) {
            access.grantInvitedInitialRole(invitation.createdBy(), member.id(),
                    GlobalRole.valueOf(invitation.initialRole().name()), activated.version(), id);
            activated = members.require(member.id());
        }
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
        audit.record(actor, invitation.memberId(), "INVITATION_REVOKED", id.toString(), null,
                reason == null || reason.isBlank() ? "Convite revogado" : reason);
    }

    private Invitation require(UUID id) {
        return jdbc.query("select i.*,m.name,m.institutional_email from nite_connect.invitations i join nite_connect.members m on m.id=i.member_id where i.id=?", MAPPER, id)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }

    private boolean matchesInvitedEmail(Jwt jwt, String invitedEmail) {
        for (String claim : java.util.List.of("email", "preferred_username", "upn")) {
            String value = jwt.getClaimAsString(claim);
            if (value != null && !value.contains("#EXT#") && invitedEmail.equalsIgnoreCase(value.strip())) return true;
        }
        return false;
    }

    public enum InitialRole { INTEGRANTE, GESTOR_PROJETO, GESTOR_GERAL, COORDENADOR }
    public record Invitation(UUID id, UUID memberId, String name, String email, UUID tenantId, UUID objectId,
            UUID createdBy, Instant createdAt, Instant expiresAt, Instant acceptedAt, Instant revokedAt,
            InitialRole initialRole, String message, String sendState, String providerMessageId,
            int sendAttempts, String sendErrorCode, Instant lastSendAt) {}
}
