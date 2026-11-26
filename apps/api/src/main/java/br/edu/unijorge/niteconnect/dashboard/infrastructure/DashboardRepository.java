package br.edu.unijorge.niteconnect.dashboard.infrastructure;

import br.edu.unijorge.niteconnect.dashboard.api.DashboardContracts.*;
import org.springframework.jdbc.core.namedparam.*;
import org.springframework.stereotype.Repository;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

/** Bounded highlights and SQL aggregates; never reuses the legacy creation-window dashboard. */
@Repository
public class DashboardRepository {
    private final NamedParameterJdbcTemplate jdbc;
    public DashboardRepository(NamedParameterJdbcTemplate jdbc) { this.jdbc=jdbc; }
    private static final String SCOPE="""
        with projects_scope as (
          select p.*,exists(select 1 from nite_connect.project_leadership_history l
            join nite_connect.project_memberships m on m.id=l.membership_id and m.ended_at is null
            where l.project_id=p.id and l.member_id=:actor and l.ended_at is null) leader
          from nite_connect.projects p where p.deleted_at is null and (:institutional or exists(
            select 1 from nite_connect.project_memberships m where m.project_id=p.id and m.member_id=:actor and m.ended_at is null)
          )
        ), activities_scope as (
          select a.*,p.status project_status,
            a.created_by=:actor created,
            exists(select 1 from nite_connect.activity_assignments x where x.activity_id=a.id
              and x.member_id=:actor and x.role='EXECUTOR' and x.ended_at is null) executor,
            exists(select 1 from nite_connect.activity_assignments x where x.activity_id=a.id
              and x.member_id=:actor and x.role='COLLABORATOR' and x.ended_at is null) collaborator
          from nite_connect.activities a left join nite_connect.projects p on p.id=a.project_id
          where (a.project_id is null or p.deleted_at is null) and (:institutional or (
            (a.project_id is null or :admin or exists(select 1 from projects_scope ps where ps.id=a.project_id))
            and (a.created_by=:actor or exists(select 1 from nite_connect.activity_assignments x
              where x.activity_id=a.id and x.member_id=:actor and x.ended_at is null))))
        ), signals as (
          select a.*,status in ('PLANEJADA','EM_EXECUCAO') and due_on<:today overdue,
            status in ('PLANEJADA','EM_EXECUCAO') and due_on between :today and :soon due_soon,
            status in ('PLANEJADA','EM_EXECUCAO') and (project_id is null or project_status='ATIVO') executable
          from activities_scope a
        ), actions as (
          select * from signals where executable and (executor or collaborator)
            and (start_on is null or start_on<=:today)
        )
        """;
    public Overview overview(UUID actor,boolean institutional,boolean admin,LocalDate from,LocalDate to,
                             LocalDate today,Instant now,ZoneId zone) {
        var args=new MapSqlParameterSource("actor",actor).addValue("institutional",institutional).addValue("admin",admin)
            .addValue("today",today).addValue("soon",today.plusDays(7)).addValue("now",Timestamp.from(now))
            .addValue("upcoming",Timestamp.from(today.plusDays(15).atStartOfDay(zone).toInstant()))
            .addValue("start",Timestamp.from(from.atStartOfDay(zone).toInstant()))
            .addValue("end",Timestamp.from(to.plusDays(1).atStartOfDay(zone).toInstant())).addValue("zone",zone.getId());
        Distribution distribution=jdbc.queryForObject(SCOPE+"""
            select count(*) total,count(*) filter(where status='PLANEJADA') planned,
              count(*) filter(where status='EM_EXECUCAO') in_progress,count(*) filter(where status='CONCLUIDA') completed,
              count(*) filter(where status='CANCELADA') cancelled,count(*) filter(where overdue) overdue,
              count(*) filter(where overdue and executable) attention,
              count(*) filter(where due_soon and executable) due_soon from signals
            """,args,(r,n)->new Distribution(r.getLong("total"),r.getLong("planned"),r.getLong("in_progress"),
                r.getLong("completed"),r.getLong("cancelled"),r.getLong("overdue"),r.getLong("attention"),r.getLong("due_soon")));
        var projectCounts=jdbc.query(SCOPE+"select status,count(*) total from projects_scope group by status order by status",
            args,(r,n)->new Count(r.getString("status"),r.getLong("total")));
        // Mirrors ProjectHealthRules using the current policy, non-cancelled activities and meaningful B03 events.
        String healthScope=SCOPE+"""
            , activity_health as (
              select a.project_id,count(*) activity_count,
                coalesce(max(:today-a.due_on) filter(where a.status in ('PLANEJADA','EM_EXECUCAO') and a.due_on<:today),0) delay,
                max(e.latest) latest
              from nite_connect.activities a join projects_scope p on p.id=a.project_id
              left join lateral (select max(e.occurred_at) latest from nite_connect.activity_events e
                where e.activity_id=a.id and e.action in ('CREATED','UPDATED','STATUS_CHANGED','EXECUTOR_CHANGED',
                  'COLLABORATOR_ADDED','COLLABORATOR_REMOVED','EVIDENCE_CREATED','EVIDENCE_WITHDRAWN')) e on true
              where a.status<>'CANCELADA' group by a.project_id
            ), health_signals as (
              select p.id,p.title,p.status,h.activity_count,h.delay,
                greatest(0,floor(extract(epoch from (:now-h.latest))/86400)) silence,
                h.latest,v.attention_overdue_days,v.critical_overdue_days,
                v.attention_no_update_days,v.critical_no_update_days
              from projects_scope p left join activity_health h on h.project_id=p.id
              left join nite_connect.project_health_policy_versions v on v.project_id=p.id and v.valid_until is null
            ), health as (
              select *,case
                when status<>'ATIVO' or attention_overdue_days is null or coalesce(activity_count,0)=0 then 'DADOS_INSUFICIENTES'
                when delay>=critical_overdue_days or (latest is not null and silence>=critical_no_update_days) then 'CRITICO'
                when delay>=attention_overdue_days or (latest is not null and silence>=attention_no_update_days) then 'ATENCAO'
                when latest is null and attention_no_update_days is not null then 'DADOS_INSUFICIENTES'
                else 'REGULAR' end situation from health_signals
            ) 
            """;
        var healthCounts=jdbc.query(healthScope+"select situation,count(*) total from health group by situation order by situation",args,
            (r,n)->new Count(r.getString("situation"),r.getLong("total")));
        var risks=jdbc.query(healthScope+"select * from health where situation in ('CRITICO','ATENCAO') order by case situation when 'CRITICO' then 0 else 1 end,delay desc,id limit 6",args,
            (r,n)->new Risk(r.getObject("id",UUID.class),r.getString("title"),r.getString("situation"),r.getInt("delay"),
                "Política vigente: atraso máximo="+r.getInt("delay")+" dias; dias sem atualização="+r.getObject("silence"),"/projetos/"+r.getObject("id",UUID.class)));
        long actionCount=count(SCOPE+"select count(*) from actions",args);
        var tasks=jdbc.query(SCOPE+"""
            select * from actions order by overdue desc nulls last,due_soon desc nulls last,
              case priority when 'ALTA' then 0 when 'MEDIA' then 1 when 'BAIXA' then 2 else 3 end,
              due_on nulls last,id limit 6
            """,args,(r,n)-> {
                var links=new ArrayList<String>();
                if(r.getBoolean("created"))links.add("CREATED");
                if(r.getBoolean("executor"))links.add("EXECUTOR");
                if(r.getBoolean("collaborator"))links.add("COLLABORATOR");
                UUID id=r.getObject("id",UUID.class);
                return new Task(id,r.getString("title"),r.getString("priority"),r.getObject("due_on",LocalDate.class),
                    r.getObject("project_id",UUID.class),List.copyOf(links),r.getBoolean("overdue"),r.getBoolean("due_soon"),"/atividades/"+id);
            });
        var projectItems=jdbc.query(SCOPE+"""
            select p.*,(select count(*) from nite_connect.activities a where a.project_id=p.id
              and a.status in ('PLANEJADA','EM_EXECUCAO')) open from projects_scope p
            order by leader desc,title,id limit 6
            """,args,(r,n)->new Project(r.getObject("id",UUID.class),r.getString("title"),r.getString("status"),
                r.getBoolean("leader"),r.getLong("open"),"/projetos/"+r.getObject("id",UUID.class)));
        var evolution=jdbc.query(SCOPE+"""
            , events as (
              select a.created_at occurred_at,'ACTIVITY' source,'CREATED' event from activities_scope a
              union all
              select e.occurred_at,'ACTIVITY',e.action from nite_connect.activity_events e
                join activities_scope a on a.id=e.activity_id where e.action<>'CREATED'
              union all
              select h.occurred_at,'PROJECT',h.new_status from nite_connect.project_status_history h
                join projects_scope p on p.id=h.project_id
            )
            select (occurred_at at time zone :zone)::date event_day,source,event,count(*) total from events
              where occurred_at>=:start and occurred_at<:end group by event_day,source,event order by event_day,source,event
            """,args,(r,n)->new Evolution(r.getObject("event_day",LocalDate.class),r.getString("source"),r.getString("event"),r.getLong("total")));
        String commitments="""
            with commitments as (
              select m.id,'MEETING' source,m.title,m.starts_at,'/reunioes' href from nite_connect.meetings m
              where m.status='AGENDADA' and (m.organizer_member_id=:actor or exists(
                select 1 from nite_connect.meeting_invites i where i.meeting_id=m.id and i.member_id=:actor
                  and i.internal_status in ('PENDENTE','ACEITO') and i.calendar_response_status<>'DECLINED'))
              union all
              select e.id,'AGENDA',e.title,e.starts_at,'/frequencia' from nite_connect.calendar_events e
                join nite_connect.event_participants p on p.event_id=e.id and p.member_id=:actor
              where e.status='AGENDADO' and e.kind<>'FERIADO'
            ) 
            """;
        var appointments=jdbc.query(commitments+"""
            select * from commitments where starts_at>=:now and starts_at<:upcoming
            order by starts_at,source,id limit 6
            """,args,(r,n)->new Commitment(r.getObject("id",UUID.class),r.getString("source"),r.getString("title"),
                r.getTimestamp("starts_at").toInstant(),r.getString("href")));
        long appointmentCount=count(commitments+"select count(*) from commitments where starts_at>=:now and starts_at<:upcoming",args);
        Administrative administrative=institutional?jdbc.queryForObject("""
            select (select count(*) from nite_connect.project_proposals where status='PENDENTE') proposals,
              (select count(*) from nite_connect.invitations where accepted_at is null and revoked_at is null and expires_at>:now and send_state<>'FAILED') invitations,
              (select count(*) from nite_connect.invitations where accepted_at is null and revoked_at is null and expires_at>:now and send_state='FAILED') failed,
              (select count(*) from nite_connect.attendance_lists where status='ABERTA' and deleted_at is null) attendance
            """,args,(r,n)->new Administrative(r.getLong("proposals"),r.getLong("invitations"),r.getLong("failed"),r.getLong("attendance"))):null;
        return new Overview(institutional?"INSTITUTIONAL":"PERSONAL",now,today,zone.getId(),from,to,
            new Current(distribution,projectCounts,healthCounts),new Highlights<>(healthCounts.stream().filter(c->List.of("CRITICO","ATENCAO").contains(c.situation())).mapToLong(Count::total).sum(),risks),evolution,new Highlights<>(actionCount,tasks),
            new Highlights<>(projectCounts.stream().mapToLong(Count::total).sum(),projectItems),
            new Highlights<>(appointmentCount,appointments),administrative,List.of(
                new Unavailable("formalApprovedDeliveries","Conclusão de atividade e evidência não representam aprovação formal de entrega."),
                new Unavailable("historicalState","Eventos não reconstituem snapshots completos; evolução usa autorização e vínculos atuais."),
                new Unavailable("productivity","Não há indicador persistido de produtividade; duração prevista de reunião não é presença comprovada.")));
    }
    private long count(String sql,MapSqlParameterSource args) { return Objects.requireNonNull(jdbc.queryForObject(sql,args,Long.class)); }
}
