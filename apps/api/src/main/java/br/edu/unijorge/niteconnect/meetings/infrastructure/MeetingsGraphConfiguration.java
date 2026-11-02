package br.edu.unijorge.niteconnect.meetings.infrastructure;

import br.edu.unijorge.niteconnect.meetings.application.MeetingProvider;
import com.microsoft.aad.msal4j.ClientCredentialFactory;
import com.microsoft.aad.msal4j.ConfidentialClientApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.net.http.HttpClient;
import java.net.MalformedURLException;

@Configuration
@EnableConfigurationProperties(MeetingsGraphProperties.class)
public class MeetingsGraphConfiguration {
    @Bean
    GraphTokenAcquirer graphTokenAcquirer(MeetingsGraphProperties properties) {
        if (!properties.isEnabled()) return new UnavailableGraphTokenAcquirer("GRAPH_INTEGRATION_DISABLED");
        if (!properties.hasConfidentialClient()) return new UnavailableGraphTokenAcquirer();
        try {
            var credential = ClientCredentialFactory.createFromSecret(properties.getClientSecret());
            var application = ConfidentialClientApplication.builder(properties.getClientId(), credential)
                    .authority(properties.authority())
                    .build();
            return new MsalGraphTokenAcquirer(application);
        } catch (MalformedURLException | RuntimeException exception) {
            return new UnavailableGraphTokenAcquirer("GRAPH_OBO_CONFIGURATION_INVALID");
        }
    }

    @Bean
    MeetingProvider meetingProvider(MeetingsGraphProperties properties, GraphTokenAcquirer tokens) {
        HttpClient client = HttpClient.newBuilder().connectTimeout(properties.getConnectTimeout()).build();
        return new GraphCalendarProvider(properties.getBaseUrl(), tokens, client, properties.getRequestTimeout());
    }
}
