package br.edu.unijorge.niteconnect.analytics.infrastructure;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.LinkedHashMap;
import java.util.Map;

/** Read-only B07 projections from the authoritative B02-B04 tables. */
@Repository
public class AnalyticsRepository {
    private final JdbcTemplate jdbc;
    public AnalyticsRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<List<String>> activities(UUID projectId, UUID memberId, Instant from, Instant to,String status) {
        StringBuilder where = new StringBuilder(" where (a.project_id is null or p.deleted_at is null) and a.created_at < ? and a.created_at >= ?");
        var args = new ArrayList<Object>(List.of(Timestamp.from(to),Timestamp.from(from)));
        if (projectId != null) { where.append(" and a.project_id=?"); args.add(projectId); }
        if (memberId != null) { where.append(" and x.member_id=?"); args.add(memberId); }
        if (status != null) { where.append(" and a.status=?"); args.add(status); }
        return jdbc.query("""
                select a.id::text, coalesce(p.title,'Atividade independente'), a.title, m.name, a.status,
                       a.created_at::text, coalesce(a.due_on::text,''), coalesce(a.completed_at::text,''),
                       case when a.due_on < current_date and a.status in ('PLANEJADA','EM_EXECUCAO') then 'true' else 'false' end
                from nite_connect.activities a
                join nite_connect.activity_assignments x on x.activity_id=a.id and x.role='EXECUTOR' and x.ended_at is null
                join nite_connect.members m on m.id=x.member_id
                left join nite_connect.projects p on p.id=a.project_id
                """ + where + " order by a.created_at,a.id limit 1000", (rs, row) -> List.of(
                rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5),
                rs.getString(6), rs.getString(7), rs.getString(8), rs.getString(9)), args.toArray());
    }

    public long countActivities(UUID projectId,UUID memberId,Instant from,Instant to,String status) {
        StringBuilder where=new StringBuilder(" where (a.project_id is null or exists(select 1 from nite_connect.projects p where p.id=a.project_id and p.deleted_at is null)) and a.created_at>=? and a.created_at<?");
        var args=new ArrayList<Object>(List.of(Timestamp.from(from),Timestamp.from(to)));
        if(projectId!=null){where.append(" and a.project_id=?");args.add(projectId);}
        if(memberId!=null){where.append(" and x.member_id=?");args.add(memberId);}
        if(status!=null){where.append(" and a.status=?");args.add(status);}
        return jdbc.queryForObject("select count(*) from nite_connect.activities a join nite_connect.activity_assignments x on x.activity_id=a.id and x.role='EXECUTOR' and x.ended_at is null"+where,Long.class,args.toArray());
    }

    public List<List<String>> projects(UUID projectId, UUID memberId, Instant from, Instant to,String status) {
        StringBuilder where = new StringBuilder(" where p.deleted_at is null");
        var args = new ArrayList<Object>();
        if (projectId != null) { where.append(" and p.id=?"); args.add(projectId); }
        if (memberId != null) {
            where.append(" and exists(select 1 from nite_connect.project_memberships pm where pm.project_id=p.id and pm.member_id=? and pm.started_at<? and (pm.ended_at is null or pm.ended_at>=?))");
            args.add(memberId);args.add(Timestamp.from(to));args.add(Timestamp.from(from));
        }
        if(status!=null){where.append(" and p.status=?");args.add(status);}
        return jdbc.query("""
                select p.id::text,p.title,p.status,
                       count(a.id)::bigint::text,
                       count(a.id) filter(where a.status in ('PLANEJADA','EM_EXECUCAO') and a.due_on < current_date)::bigint::text,
                       count(a.id) filter(where a.status='CONCLUIDA')::bigint::text,
                       (select count(*) from nite_connect.project_memberships pm where pm.project_id=p.id and pm.ended_at is null)::text,
                       count(a.id) filter(where a.status in ('PLANEJADA','EM_EXECUCAO'))::bigint::text
                from nite_connect.projects p left join nite_connect.activities a on a.project_id=p.id
                """ + where + " group by p.id,p.title,p.status order by p.title,p.id limit 200",
                (rs,row)->List.of(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getString(5),rs.getString(6),rs.getString(7),rs.getString(8)),args.toArray());
    }

    public long countProjects(UUID projectId,UUID memberId,Instant from,Instant to,String status) {
        StringBuilder where=new StringBuilder(" where p.deleted_at is null");
        var args=new ArrayList<Object>();
        if(projectId!=null){where.append(" and p.id=?");args.add(projectId);}
        if(memberId!=null){where.append(" and exists(select 1 from nite_connect.project_memberships pm where pm.project_id=p.id and pm.member_id=? and pm.started_at<? and (pm.ended_at is null or pm.ended_at>=?))");args.add(memberId);args.add(Timestamp.from(to));args.add(Timestamp.from(from));}
        if(status!=null){where.append(" and p.status=?");args.add(status);}
        return jdbc.queryForObject("select count(*) from nite_connect.projects p"+where,Long.class,args.toArray());
    }

    public Map<String,Long> activityDashboardMetrics(UUID projectId,UUID memberId,Instant from,Instant to) {
        StringBuilder where=new StringBuilder(" where (a.project_id is null or exists(select 1 from nite_connect.projects p where p.id=a.project_id and p.deleted_at is null)) and a.created_at>=? and a.created_at<?");
        var args=new ArrayList<Object>(List.of(Timestamp.from(from),Timestamp.from(to)));
        if(projectId!=null){where.append(" and a.project_id=?");args.add(projectId);}
        if(memberId!=null){where.append(" and x.member_id=?");args.add(memberId);}
        return jdbc.queryForObject("""
                select count(*) filter(where a.status='PLANEJADA')::bigint planned,
                       count(*) filter(where a.status='EM_EXECUCAO')::bigint in_progress,
                       count(*) filter(where a.status='CONCLUIDA')::bigint completed,
                       count(*) filter(where a.status='CANCELADA')::bigint cancelled,
                       count(*) filter(where a.due_on<current_date and a.status in ('PLANEJADA','EM_EXECUCAO'))::bigint overdue
                from nite_connect.activities a
                join nite_connect.activity_assignments x on x.activity_id=a.id and x.role='EXECUTOR' and x.ended_at is null
                """+where, (rs,row)->Map.of(
                "activities.planejada",rs.getLong("planned"),"activities.em_execucao",rs.getLong("in_progress"),
                "activities.concluida",rs.getLong("completed"),"activities.cancelada",rs.getLong("cancelled"),
                "overdueActivitiesNow",rs.getLong("overdue")),args.toArray());
    }

    public Map<String,Long> projectDashboardMetrics(UUID projectId,UUID memberId,Instant from,Instant to,String status) {
        StringBuilder where=new StringBuilder(" where p.deleted_at is null");
        var args=new ArrayList<Object>();
        if(projectId!=null){where.append(" and p.id=?");args.add(projectId);}
        if(memberId!=null){
            where.append(" and exists(select 1 from nite_connect.project_memberships pm where pm.project_id=p.id and pm.member_id=? and pm.started_at<? and (pm.ended_at is null or pm.ended_at>=?))");
            args.add(memberId);args.add(Timestamp.from(to));args.add(Timestamp.from(from));
        }
        if(status!=null){where.append(" and p.status=?");args.add(status);}
        return jdbc.queryForObject("""
                select count(distinct p.id)::bigint projects,count(a.id)::bigint activities,
                       count(a.id) filter(where a.due_on<current_date and a.status in ('PLANEJADA','EM_EXECUCAO'))::bigint overdue,
                       count(a.id) filter(where a.status='CONCLUIDA')::bigint completed,
                       count(a.id) filter(where a.status in ('PLANEJADA','EM_EXECUCAO'))::bigint open
                from nite_connect.projects p left join nite_connect.activities a on a.project_id=p.id
                """+where, (rs,row)->Map.of("projects",rs.getLong("projects"),"activities",rs.getLong("activities"),
                "overdueActivitiesNow",rs.getLong("overdue"),"completedActivities",rs.getLong("completed"),"openActivities",rs.getLong("open")),args.toArray());
    }


    public List<List<String>> historicalEvents(UUID projectId, Instant from, Instant to) {
        String projectFilter=projectId==null?"":" and p.id=?";
        var args=new ArrayList<Object>(); args.add(Timestamp.from(from));args.add(Timestamp.from(to));
        if(projectId!=null) args.add(projectId);
        args.add(Timestamp.from(from));args.add(Timestamp.from(to));
        if(projectId!=null) args.add(projectId);
        return jdbc.query("""
                select source_type,source_id,project_id,project_title,action,occurred_at,previous_state,current_state
                from (
                  select 'PROJECT'::text source_type,h.id::text source_id,h.project_id,p.title project_title,'STATUS_CHANGED'::text action,
                         h.occurred_at,coalesce(h.previous_status,'') previous_state,h.new_status current_state
                  from nite_connect.project_status_history h join nite_connect.projects p on p.id=h.project_id
                  where h.occurred_at>=? and h.occurred_at<?
                  """+projectFilter+"""
                  union all
                  select 'ACTIVITY'::text,e.id::text source_id,a.project_id,coalesce(p.title,'Atividade independente') project_title,
                         e.action,e.occurred_at,coalesce(e.before_value,''),coalesce(e.after_value,'')
                  from nite_connect.activity_events e join nite_connect.activities a on a.id=e.activity_id
                  left join nite_connect.projects p on p.id=a.project_id
                  where e.occurred_at>=? and e.occurred_at<?
                """+ (projectId==null?"":" and a.project_id=?") + ") changes order by occurred_at,source_type,source_id limit 2000",
                (rs,row)->List.of(rs.getString(1),rs.getString(2),rs.getString(3)==null?"":rs.getString(3),rs.getString(4),rs.getString(5),rs.getString(6),rs.getString(7),rs.getString(8)),args.toArray());
    }

    public long countHistoricalEvents(UUID projectId,Instant from,Instant to) {
        String projectFilter=projectId==null?"":" and project_id=?";
        String activityFilter=projectId==null?"":" and a.project_id=?";
        var args=new ArrayList<Object>(List.of(Timestamp.from(from),Timestamp.from(to)));
        if(projectId!=null) args.add(projectId);
        args.add(Timestamp.from(from));args.add(Timestamp.from(to));if(projectId!=null)args.add(projectId);
        return jdbc.queryForObject("""
                select (select count(*) from nite_connect.project_status_history where occurred_at>=? and occurred_at<?
                """+projectFilter+") + (select count(*) from nite_connect.activity_events e join nite_connect.activities a on a.id=e.activity_id where e.occurred_at>=? and e.occurred_at<?"+activityFilter+")",
                Long.class,args.toArray());
    }

    public Map<String,Long> comparisonMetrics(UUID projectId,UUID memberId,Instant from,Instant to) {
        var metrics=new LinkedHashMap<String,Long>();
        String activityScope="";var activityArgs=new ArrayList<Object>(List.of(Timestamp.from(from),Timestamp.from(to)));
        if(projectId!=null){activityScope+=" and a.project_id=?";activityArgs.add(projectId);}
        if(memberId!=null){activityScope+=" and exists(select 1 from nite_connect.activity_assignments x where x.activity_id=a.id and x.member_id=? and x.started_at<? and (x.ended_at is null or x.ended_at>=?))";activityArgs.add(memberId);activityArgs.add(Timestamp.from(to));activityArgs.add(Timestamp.from(from));}
        metrics.put("activityCreations",jdbc.queryForObject("select count(*) from nite_connect.activities a where a.created_at>=? and a.created_at<?"+activityScope,Long.class,activityArgs.toArray()));
        String eventScope="";var eventArgs=new ArrayList<Object>(List.of(Timestamp.from(from),Timestamp.from(to)));
        if(projectId!=null){eventScope+=" and a.project_id=?";eventArgs.add(projectId);}
        if(memberId!=null){eventScope+=" and exists(select 1 from nite_connect.activity_assignments x where x.activity_id=a.id and x.member_id=? and x.started_at<e.occurred_at and (x.ended_at is null or x.ended_at>=e.occurred_at))";eventArgs.add(memberId);}
        metrics.put("activityEvents",jdbc.queryForObject("select count(*) from nite_connect.activity_events e join nite_connect.activities a on a.id=e.activity_id where e.occurred_at>=? and e.occurred_at<?"+eventScope,Long.class,eventArgs.toArray()));
        if(memberId==null){
            String projectScope=projectId==null?"":" and project_id=?";
            Object[] args=projectId==null?new Object[]{Timestamp.from(from),Timestamp.from(to)}:new Object[]{Timestamp.from(from),Timestamp.from(to),projectId};
            metrics.put("projectStatusChanges",jdbc.queryForObject("select count(*) from nite_connect.project_status_history where occurred_at>=? and occurred_at<?"+projectScope,Long.class,args));
        }
        return Map.copyOf(metrics);
    }
}
