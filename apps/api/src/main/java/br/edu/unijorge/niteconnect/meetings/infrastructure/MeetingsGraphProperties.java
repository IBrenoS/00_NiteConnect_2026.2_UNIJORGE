package br.edu.unijorge.niteconnect.meetings.infrastructure;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.net.URI;
import java.time.Duration;

@ConfigurationProperties("nite.meetings.graph")
public class MeetingsGraphProperties {
    private boolean enabled;
    private boolean attendanceEnabled;
    private String tenantId = "";
    private String clientId = "";
    private String clientSecret = "";
    private URI baseUrl = URI.create("https://graph.microsoft.com/v1.0");
    private Duration connectTimeout = Duration.ofSeconds(5);
    private Duration requestTimeout = Duration.ofSeconds(20);

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public boolean isAttendanceEnabled() { return attendanceEnabled; }
    public void setAttendanceEnabled(boolean attendanceEnabled) { this.attendanceEnabled = attendanceEnabled; }
    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }
    public String getClientSecret() { return clientSecret; }
    public void setClientSecret(String clientSecret) { this.clientSecret = clientSecret; }
    public URI getBaseUrl() { return baseUrl; }
    public void setBaseUrl(URI baseUrl) { this.baseUrl = baseUrl; }
    public Duration getConnectTimeout() { return connectTimeout; }
    public void setConnectTimeout(Duration connectTimeout) { this.connectTimeout = connectTimeout; }
    public Duration getRequestTimeout() { return requestTimeout; }
    public void setRequestTimeout(Duration requestTimeout) { this.requestTimeout = requestTimeout; }

    public boolean hasConfidentialClient() {
        return tenantId != null && !tenantId.isBlank() && clientId != null && !clientId.isBlank()
                && clientSecret != null && !clientSecret.isBlank();
    }

    public String authority() { return "https://login.microsoftonline.com/" + tenantId + "/"; }

    @Override public String toString() {
        return "MeetingsGraphProperties[enabled=" + enabled + ", attendanceEnabled=" + attendanceEnabled
                + ", tenantIdConfigured=" + (tenantId != null && !tenantId.isBlank())
                + ", clientIdConfigured=" + (clientId != null && !clientId.isBlank())
                + ", clientSecretConfigured=" + (clientSecret != null && !clientSecret.isBlank())
                + ", baseUrl=" + baseUrl + "]";
    }
}
