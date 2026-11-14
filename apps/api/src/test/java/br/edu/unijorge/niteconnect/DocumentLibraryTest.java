package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import java.util.UUID;
import java.util.List;
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
    @Autowired DocumentFoundationTest.InMemoryStore store;
    @Autowired br.edu.unijorge.niteconnect.documents.infrastructure.DocumentSharingRepository sharing;
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
    @Test void memberCanOrganizeOnlyCustomFoldersAndFilesInOwnPersonalScope() throws Exception {
        UUID home=personal(MEMBER);
        String response=mvc.perform(post("/api/v1/library/folders").with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"parentId":"%s","name":"Rascunhos","color":"#D6A432"}
                        """.formatted(home)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID child=UUID.fromString(com.jayway.jsonpath.JsonPath.read(response,"$.id"));
        mvc.perform(patch("/api/v1/library/folders/"+child).with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"name":"Documentos","moveToRoot":true}
                        """))
                .andExpect(status().isOk()).andExpect(jsonPath("$.parentId").value(home.toString()));

        String uploaded=upload(MEMBER,home);
        UUID document=UUID.fromString(com.jayway.jsonpath.JsonPath.read(uploaded,"$.id"));
        mvc.perform(patch("/api/v1/library/documents/"+document).with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"folderId":"%s","title":"Relatório Individual.docx"}
                        """.formatted(child)))
                .andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/library/folders/"+child).with(token(MEMBER)))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/library/folders").with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"parentId":"%s","name":"Fora do escopo","color":"#D6A432"}
                        """.formatted(personal(OTHER))))
                .andExpect(status().isNotFound());
    }

    @Test void moveToRootKeepsCustomFoldersInsideTheirCurrentScope() throws Exception {
        UUID home=personal(MEMBER);
        String response=mvc.perform(post("/api/v1/library/folders").with(token(ADMIN))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"parentId":"%s","name":"Temporária","color":"#D6A432"}
                        """.formatted(home)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID child=UUID.fromString(com.jayway.jsonpath.JsonPath.read(response,"$.id"));
        mvc.perform(patch("/api/v1/library/folders/"+child).with(token(ADMIN))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"moveToRoot":true}
                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.parentId").value(home.toString()));
    }

    @Test void listingSupportsStableCursorSearchAndActualDocumentMetadata() throws Exception {
        UUID home=personal(MEMBER);
        UUID first=UUID.fromString(com.jayway.jsonpath.JsonPath.read(upload(MEMBER,home),"$.id"));
        mvc.perform(multipart("/api/v1/library/folders/"+home+"/files").file(docx())
                        .param("title","Outro arquivo.docx").with(token(MEMBER)))
                .andExpect(status().isCreated());
        var firstPage=mvc.perform(get("/api/v1/me/library").param("limit","1").param("sortBy","name").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.files.length()").value(1))
                .andExpect(jsonPath("$.totalFiles").value(2)).andExpect(jsonPath("$.hasMore").value(true))
                .andReturn().getResponse().getContentAsString();
        String firstPageId=com.jayway.jsonpath.JsonPath.read(firstPage,"$.files[0].id");
        String cursor=com.jayway.jsonpath.JsonPath.read(firstPage,"$.nextCursor");
        var secondPage=mvc.perform(get("/api/v1/me/library").param("limit","1").param("sortBy","name").param("cursor",cursor).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.files.length()").value(1))
                .andExpect(jsonPath("$.hasMore").value(false)).andReturn().getResponse().getContentAsString();
        String second=com.jayway.jsonpath.JsonPath.read(secondPage,"$.files[0].id");
        assertThat(second).isNotEqualTo(firstPageId);
        mvc.perform(get("/api/v1/me/library").param("search","Outro").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalFiles").value(1))
                .andExpect(jsonPath("$.files[0].title").value("Outro arquivo.docx"));
        mvc.perform(get("/api/v1/me/library").param("search","Outro").param("cursor",cursor).with(token(MEMBER)))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/library/documents/"+first).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.createdBy").value(MEMBER.toString()))
                .andExpect(jsonPath("$.createdAt").exists()).andExpect(jsonPath("$.folderName").exists());
        mvc.perform(get("/api/v1/me/library").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.folder.ownerName").value("Teste"))
                .andExpect(jsonPath("$.folder.createdAt").exists());
        mvc.perform(get("/api/v1/library/documents/"+first+"/activity").with(token(OTHER)))
                .andExpect(status().isNotFound());
        String folderResponse=mvc.perform(post("/api/v1/library/folders").with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"parentId":"%s","name":"Organizados","color":"#D6A432"}
                        """.formatted(home)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID child=UUID.fromString(com.jayway.jsonpath.JsonPath.read(folderResponse,"$.id"));
        mvc.perform(patch("/api/v1/library/documents/"+first).with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"folderId":"%s"}
                        """.formatted(child)))
                .andExpect(status().isNoContent());
        var history=mvc.perform(get("/api/v1/library/documents/"+first+"/activity").param("limit","1").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].actorId").value(MEMBER.toString()))
                .andExpect(jsonPath("$.hasMore").value(true)).andReturn().getResponse().getContentAsString();
        String activityCursor=com.jayway.jsonpath.JsonPath.<String>read(history,"$.nextCursor");
        mvc.perform(get("/api/v1/library/documents/"+first+"/activity")
                        .param("limit","1").param("cursor",activityCursor).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.hasMore").value(false));
    }

    @Test void uploadTreeCreatesNestedFoldersAndPreservesTheRelativeHierarchy() throws Exception {
        UUID home=personal(MEMBER);
        var request=multipart("/api/v1/library/folders/"+home+"/upload-tree").with(token(MEMBER));
        request.file(new MockMultipartFile("files","Relatorio.docx",file(),DocxIntegrityTest.docx("Conteúdo")))
                .file(new MockMultipartFile("files","plano.pdf","application/pdf",
                "%PDF-1.7\n%%EOF".getBytes(java.nio.charset.StandardCharsets.US_ASCII)))
                .param("paths","Entregas/2026/Relatorio.docx","Entregas/2026/plano.pdf");
        mvc.perform(request).andExpect(status().isCreated()).andExpect(jsonPath("$[0].folderId").exists())
                .andExpect(jsonPath("$.length()").value(2));
        UUID nested=jdbc.queryForObject("select id from nite_connect.document_folders where parent_id=? and name='2026'",UUID.class,
                jdbc.queryForObject("select id from nite_connect.document_folders where parent_id=? and name='Entregas'",UUID.class,home));
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.documents where folder_id=? and archived_at is null",Integer.class,nested)).isEqualTo(2);
        var invalid=multipart("/api/v1/library/folders/"+home+"/upload-tree").with(token(MEMBER));
        invalid.file(new MockMultipartFile("files","fora.docx",file(),DocxIntegrityTest.docx("Conteúdo"))).param("paths","../fora.docx");
        mvc.perform(invalid).andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_folders where parent_id=? and name='..'",Integer.class,home)).isZero();

        int storedBeforeFailure=store.objects.size();
        var partial=multipart("/api/v1/library/folders/"+home+"/upload-tree").with(token(MEMBER));
        partial.file(new MockMultipartFile("files","a.docx",file(),DocxIntegrityTest.docx("A")))
                .file(new MockMultipartFile("files","b.docx",file(),DocxIntegrityTest.docx("B")))
                .param("paths","Atomic/A.docx","Atomic/A.docx");
        mvc.perform(partial).andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.documents where title='A.docx'",Integer.class)).isZero();
        assertThat(store.objects).hasSize(storedBeforeFailure);
    }

    @Test void existingContentProvisioningUsesBoundedRepeatableBatches() throws Exception {
        var first=mvc.perform(post("/api/v1/library/provision-existing/batch").param("limit","1").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.membersProcessed").value(1))
                .andExpect(jsonPath("$.hasMore").value(true)).andReturn().getResponse().getContentAsString();
        String afterMember=com.jayway.jsonpath.JsonPath.read(first,"$.nextMemberId");
        mvc.perform(post("/api/v1/library/provision-existing/batch").param("limit","1").param("afterMemberId",afterMember).with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.membersProcessed").value(1));
        mvc.perform(post("/api/v1/library/provision-existing/batch").param("limit","101").with(token(ADMIN)))
                .andExpect(status().isBadRequest());
    }

    @Test void legacyProvisioningEndpointStillCompletesRostersLargerThanOneBatch() throws Exception {
        for(int index=0;index<101;index++) {
            UUID member=UUID.randomUUID();
            jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,? ,?,'ATIVO')",
                    member,"Lote "+index,"lote-"+index+"@unijorge.com.br");
        }
        mvc.perform(post("/api/v1/library/provision-existing").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(content().string("105"));
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_folders where kind='PERSONAL' and archived_at is null",Integer.class))
                .isEqualTo(105);
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
    @Test void personalDocumentViewShareAllowsReadOnlyAccessAndRevocationIsImmediate() throws Exception {
        UUID home=personal(MEMBER);
        UUID document=UUID.fromString(com.jayway.jsonpath.JsonPath.read(upload(MEMBER,home),"$.id"));
        String share=mvc.perform(post("/api/v1/library/documents/"+document+"/shares").with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"memberId":"%s","permission":"VIEW"}
                        """.formatted(OTHER)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.permission").value("VIEW"))
                .andReturn().getResponse().getContentAsString();
        UUID grant=UUID.fromString(com.jayway.jsonpath.JsonPath.read(share,"$.id"));

        mvc.perform(get("/api/v1/documents/"+document).with(token(OTHER))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/documents/"+document+"/download").with(token(OTHER))).andExpect(status().isOk());
        String launch=mvc.perform(post("/api/v1/documents/"+document+"/editor-session").with(token(OTHER)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String token=com.jayway.jsonpath.JsonPath.read(launch,"$.accessToken");
        mvc.perform(get("/wopi/files/"+document).param("access_token",token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.UserCanWrite").value(false)).andExpect(jsonPath("$.ReadOnly").value(true));
        mvc.perform(post("/wopi/files/"+document).param("access_token",token).header("X-WOPI-Override","LOCK").header("X-WOPI-Lock","view-lock"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/wopi/files/"+document+"/contents").param("access_token",token).content("not a docx"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/library/documents/"+document+"/activity").with(token(OTHER))).andExpect(status().isOk());
        mvc.perform(patch("/api/v1/library/documents/"+document).with(token(OTHER))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/me/shared-with-me").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(document.toString()));

        mvc.perform(delete("/api/v1/library/shares/"+grant).with(token(MEMBER))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/documents/"+document).with(token(OTHER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/library/documents/"+document+"/activity").with(token(OTHER))).andExpect(status().isNotFound());
    }
    @Test void disabledRecipientCannotKeepUsingOrRestoreAFormerShare() throws Exception {
        UUID folder=personal(MEMBER);
        UUID document=UUID.fromString(com.jayway.jsonpath.JsonPath.read(upload(MEMBER,folder),"$.id"));
        String body="{\"memberId\":\""+OTHER+"\",\"permission\":\"EDIT\"}";
        String result=mvc.perform(post("/api/v1/library/documents/"+document+"/shares").with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID share=UUID.fromString(com.jayway.jsonpath.JsonPath.read(result,"$.id"));
        jdbc.update("update nite_connect.members set status='DESLIGADO' where id=?",OTHER);
        mvc.perform(get("/api/v1/documents/"+document).with(token(OTHER))).andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/library/shares/"+share).with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"permission\":\"EDIT\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/library/shares/"+share).with(token(MEMBER))).andExpect(status().isNoContent());
        jdbc.update("update nite_connect.members set status='ATIVO' where id=?",OTHER);
        mvc.perform(get("/api/v1/documents/"+document).with(token(OTHER))).andExpect(status().isNotFound());
    }
    @Test void folderSharesAreInheritedWithoutExposingPrivateAncestorsAndEditCanAddContent() throws Exception {
        UUID home=personal(MEMBER);
        String folderJson=mvc.perform(post("/api/v1/library/folders").with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"parentId":"%s","name":"Compartilhada","color":"#D6A432"}
                        """.formatted(home)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID shared=UUID.fromString(com.jayway.jsonpath.JsonPath.read(folderJson,"$.id"));
        UUID document=UUID.fromString(com.jayway.jsonpath.JsonPath.read(upload(MEMBER,shared),"$.id"));
        UUID homeDocument=UUID.fromString(com.jayway.jsonpath.JsonPath.read(upload(MEMBER,home),"$.id"));
        String grant=mvc.perform(post("/api/v1/library/folders/"+shared+"/shares").with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"memberId":"%s","permission":"EDIT"}
                        """.formatted(OTHER)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID folderGrant=UUID.fromString(com.jayway.jsonpath.JsonPath.read(grant,"$.id"));
        assertThat(sharing.folderPermissions(List.of(shared),OTHER)).containsEntry(shared,"EDIT");

        mvc.perform(get("/api/v1/library/folders/"+shared).with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.folder.parentId").doesNotExist())
                .andExpect(jsonPath("$.folder.effectivePermission").value("EDIT"))
                .andExpect(jsonPath("$.files[0].effectivePermission").value("EDIT"))
                .andExpect(jsonPath("$.files.length()").value(1)).andExpect(jsonPath("$.files[0].id").value(document.toString()));
        mvc.perform(get("/api/v1/library/folders/"+home).with(token(OTHER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/documents/"+document).with(token(OTHER))).andExpect(status().isOk());

        String created=mvc.perform(post("/api/v1/library/folders").with(token(OTHER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"parentId":"%s","name":"Adição autorizada","color":"#D6A432"}
                        """.formatted(shared)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID newFolder=UUID.fromString(com.jayway.jsonpath.JsonPath.read(created,"$.id"));
        mvc.perform(delete("/api/v1/library/folders/"+newFolder).with(token(OTHER))).andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/library/documents/"+homeDocument).with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"folderId":"%s"}
                        """.formatted(shared)))
                .andExpect(status().isConflict());

        mvc.perform(delete("/api/v1/library/shares/"+folderGrant).with(token(MEMBER))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/library/folders/"+shared).with(token(OTHER))).andExpect(status().isNotFound());
    }
    @Test void directAndInheritedGrantsRemainIndependentAndWopiRechecksRevocation() throws Exception {
        UUID home=personal(MEMBER);
        String folderJson=mvc.perform(post("/api/v1/library/folders").with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"parentId":"%s","name":"Raiz compartilhada","color":"#D6A432"}
                        """.formatted(home)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID folder=UUID.fromString(com.jayway.jsonpath.JsonPath.read(folderJson,"$.id"));
        UUID document=UUID.fromString(com.jayway.jsonpath.JsonPath.read(upload(MEMBER,folder),"$.id"));
        mvc.perform(post("/api/v1/library/folders/"+folder+"/shares").with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"memberId":"%s","permission":"VIEW"}
                        """.formatted(OTHER))).andExpect(status().isCreated());
        String direct=mvc.perform(post("/api/v1/library/documents/"+document+"/shares").with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"memberId":"%s","permission":"EDIT"}
                        """.formatted(OTHER)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID directGrant=UUID.fromString(com.jayway.jsonpath.JsonPath.read(direct,"$.id"));
        String launch=mvc.perform(post("/api/v1/documents/"+document+"/editor-session").with(token(OTHER)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String wopiToken=com.jayway.jsonpath.JsonPath.read(launch,"$.accessToken");
        mvc.perform(get("/wopi/files/"+document).param("access_token",wopiToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.UserCanWrite").value(true));
        mvc.perform(post("/wopi/files/"+document).param("access_token",wopiToken).header("X-WOPI-Override","LOCK").header("X-WOPI-Lock","edit-lock"))
                .andExpect(status().isOk());
        mvc.perform(patch("/api/v1/library/shares/"+directGrant).with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"permission\":\"VIEW\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.permission").value("VIEW"));
        mvc.perform(get("/api/v1/documents/"+document).with(token(OTHER))).andExpect(status().isOk());
        mvc.perform(get("/wopi/files/"+document).param("access_token",wopiToken)).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_wopi_locks where document_id=?",Integer.class,document)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_share_events where document_id=? and action='SHARE_CHANGED'",Integer.class,document)).isEqualTo(1);
    }
    @Test void sharedRootsConsolidateInheritedItemsAndKeepFilteredKeysetPagesStable() throws Exception {
        UUID home=personal(MEMBER);
        String outerJson=mvc.perform(post("/api/v1/library/folders").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                        {"parentId":"%s","name":"Equipe","color":"#D6A432"}
                        """.formatted(home)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID outer=UUID.fromString(com.jayway.jsonpath.JsonPath.read(outerJson,"$.id"));
        String nestedJson=mvc.perform(post("/api/v1/library/folders").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                        {"parentId":"%s","name":"Privado","color":"#D6A432"}
                        """.formatted(outer)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID nested=UUID.fromString(com.jayway.jsonpath.JsonPath.read(nestedJson,"$.id"));
        UUID nestedFile=UUID.fromString(com.jayway.jsonpath.JsonPath.read(upload(MEMBER,nested),"$.id"));
        UUID rootFile=UUID.fromString(com.jayway.jsonpath.JsonPath.read(upload(MEMBER,home),"$.id"));
        mvc.perform(post("/api/v1/library/folders/"+outer+"/shares").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                        {"memberId":"%s","permission":"VIEW"}
                        """.formatted(OTHER))).andExpect(status().isCreated());
        mvc.perform(post("/api/v1/library/folders/"+nested+"/shares").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                        {"memberId":"%s","permission":"EDIT"}
                        """.formatted(OTHER))).andExpect(status().isCreated());
        mvc.perform(post("/api/v1/library/documents/"+nestedFile+"/shares").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                        {"memberId":"%s","permission":"VIEW"}
                        """.formatted(OTHER))).andExpect(status().isCreated());
        mvc.perform(post("/api/v1/library/documents/"+rootFile+"/shares").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                        {"memberId":"%s","permission":"VIEW"}
                        """.formatted(OTHER))).andExpect(status().isCreated());

        var first=mvc.perform(get("/api/v1/me/shared-with-me").queryParam("sortBy","name").queryParam("direction","asc")
                        .queryParam("limit","1").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(outer.toString())).andExpect(jsonPath("$.hasMore").value(true))
                .andReturn().getResponse().getContentAsString();
        String cursor=com.jayway.jsonpath.JsonPath.read(first,"$.nextCursor");
        mvc.perform(get("/api/v1/me/shared-with-me").queryParam("sortBy","name").queryParam("direction","asc")
                        .queryParam("limit","1").queryParam("cursor",cursor).with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(rootFile.toString())).andExpect(jsonPath("$.hasMore").value(false));
        mvc.perform(get("/api/v1/me/shared-with-me").queryParam("search","Equipe").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(outer.toString()));
        mvc.perform(get("/api/v1/me/shared-with-me").queryParam("search","sem correspondência").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(get("/api/v1/library/folders/"+nested).with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.folder.effectivePermission").value("EDIT"))
                .andExpect(jsonPath("$.files[0].effectivePermission").value("EDIT"));
    }
    @Test void projectDocumentCanBeSharedOutsideTeamWithoutExposingProjectLocation() throws Exception {
        UUID project=project();join(project,LEADER);transfer(project,LEADER);
        String result=mvc.perform(get("/api/v1/projects/"+project+"/library").with(token(LEADER)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        UUID folder=UUID.fromString(com.jayway.jsonpath.JsonPath.read(result,"$.folder.id"));
        UUID document=UUID.fromString(com.jayway.jsonpath.JsonPath.read(upload(LEADER,folder),"$.id"));
        mvc.perform(post("/api/v1/library/documents/"+document+"/shares").with(token(LEADER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"memberId":"%s","permission":"VIEW"}
                        """.formatted(OTHER))).andExpect(status().isCreated());
        mvc.perform(get("/api/v1/documents/"+document).with(token(OTHER))).andExpect(status().isOk());
        String launch=mvc.perform(post("/api/v1/documents/"+document+"/editor-session").with(token(OTHER)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String wopiToken=com.jayway.jsonpath.JsonPath.read(launch,"$.accessToken");
        mvc.perform(get("/wopi/files/"+document).param("access_token",wopiToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.OwnerId").value(document.toString()))
                .andExpect(jsonPath("$.UserCanWrite").value(false));
        mvc.perform(get("/api/v1/library/documents/"+document).with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.projectId").doesNotExist())
                .andExpect(jsonPath("$.folderId").doesNotExist()).andExpect(jsonPath("$.folderName").doesNotExist());
        mvc.perform(get("/api/v1/projects/"+project+"/library").with(token(OTHER))).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/library/folders/"+folder+"/shares").with(token(LEADER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"memberId":"%s","permission":"VIEW"}
                        """.formatted(OTHER))).andExpect(status().isNotFound());
    }
    @Test void revokingAnotherEditorsGrantPreservesTheActiveEditorsWopiLock() throws Exception {
        UUID folder=personal(MEMBER);
        UUID document=UUID.fromString(com.jayway.jsonpath.JsonPath.read(upload(MEMBER,folder),"$.id"));
        String launch=mvc.perform(post("/api/v1/documents/"+document+"/editor-session").with(token(MEMBER)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String ownerToken=com.jayway.jsonpath.JsonPath.read(launch,"$.accessToken");
        mvc.perform(post("/wopi/files/"+document).param("access_token",ownerToken)
                        .header("X-WOPI-Override","LOCK").header("X-WOPI-Lock","owner-lock"))
                .andExpect(status().isOk());
        String grant=mvc.perform(post("/api/v1/library/documents/"+document+"/shares").with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"memberId":"%s","permission":"VIEW"}
                        """.formatted(OTHER)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID grantId=UUID.fromString(com.jayway.jsonpath.JsonPath.read(grant,"$.id"));
        mvc.perform(delete("/api/v1/library/shares/"+grantId).with(token(MEMBER))).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select actor_id from nite_connect.document_wopi_locks where document_id=?",UUID.class,document)).isEqualTo(MEMBER);
        mvc.perform(post("/wopi/files/"+document).param("access_token",ownerToken)
                        .header("X-WOPI-Override","REFRESH_LOCK").header("X-WOPI-Lock","owner-lock"))
                .andExpect(status().isOk());
    }
    @Test void shareRecipientSearchOnlyReturnsOtherActiveMembers() throws Exception {
        String response=mvc.perform(get("/api/v1/library/share-recipients").param("search","Tes").with(token(MEMBER)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(com.jayway.jsonpath.JsonPath.<java.util.List<String>>read(response,"$[*].id"))
                .contains(ADMIN.toString(),LEADER.toString(),OTHER.toString()).doesNotContain(MEMBER.toString());
        jdbc.update("update nite_connect.members set status='DESLIGADO' where id=?",OTHER);
        String after=mvc.perform(get("/api/v1/library/share-recipients").param("search","Tes").with(token(MEMBER)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(com.jayway.jsonpath.JsonPath.<java.util.List<String>>read(after,"$[*].id")).doesNotContain(OTHER.toString());
        mvc.perform(get("/api/v1/library/share-recipients").param("search","T").with(token(MEMBER))).andExpect(status().isBadRequest());
    }
    @Test void concurrentDuplicateSharesCreateOnlyOneActiveGrant() throws Exception {
        UUID folder=personal(MEMBER);
        UUID document=UUID.fromString(com.jayway.jsonpath.JsonPath.read(upload(MEMBER,folder),"$.id"));
        String body="{\"memberId\":\""+OTHER+"\",\"permission\":\"VIEW\"}";
        var start=new java.util.concurrent.CountDownLatch(1);
        var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            java.util.concurrent.Callable<Integer> request=()->{
                start.await();
                return mvc.perform(post("/api/v1/library/documents/"+document+"/shares").with(token(MEMBER))
                                .contentType(MediaType.APPLICATION_JSON).content(body))
                        .andReturn().getResponse().getStatus();
            };
            var first=pool.submit(request);var second=pool.submit(request);start.countDown();
            assertThat(java.util.List.of(first.get(),second.get())).containsExactlyInAnyOrder(201,409);
        } finally {pool.shutdownNow();}
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_grants where document_id=? and member_id=? and revoked_at is null",Integer.class,document,OTHER)).isEqualTo(1);
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
    @Test void personalFolderSearchAndSortingAreAppliedByTheServer() throws Exception {
        UUID home=personal(MEMBER);
        for(String name:List.of("Beta","Alpha")) mvc.perform(post("/api/v1/library/folders").with(token(MEMBER))
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"parentId":"%s","name":"%s","color":"#D6A432"}
                """.formatted(home,name))).andExpect(status().isCreated());
        mvc.perform(get("/api/v1/me/library").queryParam("search","Alp").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.folders.length()").value(1))
                .andExpect(jsonPath("$.folders[0].name").value("Alpha"));
        mvc.perform(get("/api/v1/me/library").queryParam("sortBy","name").queryParam("direction","desc").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.folders[0].name").value("Beta"))
                .andExpect(jsonPath("$.folders[1].name").value("Alpha"));
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

    @Test void anActiveMemberCannotArchivePersonalFilesOrFolders() throws Exception {
        UUID home=personal(MEMBER);
        String created=mvc.perform(post("/api/v1/library/folders").with(token(MEMBER))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"parentId":"%s","name":"Pasta protegida","color":"#D6A432"}
                        """.formatted(home)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID folder=UUID.fromString(com.jayway.jsonpath.JsonPath.read(created,"$.id"));
        String uploaded=upload(MEMBER,folder);
        UUID file=UUID.fromString(com.jayway.jsonpath.JsonPath.read(uploaded,"$.id"));

        mvc.perform(delete("/api/v1/library/documents/"+file).with(token(MEMBER)))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/library/folders/"+folder).queryParam("recursive","true").with(token(MEMBER)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/library/folders/"+folder).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.files[0].id").value(file.toString()));
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
