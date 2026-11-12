package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Import(DocumentFoundationTest.Stubs.class)
@TestPropertySource(properties={
        "nite.documents.enabled=true", "nite.documents.storage.provider=test",
        "nite.documents.wopi-public-base-url=http://host.docker.internal:8080",
        "nite.documents.allow-insecure-dev=true",
        "nite.documents.collabora.discovery-url=http://localhost:9980/hosting/discovery"
})
class DocumentLibraryTest extends ProjectTestSupport {
    private String file(){return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";}
    private MockMultipartFile docx() throws Exception {return new MockMultipartFile("file","Modelo.docx",file(),DocxIntegrityTest.docx("Conteúdo de teste"));}
    private UUID root(String key) throws Exception {
        mvc.perform(get("/api/v1/library/roots").with(token(ADMIN))).andExpect(status().isOk());
        return jdbc.queryForObject("select id from nite_connect.document_folders where system_key=?",UUID.class,key);
    }
    private UUID personal(UUID member) throws Exception {
        String contents=mvc.perform(get("/api/v1/me/library").with(token(member))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(com.jayway.jsonpath.JsonPath.read(contents,"$.folder.id"));
    }
    private String upload(UUID actor,UUID folder) throws Exception {
        return mvc.perform(multipart("/api/v1/library/folders/"+folder+"/files")
                .file(docx()).param("title","Relatório Individual.docx").with(token(actor)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }
    @Test void personalAndAdministrativeViewsSeeTheSameDocumentWithoutGrantingDeleteToTheOwner() throws Exception {
        UUID folder=personal(MEMBER);
        String result=upload(MEMBER,folder);
        String id=com.jayway.jsonpath.JsonPath.read(result,"$.id");
        mvc.perform(get("/api/v1/me/library").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.files[?(@.id=='"+id+"')].title").exists());
        mvc.perform(get("/api/v1/library/folders/"+folder).with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.files[?(@.id=='"+id+"')].title").exists());
        mvc.perform(get("/api/v1/library/folders/"+folder).with(token(OTHER))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/library/documents/"+id).with(token(MEMBER))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/me/library").queryParam("folderId",personal(OTHER).toString()).with(token(MEMBER)))
                .andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.documents where id=?",Integer.class,UUID.fromString(id))).isEqualTo(1);
    }
    @Test void folderNamesAreUniqueAmongSiblingsAndCyclesAreRejected() throws Exception {
        UUID root=root("MATERIAIS");
        String first=mvc.perform(post("/api/v1/library/folders").with(token(ADMIN))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"parentId":"%s","name":"Apresentações","color":"#D6A432"}
                        """.formatted(root)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id=com.jayway.jsonpath.JsonPath.read(first,"$.id");
        mvc.perform(post("/api/v1/library/folders").with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"parentId":"%s","name":" APRESENTAÇÕES ","color":"#D6A432"}
                """.formatted(root))).andExpect(status().isConflict());
        mvc.perform(patch("/api/v1/library/folders/"+id).with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"parentId":"%s","name":"Apresentações","color":"#2266EE","moveToRoot":false}
                """.formatted(id))).andExpect(status().isConflict());
        mvc.perform(patch("/api/v1/library/folders/"+id).with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Material de eventos","color":"#2266EE","moveToRoot":false}
                """)).andExpect(status().isOk()).andExpect(jsonPath("$.color").value("#2266EE"));
    }
    @Test void projectPermissionsDoNotExposeTeamMembersPersonalFolders() throws Exception {
        UUID project=project();join(project,LEADER);join(project,MEMBER);transfer(project,LEADER);
        String listing=mvc.perform(get("/api/v1/projects/"+project+"/library").with(token(LEADER)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        UUID folder=UUID.fromString(com.jayway.jsonpath.JsonPath.read(listing,"$.folder.id"));
        mvc.perform(patch("/api/v1/library/folders/"+folder).with(token(LEADER))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Tentativa de renomear o espaço institucional\"}"))
                .andExpect(status().isForbidden());
        String result=upload(LEADER,folder);
        String id=com.jayway.jsonpath.JsonPath.read(result,"$.id");
        mvc.perform(get("/api/v1/documents/"+id).with(token(MEMBER))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/library/folders/"+personal(MEMBER)).with(token(LEADER))).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/documents/"+id+"/editor-session").with(token(MEMBER)))
                .andExpect(status().isOk());
        mvc.perform(put("/api/v1/library/documents/"+id+"/edit-grants/"+MEMBER).with(token(LEADER))
                .contentType(MediaType.APPLICATION_JSON).content("{\"canEdit\":true}"))
                .andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_grants where document_id=? and member_id=? and can_edit and revoked_at is null",Integer.class,
                UUID.fromString(id),MEMBER)).isEqualTo(1);
    }
    @Test void modelDistributionIsIdempotentAndKeepsIndividualCopies() throws Exception {
        String response=mvc.perform(multipart("/api/v1/library/templates").file(docx())
                        .param("title","Plano AV3").param("autoAssignOnJoin","true").with(token(ADMIN)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String templateId=response.replace("\"","");
        String json="{\"memberIds\":[\""+MEMBER+"\",\""+OTHER+"\"]}";
        mvc.perform(post("/api/v1/library/templates/"+templateId+"/distribute").with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(2));
        mvc.perform(post("/api/v1/library/templates/"+templateId+"/distribute").with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(0))
                .andExpect(jsonPath("$.alreadyPresent").value(2));
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_template_distributions where template_version_id in (select id from nite_connect.document_template_versions where template_id=?)",Integer.class,UUID.fromString(templateId)))
                .isEqualTo(2);
    }
    @Test void attachedPdfIsDownloadOnlyAndCannotLaunchWopiEditor() throws Exception {
        UUID folder=personal(MEMBER);
        byte[] pdf="%PDF-1.7\nconteudo de teste\n%%EOF".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        String response=mvc.perform(multipart("/api/v1/library/folders/"+folder+"/files")
                        .file(new MockMultipartFile("file","plano.pdf","application/pdf",pdf))
                        .param("title","plano.pdf").with(token(MEMBER)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.mimeType").value("application/pdf"))
                .andReturn().getResponse().getContentAsString();
        String id=com.jayway.jsonpath.JsonPath.read(response,"$.id");
        mvc.perform(get("/api/v1/documents/"+id+"/download").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(content().bytes(pdf));
        mvc.perform(post("/api/v1/documents/"+id+"/editor-session").with(token(MEMBER)))
                .andExpect(status().isBadRequest());
    }

    @Test void theAdministrationCanFindAndRestoreIndividuallyArchivedDocuments() throws Exception {
        UUID folder=personal(MEMBER);
        String imported=upload(MEMBER,folder);
        String id=com.jayway.jsonpath.JsonPath.read(imported,"$.id");
        mvc.perform(delete("/api/v1/library/documents/"+id).with(token(ADMIN)))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/library/archived").with(token(MEMBER)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/library/archived").with(token(ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='"+id+"')].name").exists());
        mvc.perform(post("/api/v1/library/documents/"+id+"/restore").with(token(ADMIN)))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/me/library").with(token(MEMBER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.files[?(@.id=='"+id+"')].id").exists());
    }

    @Test void recursiveArchiveCanBeRestoredWithoutLosingTheDocxOrItsRevision() throws Exception {
        UUID root=root("MATERIAIS");
        String response=mvc.perform(post("/api/v1/library/folders").with(token(ADMIN))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"parentId":"%s","name":"Arquivos temporários","color":"#B91C1C"}
                        """.formatted(root))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID folder=UUID.fromString(com.jayway.jsonpath.JsonPath.read(response,"$.id"));
        String file=upload(ADMIN,folder);
        UUID fileId=UUID.fromString(com.jayway.jsonpath.JsonPath.read(file,"$.id"));
        mvc.perform(delete("/api/v1/library/folders/"+folder).with(token(ADMIN))).andExpect(status().isConflict());
        mvc.perform(delete("/api/v1/library/folders/"+folder).queryParam("recursive","true").with(token(ADMIN)))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/documents/"+fileId).with(token(ADMIN))).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/library/folders/"+folder+"/restore").with(token(ADMIN))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/documents/"+fileId).with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1));
    }

}
