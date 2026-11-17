package br.edu.unijorge.niteconnect.activities.infrastructure;

import br.edu.unijorge.niteconnect.activities.domain.Activity;
import br.edu.unijorge.niteconnect.activities.domain.ActivityStatus;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.sql.Timestamp;
import java.util.*;

@Repository
public class ActivityRepository {
    private final JdbcTemplate jdbc;
    private static final String SELECT = "select a.*, x.member_id as executor_id from nite_connect.activities a join nite_connect.activity_assignments x on x.activity_id=a.id and x.role='EXECUTOR' and x.ended_at is null";
    private static final RowMapper<Activity> ACTIVITY = (r,n) -> new Activity(r.getObject("id",UUID.class),r.getString("title"),
            r.getString("description"),r.getObject("project_id",UUID.class),r.getObject("planning_id",UUID.class),ActivityStatus.valueOf(r.getString("status")),
            r.getObject("start_on",LocalDate.class),r.getObject("due_on",LocalDate.class),r.getString("priority"),
            r.getObject("created_by",UUID.class),r.getLong("version"),
            r.getTimestamp("created_at").toInstant(),r.getTimestamp("updated_at").toInstant(),
            instant(r.getTimestamp("completed_at")),r.getObject("executor_id",UUID.class));
    private static final RowMapper<Assignment> ASSIGNMENT = (r,n) -> new Assignment(r.getObject("id",UUID.class),
            r.getObject("activity_id",UUID.class),r.getObject("member_id",UUID.class),r.getString("role"),
            r.getTimestamp("started_at").toInstant(),r.getObject("started_by",UUID.class),r.getString("start_reason"),
            instant(r.getTimestamp("ended_at")),r.getObject("ended_by",UUID.class),r.getString("end_reason"));
    public ActivityRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    private static Instant instant(Timestamp t) { return t==null?null:t.toInstant(); }
    public Activity require(UUID id) { return jdbc.query(SELECT+" where a.id=?",ACTIVITY,id).stream().findFirst().orElseThrow(ApiException::notFound); }
    public Activity create(UUID actor,String title,String description,UUID project,LocalDate start,LocalDate due,String priority,UUID executor,String reason) {
        UUID id=UUID.randomUUID();
        jdbc.update("insert into nite_connect.activities(id,title,description,project_id,start_on,due_on,priority,created_by) values (?,?,?,?,?,?,?,?)",id,title.strip(),description==null?"":description.strip(),project,start,due,priority,actor);
        assign(actor,id,executor,"EXECUTOR",historyReason(reason)); return require(id);
    }
    public void touch(UUID id,long version) {
        changed(jdbc.update("update nite_connect.activities set version=version+1,updated_at=clock_timestamp() where id=? and version=?",id,version));
    }
    public void update(UUID id,String title,String description,LocalDate start,LocalDate due,String priority,long version) {
        changed(jdbc.update("update nite_connect.activities set title=?,description=?,start_on=?,due_on=?,priority=?,version=version+1,updated_at=clock_timestamp() where id=? and version=?",title.strip(),description,start,due,priority,id,version));
    }
    public void status(UUID id,ActivityStatus next,long version,Instant now) {
        changed(jdbc.update("update nite_connect.activities set status=?,completed_at=?,version=version+1,updated_at=clock_timestamp() where id=? and version=?",next.name(),next==ActivityStatus.CONCLUIDA?Timestamp.from(now):null,id,version));
    }
    private void changed(int count) { if(count!=1) throw ApiException.conflict("Atividade alterada; consulte a versão atual"); }
    public List<Assignment> current(UUID id) { return jdbc.query("select * from nite_connect.activity_assignments where activity_id=? and ended_at is null order by role,started_at,id",ASSIGNMENT,id); }
    public Optional<Assignment> assigned(UUID id,UUID member) { return current(id).stream().filter(x->x.memberId().equals(member)).findFirst(); }
    public boolean personalOwner(Activity a,UUID actor) {
        return a.projectId()==null && a.createdBy().equals(actor) && a.primaryExecutorId().equals(actor)
                && !Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from nite_connect.activity_assignments where activity_id=? and member_id<>?)",Boolean.class,a.id(),actor));
    }
    public Assignment assign(UUID actor,UUID id,UUID member,String role,String reason) {
        UUID assignment=UUID.randomUUID();
        jdbc.update("insert into nite_connect.activity_assignments(id,activity_id,member_id,role,started_by,start_reason) values (?,?,?,?,?,?)",assignment,id,member,role,actor,historyReason(reason));
        return assigned(id,member).orElseThrow();
    }
    public void end(UUID actor,Assignment assignment,String reason) {
        changed(jdbc.update("update nite_connect.activity_assignments set ended_at=clock_timestamp(),ended_by=?,end_reason=? where id=? and ended_at is null",actor,reason,assignment.id()));
    }
    public void event(UUID actor,UUID id,String action,long version,String before,String after,String reason) {
        jdbc.update("insert into nite_connect.activity_events(id,activity_id,actor_id,action,activity_version,before_value,after_value,reason) values (?,?,?,?,?,?,?,?)",UUID.randomUUID(),id,actor,action,version,before,after,reason);
    }
    public PageResult<Event> history(UUID id,int page,int size) {
        PageResult.validate(page,size);
        return new PageResult<>(jdbc.query("select * from nite_connect.activity_events where activity_id=? order by occurred_at desc,id limit ? offset ?",
                (r,n)->new Event(r.getObject("id",UUID.class),id,r.getObject("actor_id",UUID.class),r.getString("action"),r.getString("reason"),r.getTimestamp("occurred_at").toInstant(),r.getLong("activity_version"),r.getString("before_value"),r.getString("after_value")),id,size,(long)page*size),page,size,
                jdbc.queryForObject("select count(*) from nite_connect.activity_events where activity_id=?",Long.class,id));
    }
    public PageResult<Assignment> assignments(UUID id,boolean history,int page,int size) {
        PageResult.validate(page,size); String where=" where activity_id=?"+(history?"":" and ended_at is null");
        return new PageResult<>(jdbc.query("select * from nite_connect.activity_assignments"+where+" order by started_at desc,id limit ? offset ?",ASSIGNMENT,id,size,(long)page*size),page,size,
                jdbc.queryForObject("select count(*) from nite_connect.activity_assignments"+where,Long.class,id));
    }
    public PageResult<PersonalPeriod> personalHistory(UUID actor,int page,int size) {
        PageResult.validate(page,size);
        return new PageResult<>(jdbc.query("select x.*,a.title,a.project_id from nite_connect.activity_assignments x join nite_connect.activities a on a.id=x.activity_id where x.member_id=? order by x.started_at desc,x.id limit ? offset ?",
                (r,n)->new PersonalPeriod(r.getObject("id",UUID.class),r.getObject("activity_id",UUID.class),r.getString("title"),r.getObject("project_id",UUID.class),r.getString("role"),r.getTimestamp("started_at").toInstant(),instant(r.getTimestamp("ended_at"))),actor,size,(long)page*size),page,size,
                jdbc.queryForObject("select count(*) from nite_connect.activity_assignments where member_id=?",Long.class,actor));
    }
    public PageResult<Activity> list(UUID actor,boolean admin,List<UUID> projects,boolean own,Filter f,LocalDate today,int page,int size) {
        PageResult.validate(page,size); List<Object> args=new ArrayList<>(); StringBuilder w=new StringBuilder(" where 1=1");
        if(!admin) {
            w.append(" and ((a.project_id is null and (a.created_by=? or exists(select 1 from nite_connect.activity_assignments s where s.activity_id=a.id and s.member_id=? and s.ended_at is null)))");
            args.add(actor); args.add(actor);
            if(!projects.isEmpty()) { w.append(" or a.project_id in (").append(String.join(",",Collections.nCopies(projects.size(),"?"))).append(")"); args.addAll(projects); }
            w.append(")");
        }
        if(own) { w.append(" and (a.created_by=? or exists(select 1 from nite_connect.activity_assignments s where s.activity_id=a.id and s.member_id=? and s.ended_at is null))");args.add(actor);args.add(actor); }
        if(f.status()!=null) { w.append(" and a.status=?");args.add(f.status().name()); }
        if(f.projectId()!=null) { w.append(" and a.project_id=?");args.add(f.projectId()); }
        if(f.planningId()!=null) { w.append(" and a.planning_id=?");args.add(f.planningId()); }
        if(f.priority()!=null) { w.append(" and a.priority=?");args.add(f.priority()); }
        if(f.executorId()!=null) { w.append(" and x.member_id=?");args.add(f.executorId()); }
        if(f.startFrom()!=null) { w.append(" and a.start_on>=?");args.add(f.startFrom()); }
        if(f.startTo()!=null) { w.append(" and a.start_on<=?");args.add(f.startTo()); }
        if(f.dueFrom()!=null) { w.append(" and a.due_on>=?");args.add(f.dueFrom()); }
        if(f.dueTo()!=null) { w.append(" and a.due_on<=?");args.add(f.dueTo()); }
        if(f.overdue()!=null) { w.append(f.overdue()?" and ":" and not ");w.append("(a.due_on is not null and a.due_on<? and a.status in ('PLANEJADA','EM_EXECUCAO'))");args.add(today); }
        if(f.q()!=null) {
            String pattern="%"+f.q().strip().replace("!","!!").replace("%","!%").replace("_","!_")+"%";
            w.append(" and (a.title ilike ? escape '!' or a.description ilike ? escape '!')");
            args.add(pattern);args.add(pattern);
        }
        String from=SELECT.substring(SELECT.indexOf(" from "));
        long total=jdbc.queryForObject("select count(*)"+from+w,Long.class,args.toArray());
        args.add(size);args.add((long)page*size);
        String order=switch(f.sort()==null?"createdAt":f.sort()) {
            case "dueOn" -> "a.due_on"; case "startOn" -> "a.start_on"; case "updatedAt" -> "a.updated_at";
            case "priority" -> "a.priority"; case "title" -> "a.title"; default -> "a.created_at";
        };
        String direction="asc".equalsIgnoreCase(f.direction())?"asc":"desc";
        return new PageResult<>(jdbc.query(SELECT+w+" order by "+order+" "+direction+" nulls last,a.id limit ? offset ?",ACTIVITY,args.toArray()),page,size,total);
    }
    private String historyReason(String reason) { return reason==null || reason.isBlank()?"Operação rotineira":reason.strip(); }
    public record Filter(ActivityStatus status,UUID projectId,UUID executorId,LocalDate dueFrom,LocalDate dueTo,Boolean overdue,String q,
                         String priority,LocalDate startFrom,LocalDate startTo,String sort,String direction,UUID planningId) {
        public Filter(ActivityStatus status,UUID projectId,UUID executorId,LocalDate dueFrom,LocalDate dueTo,Boolean overdue,String q,
                      String priority,LocalDate startFrom,LocalDate startTo,String sort,String direction) {
            this(status,projectId,executorId,dueFrom,dueTo,overdue,q,priority,startFrom,startTo,sort,direction,null);
        }
        public Filter(ActivityStatus status,UUID projectId,UUID executorId,LocalDate dueFrom,LocalDate dueTo,Boolean overdue) {
            this(status,projectId,executorId,dueFrom,dueTo,overdue,null,null,null,null,null,null,null);
        }
        public Filter(ActivityStatus status,UUID projectId,UUID executorId,LocalDate dueFrom,LocalDate dueTo,Boolean overdue,String q) {
            this(status,projectId,executorId,dueFrom,dueTo,overdue,q,null,null,null,null,null,null);
        }
        public void validate() {
            if(dueFrom!=null && dueTo!=null && dueFrom.isAfter(dueTo)) throw ApiException.invalid("Intervalo de prazo inválido");
            if(startFrom!=null && startTo!=null && startFrom.isAfter(startTo)) throw ApiException.invalid("Intervalo de início inválido");
            if(priority!=null && !List.of("ALTA","MEDIA","BAIXA").contains(priority)) throw ApiException.invalid("Prioridade inválida");
            if(sort!=null && !List.of("createdAt","updatedAt","startOn","dueOn","priority","title").contains(sort)) throw ApiException.invalid("Ordenação inválida");
            if(direction!=null && !List.of("asc","desc").contains(direction.toLowerCase(Locale.ROOT))) throw ApiException.invalid("Direção inválida");
            if(q!=null && (q.length()>160 || q.strip().codePointCount(0,q.strip().length())<2 || q.chars().anyMatch(Character::isISOControl)))
                throw ApiException.invalid("Pesquisa deve conter de 2 a 160 caracteres sem caracteres de controle");
        }
    }
    public record Assignment(UUID id,UUID activityId,UUID memberId,String role,Instant startedAt,UUID startedBy,String startReason,Instant endedAt,UUID endedBy,String endReason) {}
    public record PersonalPeriod(UUID assignmentId,UUID activityId,String activityTitle,UUID projectId,String role,Instant startedAt,Instant endedAt) {}
    public record Event(UUID id,UUID activityId,UUID actorId,String action,String reason,Instant occurredAt,long activityVersion,String before,String after) {}

    /** Read contract for project health: project activities and their latest meaningful B03 event. */
    public ProjectHealthSignals projectHealth(UUID projectId, LocalDate today, Instant now) {
        List<HealthActivity> activities = jdbc.query("""
                select a.id,a.due_on,a.status,max(e.occurred_at) as latest_relevant_at
                from nite_connect.activities a
                left join nite_connect.activity_events e on e.activity_id=a.id and e.action in
                    ('CREATED','UPDATED','STATUS_CHANGED','EXECUTOR_CHANGED','COLLABORATOR_ADDED',
                     'COLLABORATOR_REMOVED','EVIDENCE_CREATED','EVIDENCE_WITHDRAWN')
                where a.project_id=? and a.status<>'CANCELADA'
                group by a.id,a.due_on,a.status order by a.id
                """, (rs, row) -> new HealthActivity(rs.getObject("id", UUID.class),
                rs.getObject("due_on", LocalDate.class), rs.getString("status"),
                instant(rs.getTimestamp("latest_relevant_at"))), projectId);
        int maxOverdueDays = 0;
        var overdueIds = new ArrayList<UUID>();
        for (HealthActivity activity : activities) {
            if (isOpen(activity.status()) && activity.dueOn() != null && activity.dueOn().isBefore(today)) {
                int overdueDays = Math.toIntExact(ChronoUnit.DAYS.between(activity.dueOn(), today));
                if (overdueDays > maxOverdueDays) {
                    maxOverdueDays = overdueDays;
                    overdueIds.clear();
                }
                if (overdueDays == maxOverdueDays) overdueIds.add(activity.id());
            }
        }
        HealthActivity latest = activities.stream().filter(activity -> activity.relevantAt() != null)
                .max(java.util.Comparator.comparing(HealthActivity::relevantAt)).orElse(null);
        Integer daysSinceUpdate = latest == null ? null
                : Math.toIntExact(Math.max(0, ChronoUnit.DAYS.between(latest.relevantAt(), now)));
        return new ProjectHealthSignals(maxOverdueDays, daysSinceUpdate, activities.size(),
                overdueIds, latest == null ? null : latest.id());
    }

    private boolean isOpen(String status) { return status.equals("PLANEJADA") || status.equals("EM_EXECUCAO"); }

    private record HealthActivity(UUID id, LocalDate dueOn, String status, Instant relevantAt) {}
    public record ProjectHealthSignals(int maxOverdueDays, Integer daysSinceRelevantUpdate, int activityCount,
                                       List<UUID> overdueActivityIds, UUID latestUpdatedActivityId) {}
}
