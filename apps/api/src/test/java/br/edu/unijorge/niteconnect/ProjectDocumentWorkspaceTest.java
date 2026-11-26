package br.edu.unijorge.niteconnect;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real PostgreSQL authorization/lifecycle integration; object storage is the existing in-memory stub. */
@Import(DocumentFoundationTest.Stubs.class)
@TestPropertySource(properties={
        "nite.documents.enabled=true", "nite.documents.storage.provider=test",
        "nite.documents.wopi-public-base-url=http://host.docker.internal:8080",
        "nite.documents.allow-insecure-dev=true",
        "nite.documents.collabora.discovery-url=http://localhost:9980/hosting/discovery"
})
class ProjectDocumentWorkspaceTest extends ProjectTestSupport {
    private static final String DOCX="application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    private UUID projectHome(UUID project,UUID actor) throws Exception {
        String body=mvc.perform(get("/api/v1/projects/"+project+"/library").with(token(actor)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(JsonPath.read(body,"$.folder.id"));
    }
    private UUID personalHome(UUID actor) throws Exception {
        String body=mvc.perform(get("/api/v1/me/library").with(token(actor)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(JsonPath.read(body,"$.folder.id"));
    }
    private UUID folder(UUID actor,UUID parent,String name) throws Exception {
        String body=mvc.perform(post("/api/v1/library/folders").with(token(actor)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"parentId\":\""+parent+"\",\"name\":\""+name+"\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(JsonPath.read(body,"$.id"));
    }
    private UUID upload(UUID actor,UUID folder,String name) throws Exception {
        byte[] bytes=name.endsWith(".pdf")?"%PDF-1.7 test".getBytes(StandardCharsets.US_ASCII):DocxIntegrityTest.docx("Projeto");
        String body=mvc.perform(multipart("/api/v1/library/folders/"+folder+"/files")
                .file(new MockMultipartFile("file",name,name.endsWith(".pdf")?"application/pdf":DOCX,bytes))
                .param("title",name).with(token(actor)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(JsonPath.read(body,"$.id"));
    }
    private UUID request(UUID actor,UUID project,UUID resource,String type) throws Exception {
        String body=mvc.perform(post("/api/v1/library/project-action-requests").with(token(actor))
                .contentType(MediaType.APPLICATION_JSON).content("{\"projectId\":\""+project+"\",\"resourceId\":\""+resource+
                        "\",\"resourceType\":\""+type+"\",\"action\":\"TRASH\",\"reason\":\"Revisão do acervo\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"))
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(JsonPath.read(body,"$.id"));
    }
    private void approve(UUID request) throws Exception {
        mvc.perform(post("/api/v1/library/project-action-requests/"+request+"/decision").with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content("{\"approve\":true,\"confirmed\":true,\"reason\":\"Revisão administrativa\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"));
    }

    @Test void projectListingUsesFiltersCursorAndRejectsForeignFoldersAndCursors() throws Exception {
        UUID project=project();join(project,MEMBER);
        UUID home=projectHome(project,ADMIN),foreignProject=project(),foreign=projectHome(foreignProject,ADMIN);
        UUID a=upload(ADMIN,home,"Acervo A.docx"),b=upload(ADMIN,home,"Acervo B.docx");
        UUID pdf=upload(ADMIN,home,"Acervo C.pdf");
        mvc.perform(post("/api/v1/documents/"+pdf+"/editor-session").with(token(ADMIN)))
                .andExpect(status().isBadRequest());
        UUID personal=personalHome(MEMBER);upload(MEMBER,personal,"Acervo pessoal.docx");
        String page=mvc.perform(get("/api/v1/projects/"+project+"/library").with(token(MEMBER))
                .param("search","Acervo").param("mimeType",DOCX).param("limit","1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.files[0].id").value(a.toString()))
                .andExpect(jsonPath("$.totalFiles").value(2)).andExpect(jsonPath("$.hasMore").value(true))
                .andExpect(jsonPath("$.files[0].identity.resourceOwnerKind").value("PROJECT"))
                .andExpect(jsonPath("$.files[0].capabilities.canEdit").value(false))
                .andReturn().getResponse().getContentAsString();
        String cursor=JsonPath.read(page,"$.nextCursor");
        mvc.perform(get("/api/v1/projects/"+project+"/library").with(token(MEMBER))
                .param("search","Acervo").param("mimeType",DOCX).param("limit","1").param("cursor",cursor))
                .andExpect(status().isOk()).andExpect(jsonPath("$.files[0].id").value(b.toString()))
                .andExpect(jsonPath("$.hasMore").value(false));
        for(UUID rejected:new UUID[]{foreign,personal}) {
            mvc.perform(get("/api/v1/projects/"+project+"/library").with(token(ADMIN)).param("folderId",rejected.toString()))
                    .andExpect(status().isNotFound());
        }
        mvc.perform(get("/api/v1/projects/"+foreignProject+"/library").with(token(ADMIN))
                .param("search","Acervo").param("mimeType",DOCX).param("cursor",cursor))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/projects/"+project+"/library").with(token(OTHER))).andExpect(status().isNotFound());
        jdbc.update("update nite_connect.members set status='AFASTADO' where id=?",MEMBER);
        mvc.perform(get("/api/v1/projects/"+project+"/library").with(token(MEMBER))).andExpect(status().isForbidden());
    }

    @Test void participantCannotMutateAndLeaderOrganizesOnlyCurrentProject() throws Exception {
        UUID project=project();join(project,LEADER);join(project,MEMBER);transfer(project,LEADER);
        UUID home=projectHome(project,LEADER),doc=upload(LEADER,home,"Editavel.docx");
        UUID nested=folder(LEADER,home,"Equipe");
        mvc.perform(get("/api/v1/projects/"+project+"/library").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.folder.capabilities.canAddChild").value(false));
        mvc.perform(post("/api/v1/library/folders").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"parentId\":\""+home+"\",\"name\":\"Negada\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/library/documents/"+doc).with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"folderId\":\""+nested+"\",\"title\":\"Renomeado.docx\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(patch("/api/v1/library/folders/"+nested).with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Organizada\"}"))
                .andExpect(status().isOk());
        UUID foreign=projectHome(project(),ADMIN);
        mvc.perform(patch("/api/v1/library/documents/"+doc).with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"folderId\":\""+foreign+"\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/library/documents/"+doc+"/trash").with(token(LEADER)))
                .andExpect(status().isForbidden());
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_PROJETO',?,'Fixture')",MEMBER,ADMIN);
        transfer(project,MEMBER);
        mvc.perform(post("/api/v1/library/folders").with(token(LEADER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"parentId\":\""+home+"\",\"name\":\"Ex liderança\"}"))
                .andExpect(status().isForbidden());
    }

    @Test void institutionalDeletionNeedsApprovalAndProjectTrashStaysIsolated() throws Exception {
        UUID project=project();join(project,LEADER);join(project,MEMBER);transfer(project,LEADER);
        UUID home=projectHome(project,LEADER),doc=upload(LEADER,home,"Institucional.docx");
        UUID foreignProject=project(),foreignDoc=upload(ADMIN,projectHome(foreignProject,ADMIN),"Outro.docx");
        UUID personalDoc=upload(MEMBER,personalHome(MEMBER),"Pessoal.docx");
        mvc.perform(post("/api/v1/library/documents/"+foreignDoc+"/trash").with(token(ADMIN))).andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/library/documents/"+personalDoc+"/trash").with(token(MEMBER))).andExpect(status().isNoContent());
        UUID request=request(LEADER,project,doc,"DOCUMENT");
        mvc.perform(get("/api/v1/library/documents/"+doc).with(token(MEMBER))).andExpect(status().isOk());
        mvc.perform(post("/api/v1/library/project-action-requests/"+request+"/decision").with(token(LEADER))
                .contentType(MediaType.APPLICATION_JSON).content("{\"approve\":true,\"confirmed\":true,\"reason\":\"Negada\"}"))
                .andExpect(status().isForbidden());
        approve(request);
        mvc.perform(get("/api/v1/projects/"+project+"/trash").with(token(LEADER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].item.id").value(doc.toString()))
                .andExpect(jsonPath("$.items[0].capabilities.canRestore").value(true))
                .andExpect(jsonPath("$.items[0].capabilities.canPermanentlyDelete").value(false));
        mvc.perform(get("/api/v1/projects/"+project+"/trash").with(token(MEMBER))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/projects/"+project+"/trash").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].capabilities.canRestore").value(true))
                .andExpect(jsonPath("$.items[0].capabilities.canPermanentlyDelete").value(false));
        mvc.perform(get("/api/v1/projects/"+project+"/trash").with(token(OTHER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/me/trash").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].item.id").value(personalDoc.toString()));
        String restore="{\"action\":\"RESTORE\",\"items\":[{\"type\":\"DOCUMENT\",\"id\":\""+doc+"\"}]}";
        mvc.perform(post("/api/v1/library/operations/batch").with(token(MEMBER)).header("Idempotency-Key","project-restore-denied")
                        .contentType(MediaType.APPLICATION_JSON).content(restore)).andExpect(status().isConflict());
        mvc.perform(post("/api/v1/library/operations/batch").with(token(LEADER)).header("Idempotency-Key","project-restore-once")
                        .contentType(MediaType.APPLICATION_JSON).content(restore)).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(post("/api/v1/library/operations/batch").with(token(LEADER)).header("Idempotency-Key","project-restore-once")
                        .contentType(MediaType.APPLICATION_JSON).content(restore)).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(get("/api/v1/library/documents/"+doc).with(token(MEMBER))).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select lifecycle_state from nite_connect.documents where id=?",String.class,foreignDoc)).isEqualTo("TRASHED");
    }

    @Test void approvedFolderDeletionRestoresItsTreeAndRejectsCrossProjectRequest() throws Exception {
        UUID project=project();join(project,LEADER);transfer(project,LEADER);
        UUID nested=folder(LEADER,projectHome(project,LEADER),"Subarvore"),doc=upload(LEADER,nested,"Filho.docx");
        UUID otherProject=project();
        mvc.perform(post("/api/v1/library/project-action-requests").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"projectId\":\""+otherProject+"\",\"resourceId\":\""+nested+
                        "\",\"resourceType\":\"FOLDER\",\"action\":\"TRASH\",\"reason\":\"Outro escopo\"}"))
                .andExpect(status().isNotFound());
        approve(request(LEADER,project,nested,"FOLDER"));
        mvc.perform(get("/api/v1/library/documents/"+doc).with(token(LEADER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/projects/"+project+"/trash").with(token(LEADER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].item.id").value(nested.toString()));
        mvc.perform(post("/api/v1/me/trash/"+nested+"/restore").with(token(ADMIN))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/library/folders/"+nested).with(token(LEADER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.files[0].id").value(doc.toString()));
    }

    @Test void administrativePendingQueueFiltersProjectBeforePagination() throws Exception {
        UUID project=project(),otherProject=project();
        UUID otherDoc=upload(ADMIN,projectHome(otherProject,ADMIN),"Outro.docx");
        request(ADMIN,otherProject,otherDoc,"DOCUMENT");
        UUID doc=upload(ADMIN,projectHome(project,ADMIN),"Alvo.docx");
        UUID first=request(ADMIN,project,doc,"DOCUMENT"),second=request(ADMIN,project,doc,"DOCUMENT");
        String url="/api/v1/library/project-action-requests";
        mvc.perform(get(url).with(token(ADMIN)).param("projectId",project.toString()).param("limit","1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(first.toString()));
        mvc.perform(get(url).with(token(ADMIN)).param("projectId",project.toString()).param("limit","1").param("offset","1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(second.toString()));
        mvc.perform(get(url).with(token(ADMIN)).param("projectId",project.toString()).param("offset","2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get(url).with(token(ADMIN)).param("offset","-1")).andExpect(status().isBadRequest());
        mvc.perform(get(url).with(token(ADMIN)).param("projectId",UUID.randomUUID().toString())).andExpect(status().isNotFound());
        join(project,LEADER);transfer(project,LEADER);
        mvc.perform(get(url).with(token(LEADER)).param("projectId",project.toString())).andExpect(status().isForbidden());
        mvc.perform(get(url+"/"+first).with(token(LEADER))).andExpect(status().isNotFound());
    }
}
