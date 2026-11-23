import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getPersonalActivityItems, getAllMyProjects } from "../../../lib/activities/data";
import { ActivityFeedback } from "../../../components/activities/activity-detail";
import { ActivityPlanningFilters } from "../../../components/activities/activity-planning-filters";
import { ActivityStatusBadge, formatActivityDate } from "../../../components/activities/activity-list";
import { PlanningCard, PageHeading } from "../../../components/activity-planning-preview/activity-planning-preview";
import { PlanningDeleteMenu } from "../../../components/activities/planning-delete-menu";
import type { PersonalActivityItem } from "../../../lib/activities/contracts";

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

function TaskCard({ item, projectName, memberId }: { item: PersonalActivityItem; projectName: string | undefined; memberId: string }) {
  const origin = item.projectId ? item.projectTitle ?? projectName ?? "Projeto indisponível" : item.createdBy === memberId && item.planningId === null ? "Independente" : item.planningId ? "Tarefa vinculada a planejamento" : "Atribuída diretamente";
  const detail = new URLSearchParams({ from: "/atividades" });
  return <Link href={`/atividades/${encodeURIComponent(item.id)}?${detail}`} className="group block min-w-0 rounded-panel border border-nite-border-soft bg-nite-surface p-3.5 transition-colors hover:border-nite-border-strong hover:bg-nite-surface-subtle/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">
    <article>
      <div className="flex items-start justify-between gap-3"><h2 className="break-words font-display text-type-component-title font-semibold leading-snug text-nite-text-primary group-hover:text-nite-brand-primary">{item.title}</h2>{item.status ? <ActivityStatusBadge status={item.status}/> : null}</div>
      {item.description.trim() ? <p className="mt-1 line-clamp-2 text-type-metadata leading-relaxed text-nite-text-secondary">{item.description}</p> : null}
      <div className="mt-2 flex min-w-0 items-center gap-1.5 text-type-metadata text-nite-text-muted"><span className={`size-1.5 shrink-0 rounded-full ${item.projectId ? "bg-nite-brand-primary" : "bg-nite-text-muted"}`}/><span className="truncate">{origin}</span></div>
      {item.dueOn ? <p className="mt-3 text-type-metadata text-nite-text-secondary">Prazo {formatActivityDate(item.dueOn)}</p> : null}
    </article>
  </Link>;
}

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const legacyView = one(params.view);
  if (legacyView === "tasks" || legacyView === "legacy") {
    const canonical = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (key !== "view" && typeof value === "string") canonical.set(key, value);
    redirect(canonical.size ? `/atividades?${canonical}` : "/atividades");
  }

  const session = await requireAuthenticatedNiteSession();
  const page = validPage(one(params.page));
  const rawSearch = one(params.q).trim();
  const query = new URLSearchParams({ page: String(page), size: "20" });
  if (rawSearch.length >= 2 && rawSearch.length <= 160) query.set("q", rawSearch);
  const projectId = uuidPattern.test(one(params.projectId)) ? one(params.projectId) : "";
  if (projectId) query.set("projectId", projectId);
  const [itemsResult, projects] = await Promise.all([
    getPersonalActivityItems(session.bearer, query),
    getAllMyProjects(session.bearer),
  ]);
  const projectNames = new Map((projects.data ?? []).map((project) => [project.id, project.title]));
  const projectOptions = (projects.data ?? []).map((project) => ({ id: project.id, title: project.title }));
  const pagination = new URLSearchParams(query);
  const total = itemsResult.data?.total ?? 0;
  const pageCount = itemsResult.data ? Math.ceil(itemsResult.data.total / itemsResult.data.size) : 0;

  return <main className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 px-4 py-5 sm:px-7 sm:py-7 lg:px-9">
    <ActivityFeedback code={one(params.feedback)}/>
    <PageHeading title="Minhas atividades" action={<Link href="/atividades/nova" className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-control bg-nite-brand-primary px-3.5 text-type-body-compact font-medium text-nite-action-text transition-colors hover:bg-nite-brand-primary/90"><span aria-hidden="true">＋</span> Nova atividade</Link>}/>
    <ActivityPlanningFilters query={rawSearch} projectId={projectId} projects={projectOptions}/>
    {itemsResult.issue || !itemsResult.data ? <section role="alert" className="border-y border-nite-border-soft py-8">
      <p className="font-medium text-nite-text-primary">{itemsResult.issue === "unauthenticated" ? "Sua sessão expirou. Entre novamente para consultar suas atividades." : itemsResult.issue === "access" ? "Você não tem acesso a esta consulta." : "Não foi possível carregar suas atividades."}</p>
      <p className="mt-1 text-type-body-compact text-nite-text-secondary">Tente atualizar a página em alguns instantes.</p>
    </section> : <>
      {itemsResult.data.items.length ? <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="Minhas atividades">
        {itemsResult.data.items.map((item) => item.kind === "PLANNING"
          ? <div key={`planning:${item.id}`} className={`relative min-w-0 ${item.canDelete ? "[&_h2]:pr-8" : ""}`}>
              <PlanningCard planning={{ id: item.id, title: item.title, description: item.description, project: item.projectId ? item.projectTitle ?? projectNames.get(item.projectId) ?? "Projeto indisponível" : null, tasks: [], updated: item.updatedAt }} stats={{ total: item.taskCount, completed: item.completedCount, inProgress: item.inProgressCount, completionRate: item.completionRate }} href={`/atividades/planejamentos/${item.id}`}/>
              {item.canDelete ? <div className="absolute right-2 top-2"><PlanningDeleteMenu id={item.id} version={item.version} title={item.title} canDelete/></div> : null}
            </div>
          : <TaskCard key={`task:${item.id}`} item={item} projectName={item.projectId ? projectNames.get(item.projectId) : undefined} memberId={session.member.id}/>)}</div> : <section className="flex min-h-56 flex-col items-center justify-center gap-3 border-y border-nite-border-soft px-4 py-10 text-center">
        <h2 className="font-display text-type-section-title text-nite-text-primary">{rawSearch || projectId ? "Nenhuma atividade corresponde aos filtros." : "Você ainda não tem atividades para acompanhar."}</h2>
        <p className="max-w-lg text-type-body-compact text-nite-text-secondary">{rawSearch || projectId ? "Ajuste a pesquisa ou o projeto para ampliar os resultados." : "Atividades criadas por você e tarefas atribuídas aparecerão aqui."}</p>
        {!rawSearch && !projectId ? <Link href="/atividades/nova" className="inline-flex min-h-9 items-center rounded-control bg-nite-brand-primary px-3.5 text-type-body-compact font-medium text-nite-action-text">Nova atividade</Link> : null}
      </section>}
      {pageCount > 1 ? <nav aria-label="Paginação" className="flex min-w-0 flex-wrap items-center justify-between gap-3 pt-1">
        {itemsResult.data.page > 0 ? <Link href={pageHref(pagination, itemsResult.data.page - 1)} className="inline-flex min-h-9 items-center rounded-control border border-nite-border-soft px-3 text-type-body-compact font-medium text-nite-text-primary">Anterior</Link> : <span/>}
        <span className="text-center text-type-metadata text-nite-text-secondary">Itens {itemsResult.data.page * itemsResult.data.size + 1}–{Math.min((itemsResult.data.page + 1) * itemsResult.data.size, total)} de {total}</span>
        {(itemsResult.data.page + 1) * itemsResult.data.size < total ? <Link href={pageHref(pagination, itemsResult.data.page + 1)} className="inline-flex min-h-9 items-center rounded-control border border-nite-border-soft px-3 text-type-body-compact font-medium text-nite-text-primary">Próxima</Link> : <span/>}
      </nav> : null}
    </>}
  </main>;
}
