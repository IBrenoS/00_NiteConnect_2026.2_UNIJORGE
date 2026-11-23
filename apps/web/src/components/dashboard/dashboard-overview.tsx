import Link from "next/link";
import type { ApiIssue, ApiResult } from "../../lib/api/contracts";
import type { DashboardContext, DashboardEvolution, DashboardOverview } from "../../lib/dashboard/overview-contracts";
import styles from "./dashboard-overview.module.css";

type Context = "personal" | "institutional";
type Period = "7" | "30" | "90";

function contextLabel(context: Context): string {
  return context === "personal" ? "Meu espaço" : "Visão geral do NITE";
}

function href(context: Context, period: Period): string {
  return `/dashboard?context=${context}&period=${period}`;
}

function PanelTitle({ title, destination, action = "Ver tudo", count }: {
  title: string;
  destination?: string;
  action?: string;
  count?: string;
}) {
  return <div className={styles.panelHeading}>
    <h2>{title}</h2>
    {count ? <span className={styles.panelCount}>{count}</span> : null}
    {destination ? <Link href={destination}>{action}<span aria-hidden="true"> ↗</span></Link> : null}
  </div>;
}

type ListItem = { title: string; meta: string; date: string; href: string; tone?: "danger" | "warning" };

function ShortList({ items, empty }: { items: ListItem[]; empty: string }) {
  if (!items.length) return <p className={styles.empty}>{empty}</p>;
  return <ul className={styles.shortList}>{items.map((item) => <li key={`${item.href}:${item.title}`}>
    <span className={`${styles.listMark} ${item.tone === "danger" ? styles.danger : item.tone === "warning" ? styles.warning : ""}`} aria-hidden="true" />
    <div className={styles.listBody}><Link href={item.href}>{item.title}</Link><small>{item.meta}</small></div><time>{item.date}</time>
  </li>)}</ul>;
}

const activityLabels = ["Planejadas", "Em execução", "Concluídas", "Canceladas"];

function ActivityDonut({ data }: { data: DashboardOverview["current"]["activities"] }) {
  const values = [data.planned, data.inProgress, data.completed, data.cancelled];
  const total = data.total;
  const parts = values.map((value) => total ? value / total * 100 : 0);
  const stops = [parts[0], parts[0] + parts[1], parts[0] + parts[1] + parts[2]];
  const gradient = total
    ? `conic-gradient(var(--nite-data-1) 0% ${stops[0]}%, var(--nite-data-2) ${stops[0]}% ${stops[1]}%, var(--nite-status-done) ${stops[1]}% ${stops[2]}%, var(--nite-data-6) ${stops[2]}% 100%)`
    : "var(--nite-surface-subtle)";
  return <div className={styles.donutRow}>
    <div className={styles.donut} style={{ background: gradient }} role="img" aria-label={values.map((value, index) => `${activityLabels[index]}: ${value}`).join(", ")}>
      <span><strong>{total}</strong><small>atividades</small></span>
    </div>
    <ul className={styles.donutLegend}>{activityLabels.map((label, index) => <li key={label}>
      <i className={styles[`dot${index + 1}`]} /><span>{label}</span><strong>{values[index]}</strong>
    </li>)}</ul>
  </div>;
}

type ChartSeries = { key: "created" | "activity" | "project"; label: string; values: number[] };

function dayRange(from: string, to: string): string[] {
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  const count = Math.max(1, Math.min(366, Math.floor((end - start) / 86_400_000) + 1));
  return Array.from({ length: count }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
}

function evolutionSeries(events: DashboardEvolution[], days: string[]): ChartSeries[] {
  const buckets = new Map(days.map((day) => [day, { created: 0, activity: 0, project: 0 }]));
  for (const event of events) {
    const bucket = buckets.get(event.day);
    if (!bucket) continue;
    if (event.source === "PROJECT") bucket.project += event.total;
    else if (event.event === "CREATED") bucket.created += event.total;
    else bucket.activity += event.total;
  }
  const values = days.map((day) => buckets.get(day) ?? { created: 0, activity: 0, project: 0 });
  const candidates: ChartSeries[] = [
    { key: "created", label: "Atividades criadas", values: values.map((item) => item.created) },
    { key: "activity", label: "Outros eventos de atividade", values: values.map((item) => item.activity) },
    { key: "project", label: "Mudanças de situação em projetos", values: values.map((item) => item.project) },
  ];
  return candidates.filter((series) => series.values.some((value) => value > 0));
}

function dateLabel(day: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

function EvolutionChart({ data, from, to }: { data: DashboardEvolution[]; from: string; to: string }) {
  const days = dayRange(from, to);
  const series = evolutionSeries(data, days);
  if (!series.length) return <p className={styles.empty}>Sem eventos registrados no período selecionado.</p>;
  const maxValue = Math.max(1, ...series.flatMap((item) => item.values));
  const scaleMax = Math.max(4, Math.ceil(maxValue / 4) * 4);
  const x = (index: number) => 24 + index * 408 / Math.max(1, days.length - 1);
  const y = (value: number) => 164 - value * 136 / scaleMax;
  const path = (values: number[]) => values.map((value, index) => `${index ? "L" : "M"} ${x(index).toFixed(2)} ${y(value).toFixed(2)}`).join(" ");
  const ticks = [0, scaleMax / 3, scaleMax * 2 / 3, scaleMax];
  const middle = Math.floor((days.length - 1) / 2);
  return <div className={styles.chartWrap}>
    <div className={styles.chartLegend}>{series.map((item) => <span key={item.key}><i className={styles[`chart${item.key[0].toUpperCase()}${item.key.slice(1)}`]} />{item.label}</span>)}</div>
    <svg viewBox="0 0 440 190" preserveAspectRatio="none" role="img" aria-label={`Eventos registrados entre ${dateLabel(from)} e ${dateLabel(to)}`} className={styles.chart}>
      {ticks.map((tick) => <g key={tick}>
        <line x1="24" x2="432" y1={y(tick)} y2={y(tick)} className={styles.gridLine} />
        <text x="18" y={y(tick) + 3} textAnchor="end" className={styles.chartTick}>{Math.round(tick)}</text>
      </g>)}
      {series.map((item) => <g key={item.key}>
        {item.key === "created" ? <path d={`${path(item.values)} L ${x(days.length - 1)} 164 L ${x(0)} 164 Z`} className={styles.chartArea} /> : null}
        <path d={path(item.values)} className={styles[`chartLine${item.key[0].toUpperCase()}${item.key.slice(1)}`]} />
      </g>)}
    </svg>
    <div className={styles.chartAxis}><span>{dateLabel(days[0])}</span><span>{dateLabel(days[middle])}</span><span>{dateLabel(days.at(-1) ?? to)}</span></div>
  </div>;
}

function issueMessage(issue: ApiIssue): string {
  if (issue === "access") return "A API negou acesso a este contexto. Nenhum indicador foi presumido.";
  if (issue === "unauthenticated") return "Sua sessão expirou. Entre novamente para carregar a Visão Geral.";
  if (issue === "invalid") return "A API retornou dados em formato inválido. Nenhum indicador foi substituído por zero.";
  if (issue === "not-found") return "O contexto solicitado não está disponível.";
  return "Não foi possível consultar a API agora. Tente novamente em instantes.";
}

function ApiError({ issue, title = "Não foi possível carregar os dados", detail }: { issue: ApiIssue; title?: string; detail?: string }) {
  return <section className={`${styles.panel} ${styles.apiError}`} role="alert"><strong>{title}</strong><p>{detail ?? issueMessage(issue)}</p></section>;
}

function periodControl(context: Context, period: Period) {
  return <div className={styles.periodControl}>
    <span>Período histórico</span><div>{(["7", "30", "90"] as const).map((item) => <Link key={item} href={href(context, item)} aria-current={period === item ? "true" : undefined}>{item} dias</Link>)}</div>
  </div>;
}

function quantity(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function Attention({ data }: { data: DashboardOverview }) {
  const projectTitles = new Map(data.projects.items.map((project) => [project.projectId, project.title]));
  const tasks = data.actions.items.slice(0, 4).map((task) => {
    const due = task.dueOn ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${task.dueOn}T12:00:00Z`)) : "Sem prazo";
    const urgency = task.overdue ? "Atrasada" : task.dueSoon ? "Até 7 dias" : due;
    const priority = task.priority ? task.priority.replaceAll("_", " ").toLocaleLowerCase("pt-BR") : "Sem prioridade";
    const project = task.projectId ? projectTitles.get(task.projectId) ?? "Projeto" : "Atividade independente";
    return { title: task.title, href: task.href, meta: `${project} · prioridade ${priority}`, date: urgency,
      ...(task.overdue ? { tone: "danger" as const } : task.dueSoon ? { tone: "warning" as const } : {}) };
  });
  return <section className={`${styles.panel} ${styles.tasksPanel}`}>
    <PanelTitle title="Precisa da sua atenção" destination="/atividades" action="Minhas atividades" count={`${Math.min(data.actions.items.length, 4)} de ${data.actions.total}`} />
    <p className={styles.panelIntro}>Ações atribuídas e executáveis · situação atual</p>
    <ShortList items={tasks} empty="Nenhuma atividade atribuída exige atenção agora." />
  </section>;
}

function Commitments({ data }: { data: DashboardOverview }) {
  const items = data.commitments.items.slice(0, 4).map((item) => {
    const date = new Date(item.startsAt);
    const day = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: data.timeZone }).format(date);
    const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: data.timeZone }).format(date);
    return { title: item.title, meta: item.source === "MEETING" ? "Reunião" : "Agenda", date: `${day} · ${time}`, href: item.href };
  });
  return <section className={`${styles.panel} ${styles.commitmentsPanel}`}>
    <PanelTitle title="Próximos compromissos" destination="/reunioes" count={`${Math.min(data.commitments.items.length, 4)} de ${data.commitments.total}`} />
    <p className={styles.panelIntro}>Reuniões e eventos confirmados</p>
    <ShortList items={items} empty="Nenhum compromisso previsto nos próximos dias." />
  </section>;
}

function Projects({ data }: { data: DashboardOverview }) {
  return <section className={`${styles.panel} ${styles.projectsPanel}`}>
    <PanelTitle title="Projetos em que participo" destination="/meus-projetos" action="Meus projetos" count={`${data.projects.items.length} de ${data.projects.total}`} />
    {data.projects.items.length ? <ul className={styles.projectList}>{data.projects.items.map((project) => <li key={project.projectId}>
      <span className={styles.projectIcon} aria-hidden="true">{project.title.slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
      <div><Link href={project.href}>{project.title}</Link><small>{project.situation.replaceAll("_", " ").toLocaleLowerCase("pt-BR")} · {quantity(project.openActivities, "atividade em aberto", "atividades em aberto")}</small></div>
      <span className={styles.projectState}>{project.leader ? "Liderança vigente" : "Participação vigente"}</span>
    </li>)}</ul> : <p className={styles.empty}>Nenhum projeto com participação vigente.</p>}
  </section>;
}

function Leadership({ data }: { data: DashboardOverview }) {
  const leaders = data.projects.items.filter((project) => project.leader);
  return <section className={`${styles.panel} ${styles.leadershipPanel}`}>
    <PanelTitle title="Sob minha liderança" destination="/meus-projetos" action="Ver projetos" count={quantity(leaders.length, "destaque", "destaques")} />
    {leaders.length ? <ul className={styles.projectList}>{leaders.map((project) => <li key={project.projectId}>
      <span className={styles.projectIcon} aria-hidden="true">{project.title.slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
      <div><Link href={project.href}>{project.title}</Link><small>{quantity(project.openActivities, "atividade em aberto", "atividades em aberto")} · {project.situation.replaceAll("_", " ").toLocaleLowerCase("pt-BR")}</small></div>
    </li>)}</ul> : <p className={styles.empty}>Nenhuma liderança vigente nos projetos retornados.</p>}
  </section>;
}

function Personal({ data, from, to, showLeadership }: { data: DashboardOverview; from: string; to: string; showLeadership: boolean }) {
  return <div className={styles.personalGrid}>
    <Attention data={data} />
    <section className={`${styles.panel} ${styles.workPanel}`}>
      <PanelTitle title="Meu trabalho" destination="/atividades" />
      <p className={styles.panelIntro}>Distribuição atual das atividades</p>
      <ActivityDonut data={data.current.activities} />
      <p className={styles.distributionMeta}>{data.current.activities.attentionRequired} com atraso executável · {data.current.activities.dueSoon} vencem em até 7 dias</p>
    </section>
    <Commitments data={data} />
    <section className={`${styles.panel} ${styles.evolutionPanel}`}>
      <PanelTitle title="Evolução das atividades" />
      <p className={styles.panelIntro}>Eventos efetivos · {periodTextForDates(from, to)}</p>
      <EvolutionChart data={data.evolution} from={from} to={to} />
    </section>
    <Projects data={data} />
    {showLeadership || data.projects.items.some((project) => project.leader) ? <Leadership data={data} /> : null}
  </div>;
}

function periodTextForDates(from: string, to: string): string {
  return `${dateLabel(from)} – ${dateLabel(to)}`;
}

function healthValues(data: DashboardOverview): number[] {
  const totals = new Map(data.current.projectHealth.map((item) => [item.situation, item.total]));
  return ["REGULAR", "ATENCAO", "CRITICO", "DADOS_INSUFICIENTES"].map((key) => totals.get(key) ?? 0);
}

function StackedBar({ values, labels, variant = "health" }: { values: number[]; labels: string[]; variant?: "health" | "projectStatus" }) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return <p className={styles.empty}>Nenhum projeto para classificar.</p>;
  return <div className={`${styles.distribution} ${variant === "health" ? styles.healthDistribution : styles.projectStatusDistribution}`}>
    <div className={styles.stackedBar} role="img" aria-label={values.map((value, index) => `${labels[index]}: ${value}`).join(", ")}>
      {values.map((value, index) => <span key={labels[index]} className={styles[`segment${index + 1}`]} style={{ width: `${value / total * 100}%` }} />)}
    </div>
    <ul className={styles.legend}>{labels.map((label, index) => <li key={label}><span className={styles[`dot${index + 1}`]} />{label}<strong>{values[index]}</strong></li>)}</ul>
  </div>;
}

function administrativeTotal(data: DashboardOverview["administrative"]): number | null {
  return data ? data.pendingProposals + data.pendingInvitations + data.failedInvitations + data.openAttendanceLists : null;
}

function Institutional({ data, from, to }: { data: DashboardOverview; from: string; to: string }) {
  const health = healthValues(data);
  const administrative = data.administrative;
  const adminTotal = administrativeTotal(administrative);
  const issueItems: ListItem[] = data.risks.items.slice(0, 3).map((risk) => ({
    title: risk.title,
    meta: `${risk.health === "CRITICO" ? "Saúde crítica" : "Saúde em atenção"} · ${risk.maxOverdueDays} dias de atraso máximo`,
    date: "Atual",
    href: risk.href,
    tone: risk.health === "CRITICO" ? "danger" : "warning",
  }));
  if (administrative && administrative.failedInvitations > 0) issueItems.push({
    title: `${administrative.failedInvitations} convite(s) com falha de envio`, meta: "Acessos e convites · verificar envio", date: "Atual", href: "/gestao/acessos-e-convites", tone: "warning",
  });
  return <div className={styles.institutionalGrid}>
    <section className={styles.overviewStrip} aria-label="Resumo institucional atual">
      <div><span>Projetos</span><strong>{data.projects.total}</strong><small>no NITE</small></div>
      <div><span>Em atenção</span><strong>{health[1]}</strong><small>saúde atual</small></div>
      <div><span>Críticos</span><strong>{health[2]}</strong><small>saúde atual</small></div>
      <div><span>Pendências administrativas</span><strong>{adminTotal ?? "—"}</strong><small>{adminTotal === null ? "indicador indisponível" : "exigem encaminhamento"}</small></div>
    </section>
    <section className={`${styles.panel} ${styles.institutionalChart}`}>
      <PanelTitle title="Evolução das atividades" />
      <p className={styles.panelIntro}>Eventos por natureza e data efetiva · {periodTextForDates(from, to)}</p>
      <EvolutionChart data={data.evolution} from={from} to={to} />
    </section>
    <section className={`${styles.panel} ${styles.healthPanel}`}>
      <PanelTitle title="Saúde dos projetos" destination="/projetos" action="Ver projetos" />
      <div className={styles.distributionBlock}>
        <p className={styles.panelIntro}>Situação atual dos projetos</p>
        <StackedBar variant="projectStatus" values={["PLANEJAMENTO", "ATIVO", "PAUSADO", "CONCLUIDO"].map((situation) =>
          data.current.projects.find((item) => item.situation === situation)?.total ?? 0)} labels={["Planejamento", "Ativos", "Pausados", "Concluídos"]} />
      </div>
      <div className={styles.distributionBlock}>
        <p className={styles.panelIntro}>Saúde consolidada · dados insuficientes não equivalem a regular</p>
        <StackedBar values={health} labels={["Regular", "Atenção", "Crítico", "Dados insuficientes"]} />
      </div>
    </section>
    <section className={`${styles.panel} ${styles.issuesPanel}`}>
      <PanelTitle title="Questões para a gestão" destination="/gestao/atividades-e-entregas" action="Acompanhar" count={quantity(data.risks.total, "risco", "riscos")} />
      <ShortList items={issueItems} empty="Nenhum risco de saúde atual foi identificado." />
    </section>
    <section className={`${styles.panel} ${styles.adminPanel}`}>
      <PanelTitle title="Pendências administrativas" destination="/gestao/acessos-e-convites" action="Abrir gestão" />
      {administrative ? <ul className={styles.adminList}>
        <li><span>Propostas pendentes</span><strong>{administrative.pendingProposals}</strong></li>
        <li><span>Convites aguardando resposta</span><strong>{administrative.pendingInvitations}</strong></li>
        <li><span>Convites com falha</span><strong>{administrative.failedInvitations}</strong></li>
        <li><span>Listas de frequência abertas</span><strong>{administrative.openAttendanceLists}</strong></li>
      </ul> : <p className={styles.unavailable}>Indicadores administrativos indisponíveis nesta resposta.</p>}
    </section>
  </div>;
}

function DataError({ result }: { result: ApiResult<DashboardOverview> }) {
  if (!result.issue) return null;
  return <ApiError issue={result.issue} />;
}

export function DashboardOverviewView({
  context,
  allowedContexts,
  period,
  from,
  to,
  result,
  contextIssue,
  showLeadership,
}: {
  context: Context;
  allowedContexts: DashboardContext[];
  period: Period;
  from: string;
  to: string;
  result: ApiResult<DashboardOverview> | null;
  contextIssue: ApiIssue | null;
  showLeadership: boolean;
}) {
  const safeContext: Context = context === "institutional" && allowedContexts.includes("INSTITUTIONAL") ? "institutional" : "personal";
  return <div className={styles.dashboardOverview}>
    <div className={styles.pageTop}>
      <div><h1>{contextLabel(safeContext)}</h1></div>
      {periodControl(safeContext, period)}
    </div>
    {allowedContexts.includes("INSTITUTIONAL") ? <nav className={styles.contextNav} aria-label="Contexto da visão geral">
      <Link href={href("personal", period)} aria-current={safeContext === "personal" ? "page" : undefined}>Meu espaço</Link>
      <Link href={href("institutional", period)} aria-current={safeContext === "institutional" ? "page" : undefined}>Visão geral do NITE</Link>
    </nav> : null}
    {contextIssue ? <ApiError issue={contextIssue} title="Não foi possível confirmar os contextos autorizados" detail={contextIssue === "access" ? "A API não confirmou acesso à Visão Geral. Nenhum indicador foi consultado." : undefined} /> : null}
    {!contextIssue && context === "institutional" && !allowedContexts.includes("INSTITUTIONAL") ? <ApiError issue="access" title="Contexto institucional não autorizado" /> : null}
    {!contextIssue && !result ? <p className={styles.unavailable} role="status">Carregando dados da Visão Geral…</p> : null}
    {!contextIssue && result?.issue ? <DataError result={result} /> : null}
    {!contextIssue && result?.data?.context !== (safeContext === "personal" ? "PERSONAL" : "INSTITUTIONAL") ? result?.data ? <ApiError issue="invalid" title="A resposta da API não corresponde ao contexto solicitado" /> : null : null}
    {!contextIssue && result?.data && result.data.context === (safeContext === "personal" ? "PERSONAL" : "INSTITUTIONAL")
      ? safeContext === "personal" ? <Personal data={result.data} from={from} to={to} showLeadership={showLeadership} /> : <Institutional data={result.data} from={from} to={to} />
      : null}
  </div>;
}

export function DashboardLoading() {
  return <div className={styles.dashboardOverview}>
    <div className={styles.pageTop}><div><h1>Meu espaço</h1></div><span className={styles.loadingLabel}>Carregando</span></div>
    <div className={styles.loading} role="status" aria-label="Carregando a Visão Geral"><div /><div /><div /><div /></div>
  </div>;
}
