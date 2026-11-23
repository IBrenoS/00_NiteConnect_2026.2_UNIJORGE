package br.edu.unijorge.niteconnect.members.application;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;

@Component
public class ResendWebhookVerifier {
    private final byte[] key;

    public ResendWebhookVerifier(@Value("${nite.resend.webhook-secret:}") String secret) {
        byte[] decoded;
        try {
            decoded = secret.startsWith("whsec_") ? Base64.getDecoder().decode(secret.substring(6)) : new byte[0];
        } catch (IllegalArgumentException ex) {
            decoded = new byte[0];
        }
        key = decoded;
    }

    public boolean verify(byte[] body, String id, String timestamp, String signatures) {
        if (key.length < 16 || body.length > 65536 || id == null || id.isBlank() || id.length() > 128
                || timestamp == null || signatures == null) return false;
        try {
            long seconds = Long.parseLong(timestamp);
            long now = Instant.now().getEpochSecond();
            if (seconds < now - 300 || seconds > now + 300) return false;
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            mac.update((id + "." + timestamp + ".").getBytes(StandardCharsets.UTF_8));
            byte[] expected = mac.doFinal(body);
            for (String candidate : signatures.split(" ")) {
                if (candidate.startsWith("v1,") && MessageDigest.isEqual(expected,
                        Base64.getDecoder().decode(candidate.substring(3)))) return true;
            }
        } catch (Exception ex) {
            return false;
        }
        return false;
    }
}
