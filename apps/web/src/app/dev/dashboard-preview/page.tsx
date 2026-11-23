import { notFound } from "next/navigation";
import Link from "next/link";
import { AuthenticatedShell } from "../../../components/shell/authenticated-shell";
import styles from "./preview.module.css";

export const dynamic = "force-dynamic";

type Role = "integrante" | "projeto" | "geral" | "coordenador";
type Density = "dados" | "poucos" | "vazio" | "carregando";
type Context = "personal" | "institutional";
type Period = "7" | "30" | "90";
type PreviewState = { role: Role; density: Density; context: Context; period: Period };
type Item = { title: string; meta: string; date: string; href?: string; tone?: "danger" | "warning" };

const roleLabels: Record<Role, string> = { integrante: "Integrante", projeto: "Gestor de projeto", geral: "Gestor geral", coordenador: "Coordenador" };
const roleIds: Record<Role, string> = { integrante: "INTEGRANTE", projeto: "GESTOR_PROJETO", geral: "GESTOR_GERAL", coordenador: "COORDENADOR" };
const periods: Record<Period, string> = { "7": "7 dias", "30": "30 dias", "90": "90 dias" };

function href(state: PreviewState, changes: Partial<PreviewState>) {
  const next = { ...state, ...changes };
  return `/dev/dashboard-preview?role=${next.role}&density=${next.density}&context=${next.context}&period=${next.period}`;
}

function PanelTitle({ title, href: destination, action = "Ver tudo" }: { title: string; href?: string; action?: string }) {
  return <div className={styles.panelHeading}><h2>{title}</h2>{destination ? <Link href={destination}>{action}<span aria-hidden="true"> ↗</span></Link> : null}</div>;
}

function ShortList({ items, empty, destination }: { items: Item[]; empty: string; destination: string }) {
  if (!items.length) return <p className={styles.empty}>{empty}</p>;
  return <ul className={styles.shortList}>{items.map((item) => <li key={item.title}>
    <span className={`${styles.listMark} ${item.tone === "danger" ? styles.danger : item.tone === "warning" ? styles.warning : ""}`} aria-hidden="true" />
    <div className={styles.listBody}><Link href={item.href ?? destination}>{item.title}</Link><small>{item.meta}</small></div><time>{item.date}</time>
  </li>)}</ul>;
}

function StackedBar({ values, labels, health = false }: { values: number[]; labels: string[]; health?: boolean }) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return <p className={styles.empty}>Nenhum projeto para classificar.</p>;
  return <div className={`${styles.distribution} ${health ? styles.healthDistribution : ""}`}>
    <div className={styles.stackedBar} role="img" aria-label={values.map((value, index) => `${labels[index]}: ${value}`).join(", ")}>
      {total ? values.map((value, index) => <span key={labels[index]} className={styles[`segment${index + 1}`]} style={{ width: `${value / total * 100}%` }} />) : null}
    </div>
    <ul className={styles.legend}>{labels.map((label, index) => <li key={label}><span className={styles[`dot${index + 1}`]} />{label}<strong>{values[index]}</strong></li>)}</ul>
  </div>;
}

function ActivityDonut({ empty, few }: { empty: boolean; few: boolean }) {
  const values = empty ? [0, 0, 0, 0] : few ? [1, 1, 0, 0] : [4, 7, 6, 1];
  const total = values.reduce((sum, value) => sum + value, 0);
  const parts = values.map((value) => total ? value / total * 100 : 0);
  const stops = [parts[0], parts[0] + parts[1], parts[0] + parts[1] + parts[2]];
  const gradient = total ? `conic-gradient(var(--nite-data-1) 0% ${stops[0]}%, var(--nite-data-2) ${stops[0]}% ${stops[1]}%, var(--nite-status-done) ${stops[1]}% ${stops[2]}%, var(--nite-data-6) ${stops[2]}% 100%)` : "var(--nite-surface-subtle)";
  const labels = ["Planejadas", "Em execução", "Concluídas", "Canceladas"];
  return <div className={styles.donutRow}>
    <div className={styles.donut} style={{ background: gradient }} role="img" aria-label={values.map((value, index) => `${labels[index]}: ${value}`).join(", ")}><span><strong>{total}</strong><small>atividades</small></span></div>
    <ul className={styles.donutLegend}>{labels.map((label, index) => <li key={label}><i className={styles[`dot${index + 1}`]} /><span>{label}</span><strong>{values[index]}</strong></li>)}</ul>
  </div>;
}

function EvolutionChart({ period, institutional, empty }: { period: Period; institutional: boolean; empty: boolean }) {
  const primary = period === "7" ? [6, 9, 7, 12, 10, 14, 13] : period === "90" ? [5, 6, 7, 8, 7, 10, 12] : [4, 6, 5, 8, 7, 11, 10];
  const secondary = period === "7" ? [3, 4, 4, 5, 6, 7, 8] : period === "90" ? [2, 4, 4, 6, 7, 8, 9] : [2, 3, 4, 4, 5, 7, 7];
  const makePath = (values: number[]) => values.map((value, index) => `${index ? "L" : "M"} ${24 + index * 64} ${164 - value * 9}`).join(" ");
  return <div className={styles.chartWrap}>
    {empty ? <p className={styles.empty}>Sem eventos registrados no período selecionado.</p> : <>
      <div className={styles.chartLegend}><span><i className={styles.chartPrimary} />{institutional ? "Criadas" : "Atividades criadas"}</span><span><i className={styles.chartSecondary} />Concluídas</span></div>
      <svg viewBox="0 0 440 190" preserveAspectRatio="none" role="img" aria-label="Evolução demonstrativa de atividades criadas e concluídas no período" className={styles.chart}>
        {[38, 80, 122, 164].map((y) => <line key={y} x1="24" x2="432" y1={y} y2={y} className={styles.gridLine} />)}
        <path d={`${makePath(primary)} L 408 164 L 24 164 Z`} className={styles.chartArea} />
        <path d={makePath(primary)} className={styles.primaryLine} />
        <path d={makePath(secondary)} className={styles.secondaryLine} />
        {primary.map((value, index) => <circle key={index} cx={24 + index * 64} cy={164 - value * 9} r="3" className={styles.chartPoint} />)}
      </svg>
      <div className={styles.chartAxis}><span>Início</span><span>Meio do período</span><span>Hoje</span></div>
    </>}
  </div>;
}

function Personal({ state }: { state: PreviewState }) {
  const empty = state.density === "vazio";
  const few = state.density === "poucos";
  const tasks: Item[] = empty ? [] : [
    { title: "Revisar plano da oficina de robótica", meta: "Projeto Aurora · Alta prioridade", date: "Atrasada", tone: "danger" },
    ...(!few ? [
      { title: "Consolidar materiais da apresentação", meta: "Projeto Horizonte · Em execução", date: "Hoje", tone: "warning" as const },
      { title: "Validar roteiro de atendimento", meta: "Projeto Aurora · Planejada", date: "25 nov" },
    ] : []),
  ];
  const commitments: Item[] = empty ? [] : [
    { title: "Alinhamento semanal do projeto", meta: "Reunião · 10h00–10h45", date: "24 nov" },
    ...(!few ? [{ title: "Oficina de prototipagem", meta: "Agenda · 14h00–16h00", date: "26 nov" }] : []),
  ];
  return <div className={styles.personalGrid}>
    <section className={`${styles.panel} ${styles.tasksPanel}`}><PanelTitle title="Precisa da sua atenção" href="/atividades" action="Minhas atividades" /><p className={styles.panelIntro}>Prioridades atuais, independentemente do período</p><ShortList items={tasks} empty="Nenhuma tarefa exige sua atenção agora." destination="/atividades" /></section>
    <section className={`${styles.panel} ${styles.commitmentsPanel}`}><PanelTitle title="Próximos compromissos" href="/reunioes" /><p className={styles.panelIntro}>Agenda dos próximos 14 dias</p><ShortList items={commitments} empty="Nenhum compromisso previsto." destination="/reunioes" /></section>
    <section className={`${styles.panel} ${styles.workPanel}`}><PanelTitle title="Meu trabalho" href="/atividades" /><p className={styles.panelIntro}>Distribuição atual das atividades</p><ActivityDonut empty={empty} few={few} /></section>
    <section className={`${styles.panel} ${styles.evolutionPanel}`}><PanelTitle title="Evolução das atividades" /><p className={styles.panelIntro}>Eventos no período · demonstração</p><EvolutionChart period={state.period} institutional={false} empty={empty} /></section>
    <section className={`${styles.panel} ${styles.projectsPanel}`}><PanelTitle title="Projetos em que participo" href="/meus-projetos" action="Meus projetos" />{empty ? <p className={styles.empty}>Nenhum projeto em participação vigente.</p> : <ul className={styles.projectList}><li><span className={styles.projectIcon}>A</span><div><Link href="/meus-projetos">Projeto Aurora</Link><small>Ativo · {few ? 1 : 4} atividades em aberto</small></div><span className={styles.projectState}>Em andamento</span></li>{!few && <li><span className={styles.projectIcon}>H</span><div><Link href="/meus-projetos">Projeto Horizonte</Link><small>Planejamento · 2 atividades em aberto</small></div><span className={styles.projectState}>Planejamento</span></li>}</ul>}</section>
    {state.role !== "integrante" && <section className={`${styles.panel} ${styles.leadershipPanel}`}><PanelTitle title="Sob minha liderança" href="/meus-projetos" action="Ver projetos" />{empty ? <p className={styles.empty}>Nenhuma liderança vigente.</p> : <div className={styles.leadership}><span className={styles.projectIcon}>A</span><div><strong>Projeto Aurora</strong><small>{few ? "1 atividade em aberto" : "4 atividades em aberto · 1 atraso atual"}</small></div><span className={styles.healthBadge}>Atenção</span></div>}</section>}
  </div>;
}

function Institutional({ state }: { state: PreviewState }) {
  const empty = state.density === "vazio";
  const few = state.density === "poucos";
  const counts = empty ? [0, 0, 0, 0] : few ? [1, 0, 0, 1] : [14, 3, 1, 7];
  return <div className={styles.institutionalGrid}>
    <section className={styles.overviewStrip} aria-label="Resumo institucional atual">
      {["Projetos", "Em atenção", "Críticos", "Pendências administrativas"].map((label, index) => <div key={label}><span>{label}</span><strong>{counts[index]}</strong><small>{index === 0 ? "no NITE" : index === 3 ? "exigem encaminhamento" : "situação atual"}</small></div>)}
    </section>
    <section className={`${styles.panel} ${styles.institutionalChart}`}><PanelTitle title="Evolução das atividades" /><p className={styles.panelIntro}>Eventos no período selecionado · demonstração</p><EvolutionChart period={state.period} institutional empty={empty} /></section>
    <section className={`${styles.panel} ${styles.healthPanel}`}><PanelTitle title="Saúde dos projetos" href="/projetos" action="Ver projetos" /><p className={styles.panelIntro}>Classificação atual dos projetos</p><StackedBar health values={empty ? [0, 0, 0, 0] : few ? [1, 0, 0, 0] : [8, 3, 1, 2]} labels={["Regular", "Atenção", "Crítico", "Dados insuficientes"]} /></section>
    <section className={`${styles.panel} ${styles.issuesPanel}`}><PanelTitle title="Questões para a gestão" href="/gestao/atividades-e-entregas" action="Acompanhar" /><ShortList items={empty ? [] : [
      { title: "Projeto Aurora com atividades atrasadas", meta: "Saúde do projeto · acompanhamento", date: "Atual", tone: "danger" },
      ...(!few ? [{ title: "Convite com falha de envio", meta: "Acessos e convites · verificar envio", date: "Atual", href: "/gestao/acessos-e-convites", tone: "warning" as const }] : []),
    ]} empty="Nenhuma questão institucional identificada." destination="/projetos" /></section>
    <section className={`${styles.panel} ${styles.adminPanel}`}><PanelTitle title="Pendências administrativas" href="/gestao/acessos-e-convites" action="Abrir gestão" />{empty ? <p className={styles.empty}>Nenhuma pendência administrativa.</p> : <ul className={styles.adminList}><li><span>Propostas de projeto pendentes</span><strong>{few ? 1 : 2}</strong></li>{!few && <><li><span>Convites aguardando resposta</span><strong>4</strong></li><li><span>Listas de frequência abertas</span><strong>1</strong></li></>}</ul>}</section>
  </div>;
}

type Props = { searchParams: Promise<{ role?: string; density?: string; context?: string; period?: string }> };

export default async function DashboardPreviewPage({ searchParams }: Props) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const role: Role = params.role === "projeto" || params.role === "geral" || params.role === "coordenador" ? params.role : "integrante";
  const density: Density = params.density === "poucos" || params.density === "vazio" || params.density === "carregando" ? params.density : "dados";
  const context: Context = (role === "geral" || role === "coordenador") && params.context === "institutional" ? "institutional" : "personal";
  const period: Period = params.period === "7" || params.period === "90" ? params.period : "30";
  const state = { role, density, context, period };
  return <AuthenticatedShell member={{ id: "demo", name: "Pessoa de demonstração", institutionalEmail: "demo@example.invalid", status: "ATIVO" }} roles={[roleIds[role]]} projects={role === "integrante" ? [] : [{ projectId: "11111111-1111-4111-8111-111111111111", title: "Projeto Aurora" }]} leadershipProjectsUnavailable={false}>
    <div className={styles.preview}>
      <div className={styles.demoBanner} role="note"><span>PRÉVIA 09.0B</span> Dados demonstrativos · sem consulta à API</div>
      <nav className={styles.scenarioBar} aria-label="Cenários da prévia">
        <label>Perfil <select defaultValue={role} aria-label="Perfil demonstrado" name="role" form="preview-controls">{Object.entries(roleLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Dados <select defaultValue={density} aria-label="Volume de dados" name="density" form="preview-controls"><option value="dados">Com dados</option><option value="poucos">Poucos registros</option><option value="vazio">Sem informações</option><option value="carregando">Carregamento</option></select></label>
        <form id="preview-controls" className={styles.scenarioForm} action="/dev/dashboard-preview"><input type="hidden" name="context" value={context} /><input type="hidden" name="period" value={period} /><button type="submit">Aplicar</button></form>
      </nav>
      <div className={styles.pageTop}><div><p className={styles.eyebrow}>VISÃO GERAL</p><h1>{context === "personal" ? "Meu espaço" : "Visão geral do NITE"}</h1><p>{context === "personal" ? `Acompanhe o que importa para você · ${roleLabels[role]}` : "Panorama para decisões da gestão do NITE"}</p></div><div className={styles.periodControl}><span>Período histórico</span><div>{(["7", "30", "90"] as const).map((item) => <Link key={item} href={href(state, { period: item })} aria-current={period === item ? "true" : undefined}>{periods[item]}</Link>)}</div></div></div>
      <nav className={styles.contextNav} aria-label="Contexto da visão geral"><Link href={href(state, { context: "personal" })} aria-current={context === "personal" ? "page" : undefined}>Meu espaço</Link>{(role === "geral" || role === "coordenador") && <Link href={href(state, { context: "institutional" })} aria-current={context === "institutional" ? "page" : undefined}>Visão geral do NITE</Link>}</nav>
      {density === "carregando" ? <div className={styles.loading} role="status" aria-label="Carregando prévia"><div /><div /><div /><div /></div> : context === "personal" ? <Personal state={state} /> : <Institutional state={state} />}
      <p className={styles.footerNote}>Dados fictícios para avaliação visual. Indicadores atuais permanecem visíveis ao trocar o período histórico.</p>
    </div>
  </AuthenticatedShell>;
}
