import { notFound } from "next/navigation";
import { requireAuthenticatedNiteSession } from "../../../../../lib/auth/server-session";
import { getActivityCapabilities, getActivityPlanning, getActivityPlanningCapabilities, getActivityPlanningStats, getAllActivityPlanningTasks, getProjectSummary } from "../../../../../lib/activities/data";
import { ActivityPlanningWorkspace, type ActivityPlanningTask } from "../../../../../components/activities/activity-planning-workspace";
import { activityStatuses, type ActivityStatus } from "../../../../../lib/activities/contracts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workspace de atividade" };

type Params = Record<string, string | string[] | undefined>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (value: string | string[] | undefined) => typeof value === "string" ? value : "";

function localDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

export default async function ActivityPlanningPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Params> }) {
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  const routeParams = await searchParams;
  const viewParam = one(routeParams.view);
  const view = viewParam === "priority" || viewParam === "table" ? viewParam : "status";
  const session = await requireAuthenticatedNiteSession();
  const [planning, capabilities, stats] = await Promise.all([
    getActivityPlanning(session.bearer, id),
    getActivityPlanningCapabilities(session.bearer, id),
    getActivityPlanningStats(session.bearer, id),
  ]);
  if (planning.issue === "not-found" || capabilities.issue === "not-found") notFound();
  if (planning.issue || !planning.data || capabilities.issue || !capabilities.data || !capabilities.data.canRead) return <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-7 lg:px-9"><section role="alert" className="border-y border-nite-border-soft py-8"><p className="font-medium text-nite-text-primary">{(planning.issue === "unauthenticated" || capabilities.issue === "unauthenticated") ? "Sua sessão expirou. Entre novamente para acessar o planejamento." : planning.issue === "access" || capabilities.issue === "access" ? "Você não tem acesso a este planejamento." : "Não foi possível carregar este planejamento."}</p><p className="mt-1 text-type-body-compact text-nite-text-secondary">Atualize a página ou volte para Minhas atividades.</p></section></main>;

  const [taskResult, projectResult] = await Promise.all([
    getAllActivityPlanningTasks(session.bearer, id),
    planning.data.projectId ? getProjectSummary(session.bearer, planning.data.projectId) : Promise.resolve(null),
  ]);
  if (taskResult.issue || !taskResult.data) return <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-7 lg:px-9"><section role="alert" className="border-y border-nite-border-soft py-8"><p className="font-medium text-nite-text-primary">Não foi possível carregar as tarefas do planejamento.</p><p className="mt-1 text-type-body-compact text-nite-text-secondary">Nenhuma alteração local foi considerada salva. Atualize a página para tentar novamente.</p></section></main>;

  const taskCapabilities = await Promise.all(taskResult.data.map((task) => getActivityCapabilities(session.bearer, task.id)));
  const tasks: ActivityPlanningTask[] = taskResult.data.map((activity, index) => ({ activity, capabilities: taskCapabilities[index]?.data ?? null }));
  const today = localDate();
  const nextDue = tasks
    .flatMap(({ activity }) => activity.dueOn && activity.dueOn >= today && (activity.status === "PLANEJADA" || activity.status === "EM_EXECUCAO") ? [activity.dueOn] : [])
    .sort()[0] ?? null;
  const initialSearch = one(routeParams.q);
  const rawStatus = one(routeParams.status);
  const selectedStatus = activityStatuses.find((status) => status === rawStatus);
  const labels: Record<ActivityStatus, string> = { PLANEJADA: "Planejada", EM_EXECUCAO: "Em andamento", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" };
  const initialStatus = selectedStatus ? labels[selectedStatus] : rawStatus;
  const rawSort = one(routeParams.sort);
  const initialSort = rawSort === "title" ? "Título" : rawSort === "priority" ? "Prioridade" : rawSort === "dueOn" ? "Prazo" : rawSort || "Atualizado recentemente";

  return <ActivityPlanningWorkspace
    key={`${planning.data.id}:${view}:${tasks.map(({ activity }) => `${activity.id}:${activity.version}`).join(",")}`}
    planning={planning.data}
    tasks={tasks}
    statistics={stats.data ?? null}
    nextDue={nextDue}
    projectTitle={projectResult?.data?.title ?? null}
    view={view}
    query={initialSearch}
    statusFilter={initialStatus || "Todas"}
    sort={initialSort || "Atualizado recentemente"}
    currentMember={{ id: session.member.id, name: session.member.name }}
    canCreateTasks={capabilities.data.canCreateTasks}
    canDeletePlanning={capabilities.data.canDelete}
  />;
}
