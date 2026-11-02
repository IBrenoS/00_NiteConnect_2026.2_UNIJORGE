package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(FrequencyReadContractsTest.FrequencyClockConfiguration.class)
class FrequencyReadContractsTest extends AttendanceTestSupport {
    private static final ZoneId BAHIA = ZoneId.of("America/Bahia");

    @org.springframework.beans.factory.annotation.Autowired
    MutableClock clock;

    @BeforeEach
    void alignClockWithTestEvents() {
        clock.set(Instant.now());
    }

    @Test
    void personalOpenListsReportMultipleEligibilityAndConfirmationStatesWithoutSecrets() throws Exception {
        UUID availableEvent = event();
        UUID availableList = openList(availableEvent);
        qrForList(availableList);

        UUID withoutQr = openList(event());

        UUID outsideEvent = event();
        jdbc.update("update nite_connect.members set status='AFASTADO' where id=?", MEMBER);
        UUID outsideSnapshot = openList(outsideEvent);
        jdbc.update("update nite_connect.members set status='ATIVO' where id=?", MEMBER);
        qrForList(outsideSnapshot);

        UUID confirmedEvent = event();
        UUID confirmedList = openList(confirmedEvent);
        String qr = qrForList(confirmedList);
        mvc.perform(post("/api/v1/me/frequency/confirmations").with(token(MEMBER)).contentType("application/json")
                        .content(json.writeValueAsString(Map.of("qrToken", qr))))
                .andExpect(status().isCreated());

        MvcResult result = mvc.perform(get("/api/v1/me/frequency/open-lists").with(token(MEMBER)))
                .andExpect(status().isOk()).andReturn();
        var items = json.readTree(result.getResponse().getContentAsString());
        assertThat(items.isArray()).isTrue();
        assertThat(items.size()).isEqualTo(4);

        var available = findByList(items, availableList);
        assertThat(available.path("eligible").asBoolean()).isTrue();
        assertThat(available.path("status").asText()).isEqualTo("AGUARDANDO_CONFIRMACAO");
        assertThat(available.has("changedAt")).isTrue();
        assertThat(available.path("changedAt").isNull()).isTrue();
        assertThat(available.path("confirmationAvailable").asBoolean()).isTrue();
        assertThat(available.path("confirmationDeadline").isTextual()).isTrue();
        assertThat(available.path("qrExpiresAt").isTextual()).isTrue();
        assertThat(available.has("qrToken")).isFalse();
        assertThat(available.has("qrTokenHash")).isFalse();
        assertThat(available.has("handoffId")).isFalse();

        var noQr = findByList(items, withoutQr);
        assertThat(noQr.path("eligible").asBoolean()).isTrue();
        assertThat(noQr.path("confirmationAvailable").asBoolean()).isFalse();

        var ineligible = findByList(items, outsideSnapshot);
        assertThat(ineligible.path("eligible").asBoolean()).isFalse();
        assertThat(ineligible.path("status").asText()).isEqualTo("NAO_ELEGIVEL");
        assertThat(ineligible.path("confirmationAvailable").asBoolean()).isFalse();

        var confirmed = findByList(items, confirmedList);
        assertThat(confirmed.path("status").asText()).isEqualTo("PRESENCA_REGISTRADA");
        assertThat(confirmed.path("confirmedAt").isTextual()).isTrue();
        assertThat(confirmed.path("confirmationAvailable").asBoolean()).isFalse();

        mvc.perform(patch("/api/v1/attendance/lists/" + availableList + "/participants/" + MEMBER).with(token(ADMIN))
                        .contentType("application/json").content(json.writeValueAsString(Map.of(
                                "expectedVersion", listVersion(availableList), "targetStatus", "JUSTIFICADO", "reason", "EMAIL_EXTERNO_RECEBIDO"))))
                .andExpect(status().isOk());
        MvcResult justifiedResult = mvc.perform(get("/api/v1/me/frequency/open-lists").with(token(MEMBER)))
                .andExpect(status().isOk()).andReturn();
        var justified = findByList(json.readTree(justifiedResult.getResponse().getContentAsString()), availableList);
        assertThat(justified.path("changedAt").isTextual()).isTrue();
        assertThat(Instant.parse(justified.path("changedAt").asText()))
                .isEqualTo(jdbc.queryForObject("select changed_at from nite_connect.attendance_list_members where list_id=? and member_id=?",
                        java.sql.Timestamp.class, availableList, MEMBER).toInstant());
    }

    @Test
    void personalOpenListsAreEmptyWithoutOpenListsAndRequireActiveIdentity() throws Exception {
        MvcResult emptyResult = mvc.perform(get("/api/v1/me/frequency/open-lists").with(token(MEMBER)))
                .andExpect(status().isOk()).andReturn();
        var emptyItems = json.readTree(emptyResult.getResponse().getContentAsString());
        assertThat(emptyItems.isArray()).isTrue();
        assertThat(emptyItems.size()).isZero();
        jdbc.update("update nite_connect.members set status='AFASTADO' where id=?", OTHER);
        mvc.perform(get("/api/v1/me/frequency/open-lists").with(token(OTHER)))
                .andExpect(status().isForbidden());
    }

    @Test
    void personalAvailabilityDisablesConfirmationAtQrAndGlobalWindowExpiry() throws Exception {
        UUID list = openList(event());
        qrForList(list);
        clock.advance(Duration.ofSeconds(121));
        MvcResult expiredQr = mvc.perform(get("/api/v1/me/frequency/open-lists").with(token(MEMBER)))
                .andExpect(status().isOk()).andReturn();
        var qrWindow = json.readTree(expiredQr.getResponse().getContentAsString()).get(0);
        assertThat(qrWindow.path("confirmationWindowStatus").asText()).isEqualTo("ABERTA");
        assertThat(qrWindow.path("status").asText()).isEqualTo("AGUARDANDO_CONFIRMACAO");
        assertThat(qrWindow.path("confirmationAvailable").asBoolean()).isFalse();

        clock.advance(Duration.ofSeconds(70));
        MvcResult expiredListWindow = mvc.perform(get("/api/v1/me/frequency/open-lists").with(token(MEMBER)))
                .andExpect(status().isOk()).andReturn();
        var listWindow = json.readTree(expiredListWindow.getResponse().getContentAsString()).get(0);
        assertThat(listWindow.path("confirmationWindowStatus").asText()).isEqualTo("EXPIRADA");
        assertThat(listWindow.path("confirmationAvailable").asBoolean()).isFalse();
    }

    @Test
    void personalHistorySeparatesPresenceListStateAndAccountingReason() throws Exception {
        UUID cancelledEvent = event();
        UUID cancelled = openList(cancelledEvent);
        String qr = qrForList(cancelled);
        checkIn(cancelledEvent, qr);
        mvc.perform(post("/api/v1/attendance/lists/" + cancelled + "/cancel").with(token(ADMIN))
                        .contentType("application/json").content(json.writeValueAsString(Map.of(
                                "expectedVersion", listVersion(cancelled), "reason", "Reunião cancelada", "confirmed", true))))
                .andExpect(status().isOk());
        MvcResult canceledRoster = mvc.perform(get("/api/v1/attendance/lists/" + cancelled + "/participants").with(token(ADMIN)))
                .andExpect(status().isOk()).andReturn();
        var canceledWaiting = findByMember(json.readTree(canceledRoster.getResponse().getContentAsString()).path("items"), LEADER);
        assertThat(canceledWaiting.path("status").asText()).isEqualTo("FORA_DA_APURACAO");
        assertThat(canceledWaiting.path("changedAt").isNull()).isTrue();
        assertThat(json.readTree(canceledRoster.getResponse().getContentAsString()).path("counts").path("absent").asLong()).isZero();

        UUID countable = openList(event());
        mvc.perform(post("/api/v1/attendance/lists/" + countable + "/finalize").with(token(ADMIN))
                        .contentType("application/json").content(json.writeValueAsString(Map.of(
                                "expectedVersion", listVersion(countable), "outcome", "REALIZADA_CONTABILIZAVEL", "reason", "Realizada"))))
                .andExpect(status().isOk());

        UUID nonCountable = openExceptionalList(false);
        mvc.perform(post("/api/v1/attendance/lists/" + nonCountable + "/finalize").with(token(ADMIN))
                        .contentType("application/json").content(json.writeValueAsString(Map.of(
                                "expectedVersion", listVersion(nonCountable), "outcome", "REALIZADA_NAO_CONTABILIZAVEL", "reason", "Não contabilizável"))))
                .andExpect(status().isOk());

        UUID expiredAwaitingFinalization = openList(event());
        clock.advance(Duration.ofMinutes(4));
        UUID openWindow = openList(event());

        LocalDate date = LocalDate.now(clock.withZone(BAHIA));
        MvcResult result = mvc.perform(get("/api/v1/me/frequency/history?from=" + date + "&to=" + date).with(token(MEMBER)))
                .andExpect(status().isOk()).andReturn();
        var items = json.readTree(result.getResponse().getContentAsString()).path("items");

        var canceledPresence = findByList(items, cancelled);
        assertThat(canceledPresence.path("status").asText()).isEqualTo("PRESENTE");
        assertThat(canceledPresence.path("presenceRecorded").asBoolean()).isTrue();
        assertThat(canceledPresence.path("confirmedAt").isTextual()).isTrue();
        assertThat(Instant.parse(canceledPresence.path("changedAt").asText()))
                .isEqualTo(Instant.parse(canceledPresence.path("confirmedAt").asText()));
        assertThat(canceledPresence.path("listStatus").asText()).isEqualTo("CANCELADA");
        assertThat(canceledPresence.path("accountingStatus").asText()).isEqualTo("CANCELADA");
        assertThat(canceledPresence.path("notCountedReason").asText()).isEqualTo("REUNIAO_CANCELADA");

        var countedAbsence = findByList(items, countable);
        assertThat(countedAbsence.path("status").asText()).isEqualTo("AUSENTE");
        assertThat(countedAbsence.path("presenceRecorded").asBoolean()).isFalse();
        assertThat(Instant.parse(countedAbsence.path("changedAt").asText()))
                .isEqualTo(jdbc.queryForObject("select closed_at from nite_connect.attendance_lists where id=?",
                        java.sql.Timestamp.class, countable).toInstant());
        assertThat(countedAbsence.path("accountingStatus").asText()).isEqualTo("CONTABILIZADA");
        assertThat(countedAbsence.path("notCountedReason").isNull()).isTrue();

        var nonCounted = findByList(items, nonCountable);
        assertThat(nonCounted.path("status").asText()).isEqualTo("FORA_DA_APURACAO");
        assertThat(nonCounted.path("attendanceStatus").asText()).isEqualTo("AGUARDANDO");
        assertThat(nonCounted.path("listStatus").asText()).isEqualTo("CONCLUIDA");
        assertThat(nonCounted.path("outcome").asText()).isEqualTo("REALIZADA_NAO_CONTABILIZAVEL");
        assertThat(nonCounted.path("accountingStatus").asText()).isEqualTo("NAO_CONTABILIZAVEL");
        assertThat(nonCounted.path("notCountedReason").asText()).isEqualTo("REUNIAO_NAO_CONTABILIZAVEL");
        assertThat(nonCounted.path("changedAt").isNull()).isTrue();

        var expired = findByList(items, expiredAwaitingFinalization);
        assertThat(expired.path("listStatus").asText()).isEqualTo("ABERTA");
        assertThat(expired.path("confirmationWindowStatus").asText()).isEqualTo("EXPIRADA");
        assertThat(expired.path("accountingStatus").asText()).isEqualTo("AGUARDANDO_CONCLUSAO");
        assertThat(expired.path("notCountedReason").asText()).isEqualTo("LISTA_AGUARDANDO_CONCLUSAO");
        assertThat(expired.path("changedAt").isNull()).isTrue();

        var open = findByList(items, openWindow);
        assertThat(open.path("confirmationWindowStatus").asText()).isEqualTo("ABERTA");
        assertThat(open.path("accountingStatus").asText()).isEqualTo("AGUARDANDO_CONCLUSAO");
        assertThat(open.path("changedAt").isNull()).isTrue();
    }

    @Test
    void personalAndCollectiveHistorySharePostConclusionAdministrativeTimestamps() throws Exception {
        UUID list = openList(event());
        mvc.perform(post("/api/v1/attendance/lists/" + list + "/finalize").with(token(ADMIN)).contentType("application/json")
                        .content(json.writeValueAsString(Map.of("expectedVersion", listVersion(list),
                                "outcome", "REALIZADA_CONTABILIZAVEL", "reason", "Reunião realizada"))))
                .andExpect(status().isOk());
        Instant concludedAt = jdbc.queryForObject("select closed_at from nite_connect.attendance_lists where id=?",
                java.sql.Timestamp.class, list).toInstant();
        MvcResult absentParticipant = mvc.perform(get("/api/v1/attendance/lists/" + list + "/participants").with(token(ADMIN)))
                .andExpect(status().isOk()).andReturn();
        var absent = findByMember(json.readTree(absentParticipant.getResponse().getContentAsString()).path("items"), MEMBER);
        assertThat(absent.path("status").asText()).isEqualTo("AUSENTE");
        assertThat(Instant.parse(absent.path("changedAt").asText())).isEqualTo(concludedAt);

        clock.advance(Duration.ofSeconds(61));
        MvcResult justification = mvc.perform(patch("/api/v1/attendance/lists/" + list + "/participants/" + MEMBER).with(token(ADMIN))
                        .contentType("application/json").content(json.writeValueAsString(Map.of(
                                "expectedVersion", listVersion(list), "targetStatus", "JUSTIFICADO", "reason", "EMAIL_EXTERNO_RECEBIDO"))))
                .andExpect(status().isOk()).andReturn();
        Instant justifiedAt = Instant.parse(json.readTree(justification.getResponse().getContentAsString()).path("changedAt").asText());
        assertThat(justifiedAt).isAfter(concludedAt);
        assertHistoryMomentsMatch(list, LocalDate.now(clock.withZone(BAHIA)), "JUSTIFICADO", justifiedAt);

        clock.advance(Duration.ofSeconds(61));
        MvcResult correction = mvc.perform(patch("/api/v1/attendance/lists/" + list + "/participants/" + MEMBER).with(token(ADMIN))
                        .contentType("application/json").content(json.writeValueAsString(Map.of(
                                "expectedVersion", listVersion(list), "targetStatus", "AUSENTE", "reason", "CORRECAO_ADMINISTRATIVA"))))
                .andExpect(status().isOk()).andReturn();
        Instant correctedAt = Instant.parse(json.readTree(correction.getResponse().getContentAsString()).path("changedAt").asText());
        assertThat(correctedAt).isAfter(justifiedAt);
        assertHistoryMomentsMatch(list, LocalDate.now(clock.withZone(BAHIA)), "AUSENTE", correctedAt);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.attendance_list_events where list_id=? and member_id=? and actor_id=? and action='JUSTIFICATION_REVOKED'",
                Long.class, list, MEMBER, ADMIN)).isEqualTo(1);
    }

    private void assertHistoryMomentsMatch(UUID list, LocalDate date, String status, Instant changedAt) throws Exception {
        String query = "?from=" + date + "&to=" + date;
        MvcResult personalResult = mvc.perform(get("/api/v1/me/frequency/history" + query).with(token(MEMBER)))
                .andExpect(status().isOk()).andReturn();
        MvcResult collectiveResult = mvc.perform(get("/api/v1/attendance/frequency/members/" + MEMBER + "/history" + query)
                        .with(token(ADMIN)))
                .andExpect(status().isOk()).andReturn();
        var personal = findByList(json.readTree(personalResult.getResponse().getContentAsString()).path("items"), list);
        var collective = findByList(json.readTree(collectiveResult.getResponse().getContentAsString()).path("items"), list);
        assertThat(personal.path("attendanceStatus").asText()).isEqualTo(status);
        assertThat(collective.path("attendanceStatus").asText()).isEqualTo(status);
        assertThat(Instant.parse(personal.path("changedAt").asText())).isEqualTo(changedAt);
        assertThat(Instant.parse(collective.path("changedAt").asText())).isEqualTo(changedAt);
    }

    @Test
    void participantSearchUsesEntireSnapshotAndReturnsGlobalCountsIndependentOfPage() throws Exception {
        setNames();
        UUID event = event();
        UUID list = openList(event);

        MvcResult searched = mvc.perform(get("/api/v1/attendance/lists/" + list + "/participants")
                        .param("name", "JOAO").param("status", "AGUARDANDO").param("page", "0").param("size", "1")
                        .with(token(ADMIN)))
                .andExpect(status().isOk()).andReturn();
        var filtered = json.readTree(searched.getResponse().getContentAsString());
        assertThat(filtered.path("total").asLong()).isEqualTo(1);
        assertThat(filtered.path("pageCount").asInt()).isEqualTo(1);
        assertThat(filtered.path("items").get(0).path("displayName").asText()).isEqualTo("João Nascimento");
        assertThat(filtered.path("counts").path("rosterTotal").asLong()).isEqualTo(4);
        assertThat(filtered.path("counts").path("awaitingConfirmation").asLong()).isEqualTo(4);

        String qr = qrForList(list);
        checkIn(event, qr);
        mvc.perform(patch("/api/v1/attendance/lists/" + list + "/participants/" + LEADER).with(token(ADMIN))
                        .contentType("application/json").content(json.writeValueAsString(Map.of(
                                "expectedVersion", listVersion(list), "targetStatus", "JUSTIFICADO", "reason", "EMAIL_EXTERNO_RECEBIDO"))))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/attendance/lists/" + list + "/finalize").with(token(ADMIN)).contentType("application/json")
                        .content(json.writeValueAsString(Map.of("expectedVersion", listVersion(list),
                                "outcome", "REALIZADA_CONTABILIZAVEL", "reason", "Realizada"))))
                .andExpect(status().isOk());

        MvcResult page = mvc.perform(get("/api/v1/attendance/lists/" + list + "/participants")
                        .param("status", "PRESENTE").param("page", "0").param("size", "1").with(token(ADMIN)))
                .andExpect(status().isOk()).andReturn();
        var summary = json.readTree(page.getResponse().getContentAsString());
        assertThat(summary.path("total").asLong()).isEqualTo(1);
        assertThat(summary.path("pageCount").asInt()).isEqualTo(1);
        assertThat(summary.path("counts").path("rosterTotal").asLong()).isEqualTo(4);
        assertThat(summary.path("counts").path("present").asLong()).isEqualTo(1);
        assertThat(summary.path("counts").path("justified").asLong()).isEqualTo(1);
        assertThat(summary.path("counts").path("absent").asLong()).isEqualTo(2);
        assertThat(summary.path("counts").path("awaitingConfirmation").asLong()).isZero();
        assertThat(summary.path("counts").path("outsideApuration").asLong()).isZero();

        mvc.perform(get("/api/v1/attendance/lists/" + list + "/participants").with(token(MEMBER)))
                .andExpect(status().isForbidden());

        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_GERAL',?,'Fixture de autorização')",
                OTHER, ADMIN);
        mvc.perform(get("/api/v1/attendance/lists/" + list + "/participants").param("name", "JOAO").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void collectiveMemberSearchIsAccentInsensitiveStablePagedAndPeriodScoped() throws Exception {
        setNames();
        UUID list = openList(event());
        LocalDate meetingDate = jdbc.queryForObject("select opened_at from nite_connect.attendance_lists where id=?",
                java.sql.Timestamp.class, list).toInstant().atZone(BAHIA).toLocalDate();
        String period = "?from=" + meetingDate + "&to=" + meetingDate;

        MvcResult accentMatch = mvc.perform(get("/api/v1/attendance/frequency/summary" + period)
                        .param("name", "jose").param("page", "0").param("size", "1").with(token(ADMIN)))
                .andExpect(status().isOk()).andReturn();
        var match = json.readTree(accentMatch.getResponse().getContentAsString());
        assertThat(match.path("total").asLong()).isEqualTo(1);
        assertThat(match.path("items").get(0).path("displayName").asText()).isEqualTo("José Carvalho");
        assertThat(match.path("items").get(0).path("memberId").asText()).isEqualTo(MEMBER.toString());

        MvcResult firstPage = mvc.perform(get("/api/v1/attendance/frequency/summary" + period)
                        .param("page", "0").param("size", "2").with(token(ADMIN)))
                .andExpect(status().isOk()).andReturn();
        MvcResult secondPage = mvc.perform(get("/api/v1/attendance/frequency/summary" + period)
                        .param("page", "1").param("size", "2").with(token(ADMIN)))
                .andExpect(status().isOk()).andReturn();
        var firstItems = json.readTree(firstPage.getResponse().getContentAsString());
        var secondItems = json.readTree(secondPage.getResponse().getContentAsString());
        assertThat(firstItems.path("total").asLong()).isEqualTo(4);
        assertThat(firstItems.path("items").size()).isEqualTo(2);
        assertThat(secondItems.path("items").size()).isEqualTo(2);
        assertThat(List.of(firstItems.path("items").get(0).path("displayName").asText(),
                firstItems.path("items").get(1).path("displayName").asText(),
                secondItems.path("items").get(0).path("displayName").asText(),
                secondItems.path("items").get(1).path("displayName").asText()))
                .containsExactly("Álvaro Dantas", "Ana Souza", "João Nascimento", "José Carvalho");

        mvc.perform(get("/api/v1/attendance/frequency/summary?from=2026-01-01&to=2026-01-31")
                        .param("name", "jose").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0))
                .andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(get("/api/v1/attendance/frequency/summary" + period).with(token(MEMBER)))
                .andExpect(status().isForbidden());
    }

    @Test
    void collectiveListSearchKeepsFrozenSnapshotNameAfterProfileRename() throws Exception {
        jdbc.update("update nite_connect.members set name='José Carvalho' where id=?", MEMBER);
        UUID event = event();
        UUID list = openList(event);
        jdbc.update("update nite_connect.members set name='José Atualizado' where id=?", MEMBER);

        mvc.perform(get("/api/v1/attendance/lists/" + list + "/participants").param("name", "jose")
                        .with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].displayName").value("José Carvalho"));
    }

    private UUID openExceptionalList(boolean counts) throws Exception {
        UUID event = event();
        String response = mvc.perform(post("/api/v1/attendance/lists").with(token(ADMIN))
                        .header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json")
                        .content(json.writeValueAsString(Map.of("calendarEventId", event, "confirmationWindowMinutes", 3,
                                "countsForFrequency", counts))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(json.readTree(response).get("listId").asString());
    }

    private void setNames() {
        jdbc.update("update nite_connect.members set name='Álvaro Dantas' where id=?", ADMIN);
        jdbc.update("update nite_connect.members set name='Ana Souza' where id=?", LEADER);
        jdbc.update("update nite_connect.members set name='José Carvalho' where id=?", MEMBER);
        jdbc.update("update nite_connect.members set name='João Nascimento' where id=?", OTHER);
    }

    private tools.jackson.databind.JsonNode findByList(tools.jackson.databind.JsonNode items, UUID listId) {
        return StreamSupport.stream(items.spliterator(), false)
                .filter(item -> listId.toString().equals(item.path("listId").asText()))
                .findFirst().orElseThrow();
    }

    private tools.jackson.databind.JsonNode findByMember(tools.jackson.databind.JsonNode items, UUID memberId) {
        return StreamSupport.stream(items.spliterator(), false)
                .filter(item -> memberId.toString().equals(item.path("memberId").asText()))
                .findFirst().orElseThrow();
    }

    private long listVersion(UUID list) {
        return jdbc.queryForObject("select version from nite_connect.attendance_lists where id=?", Long.class, list);
    }

    @TestConfiguration
    static class FrequencyClockConfiguration {
        @Bean
        @Primary
        MutableClock frequencyTestClock() {
            return new MutableClock(Instant.now(), BAHIA);
        }
    }

    static final class MutableClock extends Clock {
        private final AtomicReference<Instant> instant;
        private final ZoneId zone;

        MutableClock(Instant initial, ZoneId zone) {
            this.instant = new AtomicReference<>(initial);
            this.zone = zone;
        }

        void set(Instant value) { instant.set(value); }
        void advance(Duration amount) { instant.updateAndGet(value -> value.plus(amount)); }
        @Override public ZoneId getZone() { return zone; }
        @Override public Clock withZone(ZoneId requestedZone) { return new MutableClock(instant(), requestedZone); }
        @Override public Instant instant() { return instant.get(); }
    }
}
