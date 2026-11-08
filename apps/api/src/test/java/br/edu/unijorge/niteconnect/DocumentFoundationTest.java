package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.documents.application.CollaboraDiscovery;
import br.edu.unijorge.niteconnect.documents.application.DocumentObjectStore;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.TestPropertySource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import java.util.UUID;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Import(DocumentFoundationTest.Stubs.class)
@TestPropertySource(properties={
        "nite.documents.enabled=true",
        "nite.documents.storage.provider=test",
        "nite.documents.wopi-public-base-url=http://host.docker.internal:8080",
        "nite.documents.allow-insecure-dev=true",
        "nite.documents.collabora.discovery-url=http://localhost:9980/hosting/discovery"
})
class DocumentFoundationTest extends ProjectTestSupport {
    @TestConfiguration
    static class Stubs {
        @Bean @Primary InMemoryStore fakeDocumentObjectStore() { return new InMemoryStore(); }
        @Bean @Primary CollaboraDiscovery fakeDiscovery() {
            return new CollaboraDiscovery("http://localhost:9980/hosting/discovery") {
                @Override public String editUrl() { return "http://localhost:9980/browser/test/cool.html?"; }
            };
        }
    }
    static class InMemoryStore implements DocumentObjectStore {
        final Map<UUID,byte[]> objects=new ConcurrentHashMap<>();
        volatile boolean rejectWrite=false;
        @Override public void put(UUID objectId,byte[] bytes) {
            if(rejectWrite) throw new br.edu.unijorge.niteconnect.shared.api.ApiException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"S3 fora do ar");
            objects.put(objectId,bytes.clone());
        }
        @Override public byte[] get(UUID objectId) {
            byte[] bytes=objects.get(objectId);
            if(bytes==null) throw new IllegalStateException("Objeto não encontrado");
            return bytes.clone();
        }
        @Override public void deleteOrphan(UUID objectId) { objects.remove(objectId); }
    }
    @Autowired InMemoryStore store;

    private UUID upload(UUID actor,byte[] bytes) throws Exception {
        String response=mvc.perform(multipart("/api/v1/me/documents")
                        .file(new MockMultipartFile("file","relatorio.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document",bytes))
                        .param("title","Relatório Individual")
                        .with(token(actor)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.revision").value(1))
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(com.jayway.jsonpath.JsonPath.read(response,"$.id"));
    }
    private String session(UUID actor,UUID doc) throws Exception {
        String response=mvc.perform(post("/api/v1/documents/"+doc+"/editor-session").with(token(actor)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.actionUrl").value(org.hamcrest.Matchers.containsString("WOPISrc=")))
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(response,"$.accessToken");
    }
    @Test void uploadAuthorizationAndWopiTokenAreBoundToMemberAndDocument() throws Exception {
        UUID doc=upload(MEMBER,DocxIntegrityTest.docx("Primeira versão"));
        mvc.perform(get("/api/v1/documents/"+doc).with(token(OTHER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/documents/"+doc).with(token(ADMIN))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/me/documents").with(token(MEMBER))).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(doc.toString()));
        mvc.perform(post("/api/v1/documents/"+doc+"/editor-session").with(token(OTHER)))
                .andExpect(status().isNotFound());
        String token=session(MEMBER,doc);
        mvc.perform(post("/wopi/files/"+doc+"/contents").queryParam("access_token","invalid")
                .content(DocxIntegrityTest.docx("Tentativa indevida"))).andExpect(status().isNotFound());
        mvc.perform(get("/wopi/files/"+doc).queryParam("access_token",token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.UserCanWrite").value(true));
        mvc.perform(get("/wopi/files/"+doc).queryParam("access_token","untrusted"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/wopi/files/"+UUID.randomUUID()).queryParam("access_token",token))
                .andExpect(status().isNotFound());
        jdbc.update("update nite_connect.document_wopi_sessions set revoked_at=clock_timestamp() where document_id=?",doc);
        mvc.perform(get("/wopi/files/"+doc).queryParam("access_token",token))
                .andExpect(status().isNotFound());
    }
    @Test void locksProtectWritesAndPersistAcrossReopenWithoutFalseVersions() throws Exception {
        byte[] first=DocxIntegrityTest.docx("Original");
        byte[] changed=DocxIntegrityTest.docx("Tabela alterada");
        UUID doc=upload(MEMBER,first);
        String access=session(MEMBER,doc);
        String file="/wopi/files/"+doc;
        mvc.perform(post(file).queryParam("access_token",access).header("X-WOPI-Override","LOCK")
                .header("X-WOPI-Lock","editor-lock-1")).andExpect(status().isOk());
        mvc.perform(post(file+"/contents").queryParam("access_token",access).contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header("X-WOPI-Lock","different-lock").content(changed))
                .andExpect(status().isConflict()).andExpect(header().string("X-WOPI-Lock","editor-lock-1"));
        mvc.perform(post(file+"/contents").queryParam("access_token",access).contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header("X-WOPI-Lock","editor-lock-1").content(changed))
                .andExpect(status().isOk());
        mvc.perform(post(file+"/contents").queryParam("access_token",access).contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header("X-WOPI-Lock","editor-lock-1").content(changed))
                .andExpect(status().isOk());
        mvc.perform(get(file+"/contents").queryParam("access_token",access))
                .andExpect(status().isOk()).andExpect(content().bytes(changed));
        mvc.perform(get("/api/v1/documents/"+doc).with(token(MEMBER)))
                .andExpect(jsonPath("$.revision").value(2));
        mvc.perform(post(file).queryParam("access_token",access).header("X-WOPI-Override","UNLOCK")
                .header("X-WOPI-Lock","editor-lock-1")).andExpect(status().isOk());
        // A writer started before this revision cannot overwrite it without a shared WOPI lock.
        String stale=session(MEMBER,doc);
        byte[] newer=DocxIntegrityTest.docx("Nova edição");
        mvc.perform(post(file+"/contents").queryParam("access_token",access).content(newer))
                .andExpect(status().isOk());
        mvc.perform(post(file+"/contents").queryParam("access_token",stale).content(first))
                .andExpect(status().isConflict());
        mvc.perform(get("/api/v1/documents/"+doc+"/download").with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(content().bytes(newer));
    }
    @Test void failedStorageNeverAdvancesRevision() throws Exception {
        byte[] original=DocxIntegrityTest.docx("Preservar");
        UUID doc=upload(MEMBER,original);
        String token=session(MEMBER,doc);
        store.rejectWrite=true;
        try {
            mvc.perform(post("/wopi/files/"+doc+"/contents").queryParam("access_token",token)
                    .content(DocxIntegrityTest.docx("Conteúdo perdido")))
                    .andExpect(status().isServiceUnavailable());
        } finally { store.rejectWrite=false; }
        mvc.perform(get("/api/v1/documents/"+doc).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1));
        mvc.perform(get("/wopi/files/"+doc+"/contents").queryParam("access_token",token))
                .andExpect(status().isOk()).andExpect(content().bytes(original));
    }
}
