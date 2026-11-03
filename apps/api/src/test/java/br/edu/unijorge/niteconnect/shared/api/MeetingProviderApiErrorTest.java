package br.edu.unijorge.niteconnect.shared.api;

import br.edu.unijorge.niteconnect.meetings.application.MeetingProviderApiException;
import br.edu.unijorge.niteconnect.meetings.application.MeetingProviderException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class MeetingProviderApiErrorTest {
    @Test
    void exposesMissingProviderConsentAsForbiddenRatherThanServiceUnavailable() {
        var providerFailure = new MeetingProviderException(
                "OBO_CONSENT_REQUIRED", MeetingProviderException.FailureKind.FORBIDDEN, null);
        var exception = new MeetingProviderApiException(UUID.randomUUID(), providerFailure);

        var problem = new ApiErrors().meetingProvider(exception);

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(problem.getProperties()).containsEntry("code", "OBO_CONSENT_REQUIRED");
    }

    @Test
    void keepsUnexpectedProviderFailuresAsServiceUnavailable() {
        var providerFailure = new MeetingProviderException(
                "OBO_TOKEN_ACQUISITION_FAILED", MeetingProviderException.FailureKind.UNAVAILABLE, null);
        var exception = new MeetingProviderApiException(UUID.randomUUID(), providerFailure);

        var problem = new ApiErrors().meetingProvider(exception);

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE.value());
        assertThat(problem.getProperties()).containsEntry("code", "OBO_TOKEN_ACQUISITION_FAILED");
    }
}
