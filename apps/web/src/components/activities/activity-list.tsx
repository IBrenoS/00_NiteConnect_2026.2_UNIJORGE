import Link from "next/link";
import type { Activity, ActivityStatus } from "../../lib/activities/contracts";

export const activityStatusLabel: Record<ActivityStatus, string> = {
  PLANEJADA: "Planejada",
  EM_EXECUCAO: "Em execução",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

const statusStyles: Record<ActivityStatus, string> = {
  PLANEJADA: "border-status-draft-border bg-status-draft-soft text-status-draft",
  EM_EXECUCAO: "border-status-progress-border bg-status-progress-soft text-status-progress",
  CONCLUIDA: "border-status-done-border bg-status-done-soft text-status-done",
  CANCELADA: "border-status-cancelled-border bg-status-cancelled-soft text-status-cancelled",
};

const statusTextStyles: Record<ActivityStatus, string> = {
  PLANEJADA: "text-status-draft",
  EM_EXECUCAO: "text-status-progress",
  CONCLUIDA: "text-status-done",
  CANCELADA: "text-status-cancelled",
};

export function ActivityStatusBadge({ status }: { status: ActivityStatus }) {
  return <span className={`inline-flex min-h-6 shrink-0 items-center whitespace-nowrap rounded-pill border px-2.5 py-1 text-type-metadata font-medium ${statusStyles[status]}`}>{activityStatusLabel[status]}</span>;
}

function ActivityStatusText({ status }: { status: ActivityStatus }) {
  return <span className={`shrink-0 whitespace-nowrap text-type-body-compact font-medium ${statusTextStyles[status]}`}>{activityStatusLabel[status]}</span>;
}

export function formatActivityDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function formatActivityInstant(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Data indisponível" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bahia" }).format(date);
}

export function ActivityRows({
  activities,
  projectTitles = {},
  returnTo = "/atividades",
  detailBase = "/atividades",
  detailHrefTemplate,
}: {
  activities: readonly Activity[];
  projectTitles?: Readonly<Record<string, string>>;
  returnTo?: string;
  detailBase?: string;
  detailHrefTemplate?: string;
}) {
  return <ul className="divide-y divide-nite-border-soft border-y border-nite-border-soft" aria-label="Lista de atividades">
    {activities.map((activity) => {
      const template = detailHrefTemplate ?? `${detailBase}/{id}`;
      const target = new URL(template.replace("{id}", encodeURIComponent(activity.id)), "https://nite-connect.invalid");
      target.searchParams.set("from", returnTo);
      const detailHref = `${target.pathname}${target.search}`;
      const projectTitle = activity.projectId ? projectTitles[activity.projectId] : null;
      return <li key={activity.id} className="flex min-w-0 flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:py-[1.125rem]">
        <div className="min-w-0 flex-1">
          <Link href={detailHref} aria-label={`Ver detalhes de ${activity.title}`} className="block w-fit max-w-full rounded-subtle font-sans text-type-body font-medium leading-snug text-nite-text-primary underline decoration-transparent underline-offset-4 transition-colors hover:text-nite-brand-primary hover:decoration-current focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus motion-reduce:transition-none">
            <span className="break-words">{activity.title}</span>
          </Link>
          <p className="mt-1 break-words text-type-metadata text-nite-text-secondary">{projectTitle ?? (activity.projectId ? "Projeto associado" : "Atividade independente")}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 lg:max-w-[min(42%,28rem)] lg:justify-end lg:gap-x-[35px]">
          <ActivityStatusText status={activity.status} />
          {activity.dueOn ? <time className="whitespace-nowrap text-type-metadata text-nite-text-secondary" dateTime={activity.dueOn}>Prazo {formatActivityDate(activity.dueOn)}</time> : <span className="whitespace-nowrap text-type-metadata text-nite-text-secondary">Sem prazo definido</span>}
          {activity.overdue ? <span className="whitespace-nowrap rounded-pill border border-status-warning-border bg-status-warning-soft px-2.5 py-1 text-type-metadata font-medium text-status-warning">Em atraso</span> : null}
        </div>
      </li>;
    })}
  </ul>;
}

export function ActivityEmptyState({
  filtered,
  canCreate = false,
  clearHref = "/atividades",
  actionHref = "/atividades/nova",
  actionLabel = "Criar atividade",
}: {
  filtered: boolean;
  canCreate?: boolean;
  clearHref?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return <section className="flex min-h-64 flex-col items-center justify-center px-4 py-12 text-center" aria-labelledby="activity-empty-title">
    <svg aria-hidden="true" viewBox="0 0 56 56" fill="none" className="mb-5 size-12 text-nite-brand-primary">
      <rect x="9" y="8" width="38" height="40" rx="5" className="fill-nite-brand-soft" />
      <path d="M19 21h18M19 29h18M19 37h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="42" cy="42" r="7" className="fill-nite-background" stroke="currentColor" strokeWidth="2" />
      <path d="m39.5 42 1.7 1.7 3.4-3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <h2 id="activity-empty-title" className="font-display text-type-section-title text-nite-text-primary">
      {filtered ? "Nenhuma atividade encontrada" : "Nenhuma atividade atribuída por enquanto"}
    </h2>
    <p className="mt-2 max-w-md text-type-body-compact text-nite-text-secondary">
      {filtered ? "Tente outro termo ou ajuste os filtros para ampliar a lista." : "Quando houver uma atividade para você, ela aparecerá aqui."}
    </p>
    {filtered ? <Link href={clearHref} className="mt-5 inline-flex min-h-11 items-center rounded-control px-3 text-type-body-compact font-medium text-nite-brand-primary underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Limpar filtros</Link>
      : canCreate ? <Link href={actionHref} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-control border border-nite-brand-primary bg-nite-brand-primary px-4 text-type-body-compact font-medium text-nite-action-text transition-colors hover:bg-nite-brand-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus motion-reduce:transition-none">{actionLabel}</Link> : null}
  </section>;
}
