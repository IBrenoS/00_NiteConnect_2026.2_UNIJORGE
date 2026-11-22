package br.edu.unijorge.niteconnect.identity.application;

import br.edu.unijorge.niteconnect.shared.api.ApiException;
import com.microsoft.aad.msal4j.ClientCredentialFactory;
import com.microsoft.aad.msal4j.ClientCredentialParameters;
import com.microsoft.aad.msal4j.ConfidentialClientApplication;
import org.springframework.beans.factory.annotation.Value;
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
import java.util.Set;
import java.util.UUID;

/** Resolves the immutable Entra object ID from the tenant directory, never from operator input. */
@Component
@ConditionalOnProperty(name="nite.entra.enabled", havingValue="true")
public class EntraRecipientDirectory {
    private final ConfidentialClientApplication application;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper json;

    public EntraRecipientDirectory(EntraProperties entra, ObjectMapper json,
            @Value("${nite.entra.directory-client-id:}") String clientId,
            @Value("${nite.entra.directory-client-secret:}") String clientSecret) {
        this.json = json;
        if (clientId.isBlank() || clientSecret.isBlank()) {
            application = null;
        } else {
            try {
                application = ConfidentialClientApplication.builder(clientId, ClientCredentialFactory.createFromSecret(clientSecret))
                        .authority("https://login.microsoftonline.com/" + entra.tenantId()).build();
            } catch (Exception ex) {
                throw new IllegalArgumentException("Configuração de consulta ao diretório Entra inválida");
            }
        }
    }

    public UUID resolve(String institutionalEmail) {
        if (application == null) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Consulta ao diretório Entra não configurada");
        try {
            String token = application.acquireToken(ClientCredentialParameters.builder(
                    Set.of("https://graph.microsoft.com/.default")).build()).join().accessToken();
            String escaped = institutionalEmail.replace("'", "''");
            String filter = "mail eq '" + escaped + "' or userPrincipalName eq '" + escaped + "'";
            URI uri = URI.create("https://graph.microsoft.com/v1.0/users?$filter="
                    + URLEncoder.encode(filter, StandardCharsets.UTF_8)
                    + "&$select=id,mail,userPrincipalName,userType&$top=2&$count=true");
            HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10))
                    .header("Authorization", "Bearer " + token).header("Accept", "application/json")
                    .header("ConsistencyLevel", "eventual").GET().build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw unavailable();
            JsonNode users = json.readTree(response.body()).path("value");
            if (!users.isArray() || users.size() != 1) throw ApiException.conflict("Destinatário não encontrado de forma única no tenant Entra");
            JsonNode user = users.get(0);
            if (!"Member".equals(user.path("userType").asString("")))
                throw ApiException.conflict("Destinatário não é integrante interno do tenant Entra");
            String email = institutionalEmail.toLowerCase(Locale.ROOT);
            if (!email.equals(user.path("mail").asString("").toLowerCase(Locale.ROOT))
                    && !email.equals(user.path("userPrincipalName").asString("").toLowerCase(Locale.ROOT)))
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
