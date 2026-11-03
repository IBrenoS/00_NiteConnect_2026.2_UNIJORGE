package br.edu.unijorge.niteconnect.meetings.infrastructure;

import br.edu.unijorge.niteconnect.meetings.application.MeetingProviderException;
import com.microsoft.aad.msal4j.MsalClientException;
import com.microsoft.aad.msal4j.MsalException;
import com.microsoft.aad.msal4j.MsalInteractionRequiredException;
import com.microsoft.aad.msal4j.MsalServiceException;

import java.io.IOException;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;

final class GraphTokenFailureClassifier {
    private static final int MAX_CAUSE_DEPTH = 16;

    private GraphTokenFailureClassifier() { }

    static MeetingProviderException classify(Throwable failure) {
        MsalInteractionRequiredException interaction = findCause(failure, MsalInteractionRequiredException.class);
        if (interaction != null) {
            if (interaction.reason() == com.microsoft.aad.msal4j.InteractionRequiredExceptionReason.CONSENT_REQUIRED) {
                return failure("OBO_CONSENT_REQUIRED", MeetingProviderException.FailureKind.FORBIDDEN, null);
            }
            return failure("OBO_INTERACTION_REQUIRED", MeetingProviderException.FailureKind.FORBIDDEN, null);
        }

        MsalServiceException service = findCause(failure, MsalServiceException.class);
        if (service != null) {
            String errorCode = normalized(service.errorCode());
            if (hasAadCode(service, "90093") || hasAadCode(service, "90094") || hasAadCode(service, "900941")) {
                return failure("OBO_ADMIN_APPROVAL_REQUIRED", MeetingProviderException.FailureKind.FORBIDDEN, service.statusCode());
            }
            if (errorCode.equals("consent_required") || hasAadCode(service, "65001")) {
                return failure("OBO_CONSENT_REQUIRED", MeetingProviderException.FailureKind.FORBIDDEN, service.statusCode());
            }
            if (errorCode.equals("interaction_required")) {
                return failure("OBO_INTERACTION_REQUIRED", MeetingProviderException.FailureKind.FORBIDDEN, service.statusCode());
            }
            if (errorCode.equals("invalid_client")) {
                return failure("OBO_CLIENT_AUTHENTICATION_FAILED", MeetingProviderException.FailureKind.UNAVAILABLE, service.statusCode());
            }
            if (errorCode.equals("invalid_grant")) {
                return failure("OBO_ASSERTION_REJECTED", MeetingProviderException.FailureKind.FORBIDDEN, service.statusCode());
            }
            if (errorCode.equals("temporarily_unavailable") || errorCode.equals("server_error")
                    || service.statusCode() != null && service.statusCode() >= 500) {
                return failure("OBO_TOKEN_SERVICE_UNAVAILABLE", MeetingProviderException.FailureKind.RETRYABLE, service.statusCode());
            }
            return failure("OBO_TOKEN_SERVICE_REJECTED", MeetingProviderException.FailureKind.UNAVAILABLE, service.statusCode());
        }

        if (findCause(failure, TimeoutException.class) != null || findCause(failure, IOException.class) != null) {
            return failure("OBO_TOKEN_SERVICE_UNAVAILABLE", MeetingProviderException.FailureKind.RETRYABLE, null);
        }
        if (findCause(failure, MsalClientException.class) != null) {
            return failure("OBO_CLIENT_FAILURE", MeetingProviderException.FailureKind.UNAVAILABLE, null);
        }
        return failure("OBO_TOKEN_ACQUISITION_FAILED", MeetingProviderException.FailureKind.UNAVAILABLE, null);
    }

    static Diagnostic diagnostic(Throwable failure) {
        MsalServiceException service = findCause(failure, MsalServiceException.class);
        MsalException msal = findCause(failure, MsalException.class);
        Throwable root = unwrap(failure);
        return new Diagnostic(
                safeValue(msal == null ? null : msal.errorCode()),
                service == null ? null : service.statusCode(),
                service == null ? null : safeValue(service.correlationId()),
                root.getClass().getSimpleName());
    }

    private static boolean hasAadCode(MsalServiceException exception, String code) {
        String message = exception.getMessage();
        return message != null && Pattern.compile("(?<![A-Za-z0-9])AADSTS" + Pattern.quote(code) + "(?![0-9])")
                .matcher(message).find();
    }

    private static String normalized(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }

    private static String safeValue(String value) {
        if (value == null || value.isBlank()) return "unknown";
        String safe = value.replaceAll("[^A-Za-z0-9_.-]", "");
        return safe.length() > 80 ? safe.substring(0, 80) : safe;
    }

    private static <T extends Throwable> T findCause(Throwable failure, Class<T> type) {
        Throwable current = failure;
        for (int depth = 0; current != null && depth < MAX_CAUSE_DEPTH; depth++) {
            if (type.isInstance(current)) return type.cast(current);
            current = current.getCause();
        }
        return null;
    }

    private static Throwable unwrap(Throwable failure) {
        Throwable current = failure;
        for (int depth = 0; current != null && depth < MAX_CAUSE_DEPTH; depth++) {
            if ((current instanceof CompletionException || current instanceof ExecutionException)
                    && current.getCause() != null) {
                current = current.getCause();
            } else {
                return current;
            }
        }
        return failure;
    }

    private static MeetingProviderException failure(String code, MeetingProviderException.FailureKind kind, Integer status) {
        return new MeetingProviderException(code, kind, null, status);
    }

    record Diagnostic(String msalErrorCode, Integer httpStatus, String correlationId, String exceptionType) { }
}
