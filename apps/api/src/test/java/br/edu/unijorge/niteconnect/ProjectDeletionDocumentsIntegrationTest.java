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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(DocumentFoundationTest.Stubs.class)
@TestPropertySource(properties={
        "nite.documents.enabled=true", "nite.documents.storage.provider=test",
        "nite.documents.wopi-public-base-url=http://host.docker.internal:8080",
        "nite.documents.allow-insecure-dev=true",
        "nite.documents.collabora.discovery-url=http://localhost:9980/hosting/discovery"
})
class ProjectDeletionDocumentsIntegrationTest extends ProjectTestSupport {
    @Test void deletionKeepsProjectDocumentsAndBlocksItsWorkspace() throws Exception {
        UUID project=project();
        String homeResponse=mvc.perform(get("/api/v1/projects/"+project+"/library").with(token(ADMIN)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        UUID home=UUID.fromString(JsonPath.read(homeResponse,"$.folder.id"));
        byte[] content=DocxIntegrityTest.docx("Documento preservado");
        String fileResponse=mvc.perform(multipart("/api/v1/library/folders/"+home+"/files")
                        .file(new MockMultipartFile("file","Ata.docx",
                                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",content))
                        .param("title","Ata.docx").with(token(ADMIN)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID document=UUID.fromString(JsonPath.read(fileResponse,"$.id"));

        mvc.perform(delete("/api/v1/projects/"+project).with(token(ADMIN)))
                .andExpect(status().isOk());

        assertThat(jdbc.queryForObject("select count(*) from nite_connect.documents where id=? and project_id=?",Integer.class,document,project))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_versions where document_id=?",Integer.class,document))
                .isEqualTo(1);
        mvc.perform(get("/api/v1/projects/"+project+"/library").with(token(ADMIN))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/library/projects/"+project+"/archive").with(token(LEADER)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/library/projects/"+project+"/archive").with(token(ADMIN)))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.files[*].id")
                        .value(org.hamcrest.Matchers.hasItem(document.toString())));
        mvc.perform(get("/api/v1/library/documents/"+document).with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.capabilities.canEdit").value(false))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.capabilities.canDeleteToTrash").value(false));
        mvc.perform(patch("/api/v1/library/documents/"+document).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Ata renomeada.docx\"}"))
                .andExpect(status().isForbidden());
    }
}
