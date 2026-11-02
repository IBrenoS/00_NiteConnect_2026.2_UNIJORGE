package br.edu.unijorge.niteconnect.meetings.application;

import java.util.UUID;

public class MeetingProviderApiException extends RuntimeException {
    private final UUID operationId;
    private final String code;

    public MeetingProviderApiException(UUID operationId, String code) {
        super("Integração Microsoft indisponível para concluir a operação");
        this.operationId = operationId;
        this.code = code;
    }

    public UUID operationId() { return operationId; }
    public String code() { return code; }
}
