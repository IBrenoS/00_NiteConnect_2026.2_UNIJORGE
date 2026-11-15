package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.documents.application.DocumentAutomationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Import(DocumentFoundationTest.Stubs.class)
@TestPropertySource(properties={"nite.documents.enabled=true","nite.documents.storage.provider=test",
        "nite.documents.wopi-public-base-url=http://host.docker.internal:8080","nite.documents.allow-insecure-dev=true",
        "nite.documents.collabora.discovery-url=http://localhost:9980/hosting/discovery",
        "nite.documents.automation.poll-delay-ms=3600000"})
class DocumentAutomationTest extends ProjectTestSupport {
    @Autowired DocumentAutomationService automations;
    private UUID home(UUID actor) throws Exception {
        String body=mvc.perform(get("/api/v1/me/library").with(token(actor))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(com.jayway.jsonpath.JsonPath.read(body,"$.folder.id"));
    }
    private UUID upload(UUID actor,UUID folder,String name) throws Exception {
        String body=mvc.perform(multipart("/api/v1/library/folders/"+folder+"/files")
                .file(new MockMultipartFile("file",name,"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        DocxIntegrityTest.docx(name))).param("title",name).with(token(actor)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(com.jayway.jsonpath.JsonPath.read(body,"$.id"));
    }
    private UUID rule(UUID actor,String type,UUID target,String event) throws Exception {
        String response=mvc.perform(post("/api/v1/me/document-automations").with(token(actor)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"targetType\":\""+type+"\",\"targetId\":\""+target+"\",\"eventType\":\""+event+"\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(com.jayway.jsonpath.JsonPath.read(response,"$.id"));
    }
    @Test void folderRuleDeliversOnceAndCanBeManagedOnlyByOwner() throws Exception {
        UUID folder=home(MEMBER);
        mvc.perform(post("/api/v1/me/document-automations").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"targetType\":\"DOCUMENT\",\"targetId\":\""+folder+"\",\"eventType\":\"NEW_FILE_IN_FOLDER\"}"))
                .andExpect(status().isBadRequest());
        UUID id=rule(MEMBER,"FOLDER",folder,"NEW_FILE_IN_FOLDER");
        mvc.perform(post("/api/v1/me/document-automations").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"targetType\":\"FOLDER\",\"targetId\":\""+folder+"\",\"eventType\":\"NEW_FILE_IN_FOLDER\"}"))
                .andExpect(status().isConflict());
        mvc.perform(get("/api/v1/me/document-automations/"+id+"/history").with(token(OTHER))).andExpect(status().isNotFound());
        mvc.perform(patch("/api/v1/me/document-automations/"+id).with(token(OTHER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"enabled\":false}")).andExpect(status().isNotFound());
        UUID document=upload(MEMBER,folder,"Automacao.docx");
        automations.poll();automations.poll();
        mvc.perform(get("/api/v1/me/document-notifications").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].resourceId").value(document.toString()))
                .andExpect(jsonPath("$.length()").value(1));
        UUID notification=jdbc.queryForObject("select id from nite_connect.document_notifications where resource_id=?",UUID.class,document);
        mvc.perform(post("/api/v1/me/document-notifications/"+notification+"/read").with(token(OTHER))).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/me/document-notifications/"+notification+"/read").with(token(MEMBER))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/me/document-notifications").with(token(MEMBER)))
                .andExpect(jsonPath("$[0].readAt").isNotEmpty());
        mvc.perform(get("/api/v1/me/document-automations/"+id+"/history").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].state").value("DELIVERED"));
        mvc.perform(patch("/api/v1/me/document-automations/"+id).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"enabled\":false}")).andExpect(status().isNoContent());
        upload(MEMBER,folder,"Desativada.docx");automations.poll();
        mvc.perform(get("/api/v1/me/document-notifications").with(token(MEMBER)))
                .andExpect(jsonPath("$.length()").value(1));
        mvc.perform(patch("/api/v1/me/document-automations/"+id).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"enabled\":true}")).andExpect(status().isNoContent());
        automations.poll();
        mvc.perform(get("/api/v1/me/document-notifications").with(token(MEMBER)))
                .andExpect(jsonPath("$.length()").value(1));
        upload(MEMBER,folder,"Reativada.docx");automations.poll();
        mvc.perform(get("/api/v1/me/document-notifications").with(token(MEMBER)))
                .andExpect(jsonPath("$.length()").value(2));
        mvc.perform(delete("/api/v1/me/document-automations/"+id).with(token(MEMBER))).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_automation_rule_events where rule_id=?",Integer.class,id)).isEqualTo(4);
    }
    @Test void requestRuleNotifiesRequesterWithoutExposingDestinationToUploader() throws Exception {
        UUID folder=home(MEMBER);
        String body=mvc.perform(post("/api/v1/file-requests").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"targetFolderId\":\""+folder+"\",\"recipientIds\":[\""+OTHER+"\"]}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID request=UUID.fromString(com.jayway.jsonpath.JsonPath.read(body,"$.id"));
        rule(MEMBER,"REQUEST",request,"FILE_REQUEST_FULFILLED");
        mvc.perform(post("/api/v1/me/document-automations").with(token(OTHER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"targetType\":\"REQUEST\",\"targetId\":\""+request+"\",\"eventType\":\"FILE_REQUEST_FULFILLED\"}"))
                .andExpect(status().isForbidden());
        String uploaded=mvc.perform(multipart("/api/v1/file-requests/"+request+"/uploads")
                .file(new MockMultipartFile("file","Resposta.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        DocxIntegrityTest.docx("Resposta"))).param("title","Resposta.docx").with(token(OTHER)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID document=UUID.fromString(com.jayway.jsonpath.JsonPath.read(uploaded,"$.documentId"));
        mvc.perform(post("/api/v1/file-requests/"+request+"/cancel").with(token(MEMBER))).andExpect(status().isOk());
        automations.poll();
        mvc.perform(get("/api/v1/me/document-notifications").with(token(MEMBER)))
                .andExpect(jsonPath("$[0].resourceId").value(document.toString()));
        mvc.perform(get("/api/v1/me/document-notifications").with(token(OTHER)))
                .andExpect(jsonPath("$.length()").value(0));
    }
    @Test void shareRuleSkipsRevokedGrantAndNeverDuplicatesSameResource() throws Exception {
        UUID id=rule(OTHER,"SELF",OTHER,"DOCUMENT_SHARED_WITH_ME");
        UUID folder=home(MEMBER),first=upload(MEMBER,folder,"Primeiro.docx"),second=upload(MEMBER,folder,"Segundo.docx");
        mvc.perform(post("/api/v1/library/documents/"+first+"/shares").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\""+OTHER+"\",\"permission\":\"VIEW\"}"))
                .andExpect(status().isCreated());
        String grant=mvc.perform(post("/api/v1/library/documents/"+second+"/shares").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\""+OTHER+"\",\"permission\":\"VIEW\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID grantId=UUID.fromString(com.jayway.jsonpath.JsonPath.read(grant,"$.id"));
        mvc.perform(delete("/api/v1/library/shares/"+grantId).with(token(MEMBER))).andExpect(status().isNoContent());
        automations.poll();automations.poll();
        mvc.perform(get("/api/v1/me/document-notifications").with(token(OTHER)))
                .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].resourceId").value(first.toString()));
        mvc.perform(get("/api/v1/me/document-automations/"+id+"/history").with(token(OTHER)))
                .andExpect(jsonPath("$.length()").value(2));
        String childBody=mvc.perform(post("/api/v1/library/folders").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"parentId\":\""+folder+"\",\"name\":\"Compartilhada\",\"color\":\"#D6A432\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID child=UUID.fromString(com.jayway.jsonpath.JsonPath.read(childBody,"$.id"));
        UUID inherited=upload(MEMBER,child,"Herdado.docx");
        mvc.perform(post("/api/v1/library/folders/"+child+"/shares").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\""+OTHER+"\",\"permission\":\"VIEW\"}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/v1/library/documents/"+inherited+"/shares").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\""+OTHER+"\",\"permission\":\"EDIT\"}"))
                .andExpect(status().isCreated());
        automations.poll();
        mvc.perform(get("/api/v1/me/document-notifications").with(token(OTHER)))
                .andExpect(jsonPath("$.length()").value(2));
    }
    @Test void failedNotificationRetriesWithoutDuplicateAfterRecovery() throws Exception {
        UUID folder=home(MEMBER),rule=rule(MEMBER,"FOLDER",folder,"NEW_FILE_IN_FOLDER");
        UUID document=upload(MEMBER,folder,"Retentativa.docx");
        jdbc.execute("create function nite_connect.fail_document_notification_test() returns trigger language plpgsql as $$ begin raise exception 'synthetic notification failure'; end $$");
        jdbc.execute("create trigger fail_document_notification_test before insert on nite_connect.document_notifications for each row execute function nite_connect.fail_document_notification_test()");
        try {
            automations.poll();
            assertThat(jdbc.queryForObject("select state from nite_connect.document_automation_deliveries where rule_id=?",String.class,rule)).isEqualTo("FAILED");
            assertThat(jdbc.queryForObject("select attempts from nite_connect.document_automation_deliveries where rule_id=?",Integer.class,rule)).isEqualTo(1);
        } finally {
            jdbc.execute("drop trigger if exists fail_document_notification_test on nite_connect.document_notifications");
            jdbc.execute("drop function if exists nite_connect.fail_document_notification_test()");
        }
        jdbc.update("update nite_connect.document_automation_deliveries set next_attempt_at=clock_timestamp() where rule_id=?",rule);
        automations.poll();automations.poll();
        assertThat(jdbc.queryForObject("select state from nite_connect.document_automation_deliveries where rule_id=?",String.class,rule)).isEqualTo("DELIVERED");
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_notifications where resource_id=?",Integer.class,document)).isEqualTo(1);
    }
    @Test void inactiveOwnerCannotReceivePendingAutomation() throws Exception {
        UUID folder=home(MEMBER),rule=rule(MEMBER,"FOLDER",folder,"NEW_FILE_IN_FOLDER");
        upload(MEMBER,folder,"Inativo.docx");
        jdbc.update("update nite_connect.members set status='DESLIGADO' where id=?",MEMBER);
        automations.poll();
        assertThat(jdbc.queryForObject("select state from nite_connect.document_automation_deliveries where rule_id=?",String.class,rule)).isEqualTo("SKIPPED");
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_notifications where recipient_id=?",Integer.class,MEMBER)).isZero();
    }
}
