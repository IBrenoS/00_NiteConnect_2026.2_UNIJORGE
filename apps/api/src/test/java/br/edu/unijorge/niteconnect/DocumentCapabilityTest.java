package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Import(DocumentFoundationTest.Stubs.class)
@TestPropertySource(properties={
        "nite.documents.enabled=true", "nite.documents.storage.provider=test",
        "nite.documents.wopi-public-base-url=http://host.docker.internal:8080",
        "nite.documents.allow-insecure-dev=true",
        "nite.documents.collabora.discovery-url=http://localhost:9980/hosting/discovery"
})
class DocumentCapabilityTest extends ProjectTestSupport {
    private UUID home(UUID member) throws Exception {
        String body=mvc.perform(get("/api/v1/me/library").with(token(member))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(com.jayway.jsonpath.JsonPath.read(body,"$.folder.id"));
    }
    private UUID upload(UUID actor,UUID folder,String title) throws Exception {
        String body=mvc.perform(multipart("/api/v1/library/folders/"+folder+"/files")
                .file(new MockMultipartFile("file",title,"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        DocxIntegrityTest.docx("Teste de capacidades")))
                .param("title",title).with(token(actor))).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(com.jayway.jsonpath.JsonPath.read(body,"$.id"));
    }
    private UUID folder(UUID actor,UUID parent) throws Exception {
        String name="Pasta "+UUID.randomUUID().toString().substring(0,8);
        String body=mvc.perform(post("/api/v1/library/folders").with(token(actor)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"parentId\":\""+parent+"\",\"name\":\""+name+"\",\"color\":\"#D6A432\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(com.jayway.jsonpath.JsonPath.read(body,"$.id"));
    }
    @Test void personalCreatorControlsOwnItemButManagementCreatedItemRemainsInstitutional() throws Exception {
        UUID personal=home(MEMBER);
        UUID own=upload(MEMBER,personal,"Proprio.docx");
        mvc.perform(get("/api/v1/library/documents/"+own).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.identity.resourceOwnerKind").value("MEMBER"))
                .andExpect(jsonPath("$.identity.resourceOwnerId").value(MEMBER.toString()))
                .andExpect(jsonPath("$.capabilities.canRename").value(true))
                .andExpect(jsonPath("$.capabilities.canDeleteToTrash").value(true));
        UUID assigned=upload(ADMIN,personal,"Gestao.docx");
        mvc.perform(get("/api/v1/library/documents/"+assigned).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.identity.spaceOwnerId").value(MEMBER.toString()))
                .andExpect(jsonPath("$.identity.resourceOwnerKind").value("INSTITUTION"))
                .andExpect(jsonPath("$.identity.createdBy").value(ADMIN.toString()))
                .andExpect(jsonPath("$.capabilities.canEdit").value(true))
                .andExpect(jsonPath("$.capabilities.canRename").value(false))
                .andExpect(jsonPath("$.capabilities.canShare").value(false));
        mvc.perform(get("/api/v1/library/documents/"+assigned).with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.capabilities.canDeleteToTrash").value(true));
        mvc.perform(patch("/api/v1/library/documents/"+assigned).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Novo nome.docx\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/library/documents/"+assigned+"/shares").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\""+OTHER+"\",\"permission\":\"VIEW\"}"))
                .andExpect(status().isForbidden());
    }
    @Test void inheritedEditDoesNotTransferOwnershipOrManagement() throws Exception {
        UUID personal=home(MEMBER),sharedFolder=folder(MEMBER,personal);
        mvc.perform(post("/api/v1/library/folders/"+sharedFolder+"/shares").with(token(MEMBER))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\""+OTHER+"\",\"permission\":\"EDIT\"}"))
                .andExpect(status().isCreated());
        UUID existing=upload(MEMBER,sharedFolder,"Existente.docx");
        mvc.perform(get("/api/v1/library/documents/"+existing).with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.capabilities.canEdit").value(true))
                .andExpect(jsonPath("$.capabilities.canDeleteToTrash").value(false))
                .andExpect(jsonPath("$.capabilities.canShare").value(false))
                .andExpect(jsonPath("$.capabilities.canMove").value(false));
        String launch=mvc.perform(post("/api/v1/documents/"+existing+"/editor-session").with(token(OTHER)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String wopiToken=com.jayway.jsonpath.JsonPath.read(launch,"$.accessToken");
        mvc.perform(post("/wopi/files/"+existing+"/contents").queryParam("access_token",wopiToken)
                .content(DocxIntegrityTest.docx("Editado via grant"))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/library/documents/"+existing).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.identity.resourceOwnerId").value(MEMBER.toString()))
                .andExpect(jsonPath("$.identity.createdBy").value(MEMBER.toString()))
                .andExpect(jsonPath("$.identity.modifiedBy").value(OTHER.toString()));
        UUID newChild=upload(OTHER,sharedFolder,"Terceiro.docx");
        mvc.perform(get("/api/v1/library/documents/"+newChild).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.identity.resourceOwnerId").value(OTHER.toString()))
                .andExpect(jsonPath("$.capabilities.canRename").value(false));
        mvc.perform(patch("/api/v1/library/documents/"+newChild).with(token(MEMBER))
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Renomeado.docx\"}"))
                .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select resource_owner_id from nite_connect.documents where id=?",UUID.class,newChild)).isEqualTo(OTHER);
        jdbc.update("update nite_connect.members set status='DESLIGADO' where id=?",OTHER);
        mvc.perform(get("/api/v1/library/documents/"+existing).with(token(OTHER))).andExpect(status().isForbidden());
    }
    @Test void protectedAndUnclassifiedResourcesDenyPersonalManagement() throws Exception {
        UUID personal=home(MEMBER);
        UUID protectedFile=upload(MEMBER,personal,"Protegido.docx");
        jdbc.update("update nite_connect.documents set protection='ACADEMIC',retention_hold=true,protection_reason='Evidência acadêmica',protection_revision=1 where id=?",protectedFile);
        mvc.perform(get("/api/v1/library/documents/"+protectedFile).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.identity.protection").value("ACADEMIC"))
                .andExpect(jsonPath("$.capabilities.canEdit").value(true))
                .andExpect(jsonPath("$.capabilities.canRename").value(false))
                .andExpect(jsonPath("$.capabilities.deniedReasons.canRename").value("HELD"));
        mvc.perform(patch("/api/v1/library/documents/"+protectedFile).with(token(MEMBER))
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Novo.docx\"}"))
                .andExpect(status().isForbidden());

        UUID unknown=upload(MEMBER,personal,"Legado.docx");
        jdbc.update("update nite_connect.documents set resource_owner_kind='UNKNOWN',resource_owner_id=null,origin='LEGACY_UNKNOWN' where id=?",unknown);
        mvc.perform(get("/api/v1/library/documents/"+unknown).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.capabilities.canView").value(true))
                .andExpect(jsonPath("$.capabilities.canRename").value(false))
                .andExpect(jsonPath("$.capabilities.canShare").value(false));
    }
    @Test void mixedFolderCannotBeMovedByItsPersonalOwner() throws Exception {
        UUID personal=home(MEMBER),mixed=folder(MEMBER,personal);
        UUID child=upload(ADMIN,mixed,"Gestao dentro.docx");
        mvc.perform(get("/api/v1/library/folders/"+mixed).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.folder.capabilities.canRename").value(true))
                .andExpect(jsonPath("$.folder.capabilities.canMove").value(false));
        UUID destination=folder(MEMBER,personal);
        mvc.perform(patch("/api/v1/library/folders/"+mixed).with(token(MEMBER))
                .contentType(MediaType.APPLICATION_JSON).content("{\"parentId\":\""+destination+"\"}"))
                .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select folder_id from nite_connect.documents where id=?",UUID.class,child)).isEqualTo(mixed);
    }
    @Test void projectLeaderHasOnlyCurrentProjectScope() throws Exception {
        UUID project=project();
        join(project,LEADER);transfer(project,LEADER);
        UUID projectFolder=UUID.fromString(com.jayway.jsonpath.JsonPath.read(
                mvc.perform(get("/api/v1/projects/"+project+"/library").with(token(LEADER)))
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.folder.id"));
        UUID doc=upload(ADMIN,projectFolder,"Projeto.docx");
        mvc.perform(get("/api/v1/library/documents/"+doc).with(token(LEADER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.capabilities.canArchiveInstitutionally").value(true))
                .andExpect(jsonPath("$.capabilities.canDeleteToTrash").value(false));
        mvc.perform(get("/api/v1/library/documents/"+doc).with(token(OTHER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/library/folders/"+home(MEMBER)).with(token(LEADER))).andExpect(status().isNotFound());
    }
    @Test void generalManagerAndCoordinatorHaveAdministrativeCapabilities() throws Exception {
        UUID personal=home(MEMBER),doc=upload(MEMBER,personal,"Administracao.docx");
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_GERAL',?,'Fixture')",OTHER,ADMIN);
        for(UUID actor:new UUID[]{ADMIN,OTHER}) {
            mvc.perform(get("/api/v1/library/documents/"+doc).with(token(actor)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.capabilities.canView").value(true))
                    .andExpect(jsonPath("$.capabilities.canEdit").value(true))
                    .andExpect(jsonPath("$.capabilities.canArchiveInstitutionally").value(true));
        }
    }
}
