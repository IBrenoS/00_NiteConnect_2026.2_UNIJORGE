package br.edu.unijorge.niteconnect;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

@Testcontainers
class InstitutionalProjectRoleMigrationTest {
    @Container static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

    @Test void upgradeRegularizesOnlyLeadersWithoutHigherRolesAndPreservesHistory() {
        var config = Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:Migrations");
        config.target("46").load().migrate();
        var jdbc = new JdbcTemplate(new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
        UUID administrator = UUID.randomUUID(), regularized = UUID.randomUUID(), superior = UUID.randomUUID();
        for (UUID id : java.util.List.of(administrator, regularized, superior)) {
            jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Teste',?,'ATIVO')",
                    id, id + "@unijorge.com.br");
        }
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'COORDENADOR',?,'Fixture')", administrator, administrator);
        jdbc.update("insert into nite_connect.role_assignments(member_id,role,granted_by,reason) values (?,'GESTOR_GERAL',?,'Fixture')", superior, administrator);
        UUID oldLeadership = leader(jdbc, administrator, regularized);
        UUID superiorLeadership = leader(jdbc, administrator, superior);
        var flyway = Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:Migrations").load();
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(5);
        flyway.validate();
        assertThat(jdbc.queryForObject("select role from nite_connect.role_assignments where member_id=?", String.class, regularized)).isEqualTo("GESTOR_PROJETO");
        assertThat(jdbc.queryForObject("select granted_by from nite_connect.role_assignments where member_id=?", UUID.class, regularized)).isEqualTo(administrator);
        assertThat(jdbc.queryForObject("select reason from nite_connect.role_assignments where member_id=?", String.class, regularized)).contains("Regularização técnica B08.6-0");
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.audit_events where member_id=? and action='ROLE_GRANTED'", Integer.class, regularized)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select role from nite_connect.role_assignments where member_id=?", String.class, superior)).isEqualTo("GESTOR_GERAL");
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.project_leadership_history where id in (?,?) and ended_at is null", Integer.class, oldLeadership, superiorLeadership)).isEqualTo(2);
        assertThatThrownBy(() -> jdbc.update("delete from nite_connect.role_assignments where member_id=?", regularized))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
    }

    private UUID leader(JdbcTemplate jdbc, UUID administrator, UUID member) {
        UUID project = UUID.randomUUID(), membership = UUID.randomUUID(), leadership = UUID.randomUUID();
        jdbc.update("insert into nite_connect.projects(id,title,description,created_by) values (?,'Projeto','Teste',?)", project, administrator);
        jdbc.update("insert into nite_connect.project_memberships(id,project_id,member_id,responsibility,started_by,start_reason) values (?,?,?,'Liderança',?,'Fixture')",
                membership, project, member, administrator);
        jdbc.update("insert into nite_connect.project_leadership_history(id,project_id,member_id,membership_id,started_by,start_reason) values (?,?,?,?,?,'Fixture')",
                leadership, project, member, membership, administrator);
        return leadership;
    }
}
