package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.meetings.application.MeetingProvider;
import br.edu.unijorge.niteconnect.meetings.application.MeetingProviderException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(MeetingCreationTest.ProviderConfig.class)
@TestPropertySource(properties = "nite.meetings.graph.attendance-enabled=true")
class MeetingCreationTest extends ProjectTestSupport {
    private static final String IMMEDIATE_BODY = """
            {"mode":"IMMEDIATE","title":"Revisão técnica","startsAt":null,
             "plannedDurationMinutes":null,"inviteeIds":["%s"]}
            """.formatted(OTHER);

    @jakarta.annotation.Resource FakeMeetingProvider provider;

    @BeforeEach void resetProvider() { provider.reset(); }

    @Test void activeMemberCanCheckCalendarCapabilitiesWithoutCreatingMeeting() throws Exception {
        mvc.perform(get("/api/v1/meetings/calendar/capabilities").with(token(MEMBER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.allowedOnlineMeetingProviders[0]").value("teamsForBusiness"))
                .andExpect(jsonPath("$.defaultOnlineMeetingProvider").value("teamsForBusiness"))
                .andExpect(jsonPath("$.supportsTeamsForBusiness").value(true))
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")));

        assertThat(provider.capabilitiesCalls).isEqualTo(1);
        assertThat(provider.capabilitiesAssertion).isNotBlank();
        assertThat(provider.createCalls).isZero();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meetings", Integer.class)).isZero();
    }

    @Test void inactiveMemberCannotCheckCalendarCapabilities() throws Exception {
        jdbc.update("update nite_connect.members set status='DESLIGADO' where id=?", MEMBER);

        mvc.perform(get("/api/v1/meetings/calendar/capabilities").with(token(MEMBER)))
                .andExpect(status().isForbidden());

        assertThat(provider.capabilitiesCalls).isZero();
    }

    @Test void activeMemberCreatesImmediateMeetingWithSixtyMinuteEstimate() throws Exception {
        mvc.perform(post("/api/v1/meetings").with(token(MEMBER))
                        .header("Idempotency-Key", "meeting-immediate-1")
                        .contentType(MediaType.APPLICATION_JSON).content(IMMEDIATE_BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.mode").value("IMMEDIATE"))
                .andExpect(jsonPath("$.status").value("AGENDADA"))
                .andExpect(jsonPath("$.plannedDurationMinutes").value(60))
                .andExpect(jsonPath("$.actualDurationSeconds").isEmpty())
                .andExpect(jsonPath("$.joinUrl").doesNotExist());

        assertThat(provider.createCalls).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meetings where organizer_member_id=? and status='AGENDADA'", Integer.class, MEMBER)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select planned_ends_at - starts_at = interval '60 minutes' from nite_connect.meetings where organizer_member_id=?", Boolean.class, MEMBER)).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meeting_invites where meeting_id=(select id from nite_connect.meetings where organizer_member_id=?) and internal_status='PENDENTE'", Integer.class, MEMBER)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meeting_notifications where recipient_member_id=? and notification_type='CONVITE_RECEBIDO'", Integer.class, OTHER)).isEqualTo(1);
    }

    @Test void teamsLinkCreationIsInternalAndIdempotentUntilOrganizerLinksARealUrl() throws Exception {
        String body = """
                {"mode":"IMMEDIATE","provider":"TEAMS_LINK","title":"Conversa imediata",
                 "startsAt":null,"plannedDurationMinutes":null,"inviteeIds":["%s"]}
                """.formatted(OTHER);

        var first = mvc.perform(post("/api/v1/meetings").with(token(MEMBER)).header("Idempotency-Key", "teams-link-create-1")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.provider").value("TEAMS_LINK"))
                .andExpect(jsonPath("$.providerState").value("AGUARDANDO_CRIACAO_NO_TEAMS"))
                .andExpect(jsonPath("$.status").value("AGUARDANDO_TEAMS"))
                .andExpect(jsonPath("$.joinUrl").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        mvc.perform(post("/api/v1/meetings").with(token(MEMBER)).header("Idempotency-Key", "teams-link-create-1")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(first.split("\"id\":\"")[1].split("\"")[0]));

        assertThat(provider.createCalls).isZero();
        assertThat(jdbc.queryForObject("select graph_transaction_id is null from nite_connect.meeting_provider_operations where idempotency_key='teams-link-create-1'", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meeting_notifications where recipient_member_id=?", Integer.class, OTHER)).isZero();
    }

    @Test void concurrentTeamsLinkCreationWithSameKeyPersistsOneInternalMeeting() throws Exception {
        String body = """
                {"mode":"SCHEDULED","provider":"TEAMS_LINK","title":"Agendamento manual",
                 "startsAt":"2030-01-01T09:00:00-03:00","plannedDurationMinutes":30,"inviteeIds":[]}
                """;
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            var request = (java.util.concurrent.Callable<Integer>) () -> {
                ready.countDown();
                start.await();
                return mvc.perform(post("/api/v1/meetings").with(token(MEMBER)).header("Idempotency-Key", "teams-link-concurrent")
                                .contentType(MediaType.APPLICATION_JSON).content(body))
                        .andReturn().getResponse().getStatus();
            };
            var first = executor.submit(request);
            var second = executor.submit(request);
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(List.of(first.get(30, TimeUnit.SECONDS), second.get(30, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 201);
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.meetings where provider='TEAMS_LINK'", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.meeting_provider_operations where operation_type='CREATE' and idempotency_key='teams-link-concurrent'", Integer.class)).isEqualTo(1);
            assertThat(provider.createCalls).isZero();
        } finally {
            executor.shutdownNow();
        }
    }

    @Test void scheduledContinuationUsesEncodedOfficialTeamsLinkAndActiveInvitees() throws Exception {
        String body = """
                {"mode":"SCHEDULED","provider":"TEAMS_LINK","title":"Plano semanal NITE",
                 "startsAt":"2026-11-05T10:00:00-03:00","plannedDurationMinutes":30,"inviteeIds":["%s"]}
                """.formatted(OTHER);
        mvc.perform(post("/api/v1/meetings").with(token(MEMBER)).header("Idempotency-Key", "teams-link-scheduled-1")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated());
        UUID meetingId = meetingId();

        mvc.perform(get("/api/v1/meetings/" + meetingId + "/teams-continuation").with(token(MEMBER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.action").value("PREENCHER_AGENDAMENTO_NO_TEAMS"))
                .andExpect(jsonPath("$.actionUrl").value(org.hamcrest.Matchers.containsString("https://teams.microsoft.com/l/meeting/new?subject=Plano%20semanal%20NITE")))
                .andExpect(jsonPath("$.actionUrl").value(org.hamcrest.Matchers.containsString("startTime=2026-11-05T10%3A00%3A00-03%3A00")))
                .andExpect(jsonPath("$.actionUrl").value(org.hamcrest.Matchers.containsString("attendees=" + OTHER + "%40unijorge.com.br")))
                .andExpect(jsonPath("$.timeZone").value("America/Bahia"));
        mvc.perform(get("/api/v1/meetings/" + meetingId + "/teams-continuation").with(token(OTHER)))
                .andExpect(status().isNotFound());
        assertThat(provider.createCalls).isZero();
    }

    @Test void teamsLinkRequiresOfficialUrlAndEnablesJoinOnlyAfterOrganizerConfirmsIt() throws Exception {
        createTeamsLinkImmediate("teams-link-attach-1");
        UUID meetingId = meetingId();
        String validJoinUrl = "https://teams.microsoft.com/meet/123456789?p=sampleToken";

        mvc.perform(post("/api/v1/meetings/" + meetingId + "/teams-link").with(token(OTHER))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":1,\"joinUrl\":\"" + validJoinUrl + "\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/meetings/" + meetingId + "/teams-link").with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":1,\"joinUrl\":\"https://teams.microsoft.com.evil.example/meet/123?p=x\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/meetings/" + meetingId + "/join").with(token(OTHER)))
                .andExpect(status().isConflict());

        mvc.perform(post("/api/v1/meetings/" + meetingId + "/teams-link").with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":1,\"joinUrl\":\"" + validJoinUrl + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AGENDADA"))
                .andExpect(jsonPath("$.providerState").value("LINK_CONFIRMADO_PELO_ORGANIZADOR"))
                .andExpect(jsonPath("$.joinUrl").doesNotExist());
        mvc.perform(post("/api/v1/meetings/" + meetingId + "/teams-link").with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":1,\"joinUrl\":\"" + validJoinUrl + "\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/meetings/" + meetingId + "/join").with(token(OTHER)))
                .andExpect(status().isSeeOther())
                .andExpect(header().string("Location", validJoinUrl));

        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meeting_notifications where recipient_member_id=? and notification_type='CONVITE_RECEBIDO'", Integer.class, OTHER)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meeting_history where meeting_id=? and action='LINK_TEAMS_VINCULADO'", Integer.class, meetingId)).isEqualTo(1);
        assertThat(provider.createCalls).isZero();
    }

    @Test void teamsLinkUpdateAndCancellationAreLocalAndExplicitlyUnsynchronized() throws Exception {
        createTeamsLinkImmediate("teams-link-mutation-1");
        UUID meetingId = meetingId();
        String link = "https://teams.microsoft.com/meet/123456789?p=sampleToken";
        mvc.perform(post("/api/v1/meetings/" + meetingId + "/teams-link").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedVersion\":1,\"joinUrl\":\"" + link + "\"}"))
                .andExpect(status().isOk());
        String updateBody = """
                {"expectedVersion":2,"title":"Título alterado","startsAt":"2030-01-01T12:00:00-03:00",
                 "plannedDurationMinutes":45,"inviteeIds":["%s"]}
                """.formatted(OTHER);
        mvc.perform(patch("/api/v1/meetings/" + meetingId).with(token(MEMBER)).header("Idempotency-Key", "teams-link-update-1")
                        .contentType(MediaType.APPLICATION_JSON).content(updateBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AGUARDANDO_TEAMS"))
                .andExpect(jsonPath("$.providerState").value("ATUALIZACAO_PENDENTE_NO_TEAMS"))
                .andExpect(jsonPath("$.version").value(3));
        mvc.perform(patch("/api/v1/meetings/" + meetingId).with(token(MEMBER)).header("Idempotency-Key", "teams-link-update-1")
                        .contentType(MediaType.APPLICATION_JSON).content(updateBody))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(3));
        mvc.perform(get("/api/v1/meetings/" + meetingId + "/join").with(token(OTHER)))
                .andExpect(status().isConflict());
        assertThat(provider.updateCalls).isZero();

        mvc.perform(post("/api/v1/meetings/" + meetingId + "/teams-link").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedVersion\":3,\"joinUrl\":\"" + link + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AGENDADA"));
        mvc.perform(post("/api/v1/meetings/" + meetingId + "/cancel").with(token(MEMBER))
                        .header("Idempotency-Key", "teams-link-cancel-1").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedVersion\":4,\"comment\":\"Encerramento de teste\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELADA"))
                .andExpect(jsonPath("$.providerState").value("CANCELAMENTO_NAO_SINCRONIZADO"));
        assertThat(provider.cancelCalls).isZero();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meeting_history where meeting_id=? and action in ('REUNIAO_ALTERADA_LOCAL_TEAMS','REUNIAO_CANCELADA_LOCAL_TEAMS')", Integer.class, meetingId)).isEqualTo(2);
    }

    @Test void scheduledMeetingPersistsOffsetAsUtcAndUsesRequestedEstimate() throws Exception {
        String body = """
                {"mode":"SCHEDULED","title":"Planejamento","startsAt":"2030-01-01T09:00:00-03:00",
                 "plannedDurationMinutes":75,"inviteeIds":[]}
                """;

        mvc.perform(post("/api/v1/meetings").with(token(MEMBER)).header("Idempotency-Key", "meeting-scheduled-1")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.mode").value("SCHEDULED"))
                .andExpect(jsonPath("$.plannedDurationMinutes").value(75));

        assertThat(jdbc.queryForObject("select starts_at from nite_connect.meetings where organizer_member_id=?", java.sql.Timestamp.class, MEMBER).toInstant())
                .isEqualTo(Instant.parse("2030-01-01T12:00:00Z"));
        assertThat(jdbc.queryForObject("select planned_ends_at - starts_at = interval '75 minutes' from nite_connect.meetings where organizer_member_id=?", Boolean.class, MEMBER)).isTrue();
    }

    @Test void inactiveInviteeIsRejectedBeforeAnyProviderCall() throws Exception {
        jdbc.update("update nite_connect.members set status='DESLIGADO' where id=?", OTHER);

        mvc.perform(post("/api/v1/meetings").with(token(MEMBER)).header("Idempotency-Key", "meeting-inactive-invitee")
                        .contentType(MediaType.APPLICATION_JSON).content(IMMEDIATE_BODY))
                .andExpect(status().isForbidden());

        assertThat(provider.createCalls).isZero();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meetings", Integer.class)).isZero();
    }

    @Test void pastListDoesNotInferThatTheMeetingWasCompletedAndGuestSeesOnlyOwnInvite() throws Exception {
        String body = IMMEDIATE_BODY.replace("\"%s\"".formatted(OTHER), "\"%s\",\"%s\"".formatted(OTHER, ADMIN));
        mvc.perform(post("/api/v1/meetings").with(token(MEMBER)).header("Idempotency-Key", "meeting-history-list")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated());
        UUID meetingId = meetingId();
        jdbc.update("update nite_connect.meetings set starts_at='2020-01-01T10:00:00Z',planned_ends_at='2020-01-01T11:00:00Z' where id=?", meetingId);

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/meetings").with(token(MEMBER)).param("scope", "past"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].status").value("AGENDADA"))
                .andExpect(jsonPath("$.items[0].actualDurationSeconds").isEmpty());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/meetings/" + meetingId).with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.invitees.length()").value(1))
                .andExpect(jsonPath("$.invitees[0].memberId").value(OTHER.toString()));
    }

    @Test void cancelledMeetingIsSeparatedFromUpcomingAndPastLists() throws Exception {
        createImmediate("meeting-cancelled-scope-create");
        UUID meetingId = meetingId();

        mvc.perform(post("/api/v1/meetings/" + meetingId + "/cancel").with(token(MEMBER))
                        .header("Idempotency-Key", "meeting-cancelled-scope-cancel")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":1,\"comment\":null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELADA"));

        mvc.perform(get("/api/v1/meetings").with(token(MEMBER)).param("scope", "upcoming"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(get("/api/v1/meetings").with(token(MEMBER)).param("scope", "past"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(get("/api/v1/meetings").with(token(MEMBER)).param("scope", "cancelled"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(meetingId.toString()))
                .andExpect(jsonPath("$.items[0].status").value("CANCELADA"));
    }

    @Test void retryWithSameIdempotencyKeyDoesNotCreateAnotherGraphEvent() throws Exception {
        var first = mvc.perform(post("/api/v1/meetings").with(token(MEMBER)).header("Idempotency-Key", "meeting-idempotent-1")
                        .contentType(MediaType.APPLICATION_JSON).content(IMMEDIATE_BODY))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        var second = mvc.perform(post("/api/v1/meetings").with(token(MEMBER)).header("Idempotency-Key", "meeting-idempotent-1")
                        .contentType(MediaType.APPLICATION_JSON).content(IMMEDIATE_BODY))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        assertThat(second).contains("\"id\":\"" + first.split("\"id\":\"")[1].split("\"")[0] + "\"");
        assertThat(provider.createCalls).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meetings where organizer_member_id=?", Integer.class, MEMBER)).isEqualTo(1);
    }

    @Test void concurrentCreateRequestsWithSameKeyReserveOnlyOneProviderOperation() throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            var createRequest = (java.util.concurrent.Callable<Integer>) () -> {
                ready.countDown();
                start.await();
                return mvc.perform(post("/api/v1/meetings").with(token(MEMBER)).header("Idempotency-Key", "meeting-concurrent-1")
                                .contentType(MediaType.APPLICATION_JSON).content(IMMEDIATE_BODY))
                        .andReturn().getResponse().getStatus();
            };
            var first = executor.submit(createRequest);
            var second = executor.submit(createRequest);
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            int firstStatus = first.get(30, TimeUnit.SECONDS);
            int secondStatus = second.get(30, TimeUnit.SECONDS);

            assertThat(List.of(firstStatus, secondStatus)).allSatisfy(status -> assertThat(status).isIn(200, 201, 202));
            assertThat(provider.createCalls).isEqualTo(1);
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.meeting_provider_operations where organizer_member_id=? and operation_type='CREATE'", Integer.class, MEMBER)).isEqualTo(1);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test void uncertainGraphResultIsPendingAndDoesNotConfirmMeeting() throws Exception {
        provider.failure = new MeetingProviderException("GRAPH_SERVER_ERROR", MeetingProviderException.FailureKind.INDETERMINATE, null);

        mvc.perform(post("/api/v1/meetings").with(token(MEMBER)).header("Idempotency-Key", "meeting-uncertain-1")
                        .contentType(MediaType.APPLICATION_JSON).content(IMMEDIATE_BODY))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.meetingStatus").value("CRIACAO_PENDENTE"))
                .andExpect(jsonPath("$.operationStatus").value("RESULTADO_INDETERMINADO"));

        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meetings where status='AGENDADA'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meetings where status='CRIACAO_PENDENTE' and join_url is null", Integer.class)).isEqualTo(1);
    }

    @Test void sameIdempotencyKeyWithDifferentPayloadConflicts() throws Exception {
        mvc.perform(post("/api/v1/meetings").with(token(MEMBER)).header("Idempotency-Key", "meeting-conflict-1")
                        .contentType(MediaType.APPLICATION_JSON).content(IMMEDIATE_BODY))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/v1/meetings").with(token(MEMBER)).header("Idempotency-Key", "meeting-conflict-1")
                        .contentType(MediaType.APPLICATION_JSON).content(IMMEDIATE_BODY.replace("Revisão técnica", "Outro título")))
                .andExpect(status().isConflict());
        assertThat(provider.createCalls).isEqualTo(1);
    }

    @Test void organizerCanUpdateMeetingAndInvitationsWithExpectedVersion() throws Exception {
        createImmediate("meeting-update-create");
        UUID meetingId = meetingId();
        String body = """
                {"expectedVersion":1,"title":"Título atualizado","startsAt":"2030-01-01T12:00:00-03:00",
                 "plannedDurationMinutes":45,"inviteeIds":["%s"]}
                """.formatted(ADMIN);

        mvc.perform(patch("/api/v1/meetings/" + meetingId).with(token(MEMBER))
                        .header("Idempotency-Key", "meeting-update-1")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Título atualizado"))
                .andExpect(jsonPath("$.plannedDurationMinutes").value(45))
                .andExpect(jsonPath("$.version").value(2));

        mvc.perform(patch("/api/v1/meetings/" + meetingId).with(token(MEMBER))
                        .header("Idempotency-Key", "meeting-update-1")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        mvc.perform(patch("/api/v1/meetings/" + meetingId).with(token(MEMBER))
                        .header("Idempotency-Key", "meeting-update-stale-1")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());

        assertThat(provider.updateCalls).isEqualTo(1);
        assertThat(jdbc.queryForObject("select status from nite_connect.meetings where id=?", String.class, meetingId)).isEqualTo("AGENDADA");
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meeting_history where meeting_id=? and action='REUNIAO_ALTERADA'", Integer.class, meetingId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select internal_status from nite_connect.meeting_invites where meeting_id=? and member_id=?", String.class, meetingId, OTHER)).isEqualTo("REVOGADO");
        assertThat(jdbc.queryForObject("select internal_status from nite_connect.meeting_invites where meeting_id=? and member_id=?", String.class, meetingId, ADMIN)).isEqualTo("PENDENTE");
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meeting_notifications where recipient_member_id=? and notification_type='CONVITE_RECEBIDO'", Integer.class, ADMIN)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meeting_notifications where recipient_member_id=? and notification_type='REUNIAO_ALTERADA'", Integer.class, OTHER)).isEqualTo(1);
    }

    @Test void uncertainUpdateCanBeRecoveredByRepeatingTheSameIdempotentRequest() throws Exception {
        createImmediate("meeting-update-recovery-create");
        UUID meetingId = meetingId();
        String body = """
                {"expectedVersion":1,"title":"Título recuperado","startsAt":"2030-01-01T12:00:00-03:00",
                 "plannedDurationMinutes":45,"inviteeIds":["%s"]}
                """.formatted(OTHER);
        provider.failure = new MeetingProviderException("GRAPH_SERVER_ERROR", MeetingProviderException.FailureKind.INDETERMINATE, null);

        mvc.perform(patch("/api/v1/meetings/" + meetingId).with(token(MEMBER))
                        .header("Idempotency-Key", "meeting-update-recovery-1")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.operationStatus").value("RESULTADO_INDETERMINADO"));
        assertThat(jdbc.queryForObject("select title from nite_connect.meetings where id=?", String.class, meetingId)).isEqualTo("Revisão técnica");

        jdbc.update("update nite_connect.meeting_provider_operations set retry_after=current_timestamp - interval '1 second' where meeting_id=? and operation_type='UPDATE'", meetingId);
        provider.failure = null;
        mvc.perform(patch("/api/v1/meetings/" + meetingId).with(token(MEMBER))
                        .header("Idempotency-Key", "meeting-update-recovery-1")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Título recuperado"));

        assertThat(provider.updateCalls).isEqualTo(2);
        assertThat(jdbc.queryForObject("select status from nite_connect.meetings where id=?", String.class, meetingId)).isEqualTo("AGENDADA");
    }

    @Test void onlyOrganizerCanCancelAndCancellationNotifiesInvitees() throws Exception {
        createImmediate("meeting-cancel-create");
        UUID meetingId = meetingId();
        String body = "{\"expectedVersion\":1,\"comment\":\"Reagendamento\"}";

        mvc.perform(post("/api/v1/meetings/" + meetingId + "/cancel").with(token(OTHER))
                        .header("Idempotency-Key", "meeting-cancel-forbidden")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isNotFound());
        assertThat(provider.cancelCalls).isZero();

        mvc.perform(post("/api/v1/meetings/" + meetingId + "/cancel").with(token(MEMBER))
                        .header("Idempotency-Key", "meeting-cancel-1")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELADA"));

        assertThat(provider.cancelCalls).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meeting_notifications where recipient_member_id=? and notification_type='REUNIAO_CANCELADA'", Integer.class, OTHER)).isEqualTo(1);
    }

    @Test void inviteeResponseIsInternalAndCanBeReadFromPersonalInbox() throws Exception {
        createImmediate("meeting-response-create");
        UUID meetingId = meetingId();

        mvc.perform(put("/api/v1/meetings/" + meetingId + "/my-response").with(token(OTHER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedVersion\":1,\"response\":\"ACEITO\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.internalStatus").value("ACEITO"))
                .andExpect(jsonPath("$.calendarResponseStatus").value("NAO_SINCRONIZADO"));

        assertThat(jdbc.queryForObject("select internal_status from nite_connect.meeting_invites where meeting_id=? and member_id=?", String.class, meetingId, OTHER)).isEqualTo("ACEITO");
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meeting_notifications where recipient_member_id=? and notification_type='CONVITE_ACEITO'", Integer.class, MEMBER)).isEqualTo(1);

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/me/notifications").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].type").value("CONVITE_ACEITO"));
        UUID notificationId = jdbc.queryForObject("select id from nite_connect.meeting_notifications where recipient_member_id=? and notification_type='CONVITE_ACEITO'", UUID.class, MEMBER);
        mvc.perform(post("/api/v1/me/notifications/" + notificationId + "/read").with(token(MEMBER)))
                .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select read_at is not null from nite_connect.meeting_notifications where id=?", Boolean.class, notificationId)).isTrue();
        mvc.perform(post("/api/v1/me/notifications/" + notificationId + "/read").with(token(OTHER)))
                .andExpect(status().isNotFound());
    }

    @Test void inviteeCanAccessOfficialTeamsLinkThroughAuthorizedRedirect() throws Exception {
        createImmediate("meeting-join-create");
        UUID meetingId = meetingId();

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/meetings/" + meetingId + "/join").with(token(OTHER)))
                .andExpect(status().isSeeOther())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Location", "https://teams.microsoft.com/l/meetup-join/test"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Cache-Control", "no-store"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/meetings/" + meetingId + "/join").with(token(ADMIN)))
                .andExpect(status().isNotFound());
    }

    @Test void attendanceIsImportedOnlyFromDelegatedMicrosoftReportAndDoesNotCreateFrequencyPresence() throws Exception {
        createImmediate("meeting-attendance-create");
        UUID meetingId = meetingId();
        provider.attendanceReport = new MeetingProvider.AttendanceReport("report-1",
                Instant.parse("2026-11-02T17:00:00Z"), Instant.parse("2026-11-02T17:30:00Z"),
                List.of(new MeetingProvider.AttendanceRecord("record-1", TENANT, OTHER, 1200L,
                        List.of(new MeetingProvider.AttendanceInterval(Instant.parse("2026-11-02T17:00:00Z"),
                                Instant.parse("2026-11-02T17:20:00Z"), 1200L)))));

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/meetings/" + meetingId + "/attendance").with(token(MEMBER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.availabilityStatus").value("DISPONIVEL"))
                .andExpect(jsonPath("$.actualDurationSeconds").value(1800))
                .andExpect(jsonPath("$.participants[0].memberId").value(OTHER.toString()))
                .andExpect(jsonPath("$.participants[0].attendanceSeconds").value(1200));

        assertThat(jdbc.queryForObject("select count(*) from nite_connect.meeting_attendance_intervals", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.attendance_records", Integer.class)).isZero();
    }

    @Test void absentAttendanceReportReturnsPendingWithoutEstimatedDuration() throws Exception {
        createImmediate("meeting-attendance-pending-create");

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/meetings/" + meetingId() + "/attendance").with(token(MEMBER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.availabilityStatus").value("PENDENTE"))
                .andExpect(jsonPath("$.actualDurationSeconds").isEmpty())
                .andExpect(jsonPath("$.participants").isEmpty());
    }

    private void createImmediate(String key) throws Exception {
        mvc.perform(post("/api/v1/meetings").with(token(MEMBER)).header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON).content(IMMEDIATE_BODY))
                .andExpect(status().isCreated());
    }

    private void createTeamsLinkImmediate(String key) throws Exception {
        mvc.perform(post("/api/v1/meetings").with(token(MEMBER)).header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"mode":"IMMEDIATE","provider":"TEAMS_LINK","title":"Teste Teams Link",
                                 "startsAt":null,"plannedDurationMinutes":null,"inviteeIds":["%s"]}
                                """.formatted(OTHER)))
                .andExpect(status().isCreated());
    }

    private UUID meetingId() {
        return jdbc.queryForObject("select id from nite_connect.meetings where organizer_member_id=? order by created_at desc limit 1", UUID.class, MEMBER);
    }

    @TestConfiguration
    static class ProviderConfig {
        @Bean @Primary FakeMeetingProvider fakeMeetingProvider() { return new FakeMeetingProvider(); }
    }

    static class FakeMeetingProvider implements MeetingProvider {
        int capabilitiesCalls;
        String capabilitiesAssertion;
        int createCalls;
        int updateCalls;
        int cancelCalls;
        MeetingProviderException failure;
        MeetingProvider.AttendanceReport attendanceReport;
        final List<UUID> transactionIds = new CopyOnWriteArrayList<>();

        void reset() { capabilitiesCalls = 0; capabilitiesAssertion = null; createCalls = 0; updateCalls = 0; cancelCalls = 0; failure = null; attendanceReport = null; transactionIds.clear(); }

        @Override public Capabilities capabilities(String userAssertion) {
            capabilitiesCalls++;
            capabilitiesAssertion = userAssertion;
            return new Capabilities(List.of("teamsForBusiness"), "teamsForBusiness");
        }

        @Override public CreatedMeeting createMeeting(String userAssertion, CreateRequest request) {
            createCalls++;
            transactionIds.add(request.transactionId());
            if (failure != null) throw failure;
            return new CreatedMeeting("event-" + createCalls, "online-" + createCalls,
                    "https://teams.microsoft.com/l/meetup-join/test", "change-" + createCalls);
        }

        @Override public UpdatedMeeting updateMeeting(String userAssertion, String eventId, UpdateRequest request) {
            updateCalls++;
            if (failure != null) throw failure;
            return new UpdatedMeeting("change-updated");
        }

        @Override public void cancelMeeting(String userAssertion, String eventId, String comment) {
            cancelCalls++;
            if (failure != null) throw failure;
        }

        @Override public java.util.Optional<MeetingProvider.AttendanceReport> latestAttendanceReport(String userAssertion, String onlineMeetingId) {
            if (failure != null) throw failure;
            return java.util.Optional.ofNullable(attendanceReport);
        }
    }
}
