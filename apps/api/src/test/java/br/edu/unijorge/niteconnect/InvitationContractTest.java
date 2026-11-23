package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.members.application.InvitationMailSender;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class InvitationContractTest extends ProjectTestSupport {
    @MockitoBean InvitationMailSender mail;
    private final java.util.Map<String, UUID> resolved = new java.util.HashMap<>();

    private SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor recipient(UUID oid, String email) {
        return SecurityMockMvcRequestPostProcessors.jwt().jwt(j -> j.claim("tid", TENANT.toString())
                .claim("oid", oid.toString()).claim("preferred_username", email));
    }

    private UUID create(String email, String role) throws Exception {
        UUID oid=UUID.randomUUID();
        resolved.put(email,oid);
        when(mail.send(any(), anyString(), anyString(), anyString(), nullable(String.class), any()))
                .thenReturn(new InvitationMailSender.SendResult("resend-test-id", null));
        mvc.perform(post("/api/v1/invitations").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Pessoa Convidada\",\"institutionalEmail\":\"" + email
                        + "\",\"initialRole\":\"" + role + "\",\"expiresAt\":\"" + Instant.now().plusSeconds(3600) + "\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.sendState").value("ACCEPTED_BY_PROVIDER"));
        return jdbc.queryForObject("select id from nite_connect.invitations where member_id=(select id from nite_connect.members where institutional_email=?)", UUID.class, email);
    }

    @ParameterizedTest
    @ValueSource(strings={"INTEGRANTE","GESTOR_PROJETO","GESTOR_GERAL","COORDENADOR"})
    void acceptsAllInitialRolesWithoutProjectAndKeepsInviterInHistory(String role) throws Exception {
        String email = "invite-" + role.toLowerCase() + "@unijorge.com.br";
        UUID id = create(email, role), oid = resolved.get(email);
        assertThat(jdbc.queryForObject("select object_id from nite_connect.invitations where id=?", UUID.class, id)).isNull();
        mvc.perform(post("/api/v1/invitations/" + id + "/accept").with(recipient(oid, email)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ATIVO"));
        assertThat(jdbc.queryForObject("select object_id from nite_connect.invitations where id=?", UUID.class, id)).isEqualTo(oid);
        mvc.perform(post("/api/v1/invitations/" + id + "/accept").with(recipient(oid, email)))
                .andExpect(status().isOk());
        UUID member = jdbc.queryForObject("select member_id from nite_connect.invitations where id=?", UUID.class, id);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.identity_accounts where member_id=? and object_id=?", Integer.class, member, oid)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where member_id=?", Integer.class, member)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where member_id=? and action='INVITATION_ACCEPTED'", Integer.class, member)).isEqualTo(1);
        if (!role.equals("INTEGRANTE")) {
            assertThat(jdbc.queryForObject("select granted_by from nite_connect.role_assignments where member_id=?", UUID.class, member)).isEqualTo(ADMIN);
            assertThat(jdbc.queryForObject("select actor_id from nite_connect.audit_events where member_id=? and action='ROLE_GRANTED'", UUID.class, member)).isEqualTo(ADMIN);
        }
        if (role.equals("GESTOR_PROJETO")) mvc.perform(get("/api/v1/invitations").with(recipient(oid, email))).andExpect(status().isForbidden());
    }

    @Test void rejectsDifferentIdentityAndRevokedOrExpiredInvitation() throws Exception {
        String email="different@unijorge.com.br";
        UUID id=create(email,"INTEGRANTE"), oid=resolved.get(email);
        mvc.perform(post("/api/v1/invitations/"+id+"/accept").with(recipient(UUID.randomUUID(),"other@unijorge.com.br")))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/invitations/"+id).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/invitations/"+id+"/accept").with(recipient(oid,email))).andExpect(status().isConflict());
        UUID expired=create("expired@unijorge.com.br","INTEGRANTE");
        jdbc.update("update nite_connect.invitations set created_at=current_timestamp-interval '2 days',expires_at=current_timestamp-interval '1 day' where id=?",expired);
        mvc.perform(post("/api/v1/invitations/"+expired+"/accept").with(recipient(resolved.get("expired@unijorge.com.br"),"expired@unijorge.com.br")))
                .andExpect(status().isConflict());
        mvc.perform(get("/api/v1/invitations?state=EXPIRED").with(token(ADMIN))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
    }

    @Test void preservesLegacyObjectBindingAndRejectsMissingRecipientEmail() throws Exception {
        String email = "legacy@unijorge.com.br";
        UUID id = create(email, "INTEGRANTE"), originalOid = UUID.randomUUID();
        jdbc.update("update nite_connect.invitations set object_id=? where id=?", originalOid, id);
        mvc.perform(post("/api/v1/invitations/" + id + "/accept")
                .with(recipient(UUID.randomUUID(), email))).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/invitations/" + id + "/accept")
                .with(recipient(originalOid, email))).andExpect(status().isOk());

        String newEmail = "missing-claim@unijorge.com.br";
        UUID newId = create(newEmail, "INTEGRANTE");
        mvc.perform(post("/api/v1/invitations/" + newId + "/accept")
                .with(SecurityMockMvcRequestPostProcessors.jwt().jwt(j -> j.claim("tid", TENANT.toString())
                        .claim("oid", UUID.randomUUID().toString())))).andExpect(status().isNotFound());
    }

    @Test void failedSendCanRetryWithoutCreatingAnotherInvitation() throws Exception {
        String email="retry@unijorge.com.br";
        when(mail.send(any(), anyString(), anyString(), anyString(), nullable(String.class), any()))
                .thenReturn(new InvitationMailSender.SendResult(null,"HTTP_503"))
                .thenReturn(new InvitationMailSender.SendResult("resend-recovered",null));
        mvc.perform(post("/api/v1/invitations").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Pessoa Convidada\",\"institutionalEmail\":\""+email+"\",\"initialRole\":\"INTEGRANTE\",\"expiresAt\":\""+Instant.now().plusSeconds(3600)+"\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.sendState").value("FAILED"));
        UUID id=jdbc.queryForObject("select id from nite_connect.invitations",UUID.class);
        mvc.perform(post("/api/v1/invitations/"+id+"/send").with(token(ADMIN))).andExpect(status().isOk())
                .andExpect(jsonPath("$.sendState").value("ACCEPTED_BY_PROVIDER"));
        mvc.perform(post("/api/v1/invitations/"+id+"/send").with(token(ADMIN))).andExpect(status().isOk());
        verify(mail,times(2)).send(eq(id),anyString(),eq(email),eq("INTEGRANTE"),nullable(String.class),any());
        assertThat(jdbc.queryForObject("select send_attempts from nite_connect.invitations where id=?",Integer.class,id)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.members where institutional_email=?",Integer.class,email)).isEqualTo(1);
    }

    @Test void searchesInvitationsAcrossTheFullPageAndEscapesWildcards() throws Exception {
        create("ana.teste@unijorge.com.br", "INTEGRANTE");
        create("bruna@unijorge.com.br", "INTEGRANTE");
        mvc.perform(get("/api/v1/invitations").with(token(ADMIN)).param("q", "ana.teste").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].email").value("ana.teste@unijorge.com.br"));
        mvc.perform(get("/api/v1/invitations").with(token(ADMIN)).param("q", "%"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
    }

    @Test void optionalRoleReasonAndActualEntryAreRecorded() throws Exception {
        mvc.perform(post("/api/v1/members/"+MEMBER+"/roles").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"GESTOR_GERAL\",\"expectedVersion\":0}"))
                .andExpect(status().isOk());
        mvc.perform(delete("/api/v1/members/"+MEMBER+"/roles/GESTOR_GERAL").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedVersion\":1}"))
                .andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where member_id=? and action in ('ROLE_GRANTED','ROLE_REVOKED') and reason is null and actor_id=?",Integer.class,MEMBER,ADMIN)).isEqualTo(2);
        mvc.perform(post("/api/v1/me/access").with(token(MEMBER))).andExpect(status().isNoContent());
        Instant first=jdbc.queryForObject("select last_access_at from nite_connect.members where id=?",TimestampMapper.INSTANT,MEMBER);
        mvc.perform(post("/api/v1/me/access").with(token(MEMBER))).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select last_access_at from nite_connect.members where id=?",TimestampMapper.INSTANT,MEMBER)).isEqualTo(first);
    }

    private static final class TimestampMapper {
        static final org.springframework.jdbc.core.RowMapper<Instant> INSTANT=(rs,row)->rs.getTimestamp(1).toInstant();
    }
}
