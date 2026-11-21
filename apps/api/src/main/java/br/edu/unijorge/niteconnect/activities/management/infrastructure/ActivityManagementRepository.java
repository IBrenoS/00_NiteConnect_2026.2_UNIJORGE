package br.edu.unijorge.niteconnect.activities.management.infrastructure;

import br.edu.unijorge.niteconnect.activities.domain.ActivityStatus;
import br.edu.unijorge.niteconnect.activities.infrastructure.ActivityRepository.Filter;
import br.edu.unijorge.niteconnect.activities.management.api.ActivityManagementContracts.*;
import br.edu.unijorge.niteconnect.projects.domain.ProjectStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Repository
public class ActivityManagementRepository {
    private static final String FROM = """
            from nite_connect.activities a
            join nite_connect.activity_assignments x on x.activity_id=a.id and x.role='EXECUTOR' and x.ended_at is null
            left join nite_connect.projects p on p.id=a.project_id
            """;
    private static final String OVERDUE = "(a.due_on is not null and a.due_on<:today and a.status in ('PLANEJADA','EM_EXECUCAO'))";
    private static final String ATTENTION = OVERDUE + " and (a.project_id is null or p.status='ATIVO')";
    private static final String EVIDENCE = "from nite_connect.activity_evidence e where e.activity_id=a.id and e.withdrawn_at is null";
    private final NamedParameterJdbcTemplate jdbc;

    public ActivityManagementRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Result query(Filter filter, UUID memberId, LocalDate today, int page, int size) {
        var params = new MapSqlParameterSource("today", today).addValue("memberId", memberId);
        var where = new StringBuilder(" where true");
        add(where, params, "a.project_id=:projectId", "projectId", filter.projectId());
        add(where, params, "a.planning_id=:planningId", "planningId", filter.planningId());
        add(where, params, "a.status=:status", "status", filter.status() == null ? null : filter.status().name());
        add(where, params, "a.priority=:priority", "priority", filter.priority());
        add(where, params, "x.member_id=:executorId", "executorId", filter.executorId());
        add(where, params, "a.due_on>=:dueFrom", "dueFrom", filter.dueFrom());
        add(where, params, "a.due_on<=:dueTo", "dueTo", filter.dueTo());
        add(where, params, "a.start_on>=:startFrom", "startFrom", filter.startFrom());
        add(where, params, "a.start_on<=:startTo", "startTo", filter.startTo());
        if (memberId != null) {
            where.append("""
                     and (a.created_by=:memberId or exists(select 1 from nite_connect.activity_assignments m
                          where m.activity_id=a.id and m.member_id=:memberId and m.ended_at is null))
                    """);
        }
        if (filter.overdue() != null) where.append(filter.overdue() ? " and " : " and not ").append(OVERDUE);
        if (filter.q() != null) {
            String pattern = "%" + filter.q().strip().replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
            add(where, params, "(a.title ilike :q escape '!' or a.description ilike :q escape '!')", "q", pattern);
        }

        // Authorization, indicators and page use the same transaction snapshot and filter.
        String scope = FROM + where;
        Summary summary = jdbc.queryForObject("""
                select count(*) total,
                       count(*) filter (where a.status='PLANEJADA') planned,
                       count(*) filter (where a.status='EM_EXECUCAO') in_progress,
                       count(*) filter (where a.status='CONCLUIDA') completed,
                       count(*) filter (where a.status='CANCELADA') cancelled,
                       count(*) filter (where %s) overdue,
                       count(*) filter (where %s) attention_required,
                       count(*) filter (where exists(select 1 %s)) with_evidence
                """.formatted(OVERDUE, ATTENTION, EVIDENCE) + scope, params, (r, n) -> {
            long total = r.getLong("total"), planned = r.getLong("planned"), inProgress = r.getLong("in_progress");
            long completed = r.getLong("completed"), cancelled = r.getLong("cancelled"), denominator = total - cancelled;
            double completionRate = denominator == 0 ? 0.0 : Math.round(completed * 10000.0 / denominator) / 100.0;
            return new Summary(total, planned, inProgress, completed, cancelled, planned + inProgress,
                    r.getLong("overdue"), r.getLong("attention_required"), r.getLong("with_evidence"), denominator, completionRate);
        });
        params.addValue("size", size).addValue("offset", (long) page * size);
        List<Item> items = jdbc.query("""
                select a.id,a.title,a.project_id,p.title project_title,p.status project_status,a.planning_id,a.status,a.priority,
                       a.start_on,a.due_on,a.created_by,x.member_id executor_id,a.created_at,a.completed_at,
                       %s overdue, (%s) attention_required, (select count(*) %s) evidence_count,
                       array(select c.member_id from nite_connect.activity_assignments c where c.activity_id=a.id
                             and c.role='COLLABORATOR' and c.ended_at is null order by c.member_id) collaborator_ids
                """.formatted(OVERDUE, ATTENTION, EVIDENCE) + scope + " order by a.created_at desc,a.id limit :size offset :offset",
                params, (r, n) -> {
            UUID creator = r.getObject("created_by", UUID.class), executor = r.getObject("executor_id", UUID.class);
            String projectStatus = r.getString("project_status");
            List<UUID> collaborators = List.of((UUID[]) r.getArray("collaborator_ids").getArray());
            List<LinkKind> links = new ArrayList<>(2);
            if (memberId == null) {
                links.add(LinkKind.CREATED);
                links.add(LinkKind.EXECUTOR);
                if (!collaborators.isEmpty()) links.add(LinkKind.COLLABORATOR);
            } else {
                if (creator.equals(memberId)) links.add(LinkKind.CREATED);
                if (executor.equals(memberId)) links.add(LinkKind.EXECUTOR);
                if (collaborators.contains(memberId)) links.add(LinkKind.COLLABORATOR);
            }
            var completedAt = r.getTimestamp("completed_at");
            return new Item(r.getObject("id", UUID.class), r.getString("title"), r.getObject("project_id", UUID.class),
                    r.getString("project_title"), projectStatus == null ? null : ProjectStatus.valueOf(projectStatus),
                    r.getObject("planning_id", UUID.class), ActivityStatus.valueOf(r.getString("status")), r.getString("priority"),
                    r.getObject("start_on", LocalDate.class), r.getObject("due_on", LocalDate.class), creator, executor,
                    collaborators, List.copyOf(links), r.getLong("evidence_count"), r.getTimestamp("created_at").toInstant(),
                    completedAt == null ? null : completedAt.toInstant(), r.getBoolean("overdue"), r.getBoolean("attention_required"));
        });
        return new Result(items, page, size, summary.total(), today, summary);
    }

    private static void add(StringBuilder where, MapSqlParameterSource params, String predicate, String name, Object value) {
        if (value != null) {
            where.append(" and ").append(predicate);
            params.addValue(name, value);
        }
    }
}

