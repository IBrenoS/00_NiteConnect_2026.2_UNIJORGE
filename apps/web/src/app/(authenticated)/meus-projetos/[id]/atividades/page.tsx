import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectActivities } from "../../../../../components/projects/project-activities";
import { requireAuthenticatedNiteSession } from "../../../../../lib/auth/server-session";
import { getProjectWorkspace } from "../../../../../lib/projects/data";
import { getProjectActivityPlannings, getActivityPlanning, getActivityPlanningCapabilities, getActivityPlanningStats, getAllActivityPlanningTasks, getActivityCapabilities } from "../../../../../lib/activities/data";
import { activityStatuses, type ActivityStatus } from "../../../../../lib/activities/contracts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atividades e planejamento do projeto" };
type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => typeof value === "string" ? value : "";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const error = (message: string) => <section role="alert"><h2>{message}</h2><p>Atualize a página para tentar novamente.</p></section>;
export default async function ProjectActivitiesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Params> }) {
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const session = await requireAuthenticatedNiteSession();
  const workspace = await getProjectWorkspace(session.bearer, id);
  if (workspace.issue === "not-found") notFound();
  if (workspace.issue || !workspace.data || !workspace.data.capabilities.canViewActivities) return error(workspace.issue === "unauthenticated" ? "Sua sessão expirou. Entre novamente." : workspace.issue === "access" || !workspace.issue ? "Você não tem acesso às atividades deste projeto." : "Não foi possível carregar o projeto.");
  const route = await searchParams;
  const selectedId = one(route.planejamento);
  const common = { projectId: id, projectTitle: workspace.data.name, canCreatePlanning: workspace.data.capabilities.canCreatePlanning, plannings: [], statistics: {}, page: 0, size: 20, total: 0, query: one(route.q) };
  if (selectedId) {
    const unavailable = <section><h2>Planejamento indisponível</h2><Link href={`/meus-projetos/${id}/atividades`}>Planejamentos do projeto</Link></section>;
    if (!uuid.test(selectedId)) return unavailable;
    const planning = await getActivityPlanning(session.bearer, selectedId);
    if (planning.issue === "not-found" || planning.issue === "access" || (!planning.issue && planning.data.projectId !== id)) return unavailable;
    if (planning.issue || !planning.data) return error("Não foi possível carregar o planejamento.");
    const [capabilities, stats, result] = await Promise.all([getActivityPlanningCapabilities(session.bearer, selectedId), getActivityPlanningStats(session.bearer, selectedId), getAllActivityPlanningTasks(session.bearer, selectedId)]);
    if (capabilities.issue || !capabilities.data?.canRead) return error("Você não tem acesso a este planejamento.");
    if (result.issue || !result.data || result.data.some(activity => activity.projectId !== id || activity.planningId !== selectedId)) return error("Não foi possível carregar as tarefas do planejamento.");
    const capabilitiesByTask = await Promise.all(result.data.map(task => getActivityCapabilities(session.bearer, task.id)));
    const tasks = result.data.map((activity, index) => ({ activity, capabilities: capabilitiesByTask[index]?.data ?? null }));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const nextDue = tasks.flatMap(({ activity }) => activity.dueOn && activity.dueOn >= today && (activity.status === "PLANEJADA" || activity.status === "EM_EXECUCAO") ? [activity.dueOn] : []).sort()[0] ?? null;
    const labels: Record<ActivityStatus, string> = { PLANEJADA: "Planejada", EM_EXECUCAO: "Em andamento", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" };
    const status = activityStatuses.find(value => value === one(route.status));
    const view = one(route.view);
    const sort = one(route.sort);
    return <ProjectActivities {...common} selected={{ planning: planning.data, tasks, statistics: stats.data ?? null, nextDue, projectTitle: workspace.data.name, view: view === "priority" || view === "table" ? view : "status", query: one(route.q), statusFilter: status ? labels[status] : "Todas", sort: sort === "title" ? "Título" : sort === "priority" ? "Prioridade" : sort === "dueOn" ? "Prazo" : "Atualizado recentemente", currentMember: { id: session.member.id, name: session.member.name }, canCreateTasks: capabilities.data.canCreateTasks, canDeletePlanning: capabilities.data.canDelete }}/>;
  }
  const rawPage = Number(one(route.page));
  const page = Number.isSafeInteger(rawPage) && rawPage >= 0 ? rawPage : 0;
  const query = new URLSearchParams({ page: String(page), size: "20" });
  if (common.query) query.set("q", common.query);
  const plannings = await getProjectActivityPlannings(session.bearer, id, query);
  if (plannings.issue || !plannings.data) return error("Não foi possível carregar os planejamentos do projeto.");
  const items = plannings.data.items.filter(planning => planning.projectId === id);
  const stats = await Promise.all(items.map(planning => getActivityPlanningStats(session.bearer, planning.id)));
  return <ProjectActivities {...common} plannings={items} statistics={Object.fromEntries(items.map((planning, index) => [planning.id, stats[index].data ?? null]))} page={plannings.data.page} total={plannings.data.total} size={plannings.data.size}/>;
}
