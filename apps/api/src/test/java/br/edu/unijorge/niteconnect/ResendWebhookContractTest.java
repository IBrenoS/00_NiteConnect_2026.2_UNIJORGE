package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.members.application.InvitationMailSender;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.TestPropertySource;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@TestPropertySource(properties = "nite.resend.webhook-secret=whsec_MDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1ub3BxcnN0dXY=")
class ResendWebhookContractTest extends ProjectTestSupport {
    private static final byte[] KEY = "0123456789abcdefghijklmnopqrstuv".getBytes(StandardCharsets.UTF_8);
    private static final String ENDPOINT = "/api/v1/webhooks/resend";
    @MockitoBean InvitationMailSender mail;

    @Test void validatesSignatureAndTracksDeliveryWithoutClaimingMailboxReceipt() throws Exception {
        when(mail.send(any(), anyString(), anyString(), anyString(), nullable(String.class), any()))
                .thenReturn(new InvitationMailSender.SendResult("resend-delivery-test", null));
        mvc.perform(post("/api/v1/invitations").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Pessoa Convidada\",\"institutionalEmail\":\"delivery@unijorge.com.br\",\"initialRole\":\"INTEGRANTE\"}")).andExpect(status().isCreated());
        UUID invitation = jdbc.queryForObject("select id from nite_connect.invitations where provider_message_id='resend-delivery-test'", UUID.class);
        String delivered = event("email.delivered", "resend-delivery-test", "delivery@unijorge.com.br", Instant.now());
        mvc.perform(post(ENDPOINT).contentType(MediaType.APPLICATION_JSON).content(delivered)).andExpect(status().isUnauthorized());
        signed(delivered).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select send_state from nite_connect.invitations where id=?", String.class, invitation)).isEqualTo("DELIVERED");
        signed(delivered).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select send_state from nite_connect.invitations where id=?", String.class, invitation)).isEqualTo("DELIVERED");
        signed(event("email.bounced", "other-message", "delivery@unijorge.com.br", Instant.now()))
                .andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select send_state from nite_connect.invitations where id=?", String.class, invitation)).isEqualTo("DELIVERED");
    }

    @Test void rejectsTamperingAndExpiredSignatures() throws Exception {
        String body = event("email.bounced", "unknown", "recipient@unijorge.com.br", Instant.now());
        String timestamp = Long.toString(Instant.now().getEpochSecond());
        String id = "msg_" + UUID.randomUUID();
        mvc.perform(post(ENDPOINT).contentType(MediaType.APPLICATION_JSON).content(body + " ")
                .header("svix-id", id).header("svix-timestamp", timestamp)
                .header("svix-signature", signature(id, timestamp, body))).andExpect(status().isUnauthorized());
        String old = Long.toString(Instant.now().minusSeconds(600).getEpochSecond());
        mvc.perform(post(ENDPOINT).contentType(MediaType.APPLICATION_JSON).content(body)
                .header("svix-id", id).header("svix-timestamp", old)
                .header("svix-signature", signature(id, old, body))).andExpect(status().isUnauthorized());
    }

    private org.springframework.test.web.servlet.ResultActions signed(String body) throws Exception {
        String timestamp = Long.toString(Instant.now().getEpochSecond());
        String id = "msg_" + UUID.randomUUID();
        return mvc.perform(post(ENDPOINT).contentType(MediaType.APPLICATION_JSON).content(body)
                .header("svix-id", id).header("svix-timestamp", timestamp)
                .header("svix-signature", signature(id, timestamp, body)));
    }

    private String signature(String id, String timestamp, String body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(KEY, "HmacSHA256"));
        return "v1," + Base64.getEncoder().encodeToString(mac.doFinal((id + "." + timestamp + "." + body).getBytes(StandardCharsets.UTF_8)));
    }

    private String event(String type, String emailId, String recipient, Instant createdAt) {
        return "{\"type\":\"" + type + "\",\"created_at\":\"" + createdAt + "\",\"data\":{\"email_id\":\""
                + emailId + "\",\"to\":[\"" + recipient + "\"]}}";
    }
}
