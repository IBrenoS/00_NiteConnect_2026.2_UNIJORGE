package br.edu.unijorge.niteconnect.meetings.application;

import java.util.UUID;

public class MeetingProviderApiException extends RuntimeException {
    private final UUID operationId;
    private final String code;
    private final boolean authorizationFailure;

    public MeetingProviderApiException(UUID operationId, String code) {
        this(operationId, code, false);
    }

    public MeetingProviderApiException(UUID operationId, MeetingProviderException failure) {
        this(operationId, failure.code(), failure.kind() == MeetingProviderException.FailureKind.FORBIDDEN);
    }

    private MeetingProviderApiException(UUID operationId, String code, boolean authorizationFailure) {
        super("Integração Microsoft indisponível para concluir a operação");
        this.operationId = operationId;
        this.code = code;
        this.authorizationFailure = authorizationFailure;
    }

    public UUID operationId() { return operationId; }
    public String code() { return code; }
    public boolean authorizationFailure() { return authorizationFailure; }
}
