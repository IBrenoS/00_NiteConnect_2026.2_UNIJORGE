package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.documents.application.DocumentLibraryOperationsService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.UUID;
import java.util.zip.ZipInputStream;
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
class DocumentLibraryOperationsTest extends ProjectTestSupport {
    @Autowired DocumentFoundationTest.InMemoryStore store;
    @Autowired DocumentLibraryOperationsService operations;
    private UUID home(UUID actor) throws Exception {
        String body=mvc.perform(get("/api/v1/me/library").with(token(actor))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(com.jayway.jsonpath.JsonPath.read(body,"$.folder.id"));
    }
    private UUID upload(UUID actor,UUID folder,String name) throws Exception {
        String body=mvc.perform(multipart("/api/v1/library/folders/"+folder+"/files")
                .file(new MockMultipartFile("file",name,"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        DocxIntegrityTest.docx("Cópia independente")))
                .param("title",name).with(token(actor))).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(com.jayway.jsonpath.JsonPath.read(body,"$.id"));
    }
    private UUID folder(UUID actor,UUID parent,String name) throws Exception {
        String body=mvc.perform(post("/api/v1/library/folders").with(token(actor)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"parentId\":\""+parent+"\",\"name\":\""+name+"\",\"color\":\"#D6A432\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(com.jayway.jsonpath.JsonPath.read(body,"$.id"));
    }
    @Test void copyCreatesIndependentObjectAndPreservesProvenance() throws Exception {
        UUID home=home(MEMBER),source=upload(MEMBER,home,"Original.docx");
        mvc.perform(get("/api/v1/library/documents/"+source).with(token(MEMBER)))
                .andExpect(jsonPath("$.capabilities.canCopy").value(true));
        String body=mvc.perform(post("/api/v1/library/documents/"+source+"/copy").with(token(MEMBER))
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Cópia.docx\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID copy=UUID.fromString(com.jayway.jsonpath.JsonPath.read(body,"$.id"));
        assertThat(copy).isNotEqualTo(source);
        var originals=jdbc.queryForMap("select d.created_by,d.resource_owner_id,d.origin,d.protection,v.object_id,v.sha256 from nite_connect.documents d join nite_connect.document_versions v on v.id=d.current_version_id where d.id=?",source);
        var copied=jdbc.queryForMap("select d.copied_from_id,d.created_by,d.resource_owner_id,d.origin,d.protection,v.object_id,v.sha256 from nite_connect.documents d join nite_connect.document_versions v on v.id=d.current_version_id where d.id=?",copy);
        assertThat(copied.get("copied_from_id")).isEqualTo(source);
        assertThat(copied.get("object_id")).isNotEqualTo(originals.get("object_id"));
        assertThat(copied.get("sha256")).isEqualTo(originals.get("sha256"));
        assertThat(copied.get("resource_owner_id")).isEqualTo(MEMBER);
        assertThat(copied.get("created_by")).isEqualTo(MEMBER);
        assertThat(copied.get("origin")).isEqualTo(originals.get("origin"));
        assertThat(copied.get("protection")).isEqualTo(originals.get("protection"));
        assertThat(store.objects.get(copied.get("object_id"))).isEqualTo(store.objects.get(originals.get("object_id")));
    }
    @Test void protectedDescendantBlocksFolderCopyAndGrantDoesNotEnableCopy() throws Exception {
        UUID home=home(MEMBER),root=folder(MEMBER,home,"Mista"),normal=upload(MEMBER,root,"Normal.docx");
        upload(ADMIN,root,"Gestão.docx");
        mvc.perform(post("/api/v1/library/folders/"+root+"/copy").with(token(MEMBER))
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Clone\"}"))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_folders where parent_id=? and name='Clone'",Integer.class,home)).isZero();
        mvc.perform(post("/api/v1/library/documents/"+normal+"/shares").with(token(MEMBER))
                .contentType(MediaType.APPLICATION_JSON).content("{\"memberId\":\""+OTHER+"\",\"permission\":\"EDIT\"}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/v1/library/documents/"+normal+"/copy").with(token(OTHER))
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Outra.docx\"}"))
                .andExpect(status().isForbidden());
    }
    @Test void recursiveCopyUsesIndependentIdsAndDoesNotCopyGrants() throws Exception {
        UUID home=home(MEMBER),source=folder(MEMBER,home,"Origem"),nested=folder(MEMBER,source,"Filha");
        UUID original=upload(MEMBER,nested,"Filho.docx");
        mvc.perform(post("/api/v1/library/folders/"+source+"/shares").with(token(MEMBER))
                .contentType(MediaType.APPLICATION_JSON).content("{\"memberId\":\""+OTHER+"\",\"permission\":\"VIEW\"}"))
                .andExpect(status().isCreated());
        String body=mvc.perform(post("/api/v1/library/folders/"+source+"/copy").with(token(MEMBER))
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Cópia\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID copied=UUID.fromString(com.jayway.jsonpath.JsonPath.read(body,"$.id"));
        UUID child=jdbc.queryForObject("select id from nite_connect.document_folders where parent_id=?",UUID.class,copied);
        UUID doc=jdbc.queryForObject("select id from nite_connect.documents where folder_id=?",UUID.class,child);
        assertThat(copied).isNotEqualTo(source);
        assertThat(child).isNotEqualTo(nested);
        assertThat(doc).isNotEqualTo(original);
        assertThat(jdbc.queryForObject("select copied_from_id from nite_connect.documents where id=?",UUID.class,doc)).isEqualTo(original);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_grants where folder_id=?",Integer.class,copied)).isZero();
        mvc.perform(get("/api/v1/library/folders/"+copied).with(token(OTHER))).andExpect(status().isNotFound());
    }
    @Test void batchTrashRejectsMixedOwnershipWithoutPartialChange() throws Exception {
        UUID home=home(MEMBER),first=upload(MEMBER,home,"Primeiro.docx"),second=upload(ADMIN,home,"Gestão.docx");
        String body="{\"action\":\"TRASH\",\"items\":[{\"type\":\"DOCUMENT\",\"id\":\""+first
                +"\"},{\"type\":\"DOCUMENT\",\"id\":\""+second+"\"}]}";
        mvc.perform(post("/api/v1/library/operations/preview").with(token(MEMBER))
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.blockers.length()").value(1));
        mvc.perform(post("/api/v1/library/operations/batch").with(token(MEMBER))
                .header("Idempotency-Key","mixed").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select lifecycle_state from nite_connect.documents where id=?",String.class,first)).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("select lifecycle_state from nite_connect.documents where id=?",String.class,second)).isEqualTo("ACTIVE");
    }
    @Test void batchCopyUsesNamesAndReplaysSameResult() throws Exception {
        UUID home=home(MEMBER),doc=upload(MEMBER,home,"Lote.docx");
        String body="{\"action\":\"COPY\",\"items\":[{\"type\":\"DOCUMENT\",\"id\":\""+doc
                +"\",\"name\":\"Lote copiado.docx\"}],\"destinationId\":\""+home+"\"}";
        String first=mvc.perform(post("/api/v1/library/operations/batch").with(token(MEMBER))
                .header("Idempotency-Key","copy-once").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String second=mvc.perform(post("/api/v1/library/operations/batch").with(token(MEMBER))
                .header("Idempotency-Key","copy-once").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(second).isEqualTo(first);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.documents where copied_from_id=?",Integer.class,doc)).isEqualTo(1);
        mvc.perform(post("/api/v1/library/operations/batch").with(token(MEMBER))
                .header("Idempotency-Key","copy-once").contentType(MediaType.APPLICATION_JSON)
                .content(body.replace("Lote copiado.docx","Diferente.docx"))).andExpect(status().isConflict());
    }
    @Test void favoriteDoesNotPreserveRevokedAccessAndBatchIsIdempotent() throws Exception {
        UUID home=home(MEMBER),doc=upload(MEMBER,home,"Favorito.docx");
        mvc.perform(put("/api/v1/me/favorites/DOCUMENT/"+doc).with(token(MEMBER))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/me/favorites").with(token(MEMBER))).andExpect(jsonPath("$[0].id").value(doc.toString()));
        String body="{\"action\":\"COPY\",\"items\":[{\"type\":\"DOCUMENT\",\"id\":\""+doc+"\"}],\"destinationId\":\""+home+"\"}";
        // A copy to the same folder requires a new name, so preflight succeeds but mutation rejects the collision atomically.
        mvc.perform(post("/api/v1/library/operations/batch").with(token(MEMBER)).header("Idempotency-Key","collision")
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict());
        String favoriteBatch="{\"action\":\"FAVORITE\",\"items\":[{\"type\":\"DOCUMENT\",\"id\":\""+doc+"\"}]}";
        for(int i=0;i<2;i++) mvc.perform(post("/api/v1/library/operations/batch").with(token(MEMBER))
                .header("Idempotency-Key","fav-1").contentType(MediaType.APPLICATION_JSON).content(favoriteBatch))
                .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_operation_receipts where actor_id=?",Integer.class,MEMBER)).isEqualTo(1);
        mvc.perform(post("/api/v1/library/documents/"+doc+"/trash").with(token(MEMBER))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/me/favorites").with(token(MEMBER))).andExpect(jsonPath("$.length()").value(0));
    }
    @Test void uploadDirectoryCreatesEmptyDirectoriesAndRepeatDoesNotDuplicate() throws Exception {
        UUID home=home(MEMBER);
        var request=multipart("/api/v1/library/folders/"+home+"/upload-directory").with(token(MEMBER));
        request.param("directories","Projeto/Vazio");
        mvc.perform(request).andExpect(status().isCreated()).andExpect(jsonPath("$.folders.length()").value(2));
        var again=multipart("/api/v1/library/folders/"+home+"/upload-directory").with(token(MEMBER));
        again.param("directories","Projeto/Vazio");
        mvc.perform(again).andExpect(status().isCreated()).andExpect(jsonPath("$.folders.length()").value(0));
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_folders where name='Vazio'",Integer.class)).isEqualTo(1);
    }
    @Test void uploadDirectoryRetryReturnsExistingFileAndRejectsDeepPaths() throws Exception {
        UUID home=home(MEMBER);
        byte[] bytes=DocxIntegrityTest.docx("Diretório completo");
        for(int attempt=0;attempt<2;attempt++) {
            var request=multipart("/api/v1/library/folders/"+home+"/upload-directory").with(token(MEMBER));
            request.file(new MockMultipartFile("files","item.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document",bytes));
            request.param("paths","Pai/Filha/item.docx");
            mvc.perform(request).andExpect(status().isCreated()).andExpect(jsonPath("$.files.length()").value(1));
        }
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.documents where title='item.docx'",Integer.class)).isEqualTo(1);
        var deep=multipart("/api/v1/library/folders/"+home+"/upload-directory").with(token(MEMBER));
        deep.param("directories",String.join("/",java.util.Collections.nCopies(33,"nivel")));
        mvc.perform(deep).andExpect(status().isBadRequest());
    }
    @Test void holdAndUnknownOwnershipBlockCopyEvenForAdministrator() throws Exception {
        UUID home=home(MEMBER),doc=upload(MEMBER,home,"Guardado.docx");
        jdbc.update("update nite_connect.documents set retention_hold=true where id=?",doc);
        mvc.perform(post("/api/v1/library/documents/"+doc+"/copy").with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Cópia.docx\"}"))
                .andExpect(status().isForbidden());
        jdbc.update("update nite_connect.documents set retention_hold=false,resource_owner_kind='UNKNOWN',resource_owner_id=null where id=?",doc);
        mvc.perform(post("/api/v1/library/documents/"+doc+"/copy").with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Cópia.docx\"}"))
                .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.documents where copied_from_id=?",Integer.class,doc)).isZero();
    }
    @Test void storageFailureDoesNotCreateCopyOrRevision() throws Exception {
        UUID home=home(MEMBER),doc=upload(MEMBER,home,"Falha.docx");
        int before=store.objects.size();
        store.rejectWrite=true;
        try {
            mvc.perform(post("/api/v1/library/documents/"+doc+"/copy").with(token(MEMBER))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Falha copiada.docx\"}"))
                    .andExpect(status().isServiceUnavailable());
        } finally {store.rejectWrite=false;}
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.documents where copied_from_id=?",Integer.class,doc)).isZero();
        assertThat(store.objects).hasSize(before);
    }
    @Test void zipPreservesFolderStructureAndEmptyChild() throws Exception {
        UUID home=home(MEMBER),root=folder(MEMBER,home,"Pacote"),empty=folder(MEMBER,root,"Vazia");
        upload(MEMBER,root,"Dentro.docx");
        var stream=operations.zip(MEMBER,List.of(new DocumentLibraryOperationsService.Resource("FOLDER",root)));
        ByteArrayOutputStream out=new ByteArrayOutputStream();stream.writeTo(out);
        java.util.Set<String> entries=new java.util.HashSet<>();
        try(ZipInputStream zip=new ZipInputStream(new java.io.ByteArrayInputStream(out.toByteArray()))) {
            java.util.zip.ZipEntry entry;
            while((entry=zip.getNextEntry())!=null) entries.add(entry.getName());
        }
        assertThat(entries).contains("Pacote/","Pacote/Vazia/","Pacote/Dentro.docx");
    }
    @Test void zipRejectsPrivateItemAndStreamsAuthorizedContent() throws Exception {
        UUID own=upload(MEMBER,home(MEMBER),"ZIP.docx"),other=upload(OTHER,home(OTHER),"Privado.docx");
        assertThatThrownBy(()->operations.zip(MEMBER,List.of(new DocumentLibraryOperationsService.Resource("DOCUMENT",own),
                new DocumentLibraryOperationsService.Resource("DOCUMENT",other))))
                .isInstanceOf(br.edu.unijorge.niteconnect.shared.api.ApiException.class);
        var stream=operations.zip(MEMBER,List.of(new DocumentLibraryOperationsService.Resource("DOCUMENT",own)));
        ByteArrayOutputStream out=new ByteArrayOutputStream();stream.writeTo(out);
        try(ZipInputStream zip=new ZipInputStream(new java.io.ByteArrayInputStream(out.toByteArray()))) {
            assertThat(zip.getNextEntry().getName()).isEqualTo("ZIP.docx");
            assertThat(zip.readAllBytes()).isEqualTo(store.objects.get(jdbc.queryForObject(
                    "select object_id from nite_connect.document_versions where document_id=?",UUID.class,own)));
        }
    }
}
