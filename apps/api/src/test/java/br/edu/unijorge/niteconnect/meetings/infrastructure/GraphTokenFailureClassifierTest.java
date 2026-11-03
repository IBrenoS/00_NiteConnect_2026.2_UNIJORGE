package br.edu.unijorge.niteconnect.meetings.infrastructure;

import br.edu.unijorge.niteconnect.meetings.application.MeetingProviderException;
import com.microsoft.aad.msal4j.MsalServiceException;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CompletionException;

import static org.assertj.core.api.Assertions.assertThat;

class GraphTokenFailureClassifierTest {
    @Test
    void identifiesTheMissingConsentReturnedByEntra() {
        var source = new MsalServiceException("AADSTS65001: user consent is missing", "invalid_grant");

        MeetingProviderException result = GraphTokenFailureClassifier.classify(new CompletionException(source));

        assertThat(result.code()).isEqualTo("OBO_CONSENT_REQUIRED");
        assertThat(result.kind()).isEqualTo(MeetingProviderException.FailureKind.FORBIDDEN);
    }

    @Test
    void distinguishesTenantPolicyRequiringAdministratorApproval() {
        var source = new MsalServiceException("AADSTS90094: admin consent is required", "invalid_grant");

        MeetingProviderException result = GraphTokenFailureClassifier.classify(source);

        assertThat(result.code()).isEqualTo("OBO_ADMIN_APPROVAL_REQUIRED");
        assertThat(result.kind()).isEqualTo(MeetingProviderException.FailureKind.FORBIDDEN);
    }

    @Test
    void distinguishesTenantPolicyThatDisallowsTheUserConsentRequest() {
        var source = new MsalServiceException("AADSTS90093: the user is not authorized to grant these permissions", "invalid_grant");

        MeetingProviderException result = GraphTokenFailureClassifier.classify(source);

        assertThat(result.code()).isEqualTo("OBO_ADMIN_APPROVAL_REQUIRED");
        assertThat(result.kind()).isEqualTo(MeetingProviderException.FailureKind.FORBIDDEN);
    }

    @Test
    void doesNotTreatEveryInvalidGrantAsMissingConsent() {
        var source = new MsalServiceException("The user assertion was rejected", "invalid_grant");

        MeetingProviderException result = GraphTokenFailureClassifier.classify(source);

        assertThat(result.code()).isEqualTo("OBO_ASSERTION_REJECTED");
        assertThat(result.kind()).isEqualTo(MeetingProviderException.FailureKind.FORBIDDEN);
    }

    @Test
    void doesNotReportARejectedClientCredentialAsMissingUserConsent() {
        var source = new MsalServiceException("client authentication failed", "invalid_client");

        MeetingProviderException result = GraphTokenFailureClassifier.classify(source);

        assertThat(result.code()).isEqualTo("OBO_CLIENT_AUTHENTICATION_FAILED");
        assertThat(result.kind()).isEqualTo(MeetingProviderException.FailureKind.UNAVAILABLE);
    }

    @Test
    void doesNotReportAnUnexpectedTokenEndpointFailureAsMissingUserConsent() {
        var source = new CompletionException(new IllegalStateException("unexpected token acquisition failure"));

        MeetingProviderException result = GraphTokenFailureClassifier.classify(source);

        assertThat(result.code()).isEqualTo("OBO_TOKEN_ACQUISITION_FAILED");
        assertThat(result.kind()).isEqualTo(MeetingProviderException.FailureKind.UNAVAILABLE);
    }

    @Test
    void marksARecoverableEntraServiceFailureAsRetryable() {
        var source = new MsalServiceException("identity service unavailable", "temporarily_unavailable");

        MeetingProviderException result = GraphTokenFailureClassifier.classify(source);

        assertThat(result.code()).isEqualTo("OBO_TOKEN_SERVICE_UNAVAILABLE");
        assertThat(result.kind()).isEqualTo(MeetingProviderException.FailureKind.RETRYABLE);
    }
}
