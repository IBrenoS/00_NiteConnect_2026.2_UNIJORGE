package br.edu.unijorge.niteconnect.identity.application;

import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.meetings.infrastructure.GraphTokenAcquirer;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.List;
import java.util.UUID;

/** Resolves an institutional recipient through Microsoft Graph on behalf of the authenticated inviter. */
@Component
@ConditionalOnProperty(name="nite.entra.enabled", havingValue="true")
public class EntraRecipientDirectory {
    private static final List<String> DIRECTORY_SCOPES = List.of("https://graph.microsoft.com/User.ReadBasic.All");
    private static final URI USERS_ENDPOINT = URI.create("https://graph.microsoft.com/v1.0/users");
    private final GraphTokenAcquirer tokens;
    private final HttpClient http;
    private final ObjectMapper json;
    private final URI usersEndpoint;

    public EntraRecipientDirectory(ObjectMapper json,
            @Qualifier("invitationDirectoryGraphTokenAcquirer") GraphTokenAcquirer tokens) {
        this(json, tokens, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build(), USERS_ENDPOINT);
    }

    EntraRecipientDirectory(ObjectMapper json, GraphTokenAcquirer tokens, HttpClient http, URI usersEndpoint) {
        this.json = json;
        this.tokens = tokens;
        this.http = http;
        this.usersEndpoint = usersEndpoint;
    }

    public UUID resolve(String institutionalEmail, String apiAccessToken) {
        try {
            String token = tokens.acquire(apiAccessToken, DIRECTORY_SCOPES);
            String escaped = institutionalEmail.replace("'", "''");
            String filter = "mail eq '" + escaped + "' or userPrincipalName eq '" + escaped + "'";
            URI uri = URI.create(usersEndpoint + "?$filter="
                    + URLEncoder.encode(filter, StandardCharsets.UTF_8)
                    + "&$select=id,mail,userPrincipalName&$top=2&$count=true");
            HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10))
                    .header("Authorization", "Bearer " + token).header("Accept", "application/json")
                    .header("ConsistencyLevel", "eventual").GET().build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw unavailable();
            JsonNode users = json.readTree(response.body()).path("value");
            if (!users.isArray() || users.size() != 1) throw ApiException.conflict("Destinatário não encontrado de forma única no tenant Entra");
            JsonNode user = users.get(0);
            String email = institutionalEmail.toLowerCase(Locale.ROOT);
            String userPrincipalName = user.path("userPrincipalName").asString("").toLowerCase(Locale.ROOT);
            if (userPrincipalName.contains("#ext#"))
                throw ApiException.conflict("Destinatário não é integrante interno do tenant Entra");
            if (!email.equals(user.path("mail").asString("").toLowerCase(Locale.ROOT))
                    && !email.equals(userPrincipalName))
                throw ApiException.conflict("Destinatário não corresponde ao cadastro do tenant Entra");
            return UUID.fromString(user.path("id").asString(""));
        } catch (ApiException ex) {
            throw ex;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (Exception ex) {
            // Do not expose Graph responses, tokens or MSAL exception details.
            throw unavailable();
        }
    }

    private ApiException unavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Consulta ao diretório Entra indisponível");
    }
}
