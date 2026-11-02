package br.edu.unijorge.niteconnect.meetings.infrastructure;

import java.util.List;

@FunctionalInterface
public interface GraphTokenAcquirer {
    String acquire(String apiAccessToken, List<String> scopes);
}
