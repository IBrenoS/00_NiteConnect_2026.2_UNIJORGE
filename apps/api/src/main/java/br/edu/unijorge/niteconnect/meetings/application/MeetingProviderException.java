package br.edu.unijorge.niteconnect.meetings.application;

import java.time.Duration;

public class MeetingProviderException extends RuntimeException {
    private final String code;
    private final FailureKind kind;
    private final Duration retryAfter;
    private final Integer providerHttpStatus;

    public MeetingProviderException(String code, FailureKind kind, Duration retryAfter) {
        this(code, kind, retryAfter, null);
    }

    public MeetingProviderException(String code, FailureKind kind, Duration retryAfter, Integer providerHttpStatus) {
        super(code);
        this.code = code;
        this.kind = kind;
        this.retryAfter = retryAfter;
        this.providerHttpStatus = providerHttpStatus;
    }

    public String code() { return code; }
    public FailureKind kind() { return kind; }
    public Duration retryAfter() { return retryAfter; }
    public Integer providerHttpStatus() { return providerHttpStatus; }

    public enum FailureKind { UNAVAILABLE, FORBIDDEN, PERMANENT, RETRYABLE, INDETERMINATE }
}
