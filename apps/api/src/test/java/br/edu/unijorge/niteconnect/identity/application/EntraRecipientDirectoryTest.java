package br.edu.unijorge.niteconnect.identity.application;

import br.edu.unijorge.niteconnect.meetings.infrastructure.GraphTokenAcquirer;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EntraRecipientDirectoryTest {
    private HttpServer server;

    @AfterEach void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test void resolvesOnlyExactInternalRecipientUsingDelegatedGraphToken() throws Exception {
        UUID objectId = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
        AtomicReference<String> authorization = new AtomicReference<>();
        server = server("{\"value\":[{\"id\":\"" + objectId + "\",\"mail\":\"member@unijorge.com.br\",\"userPrincipalName\":\"member@unijorge.pro.br\"}]}", authorization);
        GraphTokenAcquirer tokens = mock(GraphTokenAcquirer.class);
        when(tokens.acquire("api-user-token", List.of("https://graph.microsoft.com/User.ReadBasic.All")))
                .thenReturn("graph-user-token");
        var directory = directory(tokens);

        assertThat(directory.resolve("member@unijorge.com.br", "api-user-token")).isEqualTo(objectId);
        assertThat(authorization.get()).isEqualTo("Bearer graph-user-token");
        verify(tokens).acquire("api-user-token", List.of("https://graph.microsoft.com/User.ReadBasic.All"));
    }

    @Test void rejectsGuestRecipientEvenWhenInstitutionalEmailMatches() throws Exception {
        server = server("{\"value\":[{\"id\":\"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\",\"mail\":\"member@unijorge.com.br\",\"userPrincipalName\":\"member_unijorge.com.br#EXT#@tenant.onmicrosoft.com\"}]}", new AtomicReference<>());
        var directory = directory((token, scopes) -> "graph-user-token");

        assertThatThrownBy(() -> directory.resolve("member@unijorge.com.br", "api-user-token"))
                .hasMessage("Destinatário não é integrante interno do tenant Entra");
    }

    @Test void rejectsMissingOrAmbiguousMatches() throws Exception {
        server = server("{\"value\":[]}", new AtomicReference<>());
        var directory = directory((token, scopes) -> "graph-user-token");

        assertThatThrownBy(() -> directory.resolve("missing@unijorge.com.br", "api-user-token"))
                .hasMessage("Destinatário não encontrado de forma única no tenant Entra");
    }

    private HttpServer server(String responseBody, AtomicReference<String> authorization) throws Exception {
        HttpServer graph = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        graph.createContext("/v1.0/users", exchange -> {
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] bytes = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        graph.start();
        return this.server = graph;
    }

    private EntraRecipientDirectory directory(GraphTokenAcquirer tokens) {
        URI endpoint = URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/v1.0/users");
        return new EntraRecipientDirectory(JsonMapper.builder().build(), tokens, HttpClient.newHttpClient(), endpoint);
    }
}
