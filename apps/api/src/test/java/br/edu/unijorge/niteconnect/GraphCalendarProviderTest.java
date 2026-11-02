package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.meetings.infrastructure.GraphCalendarProvider;
import br.edu.unijorge.niteconnect.meetings.infrastructure.GraphTokenAcquirer;
import br.edu.unijorge.niteconnect.meetings.application.MeetingProvider;
import br.edu.unijorge.niteconnect.meetings.application.MeetingProviderException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GraphCalendarProviderTest {
    private HttpServer server;

    @AfterEach void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test void createsTeamsCalendarEventUsingOnlyTheDelegatedGraphToken() throws Exception {
        var requests = new CopyOnWriteArrayList<String>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1.0", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            requests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI() + "\n"
                    + exchange.getRequestHeaders().getFirst("Authorization") + "\n" + body);
            String response = exchange.getRequestURI().getPath().endsWith("/calendar")
                    ? "{\"allowedOnlineMeetingProviders\":[\"teamsForBusiness\"],\"defaultOnlineMeetingProvider\":\"teamsForBusiness\"}"
                    : "{\"id\":\"graph-event-1\",\"changeKey\":\"ck-1\",\"isOnlineMeeting\":true,"
                    + "\"onlineMeetingProvider\":\"teamsForBusiness\",\"onlineMeeting\":{\"joinUrl\":\"https://teams.example/join\"}}";
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(exchange.getRequestURI().getPath().endsWith("/calendar") ? 200 : 201, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();

        var tokenCalls = new CopyOnWriteArrayList<String>();
        GraphTokenAcquirer tokens = (assertion, scopes) -> {
            tokenCalls.add(assertion + " " + String.join(" ", scopes));
            return "graph-delegated-token";
        };
        URI graphBase = URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/v1.0");
        var provider = new GraphCalendarProvider(graphBase, tokens, HttpClient.newHttpClient());
        var request = new MeetingProvider.CreateRequest(UUID.randomUUID(), "Reunião de teste",
                Instant.parse("2026-11-03T12:00:00Z"), Instant.parse("2026-11-03T13:00:00Z"),
                List.of(new MeetingProvider.Invitee("Pessoa Teste", "pessoa@unijorge.com.br")));

        var result = provider.createMeeting("api-token-destinado-a-nite", request);

        assertThat(result.eventId()).isEqualTo("graph-event-1");
        assertThat(result.joinUrl()).isEqualTo("https://teams.example/join");
        assertThat(tokenCalls).hasSize(2).allSatisfy(call -> {
            assertThat(call).startsWith("api-token-destinado-a-nite ");
            assertThat(call).contains("https://graph.microsoft.com/Calendars.ReadWrite");
        });
        assertThat(requests).hasSize(2);
        assertThat(requests).allSatisfy(requestText -> assertThat(requestText).contains("Bearer graph-delegated-token"));
        assertThat(requests).allSatisfy(requestText -> assertThat(requestText).doesNotContain("Bearer api-token-destinado-a-nite"));
        assertThat(requests.get(1)).contains("\"transactionId\":\"" + request.transactionId() + "\"")
                .contains("\"isOnlineMeeting\":true")
                .contains("\"onlineMeetingProvider\":\"teamsForBusiness\"")
                .contains("pessoa@unijorge.com.br");
    }

    @Test void readsLatestAttendanceReportWithOnlyDelegatedArtifactPermission() throws Exception {
        var requests = new CopyOnWriteArrayList<String>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1.0", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            requests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI() + "\n"
                    + exchange.getRequestHeaders().getFirst("Authorization") + "\n" + body);
            String response = exchange.getRequestURI().getPath().endsWith("/attendanceReports")
                    ? "{\"value\":[{\"id\":\"report-1\",\"meetingStartDateTime\":\"2026-11-02T17:00:00Z\",\"meetingEndDateTime\":\"2026-11-02T17:30:00Z\"}]}"
                    : "{\"value\":[{\"id\":\"record-1\",\"totalAttendanceInSeconds\":1200,\"identity\":{\"id\":\"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\",\"tenantId\":\"11111111-1111-4111-8111-111111111111\"},\"attendanceIntervals\":[{\"joinDateTime\":\"2026-11-02T17:00:00Z\",\"leaveDateTime\":\"2026-11-02T17:20:00Z\",\"durationInSeconds\":1200}]}]}";
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();

        var tokenCalls = new CopyOnWriteArrayList<String>();
        GraphTokenAcquirer tokens = (assertion, scopes) -> {
            tokenCalls.add(assertion + " " + String.join(" ", scopes));
            return "graph-attendance-token";
        };
        URI graphBase = URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/v1.0");
        var provider = new GraphCalendarProvider(graphBase, tokens, HttpClient.newHttpClient());

        var result = provider.latestAttendanceReport("api-token", "online-1").orElseThrow();

        assertThat(result.reportId()).isEqualTo("report-1");
        assertThat(result.startsAt()).isEqualTo(Instant.parse("2026-11-02T17:00:00Z"));
        assertThat(result.records()).hasSize(1);
        assertThat(result.records().getFirst().durationSeconds()).isEqualTo(1200);
        assertThat(tokenCalls).hasSize(2).allSatisfy(call -> assertThat(call)
                .contains("https://graph.microsoft.com/OnlineMeetingArtifact.Read.All")
                .doesNotContain("Calendars.ReadWrite"));
        assertThat(requests).allSatisfy(request -> assertThat(request).contains("Bearer graph-attendance-token"));
    }

    @Test void updatesAndCancelsTheOrganizerCalendarEvent() throws Exception {
        var requests = new CopyOnWriteArrayList<String>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1.0", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            requests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI() + "\n" + body);
            byte[] bytes = "{\"changeKey\":\"changed-1\"}".getBytes(StandardCharsets.UTF_8);
            if (exchange.getRequestMethod().equals("POST")) bytes = new byte[0];
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(exchange.getRequestMethod().equals("POST") ? 202 : 200, bytes.length);
            if (bytes.length > 0) exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();

        var provider = new GraphCalendarProvider(URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/v1.0"),
                (assertion, scopes) -> "graph-token", HttpClient.newHttpClient());
        var invitees = List.of(new MeetingProvider.Invitee("Pessoa Teste", "pessoa@unijorge.com.br"));
        var updated = provider.updateMeeting("api-token", "event-1", new MeetingProvider.UpdateRequest("Alterada",
                Instant.parse("2026-11-04T12:00:00Z"), Instant.parse("2026-11-04T13:00:00Z"), invitees));
        provider.cancelMeeting("api-token", "event-1", "Reagendada");

        assertThat(updated.changeKey()).isEqualTo("changed-1");
        assertThat(requests).hasSize(2);
        assertThat(requests.get(0)).startsWith("PATCH /v1.0/me/events/event-1")
                .contains("\"subject\":\"Alterada\"").contains("pessoa@unijorge.com.br");
        assertThat(requests.get(1)).startsWith("POST /v1.0/me/events/event-1/cancel")
                .contains("\"comment\":\"Reagendada\"");
    }

    @Test void mapsGraphThrottlingAndRetryAfterWithoutExposingItsBody() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1.0", exchange -> {
            byte[] bytes = "{\"error\":{\"code\":\"TooManyRequests\",\"message\":\"sensitive upstream detail\"}}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Retry-After", "5");
            exchange.sendResponseHeaders(429, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        var provider = new GraphCalendarProvider(URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/v1.0"),
                (assertion, scopes) -> "graph-token", HttpClient.newHttpClient());

        assertThatThrownBy(() -> provider.capabilities("api-token"))
                .isInstanceOf(MeetingProviderException.class)
                .satisfies(exception -> {
                    var providerException = (MeetingProviderException) exception;
                    assertThat(providerException.code()).isEqualTo("GRAPH_THROTTLED");
                    assertThat(providerException.kind()).isEqualTo(MeetingProviderException.FailureKind.RETRYABLE);
                    assertThat(providerException.retryAfter()).isEqualTo(Duration.ofSeconds(5));
                    assertThat(providerException.getMessage()).doesNotContain("sensitive upstream detail");
                });
    }
}
