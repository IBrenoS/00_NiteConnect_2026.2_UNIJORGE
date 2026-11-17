package br.edu.unijorge.niteconnect;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class DocumentPurgeInfrastructureMigrationTest {
    @Container static final PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:17-alpine");

    @Test void v34AddsPurgeStatesAndDurableTablesWithoutApprovingADeletionPolicy() {
        var flyway=Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword())
                .locations("classpath:Migrations").load();
        flyway.migrate();
        var jdbc=new JdbcTemplate(new DriverManagerDataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword()));

        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("42");
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_retention_policies where enabled",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select enabled from nite_connect.document_purge_activation where id=true",Boolean.class)).isFalse();
        assertThat(jdbc.queryForObject("select pg_get_constraintdef(oid) from pg_constraint where conname='document_protection_check'",String.class)).contains("ACADEMIC_NITE");
        assertThat(jdbc.queryForObject("""
                select count(*) from information_schema.tables where table_schema='nite_connect' and table_name in
                  ('document_purge_operations','document_purge_operation_items','document_purge_objects','document_purge_tombstones')
                """,Integer.class)).isEqualTo(4);
        assertThat(jdbc.queryForObject("""
                select pg_get_constraintdef(oid) from pg_constraint
                where conname='document_lifecycle_state_check'
                """,String.class)).contains("PURGE_PENDING","PURGED");
    }
}
