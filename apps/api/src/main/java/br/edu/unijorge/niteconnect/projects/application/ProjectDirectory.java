package br.edu.unijorge.niteconnect.projects.application;

import br.edu.unijorge.niteconnect.projects.domain.Project;
import br.edu.unijorge.niteconnect.projects.domain.ProjectStatus;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Public internal contract for project identity and contextual participation. */
@Repository
public class ProjectDirectory {
    private final JdbcTemplate jdbc;
    private static final RowMapper<Project> PROJECT = (rs, row) -> new Project(rs.getObject("id", UUID.class),
            rs.getString("title"), rs.getString("description"), ProjectStatus.valueOf(rs.getString("status")),
            rs.getObject("starts_on", LocalDate.class), rs.getObject("ends_on", LocalDate.class),
            rs.getObject("proposal_id", UUID.class), rs.getObject("created_by", UUID.class), rs.getLong("version"),
            rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(),
            rs.getObject("cover_object_id", UUID.class) == null ? null : "/api/v1/project-catalog/" + rs.getObject("id", UUID.class) + "/image");
    private static final RowMapper<Participation> PARTICIPATION = (rs, row) -> new Participation(
            rs.getObject("id", UUID.class), rs.getObject("project_id", UUID.class), rs.getObject("member_id", UUID.class),
            rs.getString("responsibility"), rs.getTimestamp("started_at").toInstant(), rs.getObject("started_by", UUID.class),
            rs.getString("start_reason"), rs.getTimestamp("ended_at") == null ? null : rs.getTimestamp("ended_at").toInstant(),
            rs.getObject("ended_by", UUID.class), rs.getString("end_reason"));
    public ProjectDirectory(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** Explicit activity-module contract: current project scopes visible to a member. */
    public List<UUID> currentProjectIds(UUID member) {
        return jdbc.query("select m.project_id from nite_connect.project_memberships m join nite_connect.projects p on p.id=m.project_id and p.deleted_at is null where m.member_id=? and m.ended_at is null order by m.project_id",
                (rs, row) -> rs.getObject(1, UUID.class), member);
    }

    public PageResult<CurrentLeadership> currentLeadership(UUID member, int page, int size) {
        PageResult.validate(page, size);
        String from = " from nite_connect.project_leadership_history l join nite_connect.project_memberships m on m.id=l.membership_id"
                + " join nite_connect.projects p on p.id=l.project_id where l.member_id=? and l.ended_at is null and m.ended_at is null and p.deleted_at is null";
        long total = jdbc.queryForObject("select count(*)" + from, Long.class, member);
        List<CurrentLeadership> items = jdbc.query("select p.id project_id,p.title" + from
                        + " order by p.title,p.id limit ? offset ?",
                (rs, row) -> new CurrentLeadership(rs.getObject("project_id", UUID.class), rs.getString("title")),
                member, size, (long) page * size);
        return new PageResult<>(items, page, size, total);
    }

    public Project require(UUID id) {
        return jdbc.query("select * from nite_connect.projects where id=? and deleted_at is null", PROJECT, id).stream()
                .findFirst().orElseThrow(ApiException::notFound);
    }
    public boolean participates(UUID project, UUID member) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from nite_connect.project_memberships where project_id=? and member_id=? and ended_at is null)", Boolean.class, project, member));
    }
    public UUID leader(UUID project) {
        return jdbc.query("""
                select l.member_id from nite_connect.project_leadership_history l
                join nite_connect.project_memberships m on m.id=l.membership_id
                where l.project_id=? and l.ended_at is null and m.ended_at is null
                """, (rs, row) -> rs.getObject(1, UUID.class), project).stream().findFirst().orElse(null);
    }
    public PageResult<Project> list(UUID participant, ProjectStatus status, int page, int size) {
        PageResult.validate(page, size);
        String where = " where p.deleted_at is null";
        List<Object> args = new ArrayList<>();
        if (participant != null) {
            where += " and exists(select 1 from nite_connect.project_memberships m where m.project_id=p.id and m.member_id=? and m.ended_at is null)";
            args.add(participant);
        }
        if (status != null) { where += " and p.status=?"; args.add(status.name()); }
        long total = jdbc.queryForObject("select count(*) from nite_connect.projects p" + where, Long.class, args.toArray());
        args.add(size); args.add((long) page * size);
        return new PageResult<>(jdbc.query("select p.* from nite_connect.projects p" + where + " order by p.title,p.id limit ? offset ?",
                PROJECT, args.toArray()), page, size, total);
    }
    public Project create(UUID actor, String title, String description, LocalDate startsOn, LocalDate endsOn, UUID proposal) {
        return create(actor, title, description, startsOn, endsOn, proposal, ProjectStatus.PLANEJAMENTO);
    }
    public Project create(UUID actor, String title, String description, LocalDate startsOn, LocalDate endsOn, UUID proposal, ProjectStatus status) {
        validateData(title, description, startsOn, endsOn);
        UUID id = UUID.randomUUID();
        jdbc.update("insert into nite_connect.projects(id,title,description,starts_on,ends_on,proposal_id,created_by,status) values (?,?,?,?,?,?,?,?)",
                id, title.trim(), description.trim(), startsOn, endsOn, proposal, actor, status.name());
        return require(id);
    }
    public UUID coverObject(UUID project) {
        return jdbc.queryForObject("select cover_object_id from nite_connect.projects where id=?", UUID.class, project);
    }
    public String coverContentType(UUID project) {
        return jdbc.queryForObject("select cover_content_type from nite_connect.projects where id=?", String.class, project);
    }
    public UUID replaceCover(UUID project, UUID objectId, String contentType, long version) {
        UUID old = coverObject(project);
        changed(jdbc.update("update nite_connect.projects set cover_object_id=?,cover_content_type=?,version=version+1,updated_at=clock_timestamp() where id=? and version=?",
                objectId, contentType, project, version));
        return old;
    }
    public UUID removeCover(UUID project, long version) {
        UUID old = coverObject(project);
        changed(jdbc.update("update nite_connect.projects set cover_object_id=null,cover_content_type=null,version=version+1,updated_at=clock_timestamp() where id=? and version=?",
                project, version));
        return old;
    }
    public Project update(UUID id, String title, String description, LocalDate startsOn, LocalDate endsOn, long version) {
        validateData(title, description, startsOn, endsOn);
        changed(jdbc.update("""
                update nite_connect.projects set title=?,description=?,starts_on=?,ends_on=?,version=version+1,updated_at=clock_timestamp()
                where id=? and version=? and deleted_at is null
                """, title.trim(), description.trim(), startsOn, endsOn, id, version));
        return require(id);
    }
    public Project status(UUID id, ProjectStatus status, long version) {
        changed(jdbc.update("update nite_connect.projects set status=?,version=version+1,updated_at=clock_timestamp() where id=? and version=?",
                status.name(), id, version));
        return require(id);
    }
    public void touch(UUID id, long version) {
        changed(jdbc.update("update nite_connect.projects set version=version+1,updated_at=clock_timestamp() where id=? and version=? and deleted_at is null", id, version));
    }
    public void delete(UUID actor, UUID id, long version) {
        changed(jdbc.update("update nite_connect.projects set deleted_at=clock_timestamp(),deleted_by=?,accepting_members=false,version=version+1,updated_at=clock_timestamp() where id=? and version=? and deleted_at is null", actor, id, version));
    }
    public void checkVersion(Project project, long version) {
        if (project.version() != version) throw ApiException.conflict("Projeto alterado; consulte a versão atual");
    }
    private void changed(int count) { if (count != 1) throw ApiException.conflict("Projeto alterado; consulte a versão atual"); }
    public static void validateData(String title, String description, LocalDate start, LocalDate end) {
        if (title == null || title.isBlank() || title.length() > 200 || description == null || description.isBlank()
                || description.length() > 10000 || (start != null && end != null && end.isBefore(start))) {
            throw ApiException.invalid("Título, descrição ou período inválidos");
        }
    }
    public void recordStatus(UUID actor, UUID project, ProjectStatus before, ProjectStatus after, String reason) {
        jdbc.update("insert into nite_connect.project_status_history(id,project_id,actor_id,previous_status,new_status,reason) values (?,?,?,?,?,?)",
                UUID.randomUUID(), project, actor, before == null ? null : before.name(), after.name(), reason);
    }
    public Participation currentParticipation(UUID project, UUID member) {
        return jdbc.query("select * from nite_connect.project_memberships where project_id=? and member_id=? and ended_at is null",
                PARTICIPATION, project, member).stream().findFirst().orElseThrow(ApiException::notFound);
    }
    public Participation join(UUID actor, UUID project, UUID member, String responsibility, String reason) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into nite_connect.project_memberships(id,project_id,member_id,responsibility,started_by,start_reason,started_at) values (?,?,?,?,?,?,clock_timestamp())",
                id, project, member, responsibility.trim(), actor, reason);
        return currentParticipation(project, member);
    }
    public void end(UUID actor, Participation participation, String reason) {
        changed(jdbc.update("update nite_connect.project_memberships set ended_at=clock_timestamp(),ended_by=?,end_reason=? where id=? and ended_at is null",
                actor, reason, participation.id()));
    }
    public PageResult<TeamMember> team(UUID project, int page, int size) {
        PageResult.validate(page, size);
        return new PageResult<>(jdbc.query("select id,member_id,responsibility,started_at from nite_connect.project_memberships where project_id=? and ended_at is null order by started_at,id limit ? offset ?",
                (rs, row) -> new TeamMember(rs.getObject("id", UUID.class), rs.getObject("member_id", UUID.class),
                        rs.getString("responsibility"), rs.getTimestamp("started_at").toInstant()), project, size, (long) page * size),
                page, size, jdbc.queryForObject("select count(*) from nite_connect.project_memberships where project_id=? and ended_at is null", Long.class, project));
    }
    public void transfer(UUID actor, UUID project, Participation target, String reason) {
        jdbc.update("update nite_connect.project_leadership_history set ended_at=clock_timestamp(),ended_by=?,end_reason=? where project_id=? and ended_at is null", actor, reason, project);
        if (target != null) {
            jdbc.update("insert into nite_connect.project_leadership_history(id,project_id,member_id,membership_id,started_by,start_reason,started_at) values (?,?,?,?,?,?,clock_timestamp())",
                    UUID.randomUUID(), project, target.memberId(), target.id(), actor, reason);
        }
    }
    /** All SQL identifiers passed here are constants from this class, never request input. */
    private <T> PageResult<T> page(String table, String column, UUID id, String order, int page, int size, RowMapper<T> mapper) {
        PageResult.validate(page, size);
        return new PageResult<>(jdbc.query("select * from " + table + " where " + column + "=? order by " + order + " limit ? offset ?",
                mapper, id, size, (long) page * size), page, size,
                jdbc.queryForObject("select count(*) from " + table + " where " + column + "=?", Long.class, id));
    }
    public record Participation(UUID id, UUID projectId, UUID memberId, String responsibility, Instant startedAt,
                                UUID startedBy, String startReason, Instant endedAt, UUID endedBy, String endReason) {}
    public record TeamMember(UUID id, UUID memberId, String responsibility, Instant startedAt) {}
    public record CurrentLeadership(UUID projectId, String title) {}
}
