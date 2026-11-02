package br.edu.unijorge.niteconnect.meetings.infrastructure;

import br.edu.unijorge.niteconnect.meetings.application.MeetingProvider;
import br.edu.unijorge.niteconnect.meetings.application.MeetingProviderException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public final class GraphCalendarProvider implements MeetingProvider {
    private static final List<String> CALENDAR_SCOPES = List.of("https://graph.microsoft.com/Calendars.ReadWrite");
    private static final List<String> ATTENDANCE_SCOPES = List.of("https://graph.microsoft.com/OnlineMeetingArtifact.Read.All");
    private static final String TEAMS_PROVIDER = "teamsForBusiness";
    private static final DateTimeFormatter HTTP_DATE = DateTimeFormatter.RFC_1123_DATE_TIME;

    private final URI baseUrl;
    private final GraphTokenAcquirer tokens;
    private final HttpClient http;
    private final ObjectMapper json;
    private final Duration requestTimeout;

    public GraphCalendarProvider(URI baseUrl, GraphTokenAcquirer tokens, HttpClient http) {
        this(baseUrl, tokens, http, JsonMapper.builder().build(), Duration.ofSeconds(20));
    }

    public GraphCalendarProvider(URI baseUrl, GraphTokenAcquirer tokens, HttpClient http, Duration requestTimeout) {
        this(baseUrl, tokens, http, JsonMapper.builder().build(), requestTimeout);
    }

    GraphCalendarProvider(URI baseUrl, GraphTokenAcquirer tokens, HttpClient http,
                          ObjectMapper json, Duration requestTimeout) {
        String host = baseUrl.getHost();
        boolean loopbackHttp = "http".equalsIgnoreCase(baseUrl.getScheme())
                && ("localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host) || "::1".equals(host));
        boolean graphHttps = "https".equalsIgnoreCase(baseUrl.getScheme()) && "graph.microsoft.com".equalsIgnoreCase(host);
        if (!graphHttps && !loopbackHttp) {
            throw new IllegalArgumentException("Microsoft Graph base URL precisa usar HTTPS; HTTP só é permitido em loopback de teste");
        }
        if (host == null || baseUrl.getUserInfo() != null || baseUrl.getQuery() != null || baseUrl.getFragment() != null) {
            throw new IllegalArgumentException("Microsoft Graph base URL inválida");
        }
        String normalizedBaseUrl = baseUrl.toString().replaceAll("/+$", "");
        this.baseUrl = URI.create(normalizedBaseUrl + "/");
        this.tokens = tokens;
        this.http = http;
        this.json = json;
        this.requestTimeout = requestTimeout;
    }

    @Override public Capabilities capabilities(String userAssertion) {
        JsonNode response = call(userAssertion, "GET", "/me/calendar?$select=allowedOnlineMeetingProviders,defaultOnlineMeetingProvider", null);
        List<String> allowed = new ArrayList<>();
        JsonNode providers = response.path("allowedOnlineMeetingProviders");
        if (providers.isArray()) providers.forEach(provider -> allowed.add(provider.asString()));
        return new Capabilities(allowed, response.path("defaultOnlineMeetingProvider").asString(""));
    }

    @Override public CreatedMeeting createMeeting(String userAssertion, CreateRequest request) {
        if (!capabilities(userAssertion).supportsTeamsForBusiness()) {
            throw new MeetingProviderException("TEAMS_FOR_BUSINESS_UNAVAILABLE", MeetingProviderException.FailureKind.PERMANENT, null);
        }
        JsonNode created = call(userAssertion, "POST", "/me/events", eventBody(request));
        String eventId = text(created, "id");
        if (eventId.isBlank()) {
            throw new MeetingProviderException("GRAPH_EVENT_ID_MISSING", MeetingProviderException.FailureKind.INDETERMINATE, null);
        }
        if (!created.path("isOnlineMeeting").asBoolean(false)
                || !TEAMS_PROVIDER.equals(text(created, "onlineMeetingProvider"))) {
            throw new MeetingProviderException("GRAPH_TEAMS_EVENT_UNCONFIRMED", MeetingProviderException.FailureKind.INDETERMINATE, null);
        }
        JsonNode event = created;
        String joinUrl = text(event.path("onlineMeeting"), "joinUrl");
        if (joinUrl.isBlank()) {
            event = call(userAssertion, "GET", "/me/events/" + encodePath(eventId)
                    + "?$select=id,changeKey,isOnlineMeeting,onlineMeetingProvider,onlineMeeting", null);
            joinUrl = text(event.path("onlineMeeting"), "joinUrl");
        }
        requireJoinUrl(joinUrl);
        return new CreatedMeeting(eventId, text(event.path("onlineMeeting"), "id"), joinUrl, text(event, "changeKey"));
    }

    @Override public UpdatedMeeting updateMeeting(String userAssertion, String eventId, UpdateRequest request) {
        JsonNode response = call(userAssertion, "PATCH", "/me/events/" + encodePath(eventId), eventBody(request));
        return new UpdatedMeeting(text(response, "changeKey"));
    }

    @Override public void cancelMeeting(String userAssertion, String eventId, String comment) {
        ObjectNode payload = json.createObjectNode();
        payload.put("comment", comment == null ? "" : comment);
        call(userAssertion, "POST", "/me/events/" + encodePath(eventId) + "/cancel", payload);
    }

    @Override public Optional<AttendanceReport> latestAttendanceReport(String userAssertion, String onlineMeetingId) {
        JsonNode response = call(userAssertion, "GET", "/me/onlineMeetings/" + encodePath(onlineMeetingId) + "/attendanceReports", null, ATTENDANCE_SCOPES);
        JsonNode value = response.path("value");
        if (!value.isArray() || value.isEmpty()) return Optional.empty();
        List<JsonNode> reports = new ArrayList<>();
        value.forEach(reports::add);
        reports.sort(Comparator.comparing(report -> instant(text(report, "meetingEndDateTime")),
                Comparator.nullsLast(Comparator.reverseOrder())));
        JsonNode report = reports.getFirst();
        String reportId = text(report, "id");
        if (reportId.isBlank()) throw new MeetingProviderException("GRAPH_ATTENDANCE_REPORT_ID_MISSING", MeetingProviderException.FailureKind.INDETERMINATE, null);
        String recordsPath = "/me/onlineMeetings/" + encodePath(onlineMeetingId)
                + "/attendanceReports/" + encodePath(reportId) + "/attendanceRecords";
        List<AttendanceRecord> records = new ArrayList<>();
        Set<String> visitedPages = new HashSet<>();
        JsonNode recordResponse;
        do {
            if (visitedPages.size() >= 100 || !visitedPages.add(recordsPath)) {
                throw new MeetingProviderException("GRAPH_ATTENDANCE_PAGING_INVALID", MeetingProviderException.FailureKind.INDETERMINATE, null);
            }
            recordResponse = call(userAssertion, "GET", recordsPath, null, ATTENDANCE_SCOPES);
            JsonNode recordValues = recordResponse.path("value");
            if (recordValues.isArray()) for (JsonNode record : recordValues) {
                JsonNode identity = record.path("identity");
                List<AttendanceInterval> intervals = new ArrayList<>();
                JsonNode intervalValues = record.path("attendanceIntervals");
                if (intervalValues.isArray()) {
                    for (JsonNode interval : intervalValues) {
                        intervals.add(new AttendanceInterval(instant(text(interval, "joinDateTime")),
                                instant(text(interval, "leaveDateTime")), nullableLong(interval.path("durationInSeconds"))));
                    }
                }
                records.add(new AttendanceRecord(text(record, "id"), uuid(text(identity, "tenantId")),
                        uuid(text(identity, "id")), nullableLong(record.path("totalAttendanceInSeconds")), intervals));
            }
            recordsPath = text(recordResponse, "@odata.nextLink");
        } while (!recordsPath.isBlank());
        return Optional.of(new AttendanceReport(reportId, instant(text(report, "meetingStartDateTime")),
                instant(text(report, "meetingEndDateTime")), records));
    }

    private ObjectNode eventBody(CreateRequest request) {
        ObjectNode body = json.createObjectNode();
        body.put("subject", request.title());
        body.set("start", time(request.startsAt()));
        body.set("end", time(request.endsAt()));
        body.put("isOnlineMeeting", true);
        body.put("onlineMeetingProvider", TEAMS_PROVIDER);
        body.put("transactionId", request.transactionId().toString());
        attendees(body.putArray("attendees"), request.invitees());
        return body;
    }

    private ObjectNode eventBody(UpdateRequest request) {
        ObjectNode body = json.createObjectNode();
        body.put("subject", request.title());
        body.set("start", time(request.startsAt()));
        body.set("end", time(request.endsAt()));
        attendees(body.putArray("attendees"), request.invitees());
        return body;
    }

    private ObjectNode time(Instant instant) {
        ObjectNode value = json.createObjectNode();
        value.put("dateTime", DateTimeFormatter.ISO_LOCAL_DATE_TIME.format(LocalDateTime.ofInstant(instant, ZoneOffset.UTC)));
        value.put("timeZone", "UTC");
        return value;
    }

    private void attendees(ArrayNode destination, List<Invitee> invitees) {
        for (Invitee invitee : invitees) {
            ObjectNode attendee = destination.addObject();
            attendee.put("type", "required");
            ObjectNode email = attendee.putObject("emailAddress");
            email.put("name", invitee.name());
            email.put("address", invitee.institutionalEmail());
        }
    }

    private JsonNode call(String apiAssertion, String method, String path, JsonNode body) {
        return call(apiAssertion, method, path, body, CALENDAR_SCOPES);
    }

    private JsonNode call(String apiAssertion, String method, String path, JsonNode body, List<String> scopes) {
        String accessToken = tokens.acquire(apiAssertion, scopes);
        URI requestUri = path.startsWith("https://") || path.startsWith("http://")
                ? URI.create(path) : baseUrl.resolve(path.startsWith("/") ? path.substring(1) : path);
        if (!baseUrl.getScheme().equalsIgnoreCase(requestUri.getScheme())
                || !baseUrl.getAuthority().equalsIgnoreCase(requestUri.getAuthority())) {
            throw new MeetingProviderException("GRAPH_PAGING_ORIGIN_INVALID", MeetingProviderException.FailureKind.PERMANENT, null);
        }
        HttpRequest.Builder request = HttpRequest.newBuilder(requestUri)
                .timeout(requestTimeout)
                .header("Authorization", "Bearer " + accessToken)
                .header("Accept", "application/json")
                .header("Prefer", "outlook.timezone=\"UTC\"");
        if (body == null) {
            request.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            request.header("Content-Type", "application/json")
                    .method(method, HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        }
        try {
            HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw providerError(response.statusCode(), response.headers().firstValue("Retry-After").orElse(null), response.body());
            }
            if (response.body() == null || response.body().isBlank()) return json.createObjectNode();
            return json.readTree(response.body());
        } catch (MeetingProviderException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new MeetingProviderException("GRAPH_REQUEST_INTERRUPTED", MeetingProviderException.FailureKind.INDETERMINATE, null);
        } catch (IOException | RuntimeException exception) {
            throw new MeetingProviderException("GRAPH_REQUEST_UNCERTAIN", MeetingProviderException.FailureKind.INDETERMINATE, null);
        }
    }

    private MeetingProviderException providerError(int status, String retryAfter, String body) {
        Duration retryDelay = retryDelay(retryAfter);
        if (status == 401) return new MeetingProviderException("GRAPH_UNAUTHORIZED", MeetingProviderException.FailureKind.FORBIDDEN, null, status);
        if (status == 403) return new MeetingProviderException("GRAPH_FORBIDDEN", MeetingProviderException.FailureKind.FORBIDDEN, null, status);
        if (status == 404) return new MeetingProviderException("GRAPH_RESOURCE_NOT_FOUND", MeetingProviderException.FailureKind.PERMANENT, null, status);
        if (status == 429) return new MeetingProviderException("GRAPH_THROTTLED", MeetingProviderException.FailureKind.RETRYABLE, retryDelay, status);
        if (status >= 500) return new MeetingProviderException("GRAPH_SERVER_ERROR", MeetingProviderException.FailureKind.INDETERMINATE, retryDelay, status);
        return new MeetingProviderException(errorCode(body), MeetingProviderException.FailureKind.PERMANENT, null, status);
    }

    private String errorCode(String body) {
        try {
            String code = json.readTree(body).path("error").path("code").asString("");
            if (code.matches("[A-Za-z0-9._-]{1,80}")) return "GRAPH_" + code.toUpperCase(Locale.ROOT);
        } catch (RuntimeException ignored) {
            // Do not expose upstream response text if it cannot be parsed.
        }
        return "GRAPH_REQUEST_REJECTED";
    }

    private Duration retryDelay(String value) {
        if (value == null || value.isBlank()) return null;
        try { return Duration.ofSeconds(Math.max(0, Long.parseLong(value))); }
        catch (NumberFormatException ignored) {
            try {
                Instant retryAt = ZonedDateTime.parse(value, HTTP_DATE).toInstant();
                return Duration.between(Instant.now(), retryAt).isNegative()
                        ? Duration.ZERO : Duration.between(Instant.now(), retryAt);
            } catch (DateTimeParseException ignoredDate) {
                return null;
            }
        }
    }

    private void requireJoinUrl(String value) {
        try {
            URI uri = URI.create(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getHost().isBlank()) throw new IllegalArgumentException();
        } catch (IllegalArgumentException exception) {
            throw new MeetingProviderException("GRAPH_JOIN_URL_MISSING", MeetingProviderException.FailureKind.INDETERMINATE, null);
        }
    }

    private String text(JsonNode node, String field) {
        return node.path(field).asString("");
    }

    private Instant instant(String value) {
        if (value == null || value.isBlank()) return null;
        try { return Instant.parse(value); }
        catch (DateTimeParseException exception) { return null; }
    }

    private Long nullableLong(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        try { return node.asLong(); }
        catch (RuntimeException exception) { return null; }
    }

    private UUID uuid(String value) {
        if (value == null || value.isBlank()) return null;
        try { return UUID.fromString(value); }
        catch (IllegalArgumentException exception) { return null; }
    }

    private String encodePath(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
