import { FilterToolbar } from "../patterns/filter-toolbar";
import { DatePicker, SearchField } from "../ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button, Surface } from "../ui";
import type { ApiResult } from "../../lib/api/contracts";
import type { DashboardHistory, DashboardResponse } from "../../lib/dashboard/contracts";

type Scope = "personal" | "project" | "institutional";
type Tone = "neutral" | "brand" | "done" | "warning" | "error";
type Metric = { key: string; label: string; detail: string; href: string; tone: Tone };
type DashboardViewProps = {
  viewSelector?: ReactNode;
  result: ApiResult<DashboardResponse>;
  historyResult: ApiResult<DashboardHistory> | null;
  scope: Scope;
  scopeLabel: string;
  contextValue: string;
  from: string;
  to: string;
  search: string;
};

const columnLabels: Record<string, string> = {
  project: "Projeto",
  activity: "Atividade",
  executor: "Responsável atual",
  status: "Situação",
  dueOn: "Prazo",
  overdueNow: "Atrasada agora",
  completedAt: "Concluída em",
  officialStatus: "Situação do projeto",
  healthClassification: "Criticidade",
  activities: "Atividades",
  openActivities: "Em aberto",
  overdueActivitiesNow: "Atrasadas",
  completedActivities: "Concluídas",
  activeMembers: "Integrantes ativos",
  healthReasons: "Motivo da criticidade",
};

const statusLabels: Record<string, string> = {
  PLANEJADA: "Planejada",
  EM_EXECUCAO: "Em execução",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
  PLANEJAMENTO: "Em planejamento",
  ATIVO: "Ativo",
  PAUSADO: "Pausado",
  CONCLUIDO: "Concluído",
  NORMAL: "Normal",
  ATENCAO: "Atenção",
  CRITICO: "Crítico",
  DADOS_INSUFICIENTES: "Dados insuficientes",
};

const toneClasses: Record<Tone, string> = {
  neutral: "text-nite-text-primary",
  brand: "text-nite-brand-primary",
  done: "text-status-done",
  warning: "text-status-warning",
  error: "text-status-error",
};

function number(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function date(value: string): string {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function metricCards(scope: Scope, indicators: Record<string, number>): Metric[] {
  const candidates: Metric[] = scope === "personal"
    ? [
        { key: "overdueActivitiesNow", label: "Atividades atrasadas", detail: "Criadas no período; atrasadas agora", href: "#records", tone: indicators.overdueActivitiesNow > 0 ? "error" : "neutral" },
        { key: "activities.em_execucao", label: "Em execução", detail: "Criadas no período; situação atual", href: "#records", tone: indicators["activities.em_execucao"] > 0 ? "brand" : "neutral" },
        { key: "activities.concluida", label: "Concluídas", detail: "Criadas no período; situação atual", href: "#records", tone: indicators["activities.concluida"] > 0 ? "done" : "neutral" },
        { key: "activities.planejada", label: "Planejadas", detail: "Criadas no período; situação atual", href: "#records", tone: "neutral" },
      ]
    : [
        { key: "projects", label: "Projetos no escopo", detail: scope === "project" ? "Projeto selecionado" : "Situação atual", href: "#records", tone: "neutral" },
        { key: "overdueActivitiesNow", label: "Atividades atrasadas", detail: "Situação atual", href: "#records", tone: indicators.overdueActivitiesNow > 0 ? "error" : "neutral" },
        { key: "openActivities", label: "Atividades em aberto", detail: "Planejadas ou em execução", href: "#records", tone: indicators.openActivities > 0 ? "brand" : "neutral" },
        { key: "completedActivities", label: "Atividades concluídas", detail: "Situação atual", href: "#records", tone: indicators.completedActivities > 0 ? "done" : "neutral" },
      ];
  return candidates.filter(({ key }) => Object.hasOwn(indicators, key));
}

function metricValue(value: number): string {
  return number(value);
}

function missingPriorityMessage(indicators: Record<string, number>): string | null {
  const missing = [
    indicators.overdueActivitiesNow === undefined ? "atividades atrasadas" : null,
  ].filter((message): message is string => message !== null);
  if (missing.length === 0) return null;
  return `Não foi possível verificar ${missing.join(" e ")} nesta consulta.`;
}

export function priorityEmptyMessage(scope: Scope, indicators: Record<string, number>, hasRows = true): string {
  const missing = missingPriorityMessage(indicators);
  if (missing) return missing;
  if (!hasRows) return scope === "personal"
    ? "Não há atividades exibidas neste recorte."
    : "Não há projetos exibidos neste recorte para resumir as pendências.";
  return "Nenhuma pendência identificada nos dados consultados.";
}

function PriorityPanel({ data, scope }: { data: DashboardResponse; scope: Scope }) {
  const { indicators } = data;
  const overdue = indicators.overdueActivitiesNow;
  const hasOverdue = overdue !== undefined && overdue > 0;
  const missing = missingPriorityMessage(indicators);
  return <section id="priorities" aria-labelledby="priorities-heading" className="min-w-0 scroll-mt-24">
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <h2 id="priorities-heading" className="font-display text-type-section-title text-nite-text-primary">Precisa de atenção</h2>
      {hasOverdue ? <ul className="flex min-w-0 flex-wrap gap-x-5 gap-y-2 text-type-body-compact">
        {hasOverdue ? <li><Link href="#records" className="inline-flex items-center gap-2 rounded-control text-nite-text-primary hover:text-status-error focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus"><span className="size-2 shrink-0 rounded-full bg-status-error" aria-hidden="true" /><span>{number(overdue)} {overdue === 1 ? "atividade atrasada" : "atividades atrasadas"}</span><span className="text-type-metadata text-nite-text-muted">{scope === "personal" ? "Ver atividades" : scope === "project" ? "Ver projeto" : "Ver projetos"}</span></Link></li> : null}
      </ul> : <p className="text-type-body-compact text-nite-text-secondary">{priorityEmptyMessage(scope, indicators, data.rows.length > 0)}</p>}
    </div>
    {missing && hasOverdue ? <p role="status" className="mt-2 text-type-metadata text-status-warning">{missing}</p> : null}
  </section>;
}

const activityStatuses = [
  ["activities.planejada", "Planejadas", "bg-status-progress"],
  ["activities.em_execucao", "Em execução", "bg-nite-data-2"],
  ["activities.concluida", "Concluídas", "bg-status-done"],
  ["activities.cancelada", "Canceladas", "bg-status-draft"],
] as const;

function ActivityBars({ indicators }: { indicators: Record<string, number> }) {
  const available = activityStatuses.filter(([key]) => Object.hasOwn(indicators, key));
  const total = available.reduce((sum, [key]) => sum + (indicators[key] ?? 0), 0);
  const max = Math.max(0, ...available.map(([key]) => indicators[key] ?? 0));
  const complete = available.length === activityStatuses.length;
  return <section aria-labelledby="activity-status-heading" className="min-w-0">
    <Surface padding="compact">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="activity-status-heading" className="font-display text-type-component-title text-nite-text-primary">Situação das atividades</h2>
        {complete ? <span className="shrink-0 text-type-metadata tabular-nums text-nite-text-muted">{number(total)} no período</span> : null}
      </div>
      {available.length === 0 ? <p className="mt-3 text-type-body-compact text-nite-text-secondary">A distribuição não está disponível para este período.</p> : total === 0 ? <p className="mt-3 text-type-body-compact text-nite-text-secondary">{complete ? "Nenhuma atividade foi criada neste período." : "Não há dados suficientes para distribuir as atividades."}</p> :
        <ul aria-label="Atividades criadas por situação" className="mt-4 grid gap-3">
          {available.map(([key, label, color]) => {
            const value = indicators[key] ?? 0;
            const percent = max > 0 ? (value / max) * 100 : 0;
            return <li key={key} className="grid grid-cols-[minmax(6rem,7.5rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-type-body-compact">
              <span className="truncate text-nite-text-secondary">{label}</span>
              <span className="h-2 overflow-hidden rounded-pill bg-nite-surface-subtle" aria-hidden="true"><span className={`block h-full rounded-pill ${color}`} style={{ width: `${percent}%` }} /></span>
              <span className="text-right font-medium tabular-nums text-nite-text-primary">{number(value)}</span>
            </li>;
          })}
        </ul>}
      {!complete && available.length > 0 && total > 0 ? <p role="status" className="mt-3 text-type-metadata text-status-warning">Algumas situações não foram retornadas para este período.</p> : null}
    </Surface>
  </section>;
}

function recordRows(data: DashboardResponse, query: string): { rows: string[][]; visibleColumns: number[] } {
  const visibleColumns = data.columns.map((column, index) => ({ column, index }))
    .filter(({ column }) => !/id$/i.test(column) && column !== "createdAt")
    .map(({ index }) => index);
  const filtered = query.trim().toLocaleLowerCase("pt-BR");
  const rows = filtered
    ? data.rows.filter((row) => visibleColumns.some((index) => row[index]?.toLocaleLowerCase("pt-BR").includes(filtered)))
    : data.rows;
  return { rows, visibleColumns };
}

function cellLabel(column: string, value: string): string {
  if (column === "overdueNow") return value === "true" ? "Sim" : value === "false" ? "Não" : value;
  if (statusLabels[value]) return statusLabels[value];
  if (["dueOn", "completedAt"].includes(column) && value) return date(value);
  if (column === "healthReasons") return value || "—";
  return value || "—";
}

function RecordsTable({ data, scope, query }: { data: DashboardResponse; scope: Scope; query: string }) {
  const { rows, visibleColumns } = recordRows(data, query);
  const title = scope === "personal" ? "Minhas atividades" : scope === "project" ? "Resumo do projeto" : "Projetos";
  const total = scope === "personal" ? data.indicators.activities : data.indicators.recordsInPeriod;
  const countText = query
    ? `${number(rows.length)} correspondências em ${number(data.rows.length)} registros exibidos`
    : total === undefined ? `${number(data.rows.length)} registros exibidos` : `${number(total)} ${total === 1 ? "registro" : "registros"}`;
  const emptyTitle = query ? "Nenhum registro corresponde à busca" : scope === "personal" ? "Nenhuma atividade no período" : scope === "project" ? "Nenhum registro disponível para este projeto" : "Nenhum projeto disponível neste escopo";
  const emptyDescription = query ? "A busca considera somente os registros exibidos. Tente outro termo." : null;
  return <section id="records" aria-labelledby="records-heading" className="min-w-0 scroll-mt-24">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
      <h2 id="records-heading" className="font-display text-type-section-title text-nite-text-primary">{title}</h2>
      <span className="text-type-metadata tabular-nums text-nite-text-muted">{countText}</span>
    </div>
    {rows.length === 0 ? <p className="rounded-control border border-nite-border-soft bg-nite-surface px-4 py-4 text-type-body-compact text-nite-text-secondary"><strong className="font-medium text-nite-text-primary">{emptyTitle}.</strong>{emptyDescription ? ` ${emptyDescription}` : null}</p> :
      <div className="overflow-hidden rounded-panel border border-nite-border-soft bg-nite-surface">
        <div className="overflow-x-auto" role="region" aria-label={`${title}; tabela com rolagem horizontal`} tabIndex={0}>
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead className="bg-nite-surface-subtle">
              <tr>{visibleColumns.map((index) => <th key={data.columns[index]} scope="col" className="whitespace-nowrap border-b border-nite-border-soft px-4 py-3 text-type-table-header text-nite-text-muted">{columnLabels[data.columns[index]] ?? data.columns[index]}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-nite-border-soft">
              {rows.map((row, rowIndex) => <tr key={row[0] || `${rowIndex}`} className="hover:bg-nite-surface-subtle">
                {visibleColumns.map((columnIndex) => {
                  const column = data.columns[columnIndex];
                  const value = row[columnIndex] ?? "";
                  const isPriority = (column === "overdueNow" && value === "true") || (column === "healthClassification" && value === "CRITICO");
                  return <td key={column} className={`max-w-[22rem] px-4 py-3 text-type-table-cell ${isPriority ? "font-medium text-status-error" : "text-nite-text-secondary"}`} title={cellLabel(column, value)}>{cellLabel(column, value)}</td>;
                })}
              </tr>)}
            </tbody>
          </table>
        </div>
        {data.unavailableMetrics.some((message) => message.includes("truncado")) ? <p className="border-t border-nite-border-soft px-4 py-3 text-type-metadata text-nite-text-muted">A consulta atingiu o limite de linhas. Os indicadores seguem calculados conforme os dados de origem.</p> : null}
      </div>}
  </section>;
}

const eventLabels: Record<string, string> = {
  STATUS_CHANGED: "Situação alterada",
  CREATED: "Atividade criada",
  UPDATED: "Atividade atualizada",
  EXECUTOR_CHANGED: "Responsável alterado",
  COLLABORATOR_ADDED: "Integrante adicionado à atividade",
  COLLABORATOR_REMOVED: "Integrante removido da atividade",
  EVIDENCE_CREATED: "Evidência adicionada",
  EVIDENCE_WITHDRAWN: "Evidência retirada",
};

const projectEventLabels: Record<string, string> = {
  CREATED: "Projeto criado",
  UPDATED: "Projeto atualizado",
  STATUS_CHANGED: "Situação do projeto alterada",
};

export function recentEventLabel(sourceType: string, action: string): string {
  const labels = sourceType === "PROJECT" ? projectEventLabels : eventLabels;
  return labels[action] ?? action.replaceAll("_", " ").toLocaleLowerCase("pt-BR");
}

function RecentEvents({ result }: { result: ApiResult<DashboardHistory> | null }) {
  if (!result) return null;
  if (result.issue) return <section aria-labelledby="recent-events-heading" className="min-w-0">
    <h2 id="recent-events-heading" className="mb-3 font-display text-type-section-title text-nite-text-primary">Atualizações recentes</h2>
    <p role="status" className="rounded-control border border-status-warning-border bg-status-warning-soft px-4 py-3 text-type-body-compact text-status-warning">As atualizações recentes estão indisponíveis.</p>
  </section>;
  const { columns, rows, total } = result.data;
  const column = (name: string) => columns.indexOf(name);
  const latestRows = rows
    .map((row, index) => ({ row, index, timestamp: Date.parse(row[column("occurredAt")] ?? "") }))
    .sort((left, right) => (Number.isNaN(right.timestamp) ? 0 : right.timestamp) - (Number.isNaN(left.timestamp) ? 0 : left.timestamp))
    .slice(0, 10);
  return <section aria-labelledby="recent-events-heading" className="min-w-0 scroll-mt-24">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
      <h2 id="recent-events-heading" className="font-display text-type-section-title text-nite-text-primary">Atualizações recentes</h2>
      <span className="text-type-metadata text-nite-text-muted">{number(total)} {total === 1 ? "evento" : "eventos"} no período</span>
    </div>
    {rows.length === 0 ? <p className="rounded-control border border-nite-border-soft bg-nite-surface px-4 py-4 text-type-body-compact text-nite-text-secondary">Não há atualizações registradas no período.</p> :
      <ol className="divide-y divide-nite-border-soft rounded-panel border border-nite-border-soft bg-nite-surface">
        {latestRows.map(({ row, index, timestamp }) => {
          const sourceType = row[column("sourceType")] ?? "";
          const project = row[column("project")] ?? "";
          const action = row[column("action")] ?? "";
          const occurredAt = row[column("occurredAt")] ?? "";
          const eventDate = new Date(occurredAt);
          const label = recentEventLabel(sourceType, action);
          return <li key={row[column("sourceId")] || `${index}`} className="flex min-w-0 items-start gap-3 px-4 py-3 sm:px-5">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-nite-brand-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1"><p className="text-type-body-compact font-medium text-nite-text-primary">{label}</p><p className="mt-1 truncate text-type-metadata text-nite-text-muted">{sourceType === "PROJECT" ? "Projeto" : "Atividade"} · {project}</p></div>
            <time className="shrink-0 pt-0.5 text-type-metadata text-nite-text-muted" dateTime={occurredAt}>{Number.isNaN(timestamp) ? occurredAt : date(eventDate.toISOString())}</time>
          </li>;
        })}
      </ol>}
  </section>;
}

export function DashboardView({ viewSelector, result, historyResult, scope, scopeLabel, contextValue, from, to, search }: DashboardViewProps) {
  if (result.issue) {
    const accessDenied = result.issue === "access";
    const title = accessDenied ? "Este espaço não está disponível" : result.issue === "invalid" ? "Não foi possível validar os dados" : "Não foi possível carregar o painel";
    const description = accessDenied
      ? "Seu acesso pode ter mudado. Escolha uma visão disponível ou entre novamente."
      : result.issue === "invalid"
        ? "A consulta foi interrompida porque alguns dados não passaram pela validação."
        : "Os dados não puderam ser consultados agora. Tente novamente.";
    return <section id="overview" className="mx-auto min-w-0 max-w-2xl py-10">
      <div className="min-w-0 rounded-panel border border-nite-border-soft bg-nite-surface p-5 sm:p-7">
        <span className={`mb-4 grid size-9 place-items-center rounded-full ${accessDenied ? "bg-status-warning-soft text-status-warning" : "bg-status-error-soft text-status-error"}`} aria-hidden="true">!</span>
        <h1 className="font-display text-type-page-title text-nite-text-primary">{title}</h1>
        <p className="mt-2 text-type-body-compact text-nite-text-secondary">{description}</p>
        <div className="mt-4">{viewSelector}</div>
        {!accessDenied ? <FilterToolbar compact action="/dashboard" method="get" className="border-b border-nite-border-soft pb-4">
          <input type="hidden" name="scope" value={contextValue} />
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          {search ? <input type="hidden" name="q" value={search} /> : null}
          <Button size="compact" type="submit" variant="secondary">Tentar novamente</Button>
        </FilterToolbar> : null}
      </div>
    </section>;
  }

  const data = result.data;
  const cards = metricCards(scope, data.indicators);
  const generated = date(data.generatedAt);
  const showActivityBars = activityStatuses.some(([key]) => Object.hasOwn(data.indicators, key));
  const title = scope === "project" ? "Acompanhamento do projeto" : scopeLabel;
  return <div className="grid min-w-0 gap-6">
    <section id="overview" aria-labelledby="dashboard-heading" className="min-w-0 scroll-mt-24 border-b border-nite-border-soft pb-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><h1 id="dashboard-heading" className="font-display text-type-page-title text-nite-text-primary">{title}</h1>{viewSelector}</div>
      {scope === "project" ? <p className="mt-1 text-type-body-compact text-nite-text-secondary">{scopeLabel}</p> : null}
      <FilterToolbar compact action="/dashboard" method="get" aria-label="Filtros do painel" className="border-b border-nite-border-soft pb-4">
        <input type="hidden" name="scope" value={contextValue} />
        <label className="grid min-w-0 gap-1 text-type-metadata font-medium text-nite-text-secondary">De
          <DatePicker aria-label="De"  name="from" defaultValue={from} />
        </label>
        <label className="grid min-w-0 gap-1 text-type-metadata font-medium text-nite-text-secondary">Até
          <DatePicker aria-label="Até"  name="to" defaultValue={to} />
        </label>
        <label className="col-span-2 grid min-w-0 gap-1 text-type-metadata font-medium text-nite-text-secondary sm:col-span-1 sm:min-w-56 sm:max-w-[24rem] sm:flex-1">Buscar nos registros exibidos
          <SearchField name="q"  maxLength={120} defaultValue={search} placeholder="Atividade ou projeto" />
        </label>
        <Button size="compact" type="submit" variant="secondary" className="col-span-2 sm:col-span-1">Aplicar filtros</Button>
      </FilterToolbar>
    </section>

    <PriorityPanel data={data} scope={scope} />

    <section aria-label="Indicadores principais" className="min-w-0">
      {cards.length > 0 ? <div className="grid min-w-0 grid-cols-1 gap-2 min-[560px]:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => <Link key={card.key} href={card.href} className="min-w-0 rounded-panel border border-nite-border-soft bg-nite-surface px-3 py-3 transition-colors hover:bg-nite-surface-focus focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus sm:px-4">
          <p className="truncate text-type-body-compact font-medium text-nite-text-secondary">{card.label}</p>
          <p className={`mt-1 font-display text-type-metric tabular-nums ${toneClasses[card.tone]}`}>{metricValue(data.indicators[card.key])}</p>
          <p className="mt-1 truncate text-type-metadata text-nite-text-muted">{card.detail}</p>
        </Link>)}
      </div> : <p className="rounded-control border border-nite-border-soft bg-nite-surface px-4 py-3 text-type-body-compact text-nite-text-secondary">Os indicadores deste espaço não estão disponíveis.</p>}
    </section>

    {showActivityBars ? <ActivityBars indicators={data.indicators} /> : null}

    <RecordsTable data={data} scope={scope} query={search} />
    <RecentEvents result={historyResult} />

    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-nite-border-soft pt-3 text-type-metadata text-nite-text-muted">
      <span>{scopeLabel}</span>
      <span>Dados atualizados {generated}</span>
    </div>
    {data.unavailableMetrics.length > 0 ? <details className="min-w-0 rounded-control border border-nite-border-soft bg-nite-surface px-4 py-3">
      <summary className="cursor-pointer text-type-body-compact font-medium text-nite-text-secondary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Sobre os dados ({data.unavailableMetrics.length})</summary>
      <ul className="mt-3 grid list-disc gap-2 border-t border-nite-border-soft pt-3 pl-5 text-type-metadata leading-relaxed text-nite-text-muted">
        {data.unavailableMetrics.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </details> : null}
  </div>;
}
