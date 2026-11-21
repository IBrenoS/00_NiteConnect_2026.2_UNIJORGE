import Link from "next/link";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { getManagementActivities, type ManagementFilters } from "../../../../lib/activities/management";
import { getLeadershipProjects } from "../../../../lib/projects/data";
import { activityStatusLabel, formatActivityDate } from "../../../../components/activities/activity-list";
import type { ActivityStatus } from "../../../../lib/activities/contracts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atividades e entregas" };
type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => typeof value === "string" ? value : "";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses: ActivityStatus[] = ["PLANEJADA", "EM_EXECUCAO", "CONCLUIDA", "CANCELADA"];
const priorities = ["ALTA", "MEDIA", "BAIXA"] as const;
const labels = { ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" } as const;
function issueText(issue: string) {
  if (issue === "unauthenticated") return "Sua sessão expirou. Entre novamente para consultar a gestão de atividades.";
  if (issue === "access") return "A API negou acesso a esta perspectiva ou projeto.";
  if (issue === "not-found") return "O projeto não existe ou não está disponível no seu contexto.";
  return "Não foi possível carregar os dados gerenciais. Tente atualizar a página.";
}
export default async function ManagementActivitiesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [params, session] = await Promise.all([searchParams, requireAuthenticatedNiteSession()]);
  const global = session.roles.some(role => role === "COORDENADOR" || role === "GESTOR_GERAL");
  const leaders = global ? null : await getLeadershipProjects(session.bearer);
  const perspective = one(params.perspective) === "project" ? "project" : "member";
  const rawProject = one(params.projectId);
  const projectId = uuid.test(rawProject) ? rawProject : "";
  const memberId = uuid.test(one(params.memberId)) ? one(params.memberId) : "";
  const filters: ManagementFilters = {
    ...(global && projectId && perspective === "project" ? { projectId } : {}),
    ...(perspective === "member" && memberId ? { memberId } : {}),
    ...(uuid.test(one(params.planningId)) ? { planningId: one(params.planningId) } : {}),
    ...(statuses.includes(one(params.status) as ActivityStatus) ? { status: one(params.status) } : {}),
    ...(priorities.some(value => value === one(params.priority)) ? { priority: one(params.priority) } : {}),
    ...(uuid.test(one(params.executorId)) ? { executorId: one(params.executorId) } : {}),
    ...(one(params.dueFrom) ? { dueFrom: one(params.dueFrom) } : {}), ...(one(params.dueTo) ? { dueTo: one(params.dueTo) } : {}),
    ...(one(params.startFrom) ? { startFrom: one(params.startFrom) } : {}), ...(one(params.startTo) ? { startTo: one(params.startTo) } : {}),
    ...(one(params.overdue) === "true" || one(params.overdue) === "false" ? { overdue: one(params.overdue) } : {}),
    ...(one(params.q).trim().length >= 2 && one(params.q).trim().length <= 160 ? { q: one(params.q).trim() } : {}),
    page: /^\d{1,6}$/.test(one(params.page)) ? Number(one(params.page)) : 0, size: 20,
  };
  const contextualProject = !global && perspective === "project" ? projectId : undefined;
  const canQuery = global || (perspective === "project" && Boolean(contextualProject) && leaders?.data?.some(project => project.projectId === contextualProject));
  const result = canQuery ? await getManagementActivities(session.bearer, filters, contextualProject) : null;
  const values: Record<string, string> = {};
  for (const key of ["projectId", "memberId", "planningId", "status", "priority", "executorId", "dueFrom", "dueTo", "startFrom", "startTo", "overdue", "q"] as const) if (filters[key]) values[key] = filters[key]!;
  const pageHref = (page: number) => { const query = new URLSearchParams({ perspective, ...values, page: String(page) }); return `/gestao/atividades-e-entregas?${query}`; };
  const cards = result?.data?.summary;
  return <main className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 px-4 py-5 sm:px-7 sm:py-7 lg:px-9">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-type-metadata text-nite-text-muted">Gestão do NITE</p><h1 className="font-display text-type-page-title font-semibold text-nite-text-primary">Atividades e entregas</h1></div></header>
    <nav aria-label="Perspectiva gerencial" className="flex gap-5 border-b border-nite-border-soft"><Link aria-current={perspective === "member" ? "page" : undefined} className="border-b-2 border-transparent py-3 text-type-body-compact aria-[current=page]:border-nite-brand-primary aria-[current=page]:font-medium" href="?perspective=member">Por integrante</Link><Link aria-current={perspective === "project" ? "page" : undefined} className="border-b-2 border-transparent py-3 text-type-body-compact aria-[current=page]:border-nite-brand-primary aria-[current=page]:font-medium" href="?perspective=project">Por projeto</Link></nav>
    {perspective === "project" && !global && <section className="grid gap-2 border-b border-nite-border-soft pb-4"><h2 className="text-type-component-title font-medium">Projetos sob sua liderança vigente</h2>{leaders?.issue || !leaders?.data ? <p role="alert">Não foi possível carregar seus projetos autorizados.</p> : leaders.data.length ? <ul className="flex flex-wrap gap-x-4 gap-y-2">{leaders.data.map(project => <li key={project.projectId}><Link className="text-nite-brand-primary underline underline-offset-4" href={`?perspective=project&projectId=${project.projectId}`}>{project.title}</Link></li>)}</ul> : <p className="text-type-body-compact text-nite-text-secondary">Nenhum projeto com liderança vigente.</p>}</section>}
    <form action="/gestao/atividades-e-entregas" method="get" className="grid min-w-0 grid-cols-1 gap-3 border-b border-nite-border-soft pb-5 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="perspective" value={perspective}/>
      {perspective === "member" ? <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Integrante (UUID)<input name="memberId" defaultValue={memberId} placeholder="UUID canônico" className="min-h-10 min-w-0 rounded-control border border-nite-border-control bg-nite-surface px-3 text-nite-text-primary"/></label> : <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Projeto (UUID)<input name="projectId" defaultValue={projectId} placeholder="UUID do projeto" readOnly={!global} className="min-h-10 min-w-0 rounded-control border border-nite-border-control bg-nite-surface px-3 text-nite-text-primary"/></label>}
      <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Pesquisar tarefas<input name="q" defaultValue={one(params.q)} minLength={2} maxLength={160} className="min-h-10 min-w-0 rounded-control border border-nite-border-control bg-nite-surface px-3 text-nite-text-primary"/></label>
      <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Situação<select name="status" defaultValue={one(params.status)} className="min-h-10 rounded-control border border-nite-border-control bg-nite-surface px-2 text-nite-text-primary"><option value="">Todas</option>{statuses.map(status => <option key={status} value={status}>{activityStatusLabel[status]}</option>)}</select></label>
      <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Prioridade<select name="priority" defaultValue={one(params.priority)} className="min-h-10 rounded-control border border-nite-border-control bg-nite-surface px-2 text-nite-text-primary"><option value="">Todas</option>{priorities.map(priority => <option key={priority} value={priority}>{labels[priority]}</option>)}</select></label>
      <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Responsável (UUID)<input name="executorId" defaultValue={one(params.executorId)} className="min-h-10 min-w-0 rounded-control border border-nite-border-control bg-nite-surface px-3 text-nite-text-primary"/></label>
      <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Planejamento (UUID)<input name="planningId" defaultValue={one(params.planningId)} className="min-h-10 min-w-0 rounded-control border border-nite-border-control bg-nite-surface px-3 text-nite-text-primary"/></label>
      <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Prazo desde<input type="date" name="dueFrom" defaultValue={one(params.dueFrom)} className="min-h-10 rounded-control border border-nite-border-control bg-nite-surface px-2 text-nite-text-primary"/></label>
      <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Prazo até<input type="date" name="dueTo" defaultValue={one(params.dueTo)} className="min-h-10 rounded-control border border-nite-border-control bg-nite-surface px-2 text-nite-text-primary"/></label>
      <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Início desde<input type="date" name="startFrom" defaultValue={one(params.startFrom)} className="min-h-10 rounded-control border border-nite-border-control bg-nite-surface px-2 text-nite-text-primary"/></label>
      <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Início até<input type="date" name="startTo" defaultValue={one(params.startTo)} className="min-h-10 rounded-control border border-nite-border-control bg-nite-surface px-2 text-nite-text-primary"/></label>
      <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Prazo vencido<select name="overdue" defaultValue={one(params.overdue)} className="min-h-10 rounded-control border border-nite-border-control bg-nite-surface px-2 text-nite-text-primary"><option value="">Todos</option><option value="true">Sim</option><option value="false">Não</option></select></label>
      <button className="min-h-10 self-end rounded-control bg-nite-brand-primary px-4 text-type-body-compact font-medium text-nite-action-text">Aplicar filtros</button>
    </form>
    {result?.issue ? <section role="alert" className="border-y border-status-error-border py-6 text-type-body-compact text-status-error">{issueText(result.issue)}</section> : !result ? <section role="status" className="border-y border-nite-border-soft py-6 text-type-body-compact text-nite-text-secondary">{perspective === "member" ? "Informe o UUID do integrante para consultar as atividades vinculadas." : "Selecione um projeto autorizado para consultar as atividades."}</section> : <>
      <section aria-label="Indicadores do conjunto filtrado" className="grid grid-cols-2 gap-x-5 gap-y-3 border-y border-nite-border-soft py-4 sm:grid-cols-3 lg:grid-cols-6">{[["Atividades", cards!.total], ["Pendentes", cards!.pending], ["Em atraso", cards!.overdue], ["Atenção necessária", cards!.attentionRequired], ["Com evidências", cards!.withEvidence], ["Concluídas", `${cards!.completionRate.toFixed(2)}%`]].map(([label, value]) => <div key={label} className="grid gap-1"><span className="text-type-metadata text-nite-text-muted">{label}</span><strong className="text-type-section-title font-medium text-nite-text-primary">{value}</strong></div>)}</section>
      {!result.data.items.length ? <section className="grid min-h-52 place-content-center gap-2 border-b border-nite-border-soft px-4 text-center"><h2 className="text-type-component-title font-medium text-nite-text-primary">Nenhuma atividade encontrada</h2><p className="text-type-body-compact text-nite-text-secondary">O integrante ou os filtros atuais não retornaram tarefas.</p></section> : <div className="overflow-x-auto border-b border-nite-border-soft"><table className="w-full min-w-[900px] text-left text-type-body-compact"><thead className="border-b border-nite-border-soft text-type-metadata text-nite-text-muted"><tr>{["Atividade", "Projeto / planejamento", "Responsável", "Prazo", "Prioridade", "Andamento", "Vínculo"].map(value => <th className="px-3 py-3 font-medium" key={value}>{value}</th>)}</tr></thead><tbody>{result.data.items.map(item => <tr key={item.activityId} className="border-b border-nite-border-soft last:border-0 hover:bg-nite-surface-subtle"><td className="max-w-64 whitespace-normal px-3 py-3"><Link className="font-medium text-nite-brand-primary underline-offset-4 hover:underline" href={`/atividades/${item.activityId}`}>{item.title}</Link><div className="mt-1 text-type-metadata text-nite-text-muted">{item.activityId}</div></td><td className="px-3 py-3"><div>{item.projectTitle ?? (item.projectId ? `Projeto ${item.projectId}` : "Atividade independente")}</div>{item.projectStatus === "PAUSADO" ? <span className="text-type-metadata text-status-warning">Projeto pausado</span> : null}{item.planningId ? <Link className="block text-type-metadata text-nite-brand-primary underline" href={`/atividades/planejamentos/${item.planningId}`}>Planejamento {item.planningId}</Link> : <span className="text-type-metadata text-nite-text-muted">Sem planejamento</span>}</td><td className="max-w-52 whitespace-normal px-3 py-3"><div>{item.primaryExecutorId}</div>{item.collaboratorIds.map(id => <div className="text-type-metadata text-nite-text-secondary" key={id}>Colaborador {id}</div>)}</td><td className="whitespace-nowrap px-3 py-3">{item.dueOn ? formatActivityDate(item.dueOn) : "Sem prazo"}{item.overdue ? <span className="mt-1 block text-type-metadata text-status-warning">Em atraso</span> : null}{item.attentionRequired ? <span className="mt-1 block text-type-metadata text-status-error">Requer atenção</span> : null}</td><td className="px-3 py-3">{item.priority ? labels[item.priority] : "—"}</td><td className="px-3 py-3">{activityStatusLabel[item.status]}</td><td className="max-w-44 whitespace-normal px-3 py-3">{item.linkKinds.map(kind => ({ CREATED: "Criada pela pessoa", EXECUTOR: "Responsável", COLLABORATOR: "Colaboradora" })[kind]).join(", ")}</td></tr>)}</tbody></table></div>}
      <nav aria-label="Paginação gerencial" className="flex flex-wrap items-center justify-between gap-3 pt-2"><span className="text-type-metadata text-nite-text-secondary">{result.data.total ? `Itens ${result.data.page * result.data.size + 1}–${Math.min((result.data.page + 1) * result.data.size, result.data.total)} de ${result.data.total}` : "0 atividades"}</span><div className="flex gap-3">{result.data.page > 0 ? <Link className="text-nite-brand-primary underline" href={pageHref(result.data.page - 1)}>Anterior</Link> : null}{(result.data.page + 1) * result.data.size < result.data.total ? <Link className="text-nite-brand-primary underline" href={pageHref(result.data.page + 1)}>Próxima</Link> : null}</div></nav>
      <p className="text-type-metadata text-nite-text-muted">Atraso: prazo anterior a {formatActivityDate(result.data.asOfDate)}. Conclusão indica estado da tarefa; não representa entrega formal aprovada. Evidências: {cards!.withEvidence} atividades com registros ativos; conteúdo não exibido.</p>
    </>}
  </main>;
}
