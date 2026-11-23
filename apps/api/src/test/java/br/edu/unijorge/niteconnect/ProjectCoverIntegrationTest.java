package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.documents.application.DocumentObjectStore;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.Base64;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProjectCoverIntegrationTest extends ProjectTestSupport {
    @MockitoBean DocumentObjectStore store;
    private static final byte[] PNG=Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=");

    @Test void coverCanBeCreatedReplacedReadFromCatalogAndRemovedWithoutDatabaseBlobs() throws Exception {
        MockMultipartFile metadata=new MockMultipartFile("project","project.json","application/json",
                "{\"title\":\"Projeto com capa\",\"description\":\"Descrição\",\"initialStatus\":\"ATIVO\"}".getBytes());
        MockMultipartFile image=new MockMultipartFile("image","cover.png","image/png",PNG);
        mvc.perform(multipart("/api/v1/projects").file(metadata).file(image).with(token(ADMIN)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("ATIVO"))
                .andExpect(jsonPath("$.coverImageUrl").value(org.hamcrest.Matchers.startsWith("/api/v1/project-catalog/")));
        UUID project=jdbc.queryForObject("select id from nite_connect.projects where title='Projeto com capa'",UUID.class);
        UUID first=jdbc.queryForObject("select cover_object_id from nite_connect.projects where id=?",UUID.class,project);
        assertThat(jdbc.queryForObject("select data_type from information_schema.columns where table_schema='nite_connect' and table_name='projects' and column_name='cover_object_id'",String.class)).isEqualTo("uuid");
        when(store.getAsset(first)).thenReturn(PNG);
        mvc.perform(get("/api/v1/project-catalog/"+project+"/image").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(content().contentType("image/png")).andExpect(content().bytes(PNG));
        mvc.perform(get("/api/v1/project-catalog").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].image").value("/api/v1/project-catalog/"+project+"/image"));

        MockMultipartFile replacement=new MockMultipartFile("image","replacement.png","image/png",PNG);
        mvc.perform(multipart("/api/v1/projects/"+project+"/cover-image").file(replacement).param("expectedVersion","1").with(request -> {request.setMethod("PUT");return token(ADMIN).postProcessRequest(request);}))
                .andExpect(status().isOk());
        UUID second=jdbc.queryForObject("select cover_object_id from nite_connect.projects where id=?",UUID.class,project);
        assertThat(second).isNotEqualTo(first);
        verify(store).deleteAssetOrphan(first);
        mvc.perform(delete("/api/v1/projects/"+project+"/cover-image").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedVersion\":2}" )).andExpect(status().isOk()).andExpect(jsonPath("$.coverImageUrl").value(org.hamcrest.Matchers.nullValue()));
        assertThat(jdbc.queryForObject("select cover_object_id from nite_connect.projects where id=?",UUID.class,project)).isNull();
        verify(store).deleteAssetOrphan(second);
        mvc.perform(get("/api/v1/project-catalog/"+project+"/image").with(token(OTHER))).andExpect(status().isNotFound());
    }

    @Test void rejectsUnauthorizedOrInvalidImagesAndCompensatesFailedCreation() throws Exception {
        MockMultipartFile metadata=new MockMultipartFile("project","project.json","application/json",
                "{\"title\":\"Projeto inválido\",\"description\":\"Descrição\"}".getBytes());
        MockMultipartFile badImage=new MockMultipartFile("image","cover.gif","image/gif",new byte[]{1,2,3});
        mvc.perform(multipart("/api/v1/projects").file(metadata).file(badImage).with(token(ADMIN))).andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.projects",Integer.class)).isZero();
        MockMultipartFile valid=new MockMultipartFile("image","cover.png","image/png",PNG);
        mvc.perform(multipart("/api/v1/projects").file(metadata).file(valid).with(token(MEMBER))).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.projects",Integer.class)).isZero();
        doThrow(new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Armazenamento indisponível"))
                .when(store).putAsset(any(UUID.class),any(byte[].class),any(String.class));
        mvc.perform(multipart("/api/v1/projects").file(metadata).file(valid).with(token(ADMIN))).andExpect(status().isServiceUnavailable());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.projects",Integer.class)).isZero();
        verify(store).deleteAssetOrphan(any(UUID.class));
    }
}
