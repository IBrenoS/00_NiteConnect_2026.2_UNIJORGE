package br.edu.unijorge.niteconnect.members.application;

import tools.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.UUID;

@Component
public class InvitationMailSender {
    private final ObjectMapper json;
    private final String apiKey;
    private final String sender;
    private final String invitationBaseUrl;
    private final URI endpoint;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private static final DateTimeFormatter EXPIRY_FORMAT = DateTimeFormatter.ofPattern("dd/MM/yyyy 'às' HH:mm ' (horário de Brasília)'")
            .withZone(ZoneId.of("America/Bahia"));

    public InvitationMailSender(ObjectMapper json, @Value("${nite.resend.api-key:}") String apiKey,
            @Value("${nite.resend.from:}") String sender,
            @Value("${nite.invitations.accept-url:}") String invitationBaseUrl,
            @Value("${nite.resend.api-url:https://api.resend.com/emails}") String apiUrl) {
        this.json = json;
        this.apiKey = apiKey;
        this.sender = sender;
        this.invitationBaseUrl = invitationBaseUrl;
        this.endpoint = URI.create(apiUrl);
    }

    public SendResult send(UUID id, String name, String email, String role, String message, Instant expiresAt) {
        if (apiKey.isBlank() || sender.isBlank() || invitationBaseUrl.isBlank()) return new SendResult(null, "NOT_CONFIGURED");
        try {
            if (!"https".equals(endpoint.getScheme()) && !"localhost".equals(endpoint.getHost()) && !"127.0.0.1".equals(endpoint.getHost()))
                return new SendResult(null, "INVALID_PROVIDER_URL");
            URI base = URI.create(invitationBaseUrl);
            if (!"https".equals(base.getScheme()) && !"localhost".equals(base.getHost()) && !"127.0.0.1".equals(base.getHost()))
                return new SendResult(null, "INVALID_ACCEPT_URL");
            String link = invitationBaseUrl + (invitationBaseUrl.contains("?") ? "&" : "?") + "id=" + id;
            String roleName = switch (role) {
                case "INTEGRANTE" -> "Integrante";
                case "GESTOR_PROJETO" -> "Gestor de projeto";
                case "GESTOR_GERAL" -> "Gestor geral";
                case "COORDENADOR" -> "Coordenador";
                default -> throw new IllegalArgumentException("Invalid invitation role");
            };
            String body = "Olá, " + name + "!\n\n"
                    + "É com muita alegria que convidamos você para conhecer e testar as primeiras versões do NITE Connect, a nova plataforma do NITE.\n\n"
                    + "Seu acesso inicial será como " + roleName + ".\n\n"
                    + "Para começar, acesse o link abaixo e entre com sua conta Microsoft institucional:\n" + link + "\n\n"
                    + "Este convite é válido até " + EXPIRY_FORMAT.format(expiresAt) + ".\n\n"
                    + "Estamos animados para ter você com a gente nessa primeira etapa. Seja bem-vindo(a)!";
            String payload = json.writeValueAsString(Map.of("from", sender, "to", new String[]{email},
                    "subject", "Convite para o NITE Connect", "text", body));
            HttpRequest request = HttpRequest.newBuilder(endpoint)
                    .timeout(Duration.ofSeconds(15))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .header("Idempotency-Key", "nite-invitation/" + id)
                    .POST(HttpRequest.BodyPublishers.ofString(payload)).build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                String providerId = json.readTree(response.body()).path("id").asText("");
                return providerId.isBlank() || providerId.length() > 128
                        ? new SendResult(null, "INVALID_RESPONSE") : new SendResult(providerId, null);
            }
            return new SendResult(null, "HTTP_" + response.statusCode());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return new SendResult(null, "INTERRUPTED");
        } catch (Exception ex) {
            // Provider responses and exception messages can contain request data or credentials.
            return new SendResult(null, "TRANSPORT_ERROR");
        }
    }

    public record SendResult(String providerId, String errorCode) {}
}
