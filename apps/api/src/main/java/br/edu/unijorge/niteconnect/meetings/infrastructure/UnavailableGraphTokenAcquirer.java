package br.edu.unijorge.niteconnect.meetings.infrastructure;

import br.edu.unijorge.niteconnect.meetings.application.MeetingProviderException;

import java.util.List;

public final class UnavailableGraphTokenAcquirer implements GraphTokenAcquirer {
    private final String code;

    public UnavailableGraphTokenAcquirer() { this("GRAPH_OBO_NOT_CONFIGURED"); }

    public UnavailableGraphTokenAcquirer(String code) { this.code = code; }

    @Override public String acquire(String apiAccessToken, List<String> scopes) {
        throw new MeetingProviderException(code, MeetingProviderException.FailureKind.UNAVAILABLE, null);
    }
}
