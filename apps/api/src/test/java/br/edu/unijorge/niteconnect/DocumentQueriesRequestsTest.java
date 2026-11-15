package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
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
class DocumentQueriesRequestsTest extends ProjectTestSupport {
    @Autowired DocumentFoundationTest.InMemoryStore store;
    @Autowired DocumentRepository documents;
    private UUID home(UUID actor) throws Exception {
        String body=mvc.perform(get("/api/v1/me/library").with(token(actor))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(com.jayway.jsonpath.JsonPath.read(body,"$.folder.id"));
    }
    private UUID folder(UUID actor,UUID parent) throws Exception {
        String body=mvc.perform(post("/api/v1/library/folders").with(token(actor)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"parentId\":\""+parent+"\",\"name\":\"Recebidos\",\"color\":\"#D6A432\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(com.jayway.jsonpath.JsonPath.read(body,"$.id"));
    }
    private UUID upload(UUID actor,UUID folder,String name) throws Exception {
        var body=mvc.perform(multipart("/api/v1/library/folders/"+folder+"/files")
                .file(new MockMultipartFile("file",name,"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        DocxIntegrityTest.docx("Versão original"))).param("title",name).with(token(actor)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(com.jayway.jsonpath.JsonPath.read(body,"$.id"));
    }
    @Test void requestRecipientUploadsWithoutBrowsingDestinationAndCancellationStopsFurtherUploads() throws Exception {
        UUID destination=folder(MEMBER,home(MEMBER));
        String body=mvc.perform(post("/api/v1/file-requests").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"targetFolderId\":\""+destination+"\",\"recipientIds\":[\""+OTHER+"\"]}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID request=UUID.fromString(com.jayway.jsonpath.JsonPath.read(body,"$.id"));
        mvc.perform(get("/api/v1/file-requests/"+request).with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.targetFolderId").doesNotExist());
        mvc.perform(get("/api/v1/library/folders/"+destination).with(token(OTHER))).andExpect(status().isNotFound());
        var uploaded=mvc.perform(multipart("/api/v1/file-requests/"+request+"/uploads")
                .file(new MockMultipartFile("file","Resposta.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        DocxIntegrityTest.docx("Resposta")))
                .param("title","Resposta.docx").with(token(OTHER)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID doc=UUID.fromString(com.jayway.jsonpath.JsonPath.read(uploaded,"$.documentId"));
        mvc.perform(get("/api/v1/library/documents/"+doc).with(token(OTHER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/library/documents/"+doc+"/info").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.identity.origin").value("FILE_REQUEST_UPLOAD"))
                .andExpect(jsonPath("$.createdBy").value(OTHER.toString()));
        mvc.perform(post("/api/v1/file-requests/"+request+"/cancel").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        mvc.perform(multipart("/api/v1/file-requests/"+request+"/uploads")
                .file(new MockMultipartFile("file","Outro.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        DocxIntegrityTest.docx("Outro"))).param("title","Outro.docx").with(token(OTHER)))
                .andExpect(status().isConflict());
    }
    @Test void sentViewAccessOriginAndOldLinkFollowGrantRevocation() throws Exception {
        UUID root=home(MEMBER),doc=upload(MEMBER,root,"Compartilhado.docx");
        String granted=mvc.perform(post("/api/v1/library/documents/"+doc+"/shares").with(token(MEMBER))
                .contentType(MediaType.APPLICATION_JSON).content("{\"memberId\":\""+OTHER+"\",\"permission\":\"VIEW\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID grant=UUID.fromString(com.jayway.jsonpath.JsonPath.read(granted,"$.id"));
        mvc.perform(get("/api/v1/me/shared-by-me").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(doc.toString()))
                .andExpect(jsonPath("$.items[0].recipients[0].memberId").value(OTHER.toString()));
        mvc.perform(get("/api/v1/library/documents/"+doc+"/access").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.grants[0].origin").value("DIRECT"))
                .andExpect(jsonPath("$.canManage").value(false));
        mvc.perform(get("/api/v1/library/links/document/"+doc).with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.url").value("/documentos/"+doc));
        mvc.perform(delete("/api/v1/library/shares/"+grant).with(token(MEMBER))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/library/links/document/"+doc).with(token(OTHER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/me/shared-by-me").with(token(MEMBER))).andExpect(jsonPath("$.items.length()").value(0));
    }
    @Test void inheritedAndDirectGrantsDoNotDuplicateReceivedDocument() throws Exception {
        UUID sharedFolder=folder(MEMBER,home(MEMBER));
        UUID doc=upload(MEMBER,sharedFolder,"Herdado.docx");
        String folderShare=mvc.perform(post("/api/v1/library/folders/"+sharedFolder+"/shares").with(token(MEMBER))
                .contentType(MediaType.APPLICATION_JSON).content("{\"memberId\":\""+OTHER+"\",\"permission\":\"VIEW\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID folderGrant=UUID.fromString(com.jayway.jsonpath.JsonPath.read(folderShare,"$.id"));
        mvc.perform(get("/api/v1/library/documents/"+doc+"/access").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.grants[0].origin").value("INHERITED"));
        mvc.perform(post("/api/v1/library/documents/"+doc+"/shares").with(token(MEMBER))
                .contentType(MediaType.APPLICATION_JSON).content("{\"memberId\":\""+OTHER+"\",\"permission\":\"EDIT\"}"))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/v1/library/documents/"+doc+"/access").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.grants.length()").value(2))
                .andExpect(jsonPath("$.capabilities.canEdit").value(true));
        mvc.perform(get("/api/v1/me/shared-with-me").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(delete("/api/v1/library/shares/"+folderGrant).with(token(MEMBER))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/library/documents/"+doc+"/access").with(token(OTHER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.grants.length()").value(1));
    }
    @Test void historicVersionCanBeDownloadedAndRestoredAsNewRevision() throws Exception {
        UUID doc=upload(MEMBER,home(MEMBER),"Versoes.docx");
        DocumentRepository.Document before=documents.require(doc);
        byte[] second=DocxIntegrityTest.docx("Segunda versão");
        UUID secondObject=UUID.randomUUID();store.put(secondObject,second);
        documents.promote(before,secondObject,second.length,br.edu.unijorge.niteconnect.documents.domain.DocxIntegrity.sha256(second),MEMBER);
        mvc.perform(get("/api/v1/documents/"+doc+"/versions").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].objectId").doesNotExist());
        mvc.perform(get("/api/v1/documents/"+doc+"/versions/"+before.versionId()+"/download").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(content().bytes(store.objects.get(before.objectId())));
        mvc.perform(post("/api/v1/documents/"+doc+"/versions/"+before.versionId()+"/restore").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(3));
        DocumentRepository.Document restored=documents.require(doc);
        assertThat(restored.objectId()).isNotEqualTo(before.objectId()).isNotEqualTo(secondObject);
        assertThat(store.objects.get(restored.objectId())).isEqualTo(store.objects.get(before.objectId()));
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_versions where document_id=?",Integer.class,doc)).isEqualTo(3);
        mvc.perform(get("/api/v1/documents/"+doc+"/versions").with(token(OTHER))).andExpect(status().isNotFound());
    }
    @Test void searchFiltersAuthorizedResourcesAndUsesStableCursor() throws Exception {
        UUID root=home(MEMBER);
        UUID first=upload(MEMBER,root,"Busca A.docx");
        UUID second=upload(MEMBER,root,"Busca B.docx");
        mvc.perform(get("/api/v1/library/search").with(token(OTHER)).param("search","Busca"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));
        String page=mvc.perform(get("/api/v1/library/search").with(token(MEMBER)).param("search","Busca")
                        .param("type","DOCUMENT").param("sortBy","name").param("direction","asc").param("limit","1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(first.toString()))
                .andExpect(jsonPath("$.hasMore").value(true)).andReturn().getResponse().getContentAsString();
        String cursor=com.jayway.jsonpath.JsonPath.read(page,"$.nextCursor");
        mvc.perform(get("/api/v1/library/search").with(token(MEMBER)).param("search","Busca")
                        .param("type","DOCUMENT").param("sortBy","name").param("direction","asc")
                        .param("limit","1").param("cursor",cursor))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(second.toString()));
        mvc.perform(get("/api/v1/library/search").with(token(MEMBER)).param("search","Outra")
                        .param("type","DOCUMENT").param("sortBy","name").param("direction","asc")
                        .param("limit","1").param("cursor",cursor)).andExpect(status().isBadRequest());
    }
}
