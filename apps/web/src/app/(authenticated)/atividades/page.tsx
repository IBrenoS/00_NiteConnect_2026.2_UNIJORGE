import Link from "next/link";
import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getActivityPlannings, getActivityPlanningStats, getAllMyProjects, getAllProjects, getMyActivities, getMyActivityStats, getProjectSummary } from "../../../lib/activities/data";
import { ActivityFeedback } from "../../../components/activities/activity-detail";
import { ActivityPlanningFilters } from "../../../components/activities/activity-planning-filters";
import { PlanningCard, PageHeading } from "../../../components/activity-planning-preview/activity-planning-preview";
import { activityQuery } from "../../../lib/activities/query";
import type { Activity } from "../../../lib/activities/contracts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Minhas atividades" };

type Params = Record<string, string | string[] | undefined>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (value: string | string[] | undefined) => typeof value === "string" ? value : "";
const validPage = (value: string) => /^\d{1,6}$/.test(value) ? Math.max(0, Number(value)) : 0;

function pageHref(params: URLSearchParams, page: number) {
  const query = new URLSearchParams(params);
  query.set("page", String(page));
  return `/atividades?${query}`;
}

async function LegacyActivities({ bearer, page, query }: { bearer: string; page: number; query: URLSearchParams }) {
  const firstQuery = new URLSearchParams(query);
  firstQuery.set("page", "0");
  firstQuery.set("size", "100");
  const first = await getMyActivities(bearer, firstQuery);
  if (first.issue || !first.data) return <p role="alert" className="border-y border-nite-border-soft py-8 text-type-body-compact text-nite-text-secondary">Não foi possível carregar suas tarefas. Tente atualizar a página.</p>;
  const pageCount = Math.ceil(first.data.total / first.data.size);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, async (_, index) => {
    const nextQuery = new URLSearchParams(firstQuery);
    nextQuery.set("page", String(index + 1));
    return getMyActivities(bearer, nextQuery);
  }));
  const failed = rest.find((result) => result.issue !== null || result.data === null);
  if (failed) return <p role="alert" className="border-y border-nite-border-soft py-8 text-type-body-compact text-nite-text-secondary">Não foi possível carregar todas as tarefas sem planejamento. Atualize a página para tentar novamente.</p>;
  const tasks: Activity[] = [...first.data.items, ...rest.flatMap((result) => result.data?.items ?? [])].filter((activity) => activity.planningId === null);
  const pageSize = 20;
  const lastPage = Math.max(0, Math.ceil(tasks.length / pageSize) - 1);
  const visible = tasks.slice(page * pageSize, (page + 1) * pageSize);
  const params = new URLSearchParams(query);
  params.set("size", String(pageSize));
  params.set("view", "legacy");
  return <section className="grid gap-2" aria-label="Tarefas sem planejamento">
    {visible.map((task) => <Link key={task.id} href={`/atividades/${task.id}`} className="flex min-h-12 min-w-0 items-center justify-between gap-4 rounded-panel border border-nite-border-soft bg-nite-surface px-3.5 py-3 text-type-body-compact hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">
      <span className="min-w-0 truncate font-medium text-nite-text-primary">{task.title}</span><span className="shrink-0 text-type-metadata text-nite-text-secondary">{{ PLANEJADA: "Planejada", EM_EXECUCAO: "Em execução", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" }[task.status]}</span>
    </Link>)}
    {tasks.length ? null : <p className="border-y border-nite-border-soft py-10 text-center text-type-body-compact text-nite-text-secondary">Nenhuma tarefa sem planejamento.</p>}
    {tasks.length > pageSize ? <nav aria-label="Paginação" className="flex items-center justify-between gap-4 pt-3">
      {page > 0 ? <Link href={pageHref(params, page - 1)} className="text-type-body-compact text-nite-brand-primary underline underline-offset-4">Anterior</Link> : <span/>}
      <span className="text-type-metadata text-nite-text-muted">Itens {page * pageSize + 1}–{Math.min((page + 1) * pageSize, tasks.length)} de {tasks.length}</span>
      {page < lastPage ? <Link href={pageHref(params, page + 1)} className="text-type-body-compact text-nite-brand-primary underline underline-offset-4">Próxima</Link> : <span/>}
    </nav> : null}
  </section>;
}

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const session = await requireAuthenticatedNiteSession();
  const page = validPage(one(params.page));
  const rawSearch = one(params.q).trim();
  const query = new URLSearchParams({ page: String(page), size: "20" });
  if (rawSearch.length >= 2 && rawSearch.length <= 160) query.set("q", rawSearch);
  const projectId = uuidPattern.test(one(params.projectId)) ? one(params.projectId) : "";
  if (projectId) query.set("projectId", projectId);
  const legacy = one(params.view) === "legacy";

  if (legacy) {
    const legacyQuery = activityQuery({ q: rawSearch.length >= 2 ? rawSearch : undefined });
    const stats = await getMyActivityStats(session.bearer);
    const resultQuery = new URLSearchParams(legacyQuery);
    return <main className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 px-4 py-5 sm:px-7 sm:py-7 lg:px-9">
      <ActivityFeedback code={one(params.feedback)}/>
      <PageHeading title="Tarefas sem planejamento" description="Atividades executáveis legadas continuam disponíveis sem agrupamento." action={<Link href="/atividades" className="text-type-body-compact font-medium text-nite-brand-primary underline underline-offset-4">Minhas atividades</Link>}/>
      {stats.issue || !stats.data ? null : <p className="text-type-metadata text-nite-text-muted">{stats.data.total} atividades na perspectiva autorizada; cada tarefa sem planejamento abre pela rota legada.</p>}
      <LegacyActivities bearer={session.bearer} page={page} query={resultQuery}/>
    </main>;
  }

  const administrator = session.roles.includes("COORDENADOR") || session.roles.includes("GESTOR_GERAL");
  const [plannings, projects] = await Promise.all([
    getActivityPlannings(session.bearer, query),
    administrator ? getAllProjects(session.bearer) : getAllMyProjects(session.bearer),
  ]);
  const planningItems = plannings.data?.items ?? [];
  const projectNames = new Map((projects.data ?? []).map((project) => [project.id, project.title]));
  const missingProjectIds = Array.from(new Set(planningItems.flatMap((item) => item.projectId && !projectNames.has(item.projectId) ? [item.projectId] : [])));
  const [statsResults, projectResults] = await Promise.all([
    Promise.all(planningItems.map((item) => getActivityPlanningStats(session.bearer, item.id))),
    Promise.all(missingProjectIds.map((id) => getProjectSummary(session.bearer, id))),
  ]);
  for (const result of projectResults) if (result.data) projectNames.set(result.data.id, result.data.title);
  const cardStats = new Map(planningItems.map((item, index) => [item.id, statsResults[index]?.data ?? null]));
  const projectOptions = (projects.data ?? []).map((project) => ({ id: project.id, title: project.title }));
  const pagination = new URLSearchParams(query);
  const total = plannings.data?.total ?? 0;
  const pageCount = plannings.data ? Math.ceil(plannings.data.total / plannings.data.size) : 0;

  return <main className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 px-4 py-5 sm:px-7 sm:py-7 lg:px-9">
    <ActivityFeedback code={one(params.feedback)}/>
    <PageHeading title="Minhas atividades" action={<Link href="/atividades/nova" className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-control bg-nite-brand-primary px-3.5 text-type-body-compact font-medium text-nite-action-text transition-colors hover:bg-nite-brand-primary/90"><span aria-hidden="true">＋</span> Nova atividade</Link>}/>
    <ActivityPlanningFilters query={rawSearch} projectId={projectId} projects={projectOptions}/>
    {plannings.issue || !plannings.data ? <section role="alert" className="border-y border-nite-border-soft py-8">
      <p className="font-medium text-nite-text-primary">{plannings.issue === "access" ? "Você não tem acesso a esta consulta." : "Não foi possível carregar seus planejamentos."}</p>
      <p className="mt-1 text-type-body-compact text-nite-text-secondary">Tente atualizar a página em alguns instantes.</p>
    </section> : <>
      {plannings.data.items.length ? <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {plannings.data.items.map((planning) => <PlanningCard key={planning.id} planning={{ id: planning.id, title: planning.title, description: planning.description, project: planning.projectId ? projectNames.get(planning.projectId) ?? "Projeto vinculado" : null, tasks: [], updated: planning.updatedAt }} stats={cardStats.get(planning.id) ?? null} href={`/atividades/planejamentos/${planning.id}`}/>)}</div> : <section className="flex min-h-56 flex-col items-center justify-center gap-3 border-y border-nite-border-soft px-4 py-10 text-center">
        <h2 className="font-display text-type-section-title text-nite-text-primary">{rawSearch || projectId ? "Nenhuma atividade corresponde aos filtros." : "Você ainda não criou uma atividade."}</h2>
        <p className="max-w-lg text-type-body-compact text-nite-text-secondary">Crie um planejamento para organizar tarefas, prazos e prioridades.</p>
        <Link href="/atividades/nova" className="inline-flex min-h-9 items-center rounded-control bg-nite-brand-primary px-3.5 text-type-body-compact font-medium text-nite-action-text">Nova atividade</Link>
      </section>}
      {pageCount > 1 ? <nav aria-label="Paginação" className="flex min-w-0 flex-wrap items-center justify-between gap-3 pt-1">
        {plannings.data.page > 0 ? <Link href={pageHref(pagination, plannings.data.page - 1)} className="inline-flex min-h-9 items-center rounded-control border border-nite-border-soft px-3 text-type-body-compact font-medium text-nite-text-primary">Anterior</Link> : <span/>}
        <span className="text-center text-type-metadata text-nite-text-secondary">Itens {plannings.data.page * plannings.data.size + 1}–{Math.min((plannings.data.page + 1) * plannings.data.size, total)} de {total}</span>
        {(plannings.data.page + 1) * plannings.data.size < total ? <Link href={pageHref(pagination, plannings.data.page + 1)} className="inline-flex min-h-9 items-center rounded-control border border-nite-border-soft px-3 text-type-body-compact font-medium text-nite-text-primary">Próxima</Link> : <span/>}
      </nav> : null}
    </>}
    <div className="border-t border-nite-border-soft pt-4"><Link href="/atividades?view=legacy" className="text-type-metadata text-nite-text-secondary underline underline-offset-4 hover:text-nite-brand-primary">Tarefas sem planejamento</Link></div>
  </main>;
}
