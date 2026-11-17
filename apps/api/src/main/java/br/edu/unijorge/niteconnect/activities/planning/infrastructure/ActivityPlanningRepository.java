package br.edu.unijorge.niteconnect.activities.planning.infrastructure;

import br.edu.unijorge.niteconnect.activities.planning.domain.ActivityPlanning;
import br.edu.unijorge.niteconnect.activities.planning.domain.ActivityStatistics;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;
import java.util.*;

@Repository
public class ActivityPlanningRepository {
    private static final String COLUMNS="id,title,description,project_id,created_by,version,created_at,updated_at";
    private static final org.springframework.jdbc.core.RowMapper<ActivityPlanning> MAPPER=(r,n)->new ActivityPlanning(
            r.getObject("id",UUID.class),r.getString("title"),r.getString("description"),r.getObject("project_id",UUID.class),
            r.getObject("created_by",UUID.class),r.getLong("version"),r.getTimestamp("created_at").toInstant(),r.getTimestamp("updated_at").toInstant());
    private final JdbcTemplate jdbc;
    public ActivityPlanningRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public ActivityPlanning require(UUID id) { return jdbc.query("select "+COLUMNS+" from nite_connect.activity_plannings where id=?",MAPPER,id).stream().findFirst().orElseThrow(ApiException::notFound); }
    public ActivityPlanning lock(UUID id) { return jdbc.query("select "+COLUMNS+" from nite_connect.activity_plannings where id=? for update",MAPPER,id).stream().findFirst().orElseThrow(ApiException::notFound); }
    public ActivityPlanning create(UUID actor,String title,String description,UUID project) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into nite_connect.activity_plannings(id,title,description,project_id,created_by) values (?,?,?,?,?)",id,title.strip(),description==null?"":description.strip(),project,actor);
        return require(id);
    }
    public void update(UUID id,String title,String description,long version) {
        changed(jdbc.update("update nite_connect.activity_plannings set title=?,description=?,version=version+1,updated_at=clock_timestamp() where id=? and version=?",title.strip(),description==null?"":description.strip(),id,version));
    }
    public long taskCount(UUID id) { return jdbc.queryForObject("select count(*) from nite_connect.activities where planning_id=?",Long.class,id); }
    public List<TaskRef> tasksForUpdate(UUID id) {
        return jdbc.query("select id,version from nite_connect.activities where planning_id=? order by id for update",
                (r,n)->new TaskRef(r.getObject("id",UUID.class),r.getLong("version")),id);
    }
    public long detachTask(UUID id,long version) {
        changed(jdbc.update("update nite_connect.activities set planning_id=null,version=version+1,updated_at=clock_timestamp() where id=? and planning_id is not null and version=?",id,version));
        return version+1;
    }
    public void attachTask(UUID taskId,UUID planningId,long taskVersion) {
        changed(jdbc.update("update nite_connect.activities set planning_id=?,version=version+1,updated_at=clock_timestamp() where id=? and planning_id is null and version=?",planningId,taskId,taskVersion));
    }
    public void touch(UUID id,long version) {
        changed(jdbc.update("update nite_connect.activity_plannings set version=version+1,updated_at=clock_timestamp() where id=? and version=?",id,version));
    }
    public void delete(UUID id,long version) {
        changed(jdbc.update("delete from nite_connect.activity_plannings where id=? and version=?",id,version));
    }
    public PageResult<ActivityPlanning> list(UUID actor,boolean admin,List<UUID> projectIds,UUID projectId,String q,int page,int size) {
        PageResult.validate(page,size);
        var where=new StringBuilder(" where 1=1"); var args=new ArrayList<Object>();
        if(!admin) {
            where.append(" and ((project_id is null and created_by=?)"); args.add(actor);
            if(!projectIds.isEmpty()) { where.append(" or project_id in (").append(String.join(",",Collections.nCopies(projectIds.size(),"?"))).append(")");args.addAll(projectIds); }
            where.append(")");
        }
        if(projectId!=null) { where.append(" and project_id=?");args.add(projectId); }
        if(q!=null&&!q.isBlank()) { String pattern="%"+escape(q.strip())+"%";where.append(" and (title ilike ? escape '!' or description ilike ? escape '!')");args.add(pattern);args.add(pattern); }
        long total=jdbc.queryForObject("select count(*) from nite_connect.activity_plannings"+where,Long.class,args.toArray());
        args.add(size);args.add((long)page*size);
        return new PageResult<>(jdbc.query("select "+COLUMNS+" from nite_connect.activity_plannings"+where+" order by updated_at desc,id limit ? offset ?",MAPPER,args.toArray()),page,size,total);
    }
    public ActivityStatistics planningStats(UUID id,LocalDate today) { return stats("a.planning_id=?",List.of(id),today); }
    public ActivityStatistics projectStats(UUID id,LocalDate today) { return stats("a.project_id=?",List.of(id),today); }
    public ActivityStatistics memberStats(UUID member,LocalDate today) {
        return stats("(a.created_by=? or exists(select 1 from nite_connect.activity_assignments s where s.activity_id=a.id and s.member_id=? and s.ended_at is null))",List.of(member,member),today);
    }
    public ActivityStatistics memberProjectStats(UUID member,UUID project,LocalDate today) {
        return stats("a.project_id=? and (a.created_by=? or exists(select 1 from nite_connect.activity_assignments s where s.activity_id=a.id and s.member_id=? and s.ended_at is null))",List.of(project,member,member),today);
    }
    public ActivityStatistics personalStats(UUID actor,boolean admin,List<UUID> projectIds,LocalDate today) {
        var where=new StringBuilder("(a.created_by=? or exists(select 1 from nite_connect.activity_assignments s where s.activity_id=a.id and s.member_id=? and s.ended_at is null))");
        var args=new ArrayList<Object>();args.add(actor);args.add(actor);
        if(!admin) {
            where.append(" and (a.project_id is null");
            if(!projectIds.isEmpty()) { where.append(" or a.project_id in (").append(String.join(",",Collections.nCopies(projectIds.size(),"?"))).append(")");args.addAll(projectIds); }
            where.append(")");
        }
        return stats(where.toString(),args,today);
    }
    private ActivityStatistics stats(String predicate,List<?> arguments,LocalDate today) {
        var args=new ArrayList<Object>();args.add(today);args.addAll(arguments);
        var row=jdbc.queryForMap("""
                select count(distinct a.id) total,
                  count(distinct a.id) filter(where a.status='PLANEJADA') planned,
                  count(distinct a.id) filter(where a.status='EM_EXECUCAO') in_progress,
                  count(distinct a.id) filter(where a.status='CONCLUIDA') completed,
                  count(distinct a.id) filter(where a.status='CANCELADA') cancelled,
                  count(distinct a.id) filter(where a.status in ('PLANEJADA','EM_EXECUCAO') and a.due_on<?) overdue
                from nite_connect.activities a where """+" "+predicate,args.toArray());
        long total=((Number)row.get("total")).longValue(),planned=((Number)row.get("planned")).longValue(),inProgress=((Number)row.get("in_progress")).longValue();
        long completed=((Number)row.get("completed")).longValue(),cancelled=((Number)row.get("cancelled")).longValue(),overdue=((Number)row.get("overdue")).longValue();
        long denominator=total-cancelled;
        return new ActivityStatistics(total,planned,inProgress,completed,cancelled,overdue,denominator,
                ratio(planned,total),ratio(inProgress,total),ratio(completed,total),ratio(cancelled,total),ratio(completed,denominator));
    }
    private static double ratio(long count,long denominator) { return denominator==0?0.0:Math.round(count*10000.0/denominator)/100.0; }
    private static String escape(String value) { return value.replace("!","!!").replace("%","!%").replace("_","!_"); }
    private static void changed(int count) { if(count!=1) throw ApiException.conflict("O planejamento foi alterado; consulte a versão atual"); }
    public record TaskRef(UUID id,long version) {}
}
