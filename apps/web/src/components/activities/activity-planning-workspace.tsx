"use client";

import { SearchField, FilterSelect, Button } from "../ui";
import { FilterToolbar } from "../patterns/filter-toolbar";

import { TransientFeedback } from "../ui/transient-feedback";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeading, StatsPanel, TaskBoard, TaskEditor, TaskTable, Toolbar, type PreviewTask } from "../activity-planning-preview/activity-planning-preview";
import { activityPriorities, activityStatuses, type Activity, type ActivityAssignee, type ActivityCapabilities, type ActivityPlanning, type ActivityStatistics, type ActivityStatus, type ActivityPriority, type ActivityCandidate } from "../../lib/activities/contracts";
import { createPlanningTaskAction, deletePlanningTaskAction, getPlanningTaskEditorAction, getPlanningCreationCandidatesAction, searchPlanningTaskCandidatesAction, movePlanningTaskAction, updatePlanningTaskAction } from "../../lib/activities/planning-actions";

import styles from "../projects/projects.module.css";

import { PlanningDeleteMenu } from "./planning-delete-menu";

export type ActivityPlanningTask = { activity: Activity; capabilities: ActivityCapabilities | null };
type View = "status" | "priority" | "table";
type BoardTask = PreviewTask & { canMoveStatus?: boolean; canChangePriority?: boolean };
type EditorData = { capabilities: ActivityCapabilities; candidates: ActivityCandidate[]; assignees: ActivityAssignee[] };
const statusLabels: Record<ActivityStatus, BoardTask["status"]> = { PLANEJADA: "Planejada", EM_EXECUCAO: "Em andamento", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" };
const statusCodes: Record<BoardTask["status"], ActivityStatus> = { Planejada: "PLANEJADA", "Em andamento": "EM_EXECUCAO", Concluída: "CONCLUIDA", Cancelada: "CANCELADA" };
const priorityLabels: Record<string, BoardTask["priority"]> = { ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };
const priorityCodes: Record<BoardTask["priority"], ActivityPriority | null> = { Alta: "ALTA", Média: "MEDIA", Baixa: "BAIXA", "Sem prioridade": null };
const issueText = (issue: string) => issue === "unauthenticated" ? "Sua sessão expirou. Entre novamente." : issue === "forbidden" ? "Você não tem permissão para alterar esta tarefa." : issue === "project-paused" ? "O projeto está pausado e bloqueia operações de execução." : issue === "not-found" ? "Esta tarefa não está mais disponível." : issue === "conflict" ? "A tarefa foi alterada em outra sessão. Os dados do servidor foram atualizados." : issue === "access" ? "Você não tem permissão para esta operação." : "Não foi possível salvar a alteração. Tente novamente.";

function boardTask({ activity, capabilities }: ActivityPlanningTask): BoardTask {
  return {
    id: activity.id,
    ownerId: activity.primaryExecutorId,
    title: activity.title,
    description: activity.description,
    status: statusLabels[activity.status],
    priority: activity.priority ? priorityLabels[activity.priority] : "Sem prioridade",
    owner: activity.primaryExecutorName ?? "Responsável indisponível",
    start: activity.startOn ?? "Sem data",
    due: activity.dueOn ?? "Sem prazo",
    canMoveStatus: Boolean(capabilities?.transitions.length),
    canChangePriority: Boolean(capabilities?.changePriority),
  };
}

function nextViewHref(planningId: string, view: View, query: string, status: string, sort: string): string {
  const params = new URLSearchParams({ view });
  if (query) params.set("q", query);
  if (status !== "Todas") {
    const statusCode = Object.entries(statusCodes).find(([label]) => label === status)?.[1];
    params.set("status", statusCode ?? status);
  }
  if (sort && sort !== "Atualizado recentemente") params.set("sort", sort === "Título" ? "title" : sort === "Prioridade" ? "priority" : "dueOn");
  return `/atividades/planejamentos/${planningId}?${params}`;
}

export function ActivityPlanningWorkspace({ projectContext, planning, tasks: initialTasks, statistics, nextDue, projectTitle, view, query: initialQuery, statusFilter: initialStatus, sort: initialSort, currentMember, canCreateTasks, canDeletePlanning }: {
  planning: ActivityPlanning; tasks: ActivityPlanningTask[]; statistics: ActivityStatistics | null; nextDue: string | null; projectTitle: string | null;
  view: View; query: string; statusFilter: string; sort: string; currentMember: { id: string; name: string };
  canCreateTasks: boolean; canDeletePlanning: boolean;
  projectContext?: { id: string; title: string; basePath: string };
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [receivedTasks, setReceivedTasks] = useState(initialTasks);
  if (receivedTasks !== initialTasks) {
    setReceivedTasks(initialTasks);
    setTasks(initialTasks);
  }
  const [search, setSearch] = useState(initialQuery);
  const [filter, setFilter] = useState(initialStatus);
  const [sort, setSort] = useState(initialSort);
  const [editorTask, setEditorTask] = useState<ActivityPlanningTask | null>(null);
  const [editorData, setEditorData] = useState<EditorData | null>(null);
  const [creating, setCreating] = useState(false);
  const [creationCandidates, setCreationCandidates] = useState<ActivityCandidate[]>([]);
  const moving = useRef(false);
  const editorRequest = useRef(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const visible = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    const result = tasks.filter(({ activity }) => {
      const matchesText = !normalized || `${activity.title} ${activity.description}`.toLocaleLowerCase("pt-BR").includes(normalized);
      const matchesStatus = filter === "Todas" || statusLabels[activity.status] === filter || activity.status === filter;
      return matchesText && matchesStatus;
    });
    return result.toSorted((left, right) => {
      if (sort === "Título") return left.activity.title.localeCompare(right.activity.title, "pt-BR");
      if (sort === "Prioridade") {
        const priorityOrder = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
        const leftPriority = left.activity.priority ? priorityOrder[left.activity.priority] : 3;
        const rightPriority = right.activity.priority ? priorityOrder[right.activity.priority] : 3;
        return leftPriority - rightPriority;
      }
      if (sort === "Prazo") return (left.activity.dueOn ?? "9999-12-31").localeCompare(right.activity.dueOn ?? "9999-12-31");
      return right.activity.updatedAt.localeCompare(left.activity.updatedAt);
    });
  }, [tasks, search, filter, sort]);
  const projectedTasks = useMemo(() => visible.map(boardTask), [visible]);
  const pauseBlocked = tasks.some((item) => item.capabilities?.executionBlockedByProjectPause);
  const canResumeProject = tasks.some((item) => item.capabilities?.executionBlockedByProjectPause && item.capabilities.canResumeProject);
  const pauseNotice = pauseBlocked ? <aside role="note" className="mb-3 rounded-control border border-status-warning-border bg-status-warning-soft px-3 py-2 text-type-body-compact text-nite-text-primary">
    <p>O projeto está pausado. Operações de execução e mudanças de situação estão bloqueadas; edição e prioridade continuam disponíveis quando autorizadas.</p>
    <p className="mt-1">{canResumeProject && projectContext?.id
      ? <Link className="font-medium underline" href={`/projetos/${encodeURIComponent(projectContext.id)}/configuracoes`}>Retome o projeto em Configurações.</Link>
      : "Peça a um administrador para retomar o projeto."}</p>
  </aside> : null;

  async function openEditor(task: BoardTask) {
    const row = tasks.find((item) => item.activity.id === task.id) ?? null;
    if (!row) return;
    const request = ++editorRequest.current;
    setEditorTask(row);
    setEditorData(null);
    const result = await getPlanningTaskEditorAction(planning.id, row.activity.id);
    if (request !== editorRequest.current) return;
    if (result.issue || !result.data) {
      setNotice(issueText(result.issue ?? "unavailable"));
      setEditorTask(null);
      router.refresh();
      return;
    }
    setEditorData({ capabilities: result.data.capabilities, candidates: result.data.candidates, assignees: result.data.assignees });
  }

  async function moveTask(taskId: string | number, grouping: "status" | "priority", group: BoardTask["status"] | BoardTask["priority"]) {
    const id = String(taskId);
    const row = tasks.find((item) => item.activity.id === id);
    if (!row || pendingId || moving.current) return;
    const field = grouping;
    const selected = Object.entries(grouping === "status" ? statusCodes : priorityCodes).find(([label]) => label === group);
    if (!selected) return;
    const value = selected[1];
    if (grouping === "status" && value === row.activity.status) return;
    if (grouping === "priority" && value === row.activity.priority) return;
    const isSensitiveStatusChange = grouping === "status" && (value === "CANCELADA" || row.activity.status === "CANCELADA" || row.activity.status === "CONCLUIDA");
    const confirmation = value === "CANCELADA" ? "Cancelar esta tarefa? Ela permanecerá no planejamento e poderá exigir reativação." : row.activity.status === "CANCELADA" ? "Reativar esta tarefa como Em execução?" : "Reabrir esta tarefa concluída?";
    if (isSensitiveStatusChange && !window.confirm(confirmation)) return;
    setNotice(null);
    moving.current = true;
    setPendingId(id);
    setTasks((current) => current.map((item) => {
      if (item.activity.id !== id) return item;
      if (grouping === "status") {
        const nextStatus = activityStatuses.find((status) => status === value);
        return nextStatus ? { ...item, activity: { ...item.activity, status: nextStatus } } : item;
      }
      const nextPriority = value === null ? null : activityPriorities.find((priority) => priority === value);
      return value === null || nextPriority ? { ...item, activity: { ...item.activity, priority: nextPriority ?? null } } : item;
    }));
    let result: Awaited<ReturnType<typeof movePlanningTaskAction>>;
    try {
      result = await movePlanningTaskAction(planning.id, id, row.activity.version, field, value, isSensitiveStatusChange);
    } catch {
      result = { data: null, issue: "unavailable" };
    }
    moving.current = false;
    setPendingId(null);
    if (result.issue || !result.data) {
      setTasks((current) => current.map((item) => item.activity.id === id ? row : item));
      setNotice(issueText(result.issue ?? "unavailable"));
      router.refresh();
      return;
    }
    setTasks((current) => current.map((item) => item.activity.id === id ? { ...item, activity: result.data.activity } : item));
    router.refresh();
  }

  async function openCreationEditor() {
    const request = ++editorRequest.current;
    setNotice(null);
    const result = await getPlanningCreationCandidatesAction(planning.id);
    if (request !== editorRequest.current) return;
    if (result.issue || !result.data) { setNotice(issueText(result.issue ?? "unavailable")); return; }
    setCreationCandidates(result.data);
    setCreating(true);
  }

  async function searchMembers(query: string): Promise<string | null> {
    const request = ++editorRequest.current;
    const activityId = editorTask?.activity.id ?? null;
    const result = await searchPlanningTaskCandidatesAction(planning.id, activityId, query);
    if (request !== editorRequest.current) return null;
    if (result.issue || !result.data) return "Não foi possível buscar integrantes. Tente novamente.";
    const candidates = result.data;
    const merge = (current: ActivityCandidate[]) => Array.from(new Map([...current, ...candidates].map((person) => [person.id, person])).values());
    if (activityId) setEditorData((current) => current ? { ...current, candidates: merge(current.candidates) } : current);
    else setCreationCandidates(merge);
    return null;
  }

  function closeEditor() {
    ++editorRequest.current;
    setCreating(false);
    setEditorTask(null);
    setEditorData(null);
  }

  async function createTask(title: string, grouping?: "status" | "priority", group?: BoardTask["status"] | BoardTask["priority"]): Promise<boolean> {
    setNotice(null);
    const status = grouping === "status" && group ? Object.entries(statusCodes).find(([label]) => label === group)?.[1] ?? "PLANEJADA" : "PLANEJADA";
    if (status === "CANCELADA" && !window.confirm("Criar esta tarefa como cancelada? Ela permanecerá no planejamento.")) return false;
    const result = await createPlanningTaskAction(planning.id, { title, description: "", startOn: null, dueOn: null, priority: grouping === "priority" && group ? Object.entries(priorityCodes).find(([label]) => label === group)?.[1] ?? null : null, status, ...(status === "CANCELADA" ? { confirmed: true } : {}) });
    if (result.issue || !result.data) { setNotice(issueText(result.issue ?? "unavailable")); return false; }
    router.refresh();
    return true;
  }

  async function saveTask(values: { title: string; description: string; status: BoardTask["status"]; priority: BoardTask["priority"]; ownerId: string; collaboratorIds: string[]; startOn: string | null; dueOn: string | null }) {
    if (!editorTask) return "Tarefa não encontrada.";
    const current = editorTask.activity;
    const nextStatus = statusCodes[values.status];
    const isSensitiveStatusChange = nextStatus !== current.status && (nextStatus === "CANCELADA" || current.status === "CANCELADA" || current.status === "CONCLUIDA");
    const confirmation = nextStatus === "CANCELADA" ? "Cancelar esta tarefa? Ela permanecerá no planejamento e poderá exigir reativação." : current.status === "CANCELADA" ? "Reativar esta tarefa como Em execução?" : "Reabrir esta tarefa concluída?";
    if (isSensitiveStatusChange && !window.confirm(confirmation)) return "A alteração foi cancelada.";
    if (!editorData?.capabilities.edit) {
      if (nextStatus === current.status) return "Você não tem permissão para editar esta tarefa.";
      if (!editorData?.capabilities.transitions.includes(nextStatus)) {
        const message = issueText(editorData?.capabilities.executionBlockedByProjectPause ? "project-paused" : "forbidden");
        setNotice(message);
        return message;
      }
      const moved = await movePlanningTaskAction(planning.id, current.id, current.version, "status", nextStatus, isSensitiveStatusChange);
      if (moved.issue || !moved.data) { setNotice(issueText(moved.issue ?? "unavailable")); router.refresh(); return issueText(moved.issue ?? "unavailable"); }
      setTasks((items) => items.map((item) => item.activity.id === current.id ? { ...item, activity: moved.data.activity } : item));
      router.refresh();
      return null;
    }
    const result = await updatePlanningTaskAction(planning.id, current.id, {
      expectedVersion: current.version, title: values.title, description: values.description,
      startOn: values.startOn, dueOn: values.dueOn, priority: priorityCodes[values.priority],
      ownerId: values.ownerId, collaboratorIds: values.collaboratorIds, status: nextStatus, confirmed: isSensitiveStatusChange,
    });
    if (result.issue || !result.data) { setNotice(issueText(result.issue ?? "unavailable")); router.refresh(); return issueText(result.issue ?? "unavailable"); }
    setTasks((currentTasks) => currentTasks.map((item) => item.activity.id === current.id ? {
      ...item,
      activity: result.data.activity,
    } : item));
    router.refresh();
    return null;
  }

  async function createFromEditor(values: { title: string; description: string; status: BoardTask["status"]; priority: BoardTask["priority"]; ownerId: string; collaboratorIds: string[]; startOn: string | null; dueOn: string | null }) {
    if (values.status === "Cancelada" && !window.confirm("Criar esta tarefa como cancelada? Ela permanecerá no planejamento.")) return "A criação foi cancelada.";
    const result = await createPlanningTaskAction(planning.id, {
      title: values.title, description: values.description, startOn: values.startOn, dueOn: values.dueOn, priority: priorityCodes[values.priority],
      status: statusCodes[values.status], primaryExecutorId: values.ownerId, collaboratorIds: values.collaboratorIds, ...(values.status === "Cancelada" ? { confirmed: true } : {}),
    });
    if (result.issue || !result.data) { setNotice(issueText(result.issue ?? "unavailable")); return issueText(result.issue ?? "unavailable"); }
    router.refresh();
    return null;
  }

  async function deleteTask() {
    if (!editorTask) return "Tarefa não encontrada.";
    const result = await deletePlanningTaskAction(planning.id, editorTask.activity.id, editorTask.activity.version);
    if (result.issue) { setNotice(issueText(result.issue)); router.refresh(); return issueText(result.issue); }
    setTasks((current) => current.filter((item) => item.activity.id !== editorTask.activity.id));
    router.refresh();
    return null;
  }

  const editorOwners = editorTask ? [
    { id: editorTask.activity.primaryExecutorId, name: editorTask.activity.primaryExecutorName ?? "Responsável atual" },
    ...(editorData?.assignees ?? []).filter((assignee) => assignee.available).map((assignee) => ({ id: assignee.memberId, name: assignee.memberName ?? "Integrante atual" })),
    ...(editorData?.candidates ?? []).map((candidate) => ({ id: candidate.id, name: candidate.name })),
  ].filter((person, index, people) => people.findIndex((candidate) => candidate.id === person.id) === index) : [];
  const collaboratorOwners = editorData ? [
    ...editorData.assignees.filter((assignee) => assignee.role === "COLLABORATOR").map((assignee) => ({ id: assignee.memberId, name: assignee.memberName ?? "Colaborador atual" })),
    ...editorData.candidates.map((candidate) => ({ id: candidate.id, name: candidate.name })),
  ].filter((person, index, people) => people.findIndex((candidate) => candidate.id === person.id) === index) : [];
  const allowedStatuses = editorTask ? [
    statusLabels[editorTask.activity.status],
    ...(editorData?.capabilities.transitions ?? []).map((status) => statusLabels[status]),
  ] : undefined;
  const viewQuery = (next: "priority" | "status" | "table") => {
    const canonical = nextViewHref(planning.id, next, search, filter, sort);
    if (!projectContext) return canonical;
    const params = new URLSearchParams(canonical.split("?")[1]);
    params.set("planejamento", planning.id);
    return `${projectContext.basePath}?${params}`;
  };
  const Container = projectContext ? "section" : "main";

  return <Container className={projectContext ? styles.sectionPage : "mx-auto w-full max-w-[1600px] min-w-0 space-y-5 px-4 py-5 sm:px-7 sm:py-7 lg:px-9"}>
    {projectContext ? <>
      <header className={styles.sectionHeader}><div><Link className={styles.textLink} href={projectContext.basePath}>← Planejamentos do projeto</Link><h2>{planning.title}</h2><p>{planning.description}</p></div><div className="flex items-center gap-2">{canCreateTasks ? <Button size="compact" variant="primary" type="button"  onClick={() => void openCreationEditor()}>+ Nova tarefa</Button> : null}<PlanningDeleteMenu id={planning.id} version={planning.version} title={planning.title} canDelete={canDeletePlanning} leaveWorkspace returnHref={projectContext.basePath}/></div></header>
      <div className={styles.taskViews}><nav aria-label="Visualização das tarefas">{([{ id: "status", label: "▦ Por situação" }, { id: "priority", label: "▥ Por prioridade" }, { id: "table", label: "▤ Tabela" }] as const).map(item => <Link key={item.id} aria-current={view === item.id ? "page" : undefined} href={viewQuery(item.id)}>{item.label}</Link>)}</nav><span className={styles.muted}>Somente este projeto</span></div>
      <FilterToolbar compact onSubmit={event => event.preventDefault()}><SearchField aria-label="Pesquisar tarefas do projeto" placeholder="Pesquisar tarefas…" value={search} onChange={event => setSearch(event.target.value)}/><FilterSelect aria-label="Situação da tarefa" value={filter} onChange={event => setFilter(event.target.value)}>{["Todas", "Planejada", "Em andamento", "Concluída", "Cancelada"].map(label => <option key={label}>{label}</option>)}</FilterSelect><FilterSelect aria-label="Ordenar tarefas" value={sort} onChange={event => setSort(event.target.value)}>{["Atualizado recentemente", "Título", "Prioridade", "Prazo"].map(label => <option key={label}>{label}</option>)}</FilterSelect></FilterToolbar>
    </> : <>
    <div className="flex items-center gap-1 text-type-metadata text-nite-text-muted"><Link href="/atividades" className="hover:text-nite-brand-primary">Minhas atividades</Link><span aria-hidden="true">›</span><span className="truncate">{planning.title}</span></div>
    <PageHeading eyebrow={projectTitle ?? "Independente"} title={planning.title} action={<div className="flex flex-wrap gap-2">{canCreateTasks ? <Button size="compact" variant="primary" type="button" onClick={() => void openCreationEditor()}><span aria-hidden="true">＋</span> Nova tarefa</Button> : null}<PlanningDeleteMenu id={planning.id} version={planning.version} title={planning.title} canDelete={canDeletePlanning} leaveWorkspace/></div>}/>
    <Toolbar view={view} planningId={planning.id} query={search} setQuery={setSearch} statusFilter={filter} setStatusFilter={setFilter} sort={sort} setSort={setSort} hrefForView={viewQuery} applyLabel="Aplicar" showOptions={false}/>
    </>}
    {pauseNotice}
    {notice ? <TransientFeedback messageKey={notice} onDismiss={() => setNotice(null)}><p role="status" aria-live="polite" className="rounded-control border border-nite-border-soft bg-nite-surface-subtle px-3 py-2 text-type-body-compact text-nite-text-secondary">{notice}</p></TransientFeedback> : null}
    <div className={projectContext ? styles.taskLayout : "grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_225px]"}>
      <div className={projectContext ? styles.tasks : "min-w-0"}>
        {tasks.length === 0 ? <section className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-panel border border-nite-border-soft px-4 py-10 text-center">
          <h2 className="font-display text-type-section-title text-nite-text-primary">Este planejamento ainda não tem tarefas.</h2><p className="max-w-lg text-type-body-compact text-nite-text-secondary">As tarefas serão atividades executáveis vinculadas a este planejamento.</p>{canCreateTasks ? <Button size="compact" variant="primary" type="button" onClick={() => void openCreationEditor()}>Nova tarefa</Button> : null}
        </section> : view === "table" ? <TaskTable tasks={projectedTasks} onEdit={(task) => void openEditor(task)} onAdd={createTask} canCreateTasks={canCreateTasks}/> : <TaskBoard tasks={projectedTasks} grouping={view === "priority" ? "priority" : "status"} onEdit={(task) => void openEditor(task)} onAdd={createTask} onMove={(taskId, grouping, group) => void moveTask(taskId, grouping, group)} canCreateTasks={canCreateTasks}/>}
      </div>
      {statistics ? <StatsPanel tasks={tasks.map(boardTask)} stats={statistics} nextDue={nextDue} showOptions={false}/> : <aside aria-label="Resumo do planejamento" className="rounded-panel border border-nite-border-soft p-4 text-type-body-compact text-nite-text-secondary">Resumo indisponível no momento.</aside>}
    </div>
    {creating ? <TaskEditor key="create-task" task={null} onClose={closeEditor} onSearchMembers={searchMembers} onUpdate={() => undefined} onCreate={() => undefined} ownerOptions={creationCandidates.map(({ id, name }) => ({ id, name }))} collaboratorOptions={creationCandidates.map(({ id, name }) => ({ id, name }))} initialOwnerId={creationCandidates.some((person) => person.id === currentMember.id) ? currentMember.id : creationCandidates[0]?.id} initialOwnerName={creationCandidates.find((person) => person.id === currentMember.id)?.name ?? creationCandidates[0]?.name} onCreateServer={createFromEditor}/> : null}
    {editorTask ? <TaskEditor key={`${editorTask.activity.id}:${editorTask.activity.version}:${editorData ? "loaded" : "loading"}`} task={boardTask(editorTask)} onClose={closeEditor} onSearchMembers={searchMembers} onUpdate={() => undefined} onCreate={() => undefined} ownerOptions={editorOwners} collaboratorOptions={collaboratorOwners} initialCollaboratorIds={editorData?.assignees.filter((assignee) => assignee.role === "COLLABORATOR").map((assignee) => assignee.memberId)} onSave={saveTask} onDelete={deleteTask} canEdit={Boolean(editorData?.capabilities.edit)} canManageAssignees={Boolean(editorData?.capabilities.manageAssignees)} canDelete={Boolean(editorData?.capabilities.canDelete)} allowedStatuses={allowedStatuses}/> : null}
  </Container>;
}
