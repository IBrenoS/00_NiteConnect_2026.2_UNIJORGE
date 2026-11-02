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
class Block04FrequencyMigrationTest {
    @Container static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

    @Test
    void upgradesV21WithFrequencySchemaAndPreservesAttendanceHistory() {
        Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:Migrations").target("21").load().migrate();
        JdbcTemplate jdbc = new JdbcTemplate(new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));

        UUID member = UUID.randomUUID();
        UUID event = UUID.randomUUID();
        UUID attendance = UUID.randomUUID();
        UUID segment = UUID.randomUUID();
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Histórico V21','frequency-v21@unijorge.com.br','ATIVO')", member);
        jdbc.update("""
                insert into nite_connect.calendar_events(id,title,description,kind,modality,starts_at,ends_at,status,created_by)
                values (?,'Encontro histórico','Dados sintéticos V21','ENCONTRO','PRESENCIAL',
                        clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour','ABERTO',?)
                """, event, member);
        jdbc.update("update nite_connect.calendar_events set qr_hash=repeat('a',64),qr_expires_at=clock_timestamp()+interval '2 minutes' where id=?", event);
        jdbc.update("insert into nite_connect.attendance_records(id,event_id,member_id) values (?,?,?)", attendance, event, member);
        jdbc.update("""
                insert into nite_connect.attendance_segments(id,member_id,attendance_id,starts_at,ends_at)
                values (?,?,?,'2026-10-01T20:15:00Z','2026-10-01T21:00:00Z')
                """, segment, member, attendance);

        Flyway upgraded = Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:Migrations").load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(4);
        upgraded.validate();

        assertThat(upgraded.info().current().getVersion().getVersion()).isEqualTo("25");
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.attendance_records where id=?", Long.class, attendance)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.attendance_segments where id=?", Long.class, segment)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select qr_hash is null and qr_expires_at is null from nite_connect.calendar_events where id=?", Boolean.class, event)).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.attendance_events where entity_id=? and action='LEGACY_QR_REVOKED'", Long.class, event)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from information_schema.tables where table_schema='nite_connect' and table_name in ('attendance_lists','attendance_list_members','attendance_list_events','attendance_list_qr_tokens','frequency_qr_handoffs','frequency_settings')", Long.class)).isEqualTo(6);
        assertThat(jdbc.queryForObject("select activated_at is not null from nite_connect.frequency_settings where id=1", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from pg_indexes where schemaname='nite_connect' and indexname='frequency_qr_handoffs_expiry_idx'", Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select is_nullable from information_schema.columns where table_schema='nite_connect' and table_name='calendar_events' and column_name='ends_at'", String.class)).isEqualTo("YES");
    }
}
