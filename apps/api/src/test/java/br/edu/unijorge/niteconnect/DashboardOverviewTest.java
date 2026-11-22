package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class DashboardOverviewTest extends ActivityTestSupport {
    @org.springframework.beans.factory.annotation.Autowired
    br.edu.unijorge.niteconnect.projecthealth.application.ProjectHealthService health;
    @org.springframework.beans.factory.annotation.Autowired java.time.Clock clock;
    @Test void healthParityAcrossDelaysAndPauseAndMissingSignals() throws Exception {
        var project=activeProject();
        assertHealth(project);
        activity(LEADER,project,MEMBER);
        for(int days:java.util.List.of(0,3,7,40)) {
            jdbc.update("update nite_connect.activities set due_on=? where project_id=?",java.time.LocalDate.now(clock).minusDays(days),project);
            assertHealth(project);
        }
        jdbc.update("update nite_connect.projects set status='PAUSADO' where id=?",project);
        assertHealth(project);
    }
    private void assertHealth(java.util.UUID project) throws Exception {
        mvc.perform(get("/api/v1/dashboard/institutional").with(token(ADMIN)).param("from","2020-01-01").param("to","2020-01-07"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.current.projectHealth[0].situation").value(health.health(ADMIN,project).status().name()));
    }
    @Test void approachingDeadlineAndFutureStartDoNotCreateImmediateWork() throws Exception {
        var id=activity(MEMBER,null,MEMBER);
        var today=java.time.LocalDate.now(clock);
        jdbc.update("update nite_connect.activities set due_on=?,start_on=? where id=?",today.plusDays(3),today.plusDays(2),id);
        mvc.perform(get("/api/v1/dashboard/personal").with(token(MEMBER)).param("from","2020-01-01").param("to","2020-01-07"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.current.activities.dueSoon").value(1))
            .andExpect(jsonPath("$.actions.total").value(0));
    }
    @Test void intervalIncludesStartAndExcludesNextMidnightRegardlessOfCreation() throws Exception {
        var id=activity(MEMBER,null,MEMBER);
        var day=java.time.LocalDate.now(clock).minusDays(2);
        for(var instant:java.util.List.of(day.atStartOfDay(clock.getZone()).toInstant(),day.plusDays(1).atStartOfDay(clock.getZone()).toInstant()))
            jdbc.update("insert into nite_connect.activity_events(id,activity_id,actor_id,action,reason,occurred_at,activity_version) values (?,?,?,'UPDATED','Fixture',?,0)",
                java.util.UUID.randomUUID(),id,MEMBER,java.sql.Timestamp.from(instant));
        mvc.perform(get("/api/v1/dashboard/personal").with(token(MEMBER)).param("from",day.toString()).param("to",day.toString()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.current.activities.total").value(1))
            .andExpect(jsonPath("$.evolution.length()").value(1)).andExpect(jsonPath("$.evolution[0].total").value(1));
    }
    @Test void administrativeInvitationsUseValidityAndDeliveryState() throws Exception {
        var now=java.time.Instant.now(clock);
        for(var member:java.util.List.of(MEMBER,OTHER))
            jdbc.update("insert into nite_connect.invitations(id,member_id,tenant_id,object_id,created_by,created_at,expires_at,send_state) values (?,?,?,?,?,?,?,?)",
                java.util.UUID.randomUUID(),member,TENANT,member,ADMIN,java.sql.Timestamp.from(now.minusSeconds(10)),
                java.sql.Timestamp.from(now.plusSeconds(3600)),member.equals(MEMBER)?"FAILED":"NOT_SENT");
        mvc.perform(get("/api/v1/dashboard/institutional").with(token(ADMIN)).param("from","2020-01-01").param("to","2020-01-07"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.administrative.failedInvitations").value(1))
            .andExpect(jsonPath("$.administrative.pendingInvitations").value(1));
    }
    @Test void evolutionUsesEffectiveDatesAndContextsHaveNoProjectOption() throws Exception {
        activity(MEMBER,null,MEMBER);
        var today=java.time.LocalDate.now(clock).toString();
        mvc.perform(get("/api/v1/dashboard/personal").with(token(MEMBER)).param("from",today).param("to",today))
            .andExpect(status().isOk()).andExpect(jsonPath("$.evolution[0].event").value("CREATED"))
            .andExpect(jsonPath("$.evolution[0].total").value(1));
        mvc.perform(get("/api/v1/dashboard/contexts").with(token(LEADER)))
            .andExpect(status().isOk()).andExpect(jsonPath("$",org.hamcrest.Matchers.contains("PERSONAL")));
        mvc.perform(get("/api/v1/dashboard/contexts").with(token(ADMIN)))
            .andExpect(status().isOk()).andExpect(jsonPath("$",org.hamcrest.Matchers.contains("PERSONAL","INSTITUTIONAL")));
    }
    @Test void confirmedCommitmentsExcludePendingAndUnrelatedMeetings() throws Exception {
        var now=java.time.Instant.now(clock).plusSeconds(3600);
        for(var owner:java.util.List.of(MEMBER,OTHER)) {
            jdbc.update("insert into nite_connect.meetings(id,organizer_member_id,mode,title,status,starts_at,planned_duration_minutes,planned_ends_at,graph_event_id,join_url) values (?,?,'SCHEDULED','Confirmada','AGENDADA',?,30,?,'fixture','https://example.invalid')",
                java.util.UUID.randomUUID(),owner,java.sql.Timestamp.from(now),java.sql.Timestamp.from(now.plusSeconds(1800)));
        }
        mvc.perform(get("/api/v1/dashboard/personal").with(token(MEMBER)).param("from","2020-01-01").param("to","2020-01-07"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.commitments.total").value(1))
            .andExpect(jsonPath("$.commitments.items[0].source").value("MEETING"));
    }
    @Test void currentHealthMatchesConsolidatedService() throws Exception {
        var project=activeProject(); activity(LEADER,project,MEMBER);
        jdbc.update("update nite_connect.activities set due_on=current_date-30 where project_id=?",project);
        String expected=health.health(ADMIN,project).status().name();
        mvc.perform(get("/api/v1/dashboard/institutional").with(token(ADMIN)).param("from","2020-01-01").param("to","2020-01-07"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.current.projectHealth[0].situation").value(expected))
            .andExpect(jsonPath("$.current.projectHealth[0].total").value(1));
    }
    @Test void creatorOnlyIsNotAssignedAndCollaborationIsActionable() throws Exception {
        var project=activeProject(); var id=activity(LEADER,project,MEMBER);
        mvc.perform(get("/api/v1/dashboard/personal").with(token(LEADER)).param("from","2020-01-01").param("to","2020-01-07"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.current.activities.total").value(1))
            .andExpect(jsonPath("$.actions.total").value(0)).andExpect(jsonPath("$.projects.items[0].leader").value(true));
        jdbc.update("insert into nite_connect.activity_assignments(id,activity_id,member_id,role,started_by,start_reason) values (?,?,?,'COLLABORATOR',?,'Fixture')",
            java.util.UUID.randomUUID(),id,OTHER,ADMIN);
        mvc.perform(get("/api/v1/dashboard/personal").with(token(OTHER)).param("from","2020-01-01").param("to","2020-01-07"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.actions.total").value(1))
            .andExpect(jsonPath("$.actions.items[0].linkKinds[0]").value("COLLABORATOR"));
        mvc.perform(get("/api/v1/projects/"+project+"/members/"+OTHER).with(token(OTHER))).andExpect(status().is4xxClientError());
    }
    @Test void removedMembershipDeniesProjectDataDespiteCurrentAssignment() throws Exception {
        var project=activeProject(); activity(LEADER,project,MEMBER);
        jdbc.update("update nite_connect.project_memberships set ended_at=clock_timestamp(),ended_by=?,end_reason='Fixture' where project_id=? and member_id=? and ended_at is null", ADMIN,project,MEMBER);
        mvc.perform(get("/api/v1/dashboard/personal").with(token(MEMBER)).param("from","2020-01-01").param("to","2020-01-07"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.current.activities.total").value(0))
            .andExpect(jsonPath("$.projects.total").value(0));
    }
    @Test void highlightsAreBoundedButCountsAreComplete() throws Exception {
        for(int i=0;i<8;i++)activity(MEMBER,null,MEMBER);
        mvc.perform(get("/api/v1/dashboard/personal").with(token(MEMBER)).param("from","2020-01-01").param("to","2020-01-07"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.actions.total").value(8))
            .andExpect(jsonPath("$.actions.items.length()").value(6));
    }
    @Test void personalIncludesIndependentTasksAndDeduplicatesCreatorExecutor() throws Exception {
        activity(MEMBER, null, MEMBER);
        mvc.perform(get("/api/v1/dashboard/personal").with(token(MEMBER)).param("from","2020-01-01").param("to","2020-01-07"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.current.activities.total").value(1))
            .andExpect(jsonPath("$.actions.total").value(1)).andExpect(jsonPath("$.actions.items.length()").value(1))
            .andExpect(jsonPath("$.evolution.length()").value(0));
    }
    @Test void institutionalRequiresGlobalAuthorityAndActiveMembership() throws Exception {
        for (var actor : java.util.List.of(MEMBER,LEADER))
            mvc.perform(get("/api/v1/dashboard/institutional").with(token(actor)).param("from","2026-01-01").param("to","2026-01-07"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/dashboard/institutional").with(token(ADMIN)).param("from","2026-01-01").param("to","2026-01-07"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.current.activities.total").value(0));
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_GERAL',?,'Fixture')", OTHER, ADMIN);
        mvc.perform(get("/api/v1/dashboard/institutional").with(token(OTHER)).param("from","2026-01-01").param("to","2026-01-07"))
            .andExpect(status().isOk());
        jdbc.update("update nite_connect.members set status='AFASTADO' where id=?",OTHER);
        mvc.perform(get("/api/v1/dashboard/personal").with(token(OTHER)).param("from","2026-01-01").param("to","2026-01-07"))
            .andExpect(status().isForbidden());
    }
    @Test void pausedTasksRemainOverdueWithoutImmediateAction() throws Exception {
        var project=activeProject(); activity(LEADER,project,MEMBER);
        jdbc.update("update nite_connect.activities set due_on=current_date-10 where project_id=?",project);
        jdbc.update("update nite_connect.projects set status='PAUSADO' where id=?",project);
        mvc.perform(get("/api/v1/dashboard/personal").with(token(MEMBER)).param("from","2020-01-01").param("to","2020-01-07"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.current.activities.overdue").value(1))
            .andExpect(jsonPath("$.current.activities.attentionRequired").value(0)).andExpect(jsonPath("$.actions.total").value(0));
    }
    @Test void validatesWindowAndDeniesAnonymous() throws Exception {
        mvc.perform(get("/api/v1/dashboard/personal").with(token(MEMBER)).param("from","2026-02-01").param("to","2026-01-01"))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/dashboard/personal").param("from","2026-01-01").param("to","2026-01-07"))
            .andExpect(status().is4xxClientError());
    }
}
