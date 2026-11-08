package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.postgresql.PostgreSQLContainer;
import java.util.UUID;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
@SpringBootTest(properties = {
        "nite.documents.enabled=false",
        "nite.entra.enabled=true",
        "nite.entra.tenant-id=11111111-1111-4111-8111-111111111111",
        "nite.entra.audience=22222222-2222-4222-8222-222222222222",
        "nite.entra.required-scope=access_as_user"
})
abstract class ProjectTestSupport {
    // Singleton lifecycle: subclasses share the Spring context and this database.
    // Ryuk removes the container at JVM exit; per-class stop would invalidate cached connections.
    @ServiceConnection
    static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");
    static { postgres.start(); }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    static final UUID TENANT = UUID.fromString("11111111-1111-4111-8111-111111111111");
    static final UUID ADMIN = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    static final UUID LEADER = UUID.fromString("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    static final UUID MEMBER = UUID.fromString("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    static final UUID OTHER = UUID.fromString("dddddddd-dddd-4ddd-8ddd-dddddddddddd");

    @BeforeEach void fixtures() {
        jdbc.execute("truncate nite_connect.members cascade");
        for (UUID id : java.util.List.of(ADMIN, LEADER, MEMBER, OTHER)) {
            jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Teste',?,'ATIVO')",
                    id, id + "@unijorge.com.br");
            jdbc.update("insert into nite_connect.identity_accounts(tenant_id,object_id,member_id) values (?,?,?)", TENANT, id, id);
        }
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'COORDENADOR',?,'Fixture')", ADMIN, ADMIN);
    }
    RequestPostProcessor token(UUID id) {
        return jwt().jwt(j -> j.claim("tid", TENANT.toString()).claim("oid", id.toString()));
    }
    UUID project() throws Exception {
        mvc.perform(post("/api/v1/projects").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"title":"Projeto de teste","description":"Objetivo de teste","reason":"Registro autorizado"}
                    """)).andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PLANEJAMENTO"));
        return jdbc.queryForObject("select id from nite_connect.projects order by created_at desc limit 1", UUID.class);
    }

    long version(UUID project) {
        return jdbc.queryForObject("select version from nite_connect.projects where id=?", Long.class, project);
    }
    void join(UUID project, UUID member) throws Exception {
        mvc.perform(post("/api/v1/projects/" + project + "/members").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberId\":\"" + member + "\",\"responsibility\":\"Desenvolvimento\",\"expectedVersion\":" + version(project) + ",\"reason\":\"Equipe\"}"))
                .andExpect(status().isCreated());
    }
    String transferBody(UUID member, long version) {
        return "{\"memberId\":" + (member == null ? "null" : "\"" + member + "\"") + ",\"expectedVersion\":" + version + ",\"reason\":\"Designação administrativa\"}";
    }
    void transfer(UUID project, UUID member) throws Exception {
        mvc.perform(post("/api/v1/projects/" + project + "/leadership-transfers").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content(transferBody(member, version(project)))).andExpect(status().isOk());
    }
    String updateBody(long version) {
        return "{\"title\":\"Título atualizado\",\"description\":\"Objetivo atualizado\",\"expectedVersion\":" + version + ",\"reason\":\"Ajuste operacional\"}";
    }
    int transferAfter(java.util.concurrent.CountDownLatch start, UUID project, UUID member, long version) throws Exception {
        start.await();
        return mvc.perform(post("/api/v1/projects/" + project + "/leadership-transfers").with(token(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                .content(transferBody(member, version))).andReturn().getResponse().getStatus();
    }
}
