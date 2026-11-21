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
class InstitutionalLibraryMigrationTest {
    @Container static final PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:17-alpine");
    @Test void upgradePreservesExistingSharesAndTrashAndBackfillsLocationWithoutDuplicatingResources() {
        Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword())
                .locations("classpath:Migrations").target("43").load().migrate();
        var jdbc=new JdbcTemplate(new DriverManagerDataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword()));
        UUID actor=UUID.randomUUID(),recipient=UUID.randomUUID(),document=UUID.randomUUID(),grant=UUID.randomUUID(),batch=UUID.randomUUID();
        for(UUID member:java.util.List.of(actor,recipient)) jdbc.update(
                "insert into nite_connect.members(id,name,institutional_email,status) values (?,'Nome completo',?,'ATIVO')",member,member+"@unijorge.com.br");
        UUID root=jdbc.queryForObject("select id from nite_connect.document_folders where system_key='MATERIAIS'",UUID.class);
        jdbc.update("""
                insert into nite_connect.documents(id,title,context,folder_id,created_by,resource_owner_kind,origin,official,
                  lifecycle_state,deleted_at,deleted_by,trash_batch_id)
                values (?,'Histórico.docx','ADMINISTRATIVE',?,?,'INSTITUTION','INSTITUTIONAL_RECORD',false,
                  'TRASHED',clock_timestamp(),?,?)
                """,document,root,actor,actor,batch);
        jdbc.update("insert into nite_connect.document_grants(id,document_id,member_id,permission,can_edit,granted_by) values (?,?,?,'EDIT',true,?)",
                grant,document,recipient,actor);
        Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword())
                .locations("classpath:Migrations").load().migrate();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.documents",Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select trash_batch_id from nite_connect.documents where id=?",UUID.class,document)).isEqualTo(batch);
        assertThat(jdbc.queryForObject("select trash_original_path from nite_connect.documents where id=?",String.class,document))
                .isEqualTo("Materiais institucionais / Histórico.docx");
        assertThat(jdbc.queryForObject("select permission from nite_connect.document_grants where id=?",String.class,grant)).isEqualTo("EDIT");
        assertThat(jdbc.queryForObject("select message from nite_connect.document_grants where id=?",String.class,grant)).isNull();
        assertThat(jdbc.queryForObject("select classification from nite_connect.documents where id=?",String.class,document)).isEqualTo("GENERAL");
        assertThat(jdbc.queryForObject("select id from nite_connect.document_folders where system_key='MATERIAIS'",UUID.class)).isEqualTo(root);
        assertThat(Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword())
                .locations("classpath:Migrations").load().migrate().migrationsExecuted).isZero();
    }
}
