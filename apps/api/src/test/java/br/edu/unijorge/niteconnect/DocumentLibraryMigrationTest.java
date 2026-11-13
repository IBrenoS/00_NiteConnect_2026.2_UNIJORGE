package br.edu.unijorge.niteconnect;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class DocumentLibraryMigrationTest {
    @Container static final PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:17-alpine");

    @Test void v29PreservesPersonalDocumentsOwnedByInactiveMembers() {
        var config=Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword())
                .locations("classpath:Migrations");
        config.target("27").load().migrate();
        var jdbc=new JdbcTemplate(new DriverManagerDataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword()));
        UUID member=UUID.randomUUID(),document=UUID.randomUUID(),version=UUID.randomUUID(),object=UUID.randomUUID();
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,?,'historico@unijorge.com.br','DESLIGADO')",member,"Integrante histórico");
        jdbc.update("insert into nite_connect.documents(id,title,context,owner_id,official,created_by) values (?,?,'PERSONAL',?,false,?)",
                document,"Relatório antigo.docx",member,member);
        jdbc.update("insert into nite_connect.document_versions(id,document_id,revision,object_id,size,sha256,status,created_by) values (?,?,1,?,1,repeat('a',64),'AVAILABLE',?)",
                version,document,object,member);
        jdbc.update("update nite_connect.documents set current_version_id=?,version=1 where id=?",version,document);

        config.target("28").load().migrate();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.documents where id=? and folder_id is not null",Integer.class,document)).isZero();
        Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword())
                .locations("classpath:Migrations").target("29").load().migrate();

        UUID recipient=UUID.randomUUID(),legacyGrant=UUID.randomUUID();
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,?,'destinatario@unijorge.com.br','ATIVO')",recipient,"Destinatário");
        jdbc.update("insert into nite_connect.document_grants(id,document_id,member_id,can_edit,granted_by) values (?,?,?,true,?)",
                legacyGrant,document,recipient,member);
        Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword())
                .locations("classpath:Migrations").target("30").load().migrate();

        UUID folder=jdbc.queryForObject("select folder_id from nite_connect.documents where id=?",UUID.class,document);
        assertThat(jdbc.queryForObject("select owner_id from nite_connect.document_folders where id=?",UUID.class,folder)).isEqualTo(member);
        assertThat(jdbc.queryForObject("select id from nite_connect.document_versions where document_id=?",UUID.class,document)).isEqualTo(version);
        assertThat(jdbc.queryForObject("select object_id from nite_connect.document_versions where id=?",UUID.class,version)).isEqualTo(object);
        assertThat(jdbc.queryForObject("select permission from nite_connect.document_grants where id=?",String.class,legacyGrant)).isEqualTo("EDIT");
    }
}
