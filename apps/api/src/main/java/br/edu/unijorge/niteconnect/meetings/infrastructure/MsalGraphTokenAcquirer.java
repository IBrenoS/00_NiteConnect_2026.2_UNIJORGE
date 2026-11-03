package br.edu.unijorge.niteconnect.meetings.infrastructure;

import br.edu.unijorge.niteconnect.meetings.application.MeetingProviderException;
import com.microsoft.aad.msal4j.ConfidentialClientApplication;
import com.microsoft.aad.msal4j.OnBehalfOfParameters;
import com.microsoft.aad.msal4j.UserAssertion;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Set;

public final class MsalGraphTokenAcquirer implements GraphTokenAcquirer {
    private static final Logger LOGGER = LoggerFactory.getLogger(MsalGraphTokenAcquirer.class);
    private final ConfidentialClientApplication application;

    public MsalGraphTokenAcquirer(ConfidentialClientApplication application) {
        this.application = application;
    }

    @Override public String acquire(String apiAccessToken, List<String> scopes) {
        if (apiAccessToken == null || apiAccessToken.isBlank()) {
            throw new MeetingProviderException("OBO_ASSERTION_MISSING", MeetingProviderException.FailureKind.UNAVAILABLE, null);
        }
        try {
            var parameters = OnBehalfOfParameters.builder(Set.copyOf(scopes), new UserAssertion(apiAccessToken)).build();
            String graphToken = application.acquireToken(parameters).join().accessToken();
            if (graphToken == null || graphToken.isBlank()) {
                throw new MeetingProviderException("OBO_TOKEN_EMPTY", MeetingProviderException.FailureKind.UNAVAILABLE, null);
            }
            return graphToken;
        } catch (MeetingProviderException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            MeetingProviderException classified = GraphTokenFailureClassifier.classify(exception);
            GraphTokenFailureClassifier.Diagnostic diagnostic = GraphTokenFailureClassifier.diagnostic(exception);
            LOGGER.warn("Graph OBO token acquisition failed: code={}, msalErrorCode={}, httpStatus={}, correlationId={}, exceptionType={}",
                    classified.code(), diagnostic.msalErrorCode(), diagnostic.httpStatus(), diagnostic.correlationId(),
                    diagnostic.exceptionType());
            throw classified;
        }
    }
}
