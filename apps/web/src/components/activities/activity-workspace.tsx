"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type DragEvent } from "react";
import { moveActivityAction } from "../../lib/activities/actions";
import { activityPriorities, activityStatuses, type Activity, type ActivityCapabilities, type ActivityPriority, type ActivityStatus } from "../../lib/activities/contracts";
import { formatActivityDate } from "./activity-list";

type View = "status" | "priority" | "list";
type Props = {
  activities: readonly Activity[];
  projectTitles: Readonly<Record<string, string>>;
  capabilities: Readonly<Record<string, ActivityCapabilities | null>>;
  returnTo: string;
  view: View;
};
type MoveField = "status" | "priority";

const statusLabels: Record<ActivityStatus, string> = {
  PLANEJADA: "Planejada",
  EM_EXECUCAO: "Em execução",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};
const priorityLabels: Record<ActivityPriority, string> = { ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };
const statusGroups: readonly { id: ActivityStatus; label: string; tone: string }[] = [
  { id: "PLANEJADA", label: "Planejadas", tone: "border-status-draft-border bg-status-draft-soft" },
  { id: "EM_EXECUCAO", label: "Em execução", tone: "border-status-progress-border bg-status-progress-soft" },
  { id: "CONCLUIDA", label: "Concluídas", tone: "border-status-done-border bg-status-done-soft" },
  { id: "CANCELADA", label: "Canceladas", tone: "border-status-cancelled-border bg-status-cancelled-soft" },
];
const priorityGroups: readonly { id: ActivityPriority | null; label: string; tone: string }[] = [
  { id: "ALTA", label: "Alta", tone: "border-status-error-border bg-status-error-soft" },
  { id: "MEDIA", label: "Média", tone: "border-status-warning-border bg-status-warning-soft" },
  { id: "BAIXA", label: "Baixa", tone: "border-status-done-border bg-status-done-soft" },
  { id: null, label: "Sem prioridade", tone: "border-nite-border-soft bg-nite-surface-subtle" },
];

function priorityLabel(priority: ActivityPriority | null): string {
  return priority ? priorityLabels[priority] : "Sem prioridade";
}

function dateMeta(activity: Activity): string {
  if (activity.dueOn) return `Prazo ${formatActivityDate(activity.dueOn)}`;
  if (activity.startOn) return `Início ${formatActivityDate(activity.startOn)}`;
  return "Sem datas definidas";
}

function messageForIssue(issue: string): string {
  if (issue === "conflict") return "A atividade mudou em outra sessão. A lista foi atualizada.";
  if (issue === "forbidden" || issue === "access") return "Você não tem permissão para alterar esta propriedade.";
  if (issue === "not-found") return "A atividade não está mais disponível.";
  return "Não foi possível salvar a alteração. A lista foi atualizada.";
}

export function ActivityWorkspace({ activities: initialActivities, projectTitles, capabilities, returnTo, view }: Props) {
  const router = useRouter();
  const [activities, setActivities] = useState([...initialActivities]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  async function move(id: string, field: MoveField, value: ActivityStatus | ActivityPriority | null) {
    if (pendingId) return;
    const activity = activities.find((item) => item.id === id);
    if (!activity) return;
    const permission = capabilities[id];
    let nextStatus: ActivityStatus = activity.status;
    let nextPriority: ActivityPriority | null = activity.priority;
    if (field === "status") {
      const status = activityStatuses.find((candidate) => candidate === value);
      if (!status) return;
      nextStatus = status;
    } else {
      const priority = value === null ? null : activityPriorities.find((candidate) => candidate === value);
      if (value !== null && !priority) return;
      nextPriority = priority ?? null;
    }
    if (field === "status" && (!permission?.transitions.includes(nextStatus) || nextStatus === "CANCELADA" || activity.status === "CANCELADA" || activity.status === "CONCLUIDA")) return;
    if (field === "priority" && (!permission?.changePriority || activity.status === "CANCELADA" || activity.status === "CONCLUIDA")) return;
    if (field === "status" && activity.status === nextStatus || field === "priority" && activity.priority === nextPriority) return;

    const previous = activities;
    setNotice("");
    setPendingId(id);
    setActivities((current) => current.map((item) => item.id === id ? { ...item, status: nextStatus, priority: nextPriority } : item));
    let result: Awaited<ReturnType<typeof moveActivityAction>>;
    try {
      result = await moveActivityAction(id, activity.version, field, value);
    } catch {
      result = { issue: "unavailable" };
    }
    setPendingId(null);
    if (result.issue) {
      setActivities(previous);
      setNotice(messageForIssue(result.issue));
      router.refresh();
      return;
    }
    setNotice("Alteração salva.");
    router.refresh();
  }

  function onDrop(event: DragEvent<HTMLElement>, field: MoveField, value: ActivityStatus | ActivityPriority | null) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || draggedId;
    setDraggedId(null);
    if (id) void move(id, field, value);
  }

  const activityLink = (activity: Activity) => {
    const target = new URL(`/atividades/${encodeURIComponent(activity.id)}`, "https://nite-connect.invalid");
    target.searchParams.set("from", returnTo);
    return `${target.pathname}${target.search}`;
  };

  function propertySelect(activity: Activity, field: MoveField) {
    const permission = capabilities[activity.id];
    const enabled = field === "status"
      ? Boolean(permission?.transitions.some((status) => status !== "CANCELADA") && activity.status !== "CANCELADA" && activity.status !== "CONCLUIDA")
      : Boolean(permission?.changePriority && activity.status !== "CANCELADA" && activity.status !== "CONCLUIDA");
    if (!enabled) return field === "status" ? statusLabels[activity.status] : priorityLabel(activity.priority);
    return <select
      aria-label={`${field === "status" ? "Alterar situação" : "Alterar prioridade"} de ${activity.title}`}
      className="min-h-8 max-w-40 rounded-control border border-nite-border-soft bg-nite-surface px-2 text-type-metadata text-nite-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nite-focus disabled:opacity-60"
      disabled={pendingId === activity.id}
      value={field === "status" ? activity.status : activity.priority ?? ""}
      onChange={(event) => {
        const value = event.target.value;
        if (field === "status") {
          const status = activityStatuses.find((candidate) => candidate === value);
          if (status) void move(activity.id, field, status);
        } else {
          const priority = value === "" ? null : activityPriorities.find((candidate) => candidate === value);
          if (priority !== undefined) void move(activity.id, field, priority);
        }
      }}
    >
      {field === "status" ? <>
        <option value={activity.status}>{statusLabels[activity.status]}</option>
        {permission?.transitions.filter((status) => status !== "CANCELADA").map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
      </> : <>
        <option value="">Sem prioridade</option>
        {activityPriorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
      </>}
    </select>;
  }

  function card(activity: Activity) {
    const permission = capabilities[activity.id];
    const canDrag = view === "status"
      ? Boolean(permission?.transitions.some((status) => status !== "CANCELADA") && activity.status !== "CONCLUIDA" && activity.status !== "CANCELADA")
      : Boolean(permission?.changePriority && activity.status !== "CONCLUIDA" && activity.status !== "CANCELADA");
    const project = activity.projectId ? projectTitles[activity.projectId] ?? "Projeto associado" : "Atividade independente";
    return <article
      key={activity.id}
      draggable={canDrag && !pendingId}
      onDragStart={(event) => { setDraggedId(activity.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", activity.id); }}
      onDragEnd={() => setDraggedId(null)}
      className={`min-w-0 rounded-panel border border-nite-border-soft bg-nite-surface p-3.5 transition-colors hover:border-nite-border-strong ${draggedId === activity.id ? "opacity-45" : ""}`}
    >
      <Link href={activityLink(activity)} className="block break-words font-medium leading-snug text-nite-text-primary underline decoration-transparent underline-offset-4 hover:text-nite-brand-primary hover:decoration-current focus-visible:rounded-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">{activity.title}</Link>
      <p className="mt-2 truncate text-type-metadata text-nite-text-secondary" title={project}>{project}</p>
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
        <span className="rounded-pill border border-nite-border-soft px-2 py-0.5 text-type-metadata text-nite-text-secondary">{statusLabels[activity.status]}</span>
        {view === "status" ? <span className="rounded-pill border border-nite-border-soft px-2 py-0.5 text-type-metadata text-nite-text-secondary">{priorityLabel(activity.priority)}</span> : null}
        {activity.overdue ? <span className="rounded-pill border border-status-warning-border bg-status-warning-soft px-2 py-0.5 text-type-metadata font-medium text-status-warning">Em atraso</span> : null}
      </div>
      <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-nite-border-soft pt-2.5">
        <time className="text-type-metadata text-nite-text-muted" dateTime={activity.dueOn ?? activity.startOn ?? undefined}>{dateMeta(activity)}</time>
        {pendingId === activity.id ? <span role="status" className="text-type-metadata text-nite-brand-primary">Salvando…</span> : null}
        {canDrag ? <span aria-hidden="true" className="text-type-metadata text-nite-text-muted">Arraste para mover</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {propertySelect(activity, "status")}
        {propertySelect(activity, "priority")}
      </div>
    </article>;
  }

  if (view === "list") return <section className="min-w-0" aria-label="Lista de atividades">
    {notice ? <p role="status" aria-live="polite" className="mb-3 rounded-control border border-nite-border-soft bg-nite-surface-subtle px-3 py-2 text-type-body-compact text-nite-text-secondary">{notice}</p> : null}
    <div className="overflow-x-auto rounded-panel border border-nite-border-soft">
      <table className="w-full min-w-[820px] border-collapse text-left">
        <thead className="bg-nite-surface-subtle text-type-metadata text-nite-text-secondary">
          <tr>{["Atividade", "Situação", "Prioridade", "Projeto", "Início", "Prazo"].map((label) => <th key={label} scope="col" className="border-b border-nite-border-soft px-3 py-2.5 font-medium">{label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-nite-border-soft">
          {activities.map((activity) => <tr key={activity.id} className="align-middle hover:bg-nite-surface-subtle/60">
            <th scope="row" className="max-w-[22rem] px-3 py-3 font-medium"><Link href={activityLink(activity)} className="block break-words text-type-body-compact text-nite-text-primary underline decoration-transparent underline-offset-4 hover:text-nite-brand-primary hover:decoration-current focus-visible:rounded-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">{activity.title}</Link>{activity.overdue ? <span className="mt-1 inline-block text-type-metadata text-status-warning">Em atraso</span> : null}</th>
            <td className="px-3 py-3 text-type-body-compact text-nite-text-primary">{propertySelect(activity, "status")}</td>
            <td className="px-3 py-3 text-type-body-compact text-nite-text-primary">{propertySelect(activity, "priority")}</td>
            <td className="max-w-48 truncate px-3 py-3 text-type-metadata text-nite-text-secondary" title={activity.projectId ? projectTitles[activity.projectId] ?? "Projeto associado" : "Atividade independente"}>{activity.projectId ? projectTitles[activity.projectId] ?? "Projeto associado" : "Atividade independente"}</td>
            <td className="whitespace-nowrap px-3 py-3 text-type-metadata text-nite-text-secondary">{activity.startOn ? formatActivityDate(activity.startOn) : "—"}</td>
            <td className="whitespace-nowrap px-3 py-3 text-type-metadata text-nite-text-secondary">{activity.dueOn ? formatActivityDate(activity.dueOn) : "—"}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {notice ? <span className="sr-only" role="status">{pendingId ? "Salvando alteração." : notice}</span> : null}
  </section>;

  if (view === "status") return <section aria-label="Quadro por situação" className="min-w-0">
    {notice ? <p role="status" aria-live="polite" className="mb-3 rounded-control border border-nite-border-soft bg-nite-surface-subtle px-3 py-2 text-type-body-compact text-nite-text-secondary">{notice}</p> : null}
    <div className="flex min-w-0 snap-x gap-3 overflow-x-auto pb-3 [scrollbar-width:thin]" onDragOver={(event) => event.preventDefault()}>
      {statusGroups.map((group) => {
        const grouped = activities.filter((activity) => activity.status === group.id);
        return <section key={group.id} aria-labelledby={`activity-column-${group.id}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, "status", group.id)} className="w-[min(84vw,18rem)] shrink-0 snap-start rounded-panel border border-nite-border-soft bg-nite-surface-subtle/40 p-2.5 sm:w-[19rem]">
          <header className="mb-2 flex items-center justify-between gap-2 px-1 py-1">
            <h2 id={`activity-column-${group.id}`} className="font-display text-type-body-compact font-semibold text-nite-text-primary">{group.label}</h2>
            <span className={`inline-flex min-w-7 items-center justify-center rounded-pill border px-2 py-0.5 text-type-metadata font-medium text-nite-text-secondary ${group.tone}`}>{grouped.length}</span>
          </header>
          <div className="grid min-h-24 content-start gap-2.5 rounded-control p-1" aria-label={`${group.label}: ${grouped.length} atividades`}>
            {grouped.map(card)}
            {grouped.length === 0 ? <p className="px-2 py-4 text-type-metadata text-nite-text-muted">Nenhuma atividade</p> : null}
          </div>
        </section>;
      })}
    </div>
  </section>;

  return <section aria-label="Quadro por prioridade" className="min-w-0">
    {notice ? <p role="status" aria-live="polite" className="mb-3 rounded-control border border-nite-border-soft bg-nite-surface-subtle px-3 py-2 text-type-body-compact text-nite-text-secondary">{notice}</p> : null}
    <div className="flex min-w-0 snap-x gap-3 overflow-x-auto pb-3 [scrollbar-width:thin]">
      {priorityGroups.map((group) => {
        const grouped = activities.filter((activity) => activity.priority === group.id);
        return <section key={group.label} aria-labelledby={`activity-priority-${group.id ?? "none"}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, "priority", group.id)} className="w-[min(84vw,18rem)] shrink-0 snap-start rounded-panel border border-nite-border-soft bg-nite-surface-subtle/40 p-2.5 sm:w-[19rem]">
          <header className="mb-2 flex items-center justify-between gap-2 px-1 py-1">
            <h2 id={`activity-priority-${group.id ?? "none"}`} className="font-display text-type-body-compact font-semibold text-nite-text-primary">{group.label}</h2>
            <span className={`inline-flex min-w-7 items-center justify-center rounded-pill border px-2 py-0.5 text-type-metadata font-medium text-nite-text-secondary ${group.tone}`}>{grouped.length}</span>
          </header>
          <div className="grid min-h-24 content-start gap-2.5 rounded-control p-1" aria-label={`${group.label}: ${grouped.length} atividades`}>
            {grouped.map(card)}
            {grouped.length === 0 ? <p className="px-2 py-4 text-type-metadata text-nite-text-muted">Nenhuma atividade</p> : null}
          </div>
        </section>;
      })}
    </div>
  </section>;
}
