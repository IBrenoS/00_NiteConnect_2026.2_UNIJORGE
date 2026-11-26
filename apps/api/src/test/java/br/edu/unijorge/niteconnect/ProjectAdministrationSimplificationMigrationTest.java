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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers
class ProjectAdministrationSimplificationMigrationTest {
    @Container static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

    @Test void upgradeMakesReasonsOptionalWithoutChangingExistingPeriodsOrStatusEvents() {
        var dataSource = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:Migrations").target("53").load().migrate();
        var jdbc = new JdbcTemplate(dataSource);

        UUID administrator = UUID.randomUUID();
        UUID leader = UUID.randomUUID();
        UUID member = UUID.randomUUID();
        UUID project = UUID.randomUUID();
        UUID membership = UUID.randomUUID();
        UUID leadership = UUID.randomUUID();
        UUID oldStatusEvent = UUID.randomUUID();
        for (UUID id : java.util.List.of(administrator, leader, member)) {
            jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Teste',?,'ATIVO')",
                    id, id + "@unijorge.com.br");
        }
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'COORDENADOR',?,'Fixture')", administrator, administrator);
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_PROJETO',?,'Fixture')", leader, administrator);
        jdbc.update("insert into nite_connect.projects(id,title,description,created_by) values (?,'Projeto','Descrição',?)", project, administrator);
        jdbc.update("insert into nite_connect.project_memberships(id,project_id,member_id,responsibility,started_by,start_reason) values (?,?,?,'Liderança',?,'Motivo legado')",
                membership, project, leader, administrator);
        jdbc.update("insert into nite_connect.project_leadership_history(id,project_id,member_id,membership_id,started_by,start_reason) values (?,?,?,?,?,'Motivo legado')",
                leadership, project, leader, membership, administrator);
        jdbc.update("insert into nite_connect.project_status_history(id,project_id,actor_id,new_status,reason) values (?,?,?,'PLANEJAMENTO','Situação legada')",
                oldStatusEvent, project, administrator);

        var flyway = Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:Migrations").load();
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(3);
        flyway.validate();
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("56");

        assertThat(jdbc.queryForObject("select start_reason from nite_connect.project_memberships where id=?", String.class, membership)).isEqualTo("Motivo legado");
        assertThat(jdbc.queryForObject("select start_reason from nite_connect.project_leadership_history where id=?", String.class, leadership)).isEqualTo("Motivo legado");
        assertThat(jdbc.queryForObject("select reason from nite_connect.project_status_history where id=?", String.class, oldStatusEvent)).isEqualTo("Situação legada");

        UUID newMembership = UUID.randomUUID();
        jdbc.update("insert into nite_connect.project_memberships(id,project_id,member_id,responsibility,started_by) values (?,?,?,'Pesquisa',?)",
                newMembership, project, member, administrator);
        jdbc.update("update nite_connect.project_memberships set ended_at=clock_timestamp(),ended_by=? where id=?", administrator, newMembership);
        UUID newLeadership = UUID.randomUUID();
        jdbc.update("update nite_connect.project_leadership_history set ended_at=clock_timestamp(),ended_by=? where id=?", administrator, leadership);
        jdbc.update("insert into nite_connect.project_leadership_history(id,project_id,member_id,membership_id,started_by) values (?,?,?,?,?)",
                newLeadership, project, leader, membership, administrator);
        jdbc.update("insert into nite_connect.project_status_history(id,project_id,actor_id,previous_status,new_status) values (?,?,?,'PLANEJAMENTO','ATIVO')",
                UUID.randomUUID(), project, administrator);
        jdbc.update("insert into nite_connect.audit_events(id,actor_id,entity_type,entity_id,action,after_value) values (?,?, 'PROJECT', ?, 'PROJECT_STATUS_CHANGED', 'ATIVO')",
                UUID.randomUUID(), administrator, project);

        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_memberships where id=? and start_reason is null and ended_at is not null and end_reason is null", Integer.class, newMembership)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where id=? and start_reason is null and ended_at is null", Integer.class, newLeadership)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_status_history where project_id=?", Integer.class, project)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where id=?", Integer.class, leadership)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where entity_type='PROJECT' and entity_id=? and reason is null", Integer.class, project)).isEqualTo(1);
        assertThatThrownBy(() -> jdbc.update("insert into nite_connect.audit_events(id,actor_id,entity_type,entity_id,action,after_value) values (?,?, 'PROJECT', ?, 'PROJECT_CREATED', 'Projeto')",
                UUID.randomUUID(), administrator, project)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("insert into nite_connect.audit_events(id,actor_id,entity_type,entity_id,action,after_value) values (?,?, 'ACTIVITY', ?, 'ACTIVITY_CREATED', 'Atividade')",
                UUID.randomUUID(), administrator, project)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject("select count(*) from information_schema.columns where table_schema='nite_connect' and table_name='projects' and column_name in ('deleted_at','deleted_by')", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from information_schema.columns where table_schema='nite_connect' and table_name='attendance_lists' and column_name in ('deleted_at','deleted_by')", Integer.class)).isEqualTo(2);
    }
}
