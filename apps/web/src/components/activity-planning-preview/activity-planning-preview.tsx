"use client";

import { TransientFeedback } from "../ui/transient-feedback";
import Link from "next/link";
import { AlertDialog } from "../ui/alert-dialog";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

type Screen = "plannings" | "create-planning" | "workspace" | "priority" | "status" | "table" | "task-form" | "empty" | "legacy-tasks";
type Status = "Planejada" | "Em andamento" | "Concluída" | "Cancelada";
type Priority = "Alta" | "Média" | "Baixa" | "Sem prioridade";
type BoardGrouping = "priority" | "status";
type BoardGroup = Status | Priority;
type TaskId = number | string;
export type PreviewTask = { id: TaskId; ownerId?: string; title: string; status: Status; priority: Priority; owner: string; start: string; due: string; description: string };
type Task = PreviewTask & { canMoveStatus?: boolean; canChangePriority?: boolean };
export type PreviewPlanning = { id: TaskId; title: string; description: string; project: string | null; tasks: Task[]; updated: string };
type Planning = PreviewPlanning;

const initialPlannings: Planning[] = [
  { id: 1, title: "Boas-vindas aos novos integrantes", description: "Organizar a chegada, os acessos e a primeira semana da equipe.", project: "NITE Connect", updated: "Atualizado hoje", tasks: [
    { id: 1, title: "Preparar trilha de boas-vindas", status: "Em andamento", priority: "Alta", owner: "Marina Costa", start: "2026-11-17", due: "2026-11-19", description: "Reunir os materiais que cada integrante precisa na primeira semana." },
    { id: 2, title: "Revisar permissões dos espaços", status: "Planejada", priority: "Alta", owner: "Rafael Lima", start: "Sem data", due: "2026-11-21", description: "Conferir acessos de projetos e documentos." },
    { id: 3, title: "Agendar conversa com a equipe", status: "Planejada", priority: "Média", owner: "Marina Costa", start: "Sem data", due: "2026-11-24", description: "Reservar um horário de apresentação." },
    { id: 4, title: "Enviar kit de início", status: "Concluída", priority: "Baixa", owner: "João Alves", start: "Sem data", due: "2026-11-14", description: "Compartilhar os links úteis com o grupo." },
    { id: 5, title: "Cadastrar conta institucional", status: "Em andamento", priority: "Média", owner: "Rafael Lima", start: "Sem data", due: "2026-11-20", description: "Solicitar a criação da conta institucional." },
  ] },
  { id: 2, title: "Pesquisa com usuários", description: "Ciclo de entrevistas para validar as melhorias do portal.", project: "Portal do estudante", updated: "Atualizado ontem", tasks: [
    { id: 6, title: "Fechar roteiro de entrevista", status: "Em andamento", priority: "Alta", owner: "Bianca Reis", start: "Sem data", due: "2026-11-18", description: "Validar perguntas com produto." },
    { id: 7, title: "Convidar participantes", status: "Planejada", priority: "Média", owner: "Bianca Reis", start: "Sem data", due: "2026-11-22", description: "Selecionar estudantes para as entrevistas." },
  ] },
  { id: 3, title: "Organização do laboratório", description: "Ajustes de espaço e materiais para o próximo ciclo.", project: null, updated: "Atualizado há 3 dias", tasks: [
    { id: 8, title: "Inventariar equipamentos", status: "Planejada", priority: "Baixa", owner: "Lucas Rocha", start: "Sem data", due: "2026-11-28", description: "Atualizar lista de equipamentos disponíveis." },
  ] },
  { id: 4, title: "Acompanhamento do próximo ciclo", description: "", project: "NITE Connect", updated: "Atualizado hoje", tasks: [] },
];
const demoProjects = Array.from(new Set(initialPlannings.flatMap((planning) => planning.project ? [planning.project] : [])));
export const previewProjectOptions: readonly (string | null)[] = [null, ...demoProjects];

const screenOptions: readonly { id: Screen; label: string }[] = [
  { id: "plannings", label: "Minhas atividades" }, { id: "create-planning", label: "Nova atividade" },
  { id: "workspace", label: "Workspace" }, { id: "priority", label: "Por prioridade" },
  { id: "status", label: "Por situação" }, { id: "table", label: "Tabela" },
  { id: "task-form", label: "Criar / editar tarefa" }, { id: "empty", label: "Estados vazios" },
];
const screenHref = (screen: Screen, planningId?: number | string) => `/atividades/preview?tela=${screen}${planningId ? `&planejamento=${planningId}` : ""}`;
const statusOrder: readonly Status[] = ["Planejada", "Em andamento", "Concluída", "Cancelada"];
const priorityOrder: readonly Priority[] = ["Alta", "Média", "Baixa", "Sem prioridade"];
export function getCompletionPercent(tasks: readonly PreviewTask[]): number {
  const denominator = tasks.filter((task) => task.status !== "Cancelada").length;
  if (denominator === 0) return 0;
  return Math.round(tasks.filter((task) => task.status === "Concluída").length / denominator * 100);
}

export function movePreviewTask(tasks: readonly PreviewTask[], taskId: TaskId, grouping: BoardGrouping, destination: string): PreviewTask[] {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return [...tasks];
  const nextStatus = grouping === "status" ? statusOrder.find((status) => status === destination) : undefined;
  const nextPriority = grouping === "priority" ? priorityOrder.find((priority) => priority === destination) : undefined;
  if (!nextStatus && !nextPriority) return [...tasks];
  return tasks.map((item) => item.id === taskId ? {
    ...item,
    ...(nextStatus ? { status: nextStatus } : {}),
    ...(nextPriority ? { priority: nextPriority } : {}),
  } : item);
}
function dueLabel(value: string): string {
  if (value === "Sem prazo") return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)).replace(".", "");
}

const subtle = "border border-nite-border-soft bg-nite-surface";
const iconButton = "grid size-8 shrink-0 place-items-center rounded-control text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus";

function Chevron({ className = "" }: { className?: string }) { return <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={`size-4 ${className}`}><path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function CalendarIcon({ className = "" }: { className?: string }) { return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`size-4 ${className}`}><rect x="3" y="4.5" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M6.5 2.75v3.5M13.5 2.75v3.5M3 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M6.5 11h.01M10 11h.01M13.5 11h.01M6.5 14.25h.01M10 14.25h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function Dots() { return <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" className="size-4"><circle cx="3" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="13" cy="8" r="1"/></svg>; }
function Plus() { return <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }

function DemoNotice() {
  return <div className="flex min-h-9 items-center gap-2 border-b border-nite-border-soft bg-nite-surface-subtle px-4 text-type-metadata text-nite-text-secondary sm:px-7 lg:px-9">
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-nite-border-soft bg-nite-surface px-2 py-0.5 font-medium text-nite-brand-primary"><span className="size-1.5 rounded-full bg-nite-brand-primary"/>Demonstração</span>
    <span>Dados ilustrativos. Alterações desta prévia não são persistidas.</span>
  </div>;
}

function ScreenPicker({ active, planningId }: { active: Screen; planningId: number }) {
  return <nav aria-label="Telas do protótipo" className="flex min-w-0 gap-1 overflow-x-auto border-b border-nite-border-soft bg-nite-background px-3 py-2 [scrollbar-width:thin] sm:px-6 lg:px-8">
    {screenOptions.map(({ id, label }, index) => <Link key={id} href={screenHref(id, id === "empty" ? 4 : planningId)} aria-current={active === id ? "page" : undefined} className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-control px-2.5 text-type-metadata transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${active === id ? "bg-nite-brand-soft font-medium text-nite-brand-primary" : "text-nite-text-secondary hover:bg-nite-surface-subtle hover:text-nite-text-primary"}`}><span className="text-nite-text-muted">{index + 1}</span>{label}</Link>)}
  </nav>;
}

export function PlanningCard({ planning, href, stats }: { planning: Planning; href: string; stats?: import("../../lib/activities/contracts").ActivityStatistics | null }) {
  const count = stats === null ? null : stats?.total ?? planning.tasks.length;
  const done = stats === null ? null : stats?.completed ?? planning.tasks.filter((task) => task.status === "Concluída").length;
  const active = stats === null ? null : stats?.inProgress ?? planning.tasks.filter((task) => task.status === "Em andamento").length;
  const percent = stats === null ? null : stats ? Math.round(stats.completionRate) : getCompletionPercent(planning.tasks);
  return <Link
    href={href}
    className="group block min-w-0 rounded-panel border border-nite-border-soft bg-nite-surface p-3.5 transition-colors hover:border-nite-border-strong hover:bg-nite-surface-subtle/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus"
  >
    <article>
      <h2 className="font-display text-type-component-title font-semibold leading-snug text-nite-text-primary group-hover:text-nite-brand-primary">{planning.title}</h2>
      {planning.description.trim() ? <p className="mt-1 line-clamp-1 text-type-metadata leading-relaxed text-nite-text-secondary">{planning.description}</p> : null}
      <div className="mt-2 flex min-w-0 items-center gap-1.5 text-type-metadata text-nite-text-muted">
        <span className={"size-1.5 shrink-0 rounded-full " + (planning.project ? "bg-nite-brand-primary" : "bg-nite-text-muted")}/>
        <span className="truncate">{planning.project ?? "Independente"}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-type-metadata text-nite-text-secondary">
        <span><strong className="font-semibold text-nite-text-primary">{count ?? "—"}</strong> {count === 1 ? "tarefa" : "tarefas"}<span className="mx-1.5 text-nite-text-muted">·</span>{done ?? "—"} concluídas{active ? <><span className="mx-1.5 text-nite-text-muted">·</span>{active} em execução</> : null}</span>
        <span className="shrink-0 font-medium tabular-nums text-nite-text-muted">{percent === null ? "—" : `${percent}%`}</span>
      </div>
      {percent === null ? <p className="mt-1.5 text-type-metadata text-nite-text-muted">Resumo indisponível no momento.</p> : <div className="mt-1.5 h-1 overflow-hidden rounded-pill bg-nite-surface-subtle" role="progressbar" aria-label={"Conclusão das tarefas de " + planning.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="h-full rounded-pill bg-nite-brand-primary transition-[width]" style={{ width: percent + "%" }}/>
      </div>}
    </article>
  </Link>;
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="flex min-w-0 flex-col gap-3 border-b border-nite-border-soft pb-5 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">{eyebrow ? <p className="mb-1 text-type-metadata font-medium uppercase tracking-wide text-nite-text-muted">{eyebrow}</p> : null}<h1 className="font-display text-type-page-title font-semibold tracking-tight text-nite-text-primary">{title}</h1>{description ? <p className="mt-1 max-w-3xl text-type-body-compact leading-relaxed text-nite-text-secondary">{description}</p> : null}</div>{action}
  </header>;
}

function PrimaryButton({ children, onClick, type = "button" }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit" }) {
  return <button type={type} onClick={onClick} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-control bg-nite-brand-primary px-3.5 text-type-body-compact font-medium text-nite-action-text transition-colors hover:bg-nite-brand-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">{children}</button>;
}

export function Toolbar({ view, planningId, query, setQuery, statusFilter, setStatusFilter, sort, setSort, hrefForView, applyLabel = "Aplicar na prévia", showOptions = true }: { view: Screen; planningId: number | string; query: string; setQuery: (value: string) => void; statusFilter: string; setStatusFilter: (value: string) => void; sort: string; setSort: (value: string) => void; hrefForView?: (view: "priority" | "status" | "table") => string; applyLabel?: string; showOptions?: boolean }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  return <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2">
    <nav aria-label="Visualização das tarefas" className="flex items-center gap-0.5 rounded-control border border-nite-border-soft bg-nite-surface p-0.5">
      {([ ["priority", "Quadro por prioridade"], ["status", "Quadro por situação"], ["table", "Tabela"] ] as const).map(([id, label]) => <Link key={id} href={hrefForView?.(id) ?? screenHref(id, planningId)} aria-current={view === id ? "page" : undefined} className={`inline-flex min-h-8 items-center rounded-subtle px-2.5 text-type-metadata focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${view === id ? "bg-nite-surface-subtle font-medium text-nite-text-primary shadow-sm" : "text-nite-text-secondary hover:text-nite-text-primary"}`}>{label}</Link>)}
    </nav>
    <div className="flex items-center gap-1">
      {searchOpen ? <label className="flex h-8 items-center gap-1.5 rounded-control border border-nite-border-soft bg-nite-surface px-2"><span className="sr-only">Buscar tarefas</span><span aria-hidden="true" className="text-nite-text-muted">⌕</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar tarefas" className="w-32 bg-transparent text-type-metadata text-nite-text-primary outline-none placeholder:text-nite-text-muted"/></label> : <button type="button" onClick={() => setSearchOpen(true)} className={iconButton} aria-label="Pesquisar">⌕</button>}
      <div className="relative"><button type="button" onClick={() => setFilterOpen((open) => !open)} aria-expanded={filterOpen} className={iconButton} aria-label="Filtrar tarefas">≡</button>{filterOpen ? <div className="absolute right-0 top-full z-20 mt-1 grid w-44 gap-2 rounded-panel border border-nite-border-soft bg-nite-surface p-3 shadow-nite-floating"><label className="grid gap-1 text-type-metadata text-nite-text-secondary">Situação<select aria-label="Filtrar por situação" className="h-8 rounded-control border border-nite-border-soft bg-nite-surface px-2 text-type-metadata text-nite-text-primary" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Todas</option>{statusOrder.map((status) => <option key={status}>{status}</option>)}</select></label><button type="button" onClick={() => setFilterOpen(false)} className="min-h-8 rounded-control bg-nite-surface-subtle text-type-metadata font-medium text-nite-text-secondary">{applyLabel}</button></div> : null}</div>
      <label className="sr-only" htmlFor="preview-sort">Ordenação</label><div className="relative"><select id="preview-sort" value={sort} onChange={(event) => setSort(event.target.value)} className="h-9 w-64 max-w-[65vw] appearance-none rounded-control border border-nite-border-soft bg-nite-surface py-1 pl-3 pr-9 text-type-metadata font-medium text-nite-text-primary shadow-sm transition-colors hover:border-nite-border-strong hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus"><option>Atualizado recentemente</option><option>Prioridade</option><option>Prazo</option><option>Título</option></select><Chevron className="pointer-events-none absolute right-3 top-1/2 size-3 -translate-y-1/2 rotate-90 text-nite-text-muted"/></div>
      {showOptions ? <button type="button" className={iconButton} aria-label="Opções de visualização"><Dots/></button> : null}
    </div>
  </div>;
}

export function StatusPill({ status }: { status: Status }) {
  const color = status === "Concluída" ? "bg-status-done-soft text-status-done" : status === "Em andamento" ? "bg-status-progress-soft text-status-progress" : status === "Cancelada" ? "bg-status-cancelled-soft text-status-cancelled" : "bg-status-draft-soft text-status-draft";
  return <span className={"inline-flex max-w-full items-center rounded-pill px-2 py-0.5 text-type-metadata font-medium " + color}><span className="mr-1.5 size-1.5 shrink-0 rounded-full bg-current opacity-70"/>{status}</span>;
}
export function PriorityPill({ priority }: { priority: Priority }) {
  const color = priority === "Alta" ? "bg-status-error-soft text-status-error" : priority === "Média" ? "bg-status-warning-soft text-status-warning" : priority === "Baixa" ? "bg-status-done-soft text-status-done" : "bg-nite-surface-subtle text-nite-text-muted";
  return <span className={"inline-flex items-center rounded-pill px-2 py-0.5 text-type-metadata font-medium " + color}>{priority}</span>;
}

export function TaskCard({ task, onEdit, draggable = true }: { task: Task; onEdit: (task: Task) => void; draggable?: boolean }) {
  return <button
    type="button"
    draggable={draggable}
    aria-label={"Editar tarefa " + task.title}
    onClick={() => onEdit(task)}
    onDragStart={(event) => {
      event.dataTransfer.setData("text/plain", String(task.id));
      event.dataTransfer.effectAllowed = "move";
    }}
    className="group block w-full min-w-0 cursor-grab rounded-control border border-nite-border-soft bg-nite-surface px-3 py-2.5 text-left shadow-sm transition-colors hover:border-nite-border-strong hover:bg-nite-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus active:cursor-grabbing"
  >
    <span className="block text-type-body-compact font-medium leading-snug text-nite-text-primary group-hover:text-nite-brand-primary">{task.title}</span>
    <span className="mt-2 flex flex-wrap items-center gap-1.5"><PriorityPill priority={task.priority}/><StatusPill status={task.status}/><span className="ml-auto max-w-28 truncate text-type-metadata text-nite-text-secondary">{task.owner}</span></span>
    <span className="mt-2 block border-t border-nite-border-soft/70 pt-1.5 text-right text-type-metadata text-nite-text-muted">Prazo {dueLabel(task.due)}</span>
  </button>;
}

export function KanbanColumn({ title, tone, tasks, grouping, onEdit, onAdd, onMove, canCreateTasks = true }: { title: BoardGroup; tone: string; tasks: Task[]; grouping: BoardGrouping; onEdit: (task: Task) => void; onAdd: (title: string, grouping: BoardGrouping, group: BoardGroup) => void | Promise<boolean>; onMove: (taskId: TaskId, grouping: BoardGrouping, group: BoardGroup) => void; canCreateTasks?: boolean }) {
  const [creating, setCreating] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const inputId = "quick-task-" + title.toLocaleLowerCase("pt-BR").replaceAll(" ", "-");
  function cancel() { setCreating(false); setTitleInput(""); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!titleInput.trim()) return;
    const saved = await onAdd(titleInput.trim(), grouping, title);
    if (saved !== false) cancel();
  }
  return <section
    className="flex min-w-[210px] flex-1 flex-col rounded-panel bg-nite-surface-subtle/60 p-2"
    aria-label={title + ", " + tasks.length + " tarefas"}
    onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => {
      event.preventDefault();
      const rawTaskId = event.dataTransfer.getData("text/plain");
      if (rawTaskId) onMove(/^\d+$/.test(rawTaskId) ? Number(rawTaskId) : rawTaskId, grouping, title);
    }}
  >
    <header className={"mb-2 flex min-h-9 items-center justify-between rounded-control px-2 " + tone}><h3 className="text-type-body-compact font-medium text-nite-text-primary">{title}</h3><span className="min-w-6 rounded-pill bg-nite-surface/80 px-1.5 py-0.5 text-center text-type-metadata text-nite-text-secondary">{tasks.length}</span></header>
    <div className="grid content-start gap-2">{tasks.map((task) => <TaskCard key={task.id} task={task} onEdit={onEdit} draggable={task.canMoveStatus === undefined && task.canChangePriority === undefined ? true : Boolean(grouping === "status" ? task.canMoveStatus : task.canChangePriority)}/>)}</div>
    {creating ? <form onSubmit={submit} className="mt-1">
      <label className="sr-only" htmlFor={inputId}>Título da nova tarefa</label>
      <input id={inputId} autoFocus value={titleInput} onChange={(event) => setTitleInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); cancel(); } }} placeholder="Nome da tarefa" className="min-h-8 w-full border-b border-nite-border-soft bg-transparent px-2 text-type-body-compact text-nite-text-primary outline-none placeholder:text-nite-text-muted focus:border-nite-brand-primary"/>
      <p className="sr-only">Pressione Enter para criar ou Esc para cancelar.</p>
    </form> : canCreateTasks ? <button type="button" onClick={() => setCreating(true)} className="mt-1 flex min-h-8 items-center gap-2 rounded-control px-2 text-left text-type-metadata text-nite-text-muted hover:bg-nite-surface hover:text-nite-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus"><Plus/> Nova tarefa</button> : null}
  </section>;
}

export function TaskBoard({ tasks, grouping, onEdit, onAdd, onMove, canCreateTasks = true }: { tasks: Task[]; grouping: BoardGrouping; onEdit: (task: Task) => void; onAdd: (title: string, grouping: BoardGrouping, group: BoardGroup) => void | Promise<boolean>; onMove: (taskId: TaskId, grouping: BoardGrouping, group: BoardGroup) => void; canCreateTasks?: boolean }) {
  const groups = grouping === "priority" ? priorityOrder : statusOrder;
  const tones = grouping === "priority" ? ["bg-status-error-soft/70", "bg-status-warning-soft/70", "bg-status-done-soft/70", "bg-nite-surface-subtle"] : ["bg-status-draft-soft/70", "bg-status-progress-soft/70", "bg-status-done-soft/70", "bg-status-cancelled-soft/70"];
  return <div className="grid min-w-0 grid-cols-1 gap-2.5 md:grid-cols-2 2xl:grid-cols-4">{groups.map((group, index) => <KanbanColumn key={group} title={group} tone={tones[index]} tasks={tasks.filter((task) => grouping === "priority" ? task.priority === group : task.status === group)} grouping={grouping} onEdit={onEdit} onAdd={onAdd} onMove={onMove} canCreateTasks={canCreateTasks}/>)}</div>;
}
export function StatsPanel({ tasks, stats, nextDue: serverNextDue, showOptions = true }: { tasks: Task[]; stats?: import("../../lib/activities/contracts").ActivityStatistics; nextDue?: string | null; showOptions?: boolean }) {
  const total = stats?.total ?? tasks.length;
  const active = stats?.inProgress ?? tasks.filter((task) => task.status === "Em andamento").length;
  const done = stats?.completed ?? tasks.filter((task) => task.status === "Concluída").length;
  const percent = stats?.completionRate ?? getCompletionPercent(tasks);
  const nextDue = serverNextDue !== undefined ? serverNextDue : tasks
    .filter((task) => task.due !== "Sem prazo" && task.status !== "Concluída" && task.status !== "Cancelada")
    .map((task) => task.due)
    .sort()[0];
  const rows = [{ label: "Em andamento", value: active, color: "bg-status-progress" }, { label: "Concluídas", value: done, color: "bg-status-done" }, { label: "Planejadas", value: tasks.filter((task) => task.status === "Planejada").length, color: "bg-status-draft" }, { label: "Canceladas", value: tasks.filter((task) => task.status === "Cancelada").length, color: "bg-status-cancelled" }];
  return <aside className={`${subtle} rounded-panel p-3.5`} aria-label="Resumo do planejamento">
    <div className="flex items-center justify-between"><h2 className="text-type-body-compact font-semibold text-nite-text-primary">Resumo</h2>{showOptions ? <button type="button" className={iconButton} aria-label="Mais opções do resumo"><Dots/></button> : null}</div>
    <div className="mt-3 flex items-end gap-2"><strong className="font-display text-3xl font-semibold leading-none text-nite-text-primary">{total}</strong><span className="pb-0.5 text-type-metadata text-nite-text-muted">tarefas no total</span></div>
    <div className="mt-3 h-1.5 overflow-hidden rounded-pill bg-nite-surface-subtle"><div className="h-full rounded-pill bg-status-done transition-[width]" style={{ width: percent + "%" }}/></div>
    <p className="mt-1 text-type-metadata text-nite-text-muted">{percent}% {stats ? "das tarefas não canceladas concluídas" : "concluídas"}</p>
    <div className="mt-3 grid gap-2 border-t border-nite-border-soft pt-3">{rows.map((row) => {
      const value = stats ? row.label === "Em andamento" ? stats.inProgress : row.label === "Concluídas" ? stats.completed : row.label === "Planejadas" ? stats.planned : stats.cancelled : row.value;
      return <div key={row.label} className="flex items-center gap-2 text-type-metadata"><span className={`size-2 rounded-full ${row.color}`}/><span className="flex-1 text-nite-text-secondary">{row.label}</span><span className="font-medium tabular-nums text-nite-text-primary">{value}</span></div>;
    })}</div>
    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-nite-border-soft pt-3"><div><p className="text-type-metadata text-nite-text-muted">Alta prioridade</p><p className="mt-0.5 text-type-body-compact font-semibold text-nite-text-primary">{tasks.filter((task) => task.priority === "Alta").length}</p></div><div><p className="text-type-metadata text-nite-text-muted">Próximo prazo</p><p className="mt-0.5 text-type-body-compact font-semibold text-nite-text-primary">{nextDue ? dueLabel(nextDue) : "—"}</p></div></div>
  </aside>;
}

export function TaskTable({ tasks, onEdit, onAdd, canCreateTasks = true }: { tasks: Task[]; onEdit: (task: Task) => void; onAdd: (title: string) => void | Promise<boolean>; canCreateTasks?: boolean }) {
  const [creating, setCreating] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const inputId = useId();
  function cancel() { setCreating(false); setTitleInput(""); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!titleInput.trim()) return;
    const saved = await onAdd(titleInput.trim());
    if (saved !== false) cancel();
  }
  return <div className="overflow-x-auto border-y border-nite-border-soft"><table className="w-full min-w-[720px] border-collapse text-left">
    <thead className="text-type-metadata text-nite-text-muted"><tr>{["Tarefa", "Situação", "Prioridade", "Responsável", "Prazo", ""].map((label, index) => <th key={label || `actions-${index}`} className="whitespace-nowrap px-3 py-2 font-medium" scope="col">{label}</th>)}</tr></thead>
    <tbody>{tasks.map((task) => <tr key={task.id} className="border-t border-nite-border-soft/80 hover:bg-nite-surface-subtle/60">
      <th scope="row" className="max-w-[23rem] px-3 py-2 font-normal"><button title={task.description || task.title} onClick={() => onEdit(task)} className="block truncate text-left text-type-body-compact font-medium text-nite-text-primary hover:text-nite-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">{task.title}</button></th>
      <td className="px-3 py-2"><StatusPill status={task.status}/></td><td className="px-3 py-2"><PriorityPill priority={task.priority}/></td><td className="whitespace-nowrap px-3 py-2 text-type-metadata text-nite-text-secondary">{task.owner}</td><td className="whitespace-nowrap px-3 py-2 text-type-metadata text-nite-text-secondary">{dueLabel(task.due)}</td><td className="px-2 py-1"><button type="button" onClick={() => onEdit(task)} className={iconButton} aria-label={`Editar propriedades de ${task.title}`}><Dots/></button></td>
    </tr>)}
    {creating ? <tr><th scope="row" colSpan={6} className="border-t border-nite-border-soft px-3 py-2 font-normal">
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor={inputId}>Título da nova tarefa</label>
        <input id={inputId} autoFocus value={titleInput} onChange={(event) => setTitleInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); cancel(); } }} placeholder="Nome da tarefa" className="min-h-8 w-full bg-transparent text-type-body-compact text-nite-text-primary outline-none placeholder:text-nite-text-muted"/>
        <p className="sr-only">Pressione Enter para criar ou Esc para cancelar.</p>
      </form>
    </th></tr> : null}
    </tbody>
  </table>{creating || !canCreateTasks ? null : <button type="button" onClick={() => setCreating(true)} className="flex min-h-9 items-center gap-2 px-3 text-type-metadata text-nite-text-muted hover:text-nite-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus"><Plus/> Nova tarefa</button>}</div>;
}
const propertySelectClass = "min-h-8 w-full max-w-sm rounded-control border border-transparent bg-transparent px-2 text-type-body-compact text-nite-text-primary outline-none hover:bg-nite-surface-subtle focus:border-nite-brand-primary focus:bg-nite-surface";
const propertyDateClass = "h-10 w-full min-w-0 rounded-control border border-nite-border-soft bg-nite-background px-3 pr-10 text-type-body-compact text-nite-text-primary shadow-sm transition-colors hover:border-nite-border-strong hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-nite-focus disabled:cursor-not-allowed disabled:opacity-60 [&::-webkit-calendar-picker-indicator]:opacity-0";
const demoOwners = ["Marina Costa", "Rafael Lima", "João Alves", "Bianca Reis", "Lucas Rocha"] as const;

type PlanningDraft = Pick<Planning, "title" | "description" | "project">;
type NewTaskDraft = Omit<Task, "id">;

export function isValidPlanningTitle(value: string): boolean {
  return value.trim().length > 0;
}

export function PlanningForm({ onClose, onCreate, projectOptions: realProjectOptions, projectLabels = {} }: { onClose: () => void; onCreate: (draft: PlanningDraft) => void | Promise<void>; projectOptions?: readonly string[]; projectLabels?: Readonly<Record<string, string>> }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [project, setProject] = useState("");
  const [projectOpen, setProjectOpen] = useState(false);
  const projectPopoverId = useId();
  const projectPickerRef = useRef<HTMLDivElement>(null);
  const projectTriggerRef = useRef<HTMLButtonElement>(null);
  const projectOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const projectOptions = realProjectOptions ? [null, ...realProjectOptions] : previewProjectOptions;
  const selectedProjectIndex = projectOptions.findIndex((item) => (item ?? "") === project);
  useEffect(() => {
    if (!projectOpen) return;
    const closeWhenOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !projectPickerRef.current?.contains(event.target)) setProjectOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setProjectOpen(false);
        projectTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    projectOptionRefs.current[selectedProjectIndex]?.focus();
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [projectOpen, selectedProjectIndex]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!isValidPlanningTitle(normalizedTitle) || submitting) return;
    setSubmitting(true);
    try { await onCreate({ title: normalizedTitle, description: description.trim(), project: project || null }); }
    finally { setSubmitting(false); }
  }
  return <section className="relative mx-auto w-full max-w-[680px] pt-7 sm:pt-10">
    <h1 className="sr-only">Nova atividade</h1>
    <form onSubmit={submit} className="grid gap-0">
      <label className="block">
        <span className="sr-only">Título da atividade</span>
        <input autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Nova atividade" className="w-full border-0 bg-transparent px-0 py-1 font-display text-4xl font-semibold leading-tight tracking-tight text-nite-text-primary outline-none placeholder:text-nite-text-muted/65 focus:ring-0 sm:text-[2.5rem]"/>
      </label>
      <label className="mt-2 block max-w-3xl">
        <span className="sr-only">Descrição opcional</span>
        <textarea maxLength={10000} rows={1} value={description} onChange={(event) => setDescription(event.target.value)} onInput={(event) => { event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`; }} placeholder="Adicione uma descrição..." className="min-h-8 w-full resize-none border-0 bg-transparent px-0 py-1 text-type-body text-nite-text-primary outline-none placeholder:text-nite-text-muted focus:ring-0"/>
      </label>
      <div ref={projectPickerRef} className="relative mt-7 min-w-0 xl:absolute xl:left-full xl:top-[53px] xl:mt-0 xl:w-max">
        <button ref={projectTriggerRef} type="button" aria-label={`Projeto: ${project ? projectLabels[project] ?? project : "Independente"}`} aria-haspopup="listbox" aria-expanded={projectOpen} aria-controls={projectPopoverId} onClick={() => setProjectOpen((open) => !open)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setProjectOpen(true); } }} className="inline-flex min-h-8 items-center gap-2 rounded-control px-2 text-type-body-compact text-nite-text-secondary hover:bg-nite-surface-subtle hover:text-nite-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">
          <span>Projeto</span><span className="text-nite-text-primary">{project ? projectLabels[project] ?? project : "Independente"}</span><Chevron className={`size-3 transition-transform ${projectOpen ? "rotate-90" : ""}`} />
        </button>
        {projectOpen ? <div id={projectPopoverId} role="listbox" aria-label="Projetos disponíveis" className="absolute left-0 top-full z-30 mt-2 grid w-48 gap-0.5 rounded-panel border border-nite-border-soft bg-nite-surface p-1.5 shadow-lg">
          {projectOptions.map((item, index) => <button key={item ?? "independent"} ref={(element) => { projectOptionRefs.current[index] = element; }} type="button" role="option" aria-selected={(item ?? "") === project} onClick={() => { setProject(item ?? ""); setProjectOpen(false); }} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const direction = event.key === "ArrowDown" ? 1 : -1; const nextIndex = (index + direction + projectOptions.length) % projectOptions.length; projectOptionRefs.current[nextIndex]?.focus(); } }} className={`flex min-h-9 items-center rounded-control px-2.5 text-left text-type-body-compact focus-visible:outline-2 focus-visible:outline-nite-focus ${(item ?? "") === project ? "bg-nite-surface-subtle font-medium text-nite-text-primary" : "text-nite-text-secondary hover:bg-nite-surface-subtle"}`}>{item ? projectLabels[item] ?? item : "Independente"}</button>)}
        </div> : null}
      </div>
      <div className="mt-7 flex flex-wrap items-center gap-6 xl:mt-[clamp(18rem,42vh,28rem)]">
        <button type="button" disabled={submitting} onClick={onClose} className="min-h-9 rounded-control px-3 text-type-body-compact text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Cancelar</button>
        <PrimaryButton type="submit">{submitting ? "Criando…" : "Criar atividade"}</PrimaryButton>
      </div>
    </form>
  </section>;
}

export function ProjectFilter({ options, value, onChange, labels = {} }: { options: readonly string[]; value: string; onChange: (value: string) => void; labels?: Readonly<Record<string, string>> }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.indexOf(value);

  useEffect(() => {
    if (!open) return;
    const closeWhenOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    optionRefs.current[selectedIndex]?.focus();
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, selectedIndex]);

  function choose(option: string) {
    onChange(option);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    optionRefs.current[(index + step + options.length) % options.length]?.focus();
  }

  return <div className="relative inline-flex min-h-8 items-center gap-2 text-type-metadata text-nite-text-secondary">
    <span>Projeto</span>
    <div ref={pickerRef} className="relative">
      <button ref={triggerRef} type="button" aria-label={`Filtrar por projeto: ${labels[value] ?? value}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }} className="inline-flex min-h-8 items-center gap-2 rounded-control border border-nite-border-soft bg-nite-surface px-2.5 text-type-metadata text-nite-text-primary transition-colors hover:border-nite-border-strong hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">
        <span>{labels[value] ?? value}</span><Chevron className={`size-3 text-nite-text-muted transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open ? <div id={listId} role="listbox" aria-label="Projetos para filtrar atividades" className="absolute right-0 top-full z-30 mt-2 grid w-56 gap-0.5 rounded-panel border border-nite-border-soft bg-nite-surface p-1.5 shadow-lg">
        {options.map((option, index) => <button key={option} ref={(element) => { optionRefs.current[index] = element; }} type="button" role="option" aria-selected={option === value} onClick={() => choose(option)} onKeyDown={(event) => moveFocus(event, index)} className={`flex min-h-9 items-center justify-between rounded-control px-2.5 text-left text-type-body-compact focus-visible:outline-2 focus-visible:outline-nite-focus ${option === value ? "bg-nite-surface-subtle font-medium text-nite-text-primary" : "text-nite-text-secondary hover:bg-nite-surface-subtle"}`}>
          <span>{labels[option] ?? option}</span>{option === value ? <span aria-hidden="true" className="text-nite-brand-primary">✓</span> : null}
        </button>)}
      </div> : null}
    </div>
  </div>;
}

type TaskEditorValues = { title: string; description: string; status: Status; priority: Priority; ownerId: string; collaboratorIds: string[]; startOn: string | null; dueOn: string | null };
type TaskEditorOwner = { id: string; name: string };
export function TaskEditor({ task, onClose, onUpdate, onCreate, ownerOptions, initialOwnerId, initialOwnerName, collaboratorOptions = [], initialCollaboratorIds = [], onSave, onCreateServer, canEdit = true, canManageAssignees = true, canDelete = false, allowedStatuses, onDelete, onSearchMembers }: {
  task: Task | null; onClose: () => void; onUpdate: (taskId: TaskId, changes: Partial<Omit<Task, "id">>) => void;
  onCreate: (draft: NewTaskDraft) => void; ownerOptions?: readonly TaskEditorOwner[]; initialOwnerId?: string; initialOwnerName?: string;
  collaboratorOptions?: readonly TaskEditorOwner[]; initialCollaboratorIds?: readonly string[];
  onSave?: (values: TaskEditorValues) => Promise<string | null>; onCreateServer?: (values: TaskEditorValues) => Promise<string | null>;
  canEdit?: boolean; canManageAssignees?: boolean; canDelete?: boolean; allowedStatuses?: readonly Status[]; onDelete?: () => Promise<string | null>;
  onSearchMembers?: (query: string) => Promise<string | null>;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<Status>(task?.status ?? "Planejada");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "Média");
  const [owner, setOwner] = useState(task?.owner ?? initialOwnerName ?? "Você");
  const [ownerId, setOwnerId] = useState(task?.ownerId ?? initialOwnerId ?? "");
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>([...initialCollaboratorIds]);
  const [startDate, setStartDate] = useState(task?.start === "Sem data" ? "" : task?.start ?? "");
  const [dueDate, setDueDate] = useState(task?.due === "Sem prazo" ? "" : task?.due ?? "");
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerSearchOpen, setOwnerSearchOpen] = useState(false);
  const [memberSearching, setMemberSearching] = useState(false);
  const [memberSearchError, setMemberSearchError] = useState<string | null>(null);
  const memberSearchRequest = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const ids = useId();
  const ownerListId = ids + "-owners";
  const titleId = ids + "-title";
  const descriptionId = ids + "-description";
  const statusId = ids + "-status";
  const priorityId = ids + "-priority";
  const ownerInputId = ids + "-owner";
  const startId = ids + "-start";
  const dueId = ids + "-due";
  const headingId = ids + "-heading";
  const ownerMatches = ownerOptions
    ? ownerOptions.filter((candidate) => candidate.name.toLocaleLowerCase("pt-BR").includes(ownerSearch.trim().toLocaleLowerCase("pt-BR")))
    : demoOwners.filter((candidate) => candidate.toLocaleLowerCase("pt-BR").includes(ownerSearch.trim().toLocaleLowerCase("pt-BR")));
  function commit(changes: Partial<Omit<Task, "id">>) {
    if (task) onUpdate(task.id, changes);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    const values = { title: title.trim(), description: description.trim(), status, priority, ownerId, collaboratorIds: collaboratorIds.filter((id) => id !== ownerId), startOn: startDate || null, dueOn: dueDate || null };
    if (task && onSave) {
      setSaving(true);
      try {
        const issue = await onSave(values);
        if (issue) { setError(issue); return; }
        onClose();
      } finally { setSaving(false); }
      return;
    }
    if (task) { onClose(); return; }
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return;
    if (onCreateServer) {
      setSaving(true);
      try {
        const issue = await onCreateServer(values);
        if (issue) { setError(issue); return; }
        onClose();
      } finally { setSaving(false); }
      return;
    }
    onCreate({ title: normalizedTitle, description: description.trim(), status, priority, owner, start: startDate || "Sem data", due: dueDate || "Sem prazo" });
    onClose();
  }
  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <><div role="presentation" className="fixed inset-0 z-50 bg-black/25" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby={headingId} onKeyDown={handleDialogKeyDown} className="ml-auto flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-nite-border-soft bg-nite-surface p-5 shadow-nite-modal sm:p-7">
      <header className="flex items-center justify-between gap-4">
        <div><p className="text-type-metadata text-nite-text-muted">Tasks</p><h2 id={headingId} className="sr-only">{task ? "Editar tarefa" : "Criar tarefa"}</h2></div>
        <button type="button" onClick={onClose} className={iconButton} aria-label="Fechar detalhes da tarefa">×</button>
      </header>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <label htmlFor={titleId} className="mt-7 block">
          <span className="sr-only">Título da tarefa</span>
          <input id={titleId} autoFocus required maxLength={200} disabled={Boolean(task) && !canEdit} value={title} onChange={(event) => { const value = event.target.value; setTitle(value); if (!onSave) commit({ title: value }); }} placeholder="Título da tarefa" className="w-full border-0 border-b border-transparent bg-transparent px-0 py-2 font-display text-type-page-title font-semibold text-nite-text-primary outline-none placeholder:text-nite-text-muted/70 focus:border-nite-brand-primary disabled:opacity-70"/>
        </label>
        <div className="mt-6 divide-y divide-nite-border-soft border-y border-nite-border-soft">
          <label htmlFor={statusId} className="grid min-h-11 grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 text-type-body-compact"><span className="text-nite-text-muted">Situação</span><select id={statusId} value={status} onChange={(event) => { const next = statusOrder.find((item) => item === event.target.value); if (next) { setStatus(next); if (!onSave) commit({ status: next }); } }} className={propertySelectClass}>{(task && allowedStatuses ? Array.from(new Set([status, ...allowedStatuses])) : statusOrder).map((item) => <option key={item}>{item}</option>)}</select></label>
          <label htmlFor={priorityId} className="grid min-h-11 grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 text-type-body-compact"><span className="text-nite-text-muted">Prioridade</span><select id={priorityId} disabled={Boolean(task) && !canEdit} value={priority} onChange={(event) => { const next = priorityOrder.find((item) => item === event.target.value); if (next) { setPriority(next); if (!onSave) commit({ priority: next }); } }} className={propertySelectClass}>{priorityOrder.map((item) => <option key={item}>{item}</option>)}</select></label>
          <div className="relative grid min-h-11 grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 text-type-body-compact">
            <label htmlFor={ownerInputId} className="text-nite-text-muted">Responsável</label>
            <input id={ownerInputId} disabled={Boolean(task) && !canManageAssignees} role="combobox" aria-autocomplete="list" aria-expanded={ownerSearchOpen} aria-controls={ownerListId} value={ownerSearchOpen ? ownerSearch : owner} onFocus={() => { setOwnerSearch(""); setOwnerSearchOpen(true); }} onChange={(event) => {
              const query = event.target.value;
              setOwnerSearch(query);
              setMemberSearchError(null);
              const request = ++memberSearchRequest.current;
              setMemberSearching(Boolean(onSearchMembers && query.trim().length >= 2));
              if (onSearchMembers && query.trim().length >= 2) void onSearchMembers(query.trim()).then((issue) => {
                if (request === memberSearchRequest.current) { setMemberSearchError(issue); setMemberSearching(false); }
              }).catch(() => {
                if (request === memberSearchRequest.current) { setMemberSearchError("Não foi possível buscar integrantes. Tente novamente."); setMemberSearching(false); }
              });
            }} onBlur={(event) => { if (!(event.relatedTarget instanceof HTMLElement) || !event.currentTarget.parentElement?.contains(event.relatedTarget)) setOwnerSearchOpen(false); }} className={propertySelectClass} autoComplete="off"/>
            {ownerSearchOpen ? <div id={ownerListId} role="listbox" aria-label={ownerOptions ? "Integrantes autorizados" : "Integrantes fictícios"} className="absolute left-[7.75rem] right-0 top-full z-20 mt-1 grid max-h-52 overflow-y-auto rounded-panel border border-nite-border-soft bg-nite-surface p-1 shadow-nite-floating">
              {memberSearching ? <p role="status" className="px-2 py-2 text-type-metadata text-nite-text-muted">Buscando integrantes…</p> : null}
              {ownerMatches.length ? ownerMatches.map((candidate) => {
                const candidateName = typeof candidate === "string" ? candidate : candidate.name;
                const candidateId = typeof candidate === "string" ? "" : candidate.id;
                return <button key={candidateId || candidateName} type="button" role="option" aria-selected={owner === candidateName} onMouseDown={(event) => event.preventDefault()} onClick={() => { setOwner(candidateName); setOwnerId(candidateId); setOwnerSearch(""); setOwnerSearchOpen(false); ++memberSearchRequest.current; setMemberSearching(false); if (!onSave) commit({ owner: candidateName, ownerId: candidateId }); }} className="flex min-h-9 items-center justify-between gap-3 rounded-control px-2 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus"><span>{candidateName}</span>{ownerOptions ? null : <span className="text-type-metadata text-nite-text-muted">Fictício</span>}</button>;
              }) : <p className="px-2 py-2 text-type-metadata text-nite-text-muted">{ownerOptions ? "Nenhum integrante autorizado disponível." : "Nenhum resultado local."}</p>}
            </div> : null}
          </div>
          <label htmlFor={startId} className="grid min-h-14 grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 text-type-body-compact"><span className="text-nite-text-muted">Início</span><span className="relative block min-w-0"><input id={startId} disabled={Boolean(task) && !canEdit} type="date" value={startDate} onChange={(event) => { const value = event.target.value; setStartDate(value); if (!onSave) commit({ start: value || "Sem data" }); }} className={propertyDateClass}/><CalendarIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-nite-brand-primary"/></span></label>
          <label htmlFor={dueId} className="grid min-h-14 grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 text-type-body-compact"><span className="text-nite-text-muted">Prazo</span><span className="relative block min-w-0"><input id={dueId} disabled={Boolean(task) && !canEdit} type="date" value={dueDate} onChange={(event) => { const value = event.target.value; setDueDate(value); if (!onSave) commit({ due: value || "Sem prazo" }); }} className={propertyDateClass}/><CalendarIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-nite-brand-primary"/></span></label>
        </div>
        {canManageAssignees && (task || onCreateServer) ? <fieldset className="mt-4 grid gap-2">
          <legend className="text-type-metadata font-medium text-nite-text-secondary">Colaboradores</legend>
          {onSearchMembers ? <p className="text-type-metadata text-nite-text-muted">Pesquise pelo responsável para localizar integrantes.</p> : null}
          {collaboratorOptions.length ? collaboratorOptions.filter((person) => person.id !== ownerId).map((person) => <label key={person.id} className="flex min-h-8 items-center gap-2 text-type-body-compact text-nite-text-primary">
            <input type="checkbox" checked={collaboratorIds.includes(person.id)} onChange={(event) => setCollaboratorIds((current) => event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id))} className="size-4 accent-nite-brand-primary"/>{person.name}
          </label>) : <p className="text-type-metadata text-nite-text-muted">Nenhum integrante elegível foi retornado.</p>}
        </fieldset> : null}
        <label htmlFor={descriptionId} className="mt-6 grid gap-2 text-type-body-compact text-nite-text-muted"><span>Descrição</span><textarea id={descriptionId} disabled={Boolean(task) && !canEdit} rows={5} maxLength={10000} value={description} onChange={(event) => { const value = event.target.value; setDescription(value); if (!onSave) commit({ description: value }); }} placeholder="Adicionar descrição" className="w-full resize-y border-0 bg-transparent px-0 py-1 text-type-body text-nite-text-primary outline-none placeholder:text-nite-text-muted focus:ring-0"/></label>
        {memberSearchError ? <p role="alert" className="mt-4 text-type-body-compact text-status-error">{memberSearchError}</p> : null}
        {error && !deleteOpen ? <TransientFeedback messageKey={error} onDismiss={() => setError(null)}><p role="alert" className="mt-4 text-type-body-compact text-status-error">{error}</p></TransientFeedback> : null}
        <div className="mt-auto flex justify-end border-t border-nite-border-soft pt-5">
          {canDelete && onDelete ? <button type="button" disabled={deleting || saving} aria-haspopup="dialog" onClick={() => { setError(null); setDeleteOpen(true); }} className="mr-auto min-h-9 rounded-control px-3 text-type-body-compact font-medium text-status-error">{deleting ? "Excluindo…" : "Excluir tarefa"}</button> : null}
          {task ? <button type="submit" disabled={saving || deleting} className="min-h-9 rounded-control bg-nite-brand-primary px-3 text-type-body-compact font-medium text-nite-action-text">{saving ? "Salvando…" : onSave ? "Salvar alterações" : "Fechar"}</button> : <PrimaryButton type="submit">{saving ? "Criando…" : "Criar tarefa"}</PrimaryButton>}
        </div>
      </form>
    </section>
  </div>
    {canDelete && onDelete ? <AlertDialog open={deleteOpen} onOpenChange={(next) => { if (!deleting) setDeleteOpen(next); }}
      title="Excluir esta tarefa?" description="A tarefa será excluída permanentemente. Esta ação não pode ser desfeita."
      confirmLabel="Excluir tarefa" pending={deleting} className="max-w-md" onConfirm={async () => {
        if (deleting) return;
        setDeleting(true);
        setError(null);
        try {
          const issue = await onDelete();
          if (issue) { setError(issue); return; }
          setDeleteOpen(false);
          onClose();
        } catch { setError("Não foi possível excluir a tarefa. Tente novamente."); }
        finally { setDeleting(false); }
      }}>
      <p className="break-words font-medium text-nite-text-primary">{task?.title}</p>
      <p className="mt-3 text-type-body-compact text-nite-text-secondary">O planejamento será mantido. Esta tarefa e seus dados vinculados não poderão ser recuperados pela Lixeira.</p>
      {error && deleteOpen ? <TransientFeedback messageKey={error} onDismiss={() => setError(null)}><p role="alert" className="mt-4 text-type-body-compact text-status-error">{error}</p></TransientFeedback> : null}
    </AlertDialog> : null}
  </>;

}
export function ActivityPlanningPreview({ screen, planningId }: { screen: Screen; planningId: number }) {
  const router = useRouter();
  const [plannings, setPlannings] = useState(initialPlannings);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todas");
  const [sort, setSort] = useState("Atualizado recentemente");
  const [planningQuery, setPlanningQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("Todos os projetos");
  const [editorTask, setEditorTask] = useState<Task | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const nextTaskId = useRef(Math.max(...initialPlannings.flatMap((planning) => planning.tasks.map((task) => task.id).filter((id): id is number => typeof id === "number"))) + 1);
  const nextPlanningId = useRef(Math.max(...initialPlannings.map((planning) => planning.id).filter((id): id is number => typeof id === "number")) + 1);

  const active = plannings.find((planning) => planning.id === planningId) ?? plannings[0];
  const tasks = useMemo(() => active.tasks.filter((task) => task.title.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")) && (statusFilter === "Todas" || task.status === statusFilter)).sort((left, right) => {
    if (sort === "Título") return left.title.localeCompare(right.title, "pt-BR");
    if (sort === "Prioridade") return priorityOrder.indexOf(left.priority) - priorityOrder.indexOf(right.priority);
    if (sort === "Prazo") return left.due.localeCompare(right.due);
    return Number(right.id) - Number(left.id);
  }), [active.tasks, query, sort, statusFilter]);
  const visiblePlannings = plannings.filter((planning) => {
    const normalizedQuery = planningQuery.trim().toLocaleLowerCase("pt-BR");
    const matchesText = !normalizedQuery || `${planning.title} ${planning.description}`.toLocaleLowerCase("pt-BR").includes(normalizedQuery);
    const project = planning.project ?? "Independente";
    return matchesText && (projectFilter === "Todos os projetos" || projectFilter === project);
  });
  const projectFilterOptions = ["Todos os projetos", "Independente", ...new Set(plannings.flatMap((planning) => planning.project ? [planning.project] : []))];

  function openTaskEditor(task?: Task) {
    setEditorTask(task ?? null);
    setEditorOpen(true);
  }
  function updateTask(taskId: TaskId, changes: Partial<Omit<Task, "id">>) {
    setPlannings((current) => current.map((planning) => planning.id === planningId
      ? { ...planning, tasks: planning.tasks.map((task) => task.id === taskId ? { ...task, ...changes } : task) }
      : planning));
  }
  function addTask(draft: NewTaskDraft) {
    const task = { id: nextTaskId.current++, ...draft };
    setPlannings((current) => current.map((planning) => planning.id === planningId ? { ...planning, tasks: [...planning.tasks, task] } : planning));
  }
  function quickCreate(title: string, grouping?: BoardGrouping, group?: BoardGroup) {
    const status = grouping === "status" ? statusOrder.find((item) => item === group) ?? "Planejada" : "Planejada";
    const priority = grouping === "priority" ? priorityOrder.find((item) => item === group) ?? "Média" : "Média";
    addTask({ title, description: "", status, priority, owner: "Você", start: "Sem data", due: "Sem prazo" });
  }
  function moveTask(rawTaskId: TaskId, grouping: BoardGrouping, group: BoardGroup) {
    const taskId = typeof rawTaskId === "number" ? rawTaskId : Number(rawTaskId);
    if (!Number.isSafeInteger(taskId)) return;
    setPlannings((current) => current.map((planning) => planning.id === planningId
      ? { ...planning, tasks: movePreviewTask(planning.tasks, taskId, grouping, group) }
      : planning));
  }
  function createPlanning(draft: PlanningDraft) {
    const id = nextPlanningId.current++;
    const planning: Planning = { ...draft, id, tasks: [], updated: "Atualizado agora" };
    setPlannings((current) => [...current, planning]);
    router.push(screenHref("workspace", id));
  }
  function closeTaskEditor() {
    setEditorOpen(false);
    if (screen === "task-form") router.push(screenHref("workspace", planningId));
  }

  const workspaceView = screen === "task-form" || screen === "empty" ? "status" : screen;
  const showWorkspace = screen === "workspace" || screen === "priority" || screen === "status" || screen === "table" || screen === "task-form" || screen === "empty";

  return <>
    <DemoNotice/><ScreenPicker active={screen} planningId={planningId}/>
    <main className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 px-4 py-5 sm:px-7 sm:py-7 lg:px-9">
      {screen === "plannings" ? <>
        <PageHeading title="Minhas atividades" action={<Link href={screenHref("create-planning")} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-control bg-nite-brand-primary px-3.5 text-type-body-compact font-medium text-nite-action-text hover:bg-nite-brand-primary/90"><Plus/> Nova atividade</Link>}/>
        <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex min-h-9 w-full max-w-sm items-center gap-2 rounded-control border border-nite-border-soft bg-nite-surface px-3 text-type-body-compact text-nite-text-muted"><span aria-hidden="true">⌕</span><span className="sr-only">Buscar atividades</span><input value={planningQuery} onChange={(event) => setPlanningQuery(event.target.value)} placeholder="Buscar atividades" className="min-w-0 flex-1 bg-transparent text-type-body-compact text-nite-text-primary outline-none placeholder:text-nite-text-muted"/></label><ProjectFilter options={projectFilterOptions} value={projectFilter} onChange={setProjectFilter}/></div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{visiblePlannings.map((planning) => <PlanningCard key={planning.id} planning={planning} href={screenHref("workspace", planning.id)}/>)}</div>
        {visiblePlannings.length ? null : <p className="border-y border-nite-border-soft py-10 text-center text-type-body-compact text-nite-text-secondary">Nenhuma atividade corresponde à busca.</p>}
        <div className="border-t border-nite-border-soft pt-4"><Link href={screenHref("legacy-tasks", planningId)} className="text-type-metadata text-nite-text-muted underline underline-offset-4">Tarefas sem atividade</Link></div>
      </> : null}

      {screen === "create-planning" ? <>
        <PlanningForm onClose={() => router.push(screenHref("plannings"))} onCreate={createPlanning}/>
      </> : null}

      {showWorkspace ? <>
        {screen === "empty" ? null : <div className="flex items-center gap-1 text-type-metadata text-nite-text-muted"><Link href={screenHref("plannings", planningId)} className="hover:text-nite-brand-primary">Minhas atividades</Link><Chevron className="size-3"/><span>{active.title}</span></div>}
        <PageHeading eyebrow={active.project ?? "Independente"} title={active.title} description={active.description || undefined} action={<button type="button" onClick={() => openTaskEditor()} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-control border border-nite-border-soft bg-nite-surface px-3 text-type-body-compact font-medium text-nite-text-primary hover:bg-nite-surface-subtle"><Plus/> Nova tarefa</button>}/>
        <Toolbar view={workspaceView} planningId={planningId} query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} sort={sort} setSort={setSort}/>
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_225px]">
          <div className="min-w-0">
            {workspaceView === "table" ? <TaskTable tasks={tasks} onEdit={(task) => openTaskEditor(task)} onAdd={(title) => quickCreate(title)}/> : <><p className="sr-only">Para alterar situação ou prioridade sem arrastar, abra a tarefa e escolha a propriedade.</p><TaskBoard tasks={tasks} grouping={workspaceView === "priority" ? "priority" : "status"} onEdit={(task) => openTaskEditor(task)} onAdd={quickCreate} onMove={moveTask}/></>}
          </div>
          <StatsPanel tasks={active.tasks}/>
        </div>
      </> : null}

      {screen === "legacy-tasks" ? <>
        <PageHeading title="Tarefas sem atividade"/>
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-nite-border-soft px-2"><span className="text-type-body-compact font-medium text-nite-text-primary">Revisar atas do último encontro</span><span className="text-type-metadata text-nite-text-secondary">Em andamento</span></div>
        <Link href={screenHref("plannings")} className="text-type-metadata text-nite-text-muted underline underline-offset-4">Minhas atividades</Link>
      </> : null}
    </main>
    {screen === "task-form" || editorOpen ? <TaskEditor key={editorTask?.id ?? "new"} task={editorTask} onClose={closeTaskEditor} onUpdate={updateTask} onCreate={addTask}/> : null}
  </>;
}
