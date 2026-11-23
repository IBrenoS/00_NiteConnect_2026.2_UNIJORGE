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
@TestPropertySource(properties={"nite.documents.enabled=true","nite.documents.storage.provider=test",
        "nite.documents.wopi-public-base-url=http://host.docker.internal:8080","nite.documents.allow-insecure-dev=true",
        "nite.documents.collabora.discovery-url=http://localhost:9980/hosting/discovery"})
class InstitutionalLibraryTest extends ProjectTestSupport {
    @org.springframework.beans.factory.annotation.Autowired br.edu.unijorge.niteconnect.access.application.AccessService access;
    @org.springframework.beans.factory.annotation.Autowired br.edu.unijorge.niteconnect.documents.application.DocumentCapabilityService capabilities;
    @org.springframework.beans.factory.annotation.Autowired br.edu.unijorge.niteconnect.documents.infrastructure.DocumentPurgeRepository purgeRepository;
    @org.springframework.beans.factory.annotation.Autowired br.edu.unijorge.niteconnect.documents.application.DocumentRetentionPolicyService retention;
    @org.springframework.beans.factory.annotation.Autowired br.edu.unijorge.niteconnect.documents.application.DocumentPurgeActivationService activation;
    @org.springframework.beans.factory.annotation.Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;
    @org.springframework.beans.factory.annotation.Autowired DocumentFoundationTest.InMemoryStore store;
    private static final String DOCX="application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    @Test void reportsRequireExplicitClassificationAndNeverIncludePersonalDocuments() throws Exception {
        UUID parent=folder(library(),"Relatórios"),child=folder(parent,"Mensais"),document=upload(ADMIN,child);
        mvc.perform(post("/api/v1/library/folders/"+parent+"/shares").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\""+MEMBER+"\",\"permission\":\"EDIT\"}")).andExpect(status().isCreated());
        String query="/api/v1/library/members/"+MEMBER+"/documents?reportsOnly=true";
        mvc.perform(get(query).with(token(ADMIN))).andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
        String classify="/api/v1/library/documents/"+document+"/classification";
        mvc.perform(put(classify).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON).content("{\"classification\":\"REPORT\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(put(classify).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON).content("{\"classification\":\"REPORT\"}"))
                .andExpect(status().isNoContent());
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_GERAL',?,'Teste')",LEADER,ADMIN);
        mvc.perform(put(classify).with(token(LEADER)).contentType(MediaType.APPLICATION_JSON).content("{\"classification\":\"REPORT\"}"))
                .andExpect(status().isNoContent()); // Idempotent classification does not duplicate events or content.
        mvc.perform(get(query).with(token(ADMIN))).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(parent.toString())).andExpect(jsonPath("$.items[0].capabilities.canView").value(true));
        mvc.perform(get(query+"&parentId="+child).with(token(ADMIN))).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(document.toString())).andExpect(jsonPath("$.items[0].mimeType").value(DOCX));
        mvc.perform(get(query).with(token(MEMBER))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/library/members/"+OTHER+"/documents?reportsOnly=true").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
        String personal=mvc.perform(get("/api/v1/me/library").with(token(MEMBER))).andReturn().getResponse().getContentAsString();
        UUID privateDocument=upload(MEMBER,id(personal,"$.folder.id"));
        mvc.perform(put("/api/v1/library/documents/"+privateDocument+"/classification").with(token(ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content("{\"classification\":\"REPORT\"}")).andExpect(status().isConflict());
        jdbc.update("update nite_connect.documents set classification='REPORT',resource_owner_kind='INSTITUTION',resource_owner_id=null,created_for=? where id=?",MEMBER,privateDocument);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_events where document_id=? and action='DOCUMENT_CLASSIFIED'",Integer.class,document)).isEqualTo(1);
        mvc.perform(put(classify).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON).content("{\"classification\":\"GENERAL\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get(query).with(token(ADMIN))).andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
    }
    private UUID id(String json,String path) {return UUID.fromString(com.jayway.jsonpath.JsonPath.read(json,path));}
    private UUID library() throws Exception {
        return id(mvc.perform(get("/api/v1/library/institutional").with(token(ADMIN)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.folder.id");
    }
    private UUID folder(UUID parent,String name) throws Exception {
        return id(mvc.perform(post("/api/v1/library/folders").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"parentId\":\""+parent+"\",\"name\":\""+name+"\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(),"$.id");
    }
    private UUID upload(UUID actor,UUID folder) throws Exception {
        return id(mvc.perform(multipart("/api/v1/library/folders/"+folder+"/files").with(token(actor))
                .file(new MockMultipartFile("file","Relatorio.docx",DOCX,DocxIntegrityTest.docx("Institucional")))
                .param("title","Relatorio.docx")).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(),"$.id");
    }
    @Test void institutionalEntryUsesExistingRootAndDeniesMembersAndForeignScopes() throws Exception {
        UUID root=library();
        assertThat(root).isEqualTo(jdbc.queryForObject("select id from nite_connect.document_folders where system_key='MATERIAIS'",UUID.class));
        mvc.perform(get("/api/v1/library/institutional").with(token(MEMBER))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/library/institutional").with(token(LEADER))).andExpect(status().isForbidden());
        String personal=mvc.perform(get("/api/v1/me/library").with(token(MEMBER))).andReturn().getResponse().getContentAsString();
        mvc.perform(get("/api/v1/library/institutional").param("folderId",id(personal,"$.folder.id").toString()).with(token(ADMIN)))
                .andExpect(status().isNotFound());
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_GERAL',?,'Teste')",LEADER,ADMIN);
        mvc.perform(get("/api/v1/library/institutional").with(token(LEADER))).andExpect(status().isOk());
    }
    @Test void sharingKeepsOneItemMessageAndInheritedEditWithoutStructuralPermissions() throws Exception {
        UUID folder=folder(library(),"Relatórios"),document=upload(ADMIN,folder);
        long versions=jdbc.queryForObject("select count(*) from nite_connect.document_versions",Long.class);
        mvc.perform(post("/api/v1/library/folders/"+folder+"/shares").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\""+MEMBER+"\",\"permission\":\"EDIT\",\"message\":\"Revise seu relatório\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.message").value("Revise seu relatório"));
        mvc.perform(get("/api/v1/me/shared-with-me").with(token(MEMBER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(folder.toString()))
                .andExpect(jsonPath("$.items[0].message").value("Revise seu relatório"))
                .andExpect(jsonPath("$.items[0].sourceLabel").value("Biblioteca do NITE"))
                .andExpect(jsonPath("$.items[0].identity.resourceOwnerKind").value("INSTITUTION"));
        mvc.perform(get("/api/v1/library/documents/"+document).with(token(MEMBER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.capabilities.canEdit").value(true))
                .andExpect(jsonPath("$.capabilities.canRename").value(false))
                .andExpect(jsonPath("$.capabilities.canDeleteToTrash").value(false));
        mvc.perform(patch("/api/v1/library/documents/"+document).with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Outro.docx\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/library/documents/"+document+"/trash").with(token(MEMBER))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/library/documents/"+document).with(token(OTHER))).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_versions",Long.class)).isEqualTo(versions);
        String session=mvc.perform(post("/api/v1/documents/"+document+"/editor-session").with(token(MEMBER)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String wopiToken=com.jayway.jsonpath.JsonPath.read(session,"$.accessToken");
        mvc.perform(post("/wopi/files/"+document+"/contents").queryParam("access_token",wopiToken)
                .content(DocxIntegrityTest.docx("Revisão pelo integrante"))).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_versions",Long.class)).isEqualTo(versions+1);
        mvc.perform(get("/api/v1/library/members/"+MEMBER+"/documents").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].modifiedByName").exists())
                .andExpect(jsonPath("$.items[0].sharing[0].grant.message").value("Revise seu relatório"));
        mvc.perform(get("/api/v1/library/members/"+MEMBER+"/documents").with(token(OTHER))).andExpect(status().isForbidden());
    }
    @Test void trashSnapshotsFullOriginAndAuthenticatedNameAndRestoresTree() throws Exception {
        UUID root=library(),parent=folder(root,"Entregas"),child=folder(parent,"2026"),document=upload(ADMIN,child);
        jdbc.update("update nite_connect.members set name='Maria da Silva' where id=?",ADMIN);
        mvc.perform(post("/api/v1/library/folders/"+parent+"/trash").param("recursive","true").with(token(ADMIN)))
                .andExpect(status().isNoContent());
        mvc.perform(patch("/api/v1/library/folders/"+root).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Biblioteca renomeada\"}")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/library/trash").with(token(ADMIN))).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].item.deletedByName").value("Maria da Silva"))
                .andExpect(jsonPath("$.items[0].originalLocation.rootKey").value("MATERIAIS"))
                .andExpect(jsonPath("$.items[0].originalLocation.path").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("Biblioteca renomeada"))))
                .andExpect(jsonPath("$.items[0].originalLocation.path").value(org.hamcrest.Matchers.containsString("Entregas")));
        mvc.perform(post("/api/v1/me/trash/"+parent+"/restore").with(token(MEMBER))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/me/trash/"+parent+"/restore").with(token(ADMIN))).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select lifecycle_state from nite_connect.documents where id=?",String.class,document)).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("select parent_id from nite_connect.document_folders where id=?",UUID.class,child)).isEqualTo(parent);
    }
    @Test void reportsExcludePrivateFilesAndFollowRevocationAndPagination() throws Exception {
        UUID root=library(),folder=folder(root,"Institucional"),document=upload(ADMIN,folder);
        String personal=mvc.perform(get("/api/v1/me/library").with(token(MEMBER))).andReturn().getResponse().getContentAsString();
        UUID privateDocument=upload(MEMBER,id(personal,"$.folder.id"));
        mvc.perform(get("/api/v1/library/documents/"+privateDocument).with(token(OTHER))).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/library/documents/"+privateDocument+"/shares").with(token(MEMBER)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\""+OTHER+"\",\"permission\":\"VIEW\"}")).andExpect(status().isCreated());
        mvc.perform(get("/api/v1/library/members/"+OTHER+"/documents").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
        String share=mvc.perform(post("/api/v1/library/folders/"+folder+"/shares").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\""+MEMBER+"\",\"permission\":\"VIEW\",\"message\":\"Consulta\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        mvc.perform(get("/api/v1/library/members/"+MEMBER+"/documents").param("limit","1").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.hasMore").value(true)).andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(get("/api/v1/library/members/"+MEMBER+"/documents").param("type","DOCUMENT").param("parentId",folder.toString()).with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(document.toString()));
        mvc.perform(get("/api/v1/library/documents/"+document).with(token(MEMBER)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.capabilities.canEdit").value(false));
        UUID grant=id(share,"$.id");
        String changed=mvc.perform(patch("/api/v1/library/shares/"+grant).with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"permission\":\"EDIT\"}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Consulta")).andReturn().getResponse().getContentAsString();
        mvc.perform(delete("/api/v1/library/shares/"+id(changed,"$.id")).with(token(ADMIN))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/library/members/"+MEMBER+"/documents").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
        mvc.perform(get("/api/v1/library/documents/"+document).with(token(MEMBER))).andExpect(status().isNotFound());
    }
    @Test void projectTrashIncludesProjectIdentityAndOriginalFullPath() throws Exception {
        UUID project=project();
        String listing=mvc.perform(get("/api/v1/projects/"+project+"/library").with(token(ADMIN)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        UUID folder=folder(id(listing,"$.folder.id"),"Atas"),document=upload(ADMIN,folder);
        // Ownership is independent from project location (e.g. an institutional official record).
        jdbc.update("update nite_connect.documents set resource_owner_kind='INSTITUTION',resource_owner_id=null where id=?",document);
        mvc.perform(post("/api/v1/library/documents/"+document+"/shares").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\""+MEMBER+"\",\"permission\":\"VIEW\"}")).andExpect(status().isCreated());
        mvc.perform(get("/api/v1/library/members/"+MEMBER+"/documents").with(token(ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].projectId").value(project.toString()));
        mvc.perform(post("/api/v1/library/documents/"+document+"/trash").with(token(ADMIN))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/projects/"+project+"/trash").with(token(ADMIN))).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].originalLocation.projectId").value(project.toString()))
                .andExpect(jsonPath("$.items[0].originalLocation.projectTitle").value("Projeto de teste"))
                .andExpect(jsonPath("$.items[0].originalLocation.path").value("Projetos / Projeto de teste / Atas / Relatorio.docx"));
    }
    @Test void invalidMessagesAndInactiveActorsCannotMutateTheLibrary() throws Exception {
        UUID folder=folder(library(),"Compartilhamentos");
        mvc.perform(post("/api/v1/library/folders/"+folder+"/shares").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\""+MEMBER+"\",\"permission\":\"EDIT\",\"message\":\""+"x".repeat(1001)+"\"}"))
                .andExpect(status().isBadRequest());
        jdbc.update("update nite_connect.members set status='DESLIGADO' where id=?",ADMIN);
        mvc.perform(get("/api/v1/library/institutional").with(token(ADMIN))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/library/folders/"+folder+"/trash").with(token(ADMIN))).andExpect(status().isForbidden());
    }
    @Test void institutionalTreePurgesOnlyAfterThirtyDaysThroughExistingWorker() throws Exception {
        UUID root=library(),parent=folder(root,"Expurgo"),child=folder(parent,"Filha"),document=upload(ADMIN,child);
        UUID recent=upload(ADMIN,root);
        UUID object=jdbc.queryForObject("select v.object_id from nite_connect.document_versions v join nite_connect.documents d on d.current_version_id=v.id where d.id=?",UUID.class,document);
        mvc.perform(post("/api/v1/library/folders/"+parent+"/trash").param("recursive","true").with(token(ADMIN))).andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/library/documents/"+recent+"/trash").with(token(ADMIN))).andExpect(status().isNoContent());
        var policy=retention.draft(ADMIN,"Teste isolado da Biblioteca");
        retention.approve(ADMIN,policy.id(),"Retenção de trinta dias");
        // ProjectTestSupport truncates the member graph, including this singleton via its actor FK.
        jdbc.update("insert into nite_connect.document_purge_activation(id) values (true) on conflict do nothing");
        activation.change(ADMIN,new br.edu.unijorge.niteconnect.documents.application.DocumentPurgeActivationService.Activation(
                true,true,true,true,true,true,null,null,"Infraestrutura isolada de teste"));
        var purge=new br.edu.unijorge.niteconnect.documents.application.DocumentPurgeService(access,capabilities,purgeRepository,true,true,
                new org.springframework.transaction.support.TransactionTemplate(transactionManager));
        assertThat(purge.preview(ADMIN,recent).reasonCode()).isEqualTo("RETENTION_PERIOD");
        assertThat(purge.request(ADMIN,recent,"library-retention:"+recent).status()).isEqualTo("BLOCKED_POLICY");
        purge.discoverAutomatic();
        assertThat(jdbc.queryForObject("select lifecycle_state from nite_connect.documents where id=?",String.class,document)).isEqualTo("TRASHED");
        jdbc.update("update nite_connect.documents set deleted_at=clock_timestamp()-interval '31 days' where id=?",document);
        jdbc.update("update nite_connect.document_folders set deleted_at=clock_timestamp()-interval '31 days' where id in (?,?)",parent,child);
        purge.discoverAutomatic();
        UUID operation=jdbc.queryForObject("select purge_operation_id from nite_connect.documents where id=?",UUID.class,document);
        assertThat(operation).isNotNull();
        var objectStore=new br.edu.unijorge.niteconnect.documents.application.DocumentObjectStore() {
            public void put(UUID id,byte[] bytes) {store.put(id,bytes);}
            public byte[] get(UUID id) {return store.get(id);}
            public void deleteOrphan(UUID id) {store.deleteOrphan(id);}
            public void purge(UUID id,boolean asset) {store.deleteOrphan(id);}
        };
        var worker=new br.edu.unijorge.niteconnect.documents.application.DocumentPurgeWorker(purgeRepository,objectStore,true,true);
        assertThat(worker.runOnce(operation)).isTrue(); // One file/version in this isolated tree.
        assertThat(purgeRepository.operation(operation).status()).isEqualTo("COMPLETED");
        assertThat(store.objects).doesNotContainKey(object);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_purge_tombstones where resource_id in (?,?,?)",Integer.class,parent,child,document)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select lifecycle_state from nite_connect.documents where id=?",String.class,recent)).isEqualTo("TRASHED");
        mvc.perform(post("/api/v1/me/trash/"+parent+"/restore").with(token(ADMIN))).andExpect(status().isNotFound());
    }
}
