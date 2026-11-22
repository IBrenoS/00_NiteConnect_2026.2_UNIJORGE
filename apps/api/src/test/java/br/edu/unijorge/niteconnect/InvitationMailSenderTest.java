package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.members.application.InvitationMailSender;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class InvitationMailSenderTest {
    @Test void usesStableIdempotencyKeyAndOnlyTreatsProviderIdAsAcceptance() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        AtomicReference<String> key = new AtomicReference<>(), authorization = new AtomicReference<>(), body = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/emails", exchange -> {
            key.set(exchange.getRequestHeaders().getFirst("Idempotency-Key"));
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            int status = calls.incrementAndGet() == 1 ? 503 : 200;
            byte[] response = (status == 200 ? "{\"id\":\"provider-test-id\"}" : "{\"error\":\"unavailable\"}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, response.length);
            try (var output = exchange.getResponseBody()) { output.write(response); }
        });
        server.start();
        try {
            var sender = new InvitationMailSender(JsonMapper.builder().build(), "test-only-key", "NITE <test@unijorge.com.br>",
                    "http://localhost/convites/aceitar", "http://127.0.0.1:" + server.getAddress().getPort() + "/emails");
            UUID id = UUID.randomUUID();
            Instant expiresAt = Instant.now().plusSeconds(3600);
            var first = sender.send(id, "Pessoa", "pessoa@unijorge.com.br", "INTEGRANTE", null, expiresAt);
            assertThat(first.providerId()).isNull();
            assertThat(first.errorCode()).isEqualTo("HTTP_503");
            var second = sender.send(id, "Pessoa", "pessoa@unijorge.com.br", "INTEGRANTE", null, expiresAt);
            assertThat(second.providerId()).isEqualTo("provider-test-id");
            assertThat(second.errorCode()).isNull();
            assertThat(key.get()).isEqualTo("nite-invitation/" + id);
            assertThat(authorization.get()).isEqualTo("Bearer test-only-key");
            assertThat(body.get()).contains("pessoa@unijorge.com.br", "/convites/aceitar?id=" + id);
            assertThat(calls.get()).isEqualTo(2);
        } finally {
            server.stop(0);
        }
    }
}
