package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import java.util.UUID;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProjectDiscoveryParticipationTest extends ProjectTestSupport {
    @Test void pausedOrLeaderlessProjectsUseFormalRequestsAndGlobalAdministration() throws Exception {
        UUID paused=project();
        mvc.perform(post("/api/v1/projects/"+paused+"/membership-requests").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict());
        mvc.perform(patch("/api/v1/projects/"+paused+"/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"ATIVO\",\"expectedVersion\":"+version(paused)+",\"reason\":\"Início\"}" )).andExpect(status().isOk());
        mvc.perform(patch("/api/v1/projects/"+paused+"/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"PAUSADO\",\"expectedVersion\":"+version(paused)+",\"reason\":\"Pausa\"}" )).andExpect(status().isOk());
        mvc.perform(patch("/api/v1/projects/"+paused+"/availability").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"acceptingMembers\":true,\"expectedVersion\":"+version(paused)+"}" )).andExpect(status().isOk());
        mvc.perform(get("/api/v1/project-catalog/"+paused).with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.capabilities.canRequestMembership").value(true))
                .andExpect(jsonPath("$.capabilities.canExpressInterest").value(false));
        mvc.perform(post("/api/v1/projects/"+paused+"/membership-requests").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.state").value("PENDENTE"));
        UUID pausedRequest=jdbc.queryForObject("select id from nite_connect.project_membership_requests where project_id=?",UUID.class,paused);
        mvc.perform(get("/api/v1/me/project-participation-notifications").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(post("/api/v1/projects/"+paused+"/membership-requests/"+pausedRequest+"/withdraw").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedVersion\":0}" )).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("ENCERRADA"));
        mvc.perform(get("/api/v1/projects/"+paused+"/membership-requests/"+pausedRequest+"/history").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2)).andExpect(jsonPath("$.items[1].type").value("DESISTIDA"));
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select status from nite_connect.projects where id=?",String.class,paused)).isEqualTo("PAUSADO");
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=?",Integer.class,paused)).isZero();
        mvc.perform(post("/api/v1/projects/"+paused+"/membership-requests").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isCreated());
        UUID pausedApproval=jdbc.queryForObject("select id from nite_connect.project_membership_requests where project_id=? and member_id=?",UUID.class,paused,MEMBER);
        mvc.perform(post("/api/v1/projects/"+paused+"/membership-requests/"+pausedApproval+"/decision").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"approve\":true,\"expectedVersion\":0}" )).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("APROVADA"));
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select status from nite_connect.projects where id=?",String.class,paused)).isEqualTo("PAUSADO");
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and member_id=? and ended_at is null",Integer.class,paused,MEMBER)).isEqualTo(1);

        UUID vacant=project();
        mvc.perform(patch("/api/v1/projects/"+vacant+"/availability").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"acceptingMembers\":true,\"expectedVersion\":"+version(vacant)+"}" )).andExpect(status().isOk());
        mvc.perform(post("/api/v1/projects/"+vacant+"/membership-requests").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isCreated());
        UUID request=jdbc.queryForObject("select id from nite_connect.project_membership_requests where project_id=?",UUID.class,vacant);
        mvc.perform(post("/api/v1/projects/"+vacant+"/membership-requests/"+request+"/decision").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"approve\":true,\"expectedVersion\":0}" )).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("APROVADA"));
        mvc.perform(get("/api/v1/project-catalog/"+vacant).with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PLANEJAMENTO"))
                .andExpect(jsonPath("$.leadershipVacant").value(true)).andExpect(jsonPath("$.membershipRequestState").value("APROVADA"));
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and member_id=? and ended_at is null",Integer.class,vacant,OTHER)).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where project_id=?",Integer.class,vacant)).isZero();
    }

    @Test void pausedApprovalExplicitRoleGrantLeadershipAndResumeRemainSeparateAndSynchronized() throws Exception {
        mvc.perform(post("/api/v1/projects").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Ciclo pausado\",\"description\":\"Homologação integrada\",\"initialStatus\":\"PAUSADO\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PAUSADO"));
        UUID id=jdbc.queryForObject("select id from nite_connect.projects order by created_at desc limit 1",UUID.class);
        mvc.perform(patch("/api/v1/projects/"+id+"/availability").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"acceptingMembers\":true,\"expectedVersion\":"+version(id)+"}" )).andExpect(status().isOk());
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"Solicitação controlada\"}" )).andExpect(status().isCreated()).andExpect(jsonPath("$.state").value("PENDENTE"));
        UUID request=jdbc.queryForObject("select id from nite_connect.project_membership_requests where project_id=? and member_id=?",UUID.class,id,MEMBER);
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests/"+request+"/decision").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"approve\":true,\"expectedVersion\":0}" )).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("APROVADA"));
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select status from nite_connect.projects where id=?",String.class,id)).isEqualTo("PAUSADO");
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and member_id=? and ended_at is null",Integer.class,id,MEMBER)).isEqualTo(1);
        mvc.perform(get("/api/v1/projects/"+id+"/membership-requests/"+request+"/history").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2));
        mvc.perform(post("/api/v1/members/"+MEMBER+"/roles").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"GESTOR_PROJETO\",\"expectedVersion\":0,\"reason\":\"Concessão explícita de homologação\"}" ))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/projects/"+id+"/leadership-transfers").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content(transferBody(MEMBER,version(id)))).andExpect(status().isOk());
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select status from nite_connect.projects where id=?",String.class,id)).isEqualTo("PAUSADO");
        mvc.perform(patch("/api/v1/projects/"+id+"/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"ATIVO\",\"expectedVersion\":"+version(id)+",\"reason\":\"Retomada autorizada\"}" ))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ATIVO"));
        mvc.perform(get("/api/v1/project-catalog/"+id).with(token(MEMBER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ATIVO")).andExpect(jsonPath("$.membershipRequestState").value("APROVADA"))
                .andExpect(jsonPath("$.leaderName").value("Teste"));
        mvc.perform(get("/api/v1/me/projects").with(token(MEMBER))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/v1/projects/"+id+"/workspace").with(token(MEMBER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ATIVO")).andExpect(jsonPath("$.leaderId").value(MEMBER.toString()));
        mvc.perform(get("/api/v1/projects/"+id+"/history").with(token(ADMIN))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2));
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_membership_request_events where request_id=?",Integer.class,request)).isEqualTo(2);
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where project_id=?",Integer.class,id)).isEqualTo(1);
    }

    @Test void rejectionIsVisibleToRequesterAndDoesNotCreateParticipation() throws Exception {
        UUID id=project();
        mvc.perform(patch("/api/v1/projects/"+id+"/availability").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"acceptingMembers\":true,\"expectedVersion\":"+version(id)+"}" )).andExpect(status().isOk());
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"Pedido para homologação de rejeição\"}" )).andExpect(status().isCreated());
        UUID request=jdbc.queryForObject("select id from nite_connect.project_membership_requests where project_id=? and member_id=?",UUID.class,id,OTHER);
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests/"+request+"/decision").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"approve\":false,\"message\":\"Equipe completa\",\"expectedVersion\":0}" ))
                .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("REJEITADA"))
                .andExpect(jsonPath("$.decisionMessage").value("Equipe completa"));
        mvc.perform(get("/api/v1/me/project-membership-requests").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].state").value("REJEITADA"));
        mvc.perform(get("/api/v1/projects/"+id+"/membership-requests/"+request+"/history").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2)).andExpect(jsonPath("$.items[1].type").value("REJEITADA"));
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and member_id=? and ended_at is null",Integer.class,id,OTHER)).isZero();
    }
    @Test void activeMemberCanDiscoverButCannotReadWorkspaceBeforeApproval() throws Exception {
        UUID id=project(); join(id,LEADER); transfer(id,LEADER);
        mvc.perform(get("/api/v1/project-catalog").with(token(OTHER)).param("q","Projeto").param("sort","name"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(id.toString()))
                .andExpect(jsonPath("$.items[0].memberCount").value(1))
                .andExpect(jsonPath("$.items[0].image").doesNotExist());
        mvc.perform(get("/api/v1/projects/"+id+"/workspace").with(token(OTHER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/projects/"+id+"/activities").with(token(OTHER))).andExpect(status().isNotFound());
    }

    @Test void requestApprovalCreatesOneParticipationAndNotifiesBothSides() throws Exception {
        UUID id=project(); join(id,LEADER); transfer(id,LEADER);
        mvc.perform(patch("/api/v1/projects/"+id+"/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"ATIVO\",\"expectedVersion\":"+version(id)+",\"reason\":\"Início\"}"))
                .andExpect(status().isOk());
        mvc.perform(patch("/api/v1/projects/"+id+"/availability").with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"acceptingMembers\":true,\"expectedVersion\":"+version(id)+"}")).andExpect(status().isOk());
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"Tenho interesse\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.state").value("PENDENTE"));
        UUID request=jdbc.queryForObject("select id from nite_connect.project_membership_requests where project_id=?",UUID.class,id);
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON)
                .content("{}" )).andExpect(status().isConflict());
        mvc.perform(get("/api/v1/me/project-participation-notifications").with(token(LEADER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests/"+request+"/decision").with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"approve\":true,\"expectedVersion\":0}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("APROVADA"));
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and member_id=? and ended_at is null",Integer.class,id,OTHER)).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_participation_notifications where recipient_id=? and event_type='SOLICITACAO_APROVADA'",Integer.class,OTHER)).isEqualTo(1);
        mvc.perform(get("/api/v1/projects/"+id+"/workspace").with(token(OTHER))).andExpect(status().isOk());
    }

    @Test void interestDoesNotCreateMembershipAndCoordinatorCanConsultIt() throws Exception {
        UUID id=project();
        mvc.perform(post("/api/v1/projects/"+id+"/interest-signals").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"Posso contribuir\"}"))
                .andExpect(status().isCreated());
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and member_id=?",Integer.class,id,OTHER)).isZero();
        mvc.perform(get("/api/v1/projects/"+id+"/interest-signals").with(token(ADMIN))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/v1/projects/"+id+"/interest-signals").with(token(OTHER))).andExpect(status().isForbidden());
    }

    @Test void pendingRequestSurvivesClosingAvailabilityUntilExplicitClosure() throws Exception {
        UUID id=project();join(id,LEADER);transfer(id,LEADER);
        mvc.perform(patch("/api/v1/projects/"+id+"/status").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"ATIVO\",\"expectedVersion\":"+version(id)+",\"reason\":\"Início\"}" )).andExpect(status().isOk());
        mvc.perform(patch("/api/v1/projects/"+id+"/availability").with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"acceptingMembers\":true,\"expectedVersion\":"+version(id)+"}")).andExpect(status().isOk());
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isCreated());
        UUID request=jdbc.queryForObject("select id from nite_connect.project_membership_requests where project_id=?",UUID.class,id);
        mvc.perform(patch("/api/v1/projects/"+id+"/availability").with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"acceptingMembers\":false,\"expectedVersion\":"+version(id)+"}")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/projects/"+id+"/membership-requests").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests/"+request+"/decision").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"approve\":false,\"expectedVersion\":0}" )).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests/"+request+"/close").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedVersion\":0}" )).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("ENCERRADA"));
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests/"+request+"/decision").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"approve\":false,\"expectedVersion\":0}" )).andExpect(status().isConflict());
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and member_id=? and ended_at is null",Integer.class,id,OTHER)).isZero();
    }
    @Test void publicCatalogDetailKeepsPrivateWorkspaceHiddenAndRequiresActiveMember() throws Exception {
        UUID id=project(); join(id,LEADER); transfer(id,LEADER);
        mvc.perform(get("/api/v1/project-catalog/"+id)).andExpect(status().isUnauthorized());
        jdbc.update("update nite_connect.projects set description=? where id=?", "a".repeat(320),id);
        mvc.perform(get("/api/v1/project-catalog/"+id).with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.summary").value("a".repeat(277)+"..."))
                .andExpect(jsonPath("$.description").doesNotExist())
                .andExpect(jsonPath("$.version").doesNotExist())
                .andExpect(jsonPath("$.capabilities.canAccessWorkspace").value(false));
        mvc.perform(get("/api/v1/projects/"+id).with(token(OTHER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/projects/"+id+"/workspace").with(token(OTHER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/project-catalog/"+UUID.randomUUID()).with(token(OTHER))).andExpect(status().isNotFound());
        jdbc.update("update nite_connect.members set status='AFASTADO' where id=?",OTHER);
        mvc.perform(get("/api/v1/project-catalog/"+id).with(token(OTHER))).andExpect(status().isForbidden());
    }

    @Test void ownInterestsArePersistedPaginatedAndIsolated() throws Exception {
        UUID id=project();
        mvc.perform(post("/api/v1/projects/"+id+"/interest-signals").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON)
                .content("{}" )).andExpect(status().isCreated());
        mvc.perform(post("/api/v1/projects/"+id+"/interest-signals").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{}" )).andExpect(status().isCreated());
        mvc.perform(get("/api/v1/me/project-interest-signals").with(token(OTHER)).param("size","1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].memberId").value(OTHER.toString()))
                .andExpect(jsonPath("$.items[0].projectId").value(id.toString()));
        mvc.perform(get("/api/v1/me/project-interest-signals").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        jdbc.update("update nite_connect.project_interest_signals set withdrawn_at=clock_timestamp() where member_id=?",OTHER);
        mvc.perform(get("/api/v1/me/project-interest-signals").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].withdrawnAt").isNotEmpty());
        mvc.perform(get("/api/v1/me/project-interest-signals").with(token(OTHER)).param("size","101"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/me/project-interest-signals")).andExpect(status().isUnauthorized());
        jdbc.update("update nite_connect.members set status='AFASTADO' where id=?",OTHER);
        mvc.perform(get("/api/v1/me/project-interest-signals").with(token(OTHER))).andExpect(status().isForbidden());
    }

    @Test void requestNamesAreAvailableToContextualManagementAndRequesterOnly() throws Exception {
        UUID id=project();join(id,LEADER);transfer(id,LEADER);
        UUID another=project();join(another,MEMBER);
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_PROJETO',?,'Fixture')",MEMBER,ADMIN);
        transfer(another,MEMBER);
        jdbc.update("update nite_connect.members set name='Nome solicitante' where id=?",OTHER);
        jdbc.update("update nite_connect.projects set accepting_members=true where id=?",id);
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON)
                .content("{}" )).andExpect(status().isCreated()).andExpect(jsonPath("$.memberName").value("Nome solicitante"));
        UUID request=jdbc.queryForObject("select id from nite_connect.project_membership_requests where project_id=?",UUID.class,id);
        for(UUID actor:java.util.List.of(ADMIN,LEADER)) {
            mvc.perform(get("/api/v1/projects/"+id+"/membership-requests").with(token(actor)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].memberName").value("Nome solicitante"));
        }
        mvc.perform(get("/api/v1/me/project-membership-requests").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].memberName").value("Nome solicitante"));
        for(UUID actor:java.util.List.of(MEMBER,OTHER)) {
            mvc.perform(get("/api/v1/projects/"+id+"/membership-requests").with(token(actor))).andExpect(status().isForbidden());
        }
        mvc.perform(post("/api/v1/projects/"+id+"/membership-requests/"+request+"/decision").with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"approve\":false,\"expectedVersion\":0}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.memberName").value("Nome solicitante"));
    }

    @Test void projectCapabilitiesRespectContextualLeadershipAndTerminalState() throws Exception {
        UUID id=project();join(id,LEADER);transfer(id,LEADER);join(id,MEMBER);
        for(UUID actor:java.util.List.of(ADMIN,LEADER,MEMBER)) {
            boolean management=!actor.equals(MEMBER);
            mvc.perform(get("/api/v1/project-catalog").with(token(actor)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].capabilities.canManageAvailability").value(management));
            mvc.perform(get("/api/v1/projects/"+id+"/workspace").with(token(actor)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.capabilities.canDecideRequests").value(management))
                    .andExpect(jsonPath("$.capabilities.canCreatePlanning").value(management))
                    .andExpect(jsonPath("$.capabilities.canTransferLeadership").value(actor.equals(ADMIN)));
        }
        UUID otherProject=project();join(otherProject,OTHER);
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_PROJETO',?,'Fixture')",OTHER,ADMIN);
        transfer(otherProject,OTHER);
        mvc.perform(get("/api/v1/project-catalog").with(token(LEADER)).param("sort","updated"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].capabilities.canManageAvailability").value(false));
        mvc.perform(get("/api/v1/projects/"+otherProject+"/workspace").with(token(LEADER))).andExpect(status().isNotFound());
        jdbc.update("update nite_connect.projects set status='CONCLUIDO' where id=?",otherProject);
        transfer(otherProject,null);
        mvc.perform(get("/api/v1/project-catalog").with(token(MEMBER)).param("status","CONCLUIDO"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].capabilities.canExpressInterest").value(false));
    }

    @Test void planningMigrationPreservesSupportedAuditTypesAndEntityIntegrity() {
        for (String type:java.util.List.of("PROJECT","PROPOSAL","ACTIVITY","EVIDENCE","CALENDAR_EVENT","ATTENDANCE","ATTENDANCE_SEGMENT","DOCUMENT","DOCUMENT_TEMPLATE","ACTIVITY_PLANNING")) {
            org.assertj.core.api.Assertions.assertThat(jdbc.update(
                    "insert into nite_connect.audit_events(id,actor_id,entity_type,entity_id,action,reason) values (?,?,?,?,?,?)",
                    UUID.randomUUID(),ADMIN,type,UUID.randomUUID(),"FIXTURE_HISTORY","Historical audit compatibility"))
                    .as("Audit type %s remains supported",type).isEqualTo(1);
        }
        org.assertj.core.api.Assertions.assertThatThrownBy(()->jdbc.update(
                "insert into nite_connect.audit_events(id,actor_id,entity_type,entity_id,action,reason) values (?,?,?,?,?,?)",
                UUID.randomUUID(),ADMIN,"ACTIVITY_PLANNING",null,"FIXTURE_HISTORY","Missing entity"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(()->jdbc.update(
                "insert into nite_connect.audit_events(id,actor_id,member_id,entity_type,entity_id,action,reason) values (?,?,?,?,?,?,?)",
                UUID.randomUUID(),ADMIN,MEMBER,"ACTIVITY_PLANNING",UUID.randomUUID(),"FIXTURE_HISTORY","Invalid member context"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

}
