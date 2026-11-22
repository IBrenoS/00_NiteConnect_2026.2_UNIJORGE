package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.documents.application.DocumentObjectStore;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class MemberProfileTest extends ProjectTestSupport {
    @MockitoBean DocumentObjectStore store;

    private String profile(long version, String course, String date) {
        return "{\"course\":" + course + ",\"practiceArea\":null,\"birthDate\":" + date
                + ",\"expectedVersion\":" + version + "}";
    }

    @Test void ownProfileIsEditableForEveryInstitutionalRoleAndPersists() throws Exception {
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_GERAL',?,'Fixture')", OTHER, ADMIN);
        for (UUID actor : java.util.List.of(ADMIN, LEADER, MEMBER, OTHER)) {
            mvc.perform(patch("/api/v1/me/profile").with(token(actor)).contentType(MediaType.APPLICATION_JSON)
                    .content(profile(0, "\"Computação\"", "\"2001-02-03\"")))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.course").value("Computação"))
                    .andExpect(jsonPath("$.version").value(1));
            mvc.perform(get("/api/v1/me/profile").with(token(actor))).andExpect(status().isOk())
                    .andExpect(jsonPath("$.birthDate").value("2001-02-03"));
        }
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.members where course='Computação'", Integer.class)).isEqualTo(4);
        mvc.perform(get("/api/v1/members/" + MEMBER + "/profile").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.course").value("Computação"))
                .andExpect(jsonPath("$.birthDate").doesNotExist());
        mvc.perform(get("/api/v1/members/" + MEMBER + "/profile").with(token(LEADER)))
                .andExpect(status().isForbidden());
    }

    @Test void cannotChangeAnotherProfileOrInstitutionalEmailAndConflictsAreDetected() throws Exception {
        mvc.perform(patch("/api/v1/members/" + ADMIN).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Outro\",\"institutionalEmail\":\"outro@unijorge.com.br\",\"expectedVersion\":0,\"reason\":\"teste\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/me/profile").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"institutionalEmail\":\"outro@unijorge.com.br\",\"course\":\"Novo\",\"expectedVersion\":0}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/v1/me/profile").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content(profile(0, "\"Novo\"", "null"))).andExpect(status().isOk());
        mvc.perform(patch("/api/v1/me/profile").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content(profile(0, "\"Antigo\"", "null"))).andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select institutional_email from nite_connect.members where id=?", String.class, MEMBER))
                .isEqualTo(MEMBER + "@unijorge.com.br");
    }

    @Test void optionalFieldsAndBirthDateValidation() throws Exception {
        mvc.perform(patch("/api/v1/me/profile").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content(profile(0, "null", "null"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.course").doesNotExist());
        mvc.perform(patch("/api/v1/me/profile").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content(profile(1, "null", "\"1899-12-31\""))).andExpect(status().isBadRequest());
        mvc.perform(patch("/api/v1/me/profile").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content(profile(1, "null", "\"2999-01-01\""))).andExpect(status().isBadRequest());
    }

    @Test void photoCanBeUploadedReplacedReadAndRemoved() throws Exception {
        byte[] png = java.util.Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
        MockMultipartFile file = new MockMultipartFile("file", "photo.png", "image/png", png);
        mvc.perform(multipart("/api/v1/me/profile/photo").file(file).with(token(MEMBER))
                .param("expectedVersion", "0")).andExpect(status().isOk()).andExpect(jsonPath("$.hasPhoto").value(true));
        UUID first = jdbc.queryForObject("select photo_object_id from nite_connect.members where id=?", UUID.class, MEMBER);
        when(store.getAsset(first)).thenReturn(png);
        mvc.perform(get("/api/v1/members/" + MEMBER + "/photo").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(header().string("Content-Type", "image/png"));
        mvc.perform(multipart("/api/v1/me/profile/photo").file(file).with(token(MEMBER))
                .param("expectedVersion", "1")).andExpect(status().isOk());
        UUID second = jdbc.queryForObject("select photo_object_id from nite_connect.members where id=?", UUID.class, MEMBER);
        assertThat(second).isNotEqualTo(first);
        verify(store).deleteAssetOrphan(first);
        mvc.perform(delete("/api/v1/me/profile/photo").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedVersion\":2}")).andExpect(status().isOk()).andExpect(jsonPath("$.hasPhoto").value(false));
        verify(store).deleteAssetOrphan(second);
        mvc.perform(get("/api/v1/members/" + MEMBER + "/photo").with(token(MEMBER))).andExpect(status().isNotFound());
    }

    @Test void photoRejectsSpoofedFileAndStaleVersion() throws Exception {
        MockMultipartFile invalid = new MockMultipartFile("file", "x.png", "image/png", "<svg/>".getBytes());
        mvc.perform(multipart("/api/v1/me/profile/photo").file(invalid).with(token(MEMBER))
                .param("expectedVersion", "0")).andExpect(status().isBadRequest());
        byte[] png = java.util.Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
        MockMultipartFile file = new MockMultipartFile("file", "x.png", "image/png", png);
        mvc.perform(patch("/api/v1/me/profile").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content(profile(0, "null", "null"))).andExpect(status().isOk());
        mvc.perform(multipart("/api/v1/me/profile/photo").file(file).with(token(MEMBER))
                .param("expectedVersion", "0")).andExpect(status().isConflict());
        verify(store).deleteAssetOrphan(any(UUID.class));
    }
}
