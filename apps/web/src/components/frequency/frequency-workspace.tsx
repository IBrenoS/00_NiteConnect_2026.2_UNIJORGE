"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { Button, Badge, Select, TextField } from "../ui";
import { QrScanner } from "./qr-scanner";
import { cancelFrequencyList, changeFrequencyParticipant, finalizeFrequencyList, openFrequencyList, renewFrequencyListQr } from "../../lib/frequency/actions";
import type { CollectiveSummaryRow, FrequencyList, FrequencyPage, FrequencySummary, HistoryEntry, Participant, PersonalOpenList } from "../../lib/frequency/contracts";
import type { AgendaEvent } from "../../lib/frequency/data";
import { adjacentRangeKey, formatFrequencyDate, rangeKeyForGroup, type FrequencyGroupBy } from "../../lib/frequency/query";
import { historyPresentation } from "../../lib/frequency/presentation";

type RangeOption = { value: string; label: string };
type ApiIssue = "access" | "not-found" | "unavailable" | "invalid" | null;
type WorkspaceProps = {
  manager: boolean;
  view: "personal" | "management";
  mode: "meeting" | "member";
  groupBy: FrequencyGroupBy;
  rangeKey: string;
  openKey: string;
  rangeOptions: RangeOption[];
  from: string;
  to: string;
  historyPage: FrequencyPage<HistoryEntry> | null;
  historyIssue: ApiIssue;
  personalSummary: FrequencySummary | null;
  summaryIssue: ApiIssue;
  openLists: PersonalOpenList[] | null;
  openListsIssue: ApiIssue;
  selectedHistoryPage: number;
  lists: FrequencyPage<FrequencyList> | null;
  listIssue: ApiIssue;
  selectedList: FrequencyList | null;
  participants: FrequencyPage<Participant> | null;
  participantsIssue: ApiIssue;
  participantPage: number;
  participantStatus: string;
  listStatus: string;
  events: AgendaEvent[];
  collective: FrequencyPage<CollectiveSummaryRow> | null;
  collectiveIssue: ApiIssue;
  collectivePage: number;
  selectedMemberId: string;
  memberHistory: FrequencyPage<HistoryEntry> | null;
  memberHistoryIssue: ApiIssue;
  memberHistoryPage: number;
  notice: string;
  error: string;
  synthetic?: boolean;
  syntheticOpenCreate?: boolean;
};

const issueCopy: Record<Exclude<ApiIssue, null>, string> = {
  access: "Sua conta não tem autorização para consultar estes dados.",
  "not-found": "O registro não está disponível nesta consulta.",
  unavailable: "Não foi possível carregar estas informações agora.",
  invalid: "Não foi possível ler estas informações. Tente novamente.",
};

function Icon({ name, className = "" }: { name: "scan" | "calendar" | "arrow" | "check"; className?: string }) {
  const paths = {
    scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M8 8h8v8H8z" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`size-[18px] ${className}`}>{paths[name]}</svg>;
}

function pathWith(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const suffix = query.toString();
  return `/frequencia${suffix ? `?${suffix}` : ""}`;
}

function Status({ status, inApuration = true }: { status: string; inApuration?: boolean }) {
  if (!inApuration) return <Badge variant="neutral">Fora da apuração</Badge>;
  const variant = status === "PRESENTE" ? "success" : status === "JUSTIFICADO" ? "info" : status === "AUSENTE" ? "warning" : status === "CANCELADA" ? "neutral" : "neutral";
  const label = status === "PRESENTE" ? "Presente" : status === "JUSTIFICADO" ? "Justificado" : status === "AUSENTE" ? "Ausente" : status === "AGUARDANDO" ? "Sem confirmação" : status === "FORA_DA_APURACAO" ? "Fora da apuração" : status === "ABERTA" ? "Aberta" : status === "CONCLUIDA" ? "Concluída" : status === "CANCELADA" ? "Cancelada" : status;
  return <Badge variant={variant}>{label}</Badge>;
}

function Issue({ issue }: { issue: ApiIssue }) {
  return issue ? <p role="alert" className="rounded-control border border-status-warning-border bg-status-warning-soft px-3 py-2.5 text-type-body-compact text-status-warning">{issueCopy[issue]}</p> : null;
}

function PageLink({ href, children, disabled = false }: { href: string; children: ReactNode; disabled?: boolean }) {
  return disabled ? <span aria-disabled="true" className="inline-flex min-h-10 items-center rounded-control border border-nite-border-soft px-3 text-type-metadata text-nite-text-muted">{children}</span> : <Link href={href} className="inline-flex min-h-10 items-center rounded-control border border-nite-border-strong px-3 text-type-metadata font-medium text-nite-text-secondary transition-colors hover:bg-nite-surface-subtle hover:text-nite-text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">{children}</Link>;
}

function PeriodNavigator({ props }: { props: WorkspaceProps }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const older = adjacentRangeKey(props.rangeKey, "previous", props.rangeOptions);
  const newer = adjacentRangeKey(props.rangeKey, "next", props.rangeOptions);
  const otherGroup: FrequencyGroupBy = props.groupBy === "MONTH" ? "SEMESTER" : "MONTH";
  const otherRange = rangeKeyForGroup(props.rangeKey, otherGroup, props.rangeOptions);
  const currentLabel = props.rangeOptions.find((option) => option.value === props.rangeKey)?.label ?? "Período selecionado";
  const href = (range: string) => pathWith({ view: "personal", range, historyPage: "0" });
  const controlClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-3 text-type-body-compact font-medium transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus";
  const navigate = (range: string) => startTransition(() => router.push(href(range), { scroll: false }));
  const monthTarget = props.groupBy === "MONTH" ? props.rangeKey : otherGroup === "MONTH" ? otherRange : null;
  const semesterTarget = props.groupBy === "SEMESTER" ? props.rangeKey : otherGroup === "SEMESTER" ? otherRange : null;
  const toggle = (label: string, target: string | null, selected: boolean) => selected
    ? <button key={label} type="button" aria-pressed="true" disabled className={`${controlClass} min-h-9 px-3 bg-nite-brand-soft text-nite-brand-primary`}>{label}</button>
    : <button key={label} type="button" aria-pressed="false" disabled={!target || isPending} onClick={() => { if (target) navigate(target); }} className={`${controlClass} min-h-9 px-3 text-nite-text-secondary hover:bg-nite-surface-subtle disabled:cursor-not-allowed disabled:text-nite-text-muted`}>{label}</button>;
  return <div className="grid min-w-0 gap-3 sm:flex sm:items-center sm:justify-end sm:gap-4" aria-busy={isPending}>
    <div role="group" aria-label="Agrupar período" className="inline-flex w-fit rounded-control border border-nite-border-soft bg-nite-surface p-1">
      {toggle("Mês", monthTarget, props.groupBy === "MONTH")}
      {toggle("Semestre", semesterTarget, props.groupBy === "SEMESTER")}
    </div>
    <div className="flex min-w-0 items-center gap-2">
      <button type="button" aria-label="Período anterior" disabled={!older || isPending} onClick={() => { if (older) navigate(older); }} className={`${controlClass} w-11 shrink-0 border border-nite-border-soft text-nite-text-secondary hover:bg-nite-surface-subtle disabled:cursor-not-allowed disabled:text-nite-text-muted`}><Icon name="arrow" className="rotate-180" /></button>
      <p aria-live="polite" className="min-w-0 flex-1 text-center text-type-body-compact font-medium text-nite-text-primary sm:min-w-[10rem]">{isPending ? "Carregando período…" : currentLabel}</p>
      <button type="button" aria-label="Próximo período" disabled={!newer || isPending} onClick={() => { if (newer) navigate(newer); }} className={`${controlClass} w-11 shrink-0 border border-nite-border-soft text-nite-text-secondary hover:bg-nite-surface-subtle disabled:cursor-not-allowed disabled:text-nite-text-muted`}><Icon name="arrow" /></button>
    </div>
  </div>;
}

function PeriodSelect({ props, hidden = {} }: { props: WorkspaceProps; hidden?: Record<string, string> }) {
  return <form action="/frequencia" method="get" className="flex flex-wrap items-end gap-2">
    {Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <label className="grid min-w-[12rem] flex-1 gap-1.5 text-type-metadata text-nite-text-secondary">Período
      <Select name="range" defaultValue={props.rangeKey} aria-label="Período de acompanhamento">
        {props.rangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
    </label>
    <Button type="submit" variant="secondary">Aplicar</Button>
  </form>;
}

function HistoryRows({ page, pageNumber, params, personal = false }: { page: FrequencyPage<HistoryEntry> | null; pageNumber: number; params: Record<string, string | undefined>; personal?: boolean }) {
  if (!page || page.items.length === 0) return personal ? null : <p className="rounded-panel border border-dashed border-nite-border-strong px-4 py-8 text-center text-type-body-compact text-nite-text-muted">Nenhuma reunião aparece neste período.</p>;
  return <>
    <ol className="divide-y divide-nite-border-soft border-y border-nite-border-soft" aria-label={personal ? "Histórico de reuniões" : "Histórico de Frequência"}>
      {page.items.map((item) => {
        const presentation = personal ? historyPresentation(item) : null;
        return <li key={item.listId} className={`grid min-w-0 gap-2 py-3 sm:items-center sm:gap-5 ${personal ? "sm:grid-cols-[minmax(0,1fr)_minmax(8rem,auto)]" : "sm:grid-cols-[minmax(0,1fr)_auto_auto]"}`}>
          <div className="flex min-w-0 items-start gap-3"><span className="mt-1 grid size-8 shrink-0 place-items-center rounded-control bg-nite-surface-elevated text-nite-brand-accent"><Icon name="calendar" /></span><div className="min-w-0"><p className="text-type-metadata text-nite-text-muted">{formatFrequencyDate(item.occurredAt, { dateStyle: "medium", timeStyle: "short" })}</p><p className={`mt-0.5 text-type-body-compact font-medium text-nite-text-primary ${personal ? "break-words" : "truncate"}`}>{item.meetingName}</p></div></div>
          {presentation ? <div className="grid min-w-0 gap-1 sm:justify-items-end"><p className="break-words text-type-body-compact font-medium text-nite-text-secondary sm:text-right">{presentation.label}{presentation.context ? <span className="font-normal text-nite-text-muted"> · {presentation.context}</span> : null}</p>{item.confirmedAt ? <p className="text-type-metadata text-nite-text-secondary sm:text-right">Confirmada às {formatFrequencyDate(item.confirmedAt, { hour: "2-digit", minute: "2-digit" })}</p> : null}</div> : <><Status status={item.status} inApuration={item.inApuration} />{item.confirmedAt ? <p className="text-type-metadata text-nite-text-secondary sm:text-right">Confirmada às {formatFrequencyDate(item.confirmedAt, { hour: "2-digit", minute: "2-digit" })}</p> : <p className="text-type-metadata text-nite-text-secondary sm:text-right">Sem horário de confirmação</p>}</>}
        </li>;
      })}
    </ol>
    {page.total > page.size ? <div className="flex items-center justify-between gap-3"><span className="text-type-metadata text-nite-text-muted">Página {pageNumber + 1} de {Math.ceil(page.total / page.size)}</span><div className="flex gap-2"><PageLink href={pathWith({ ...params, historyPage: String(pageNumber - 1) })} disabled={pageNumber <= 0}>Anterior</PageLink><PageLink href={pathWith({ ...params, historyPage: String(pageNumber + 1) })} disabled={(pageNumber + 1) * page.size >= page.total}>Próxima</PageLink></div></div> : null}
  </>;
}

function RetryButton() {
  const router = useRouter();
  return <Button type="button" variant="secondary" onClick={() => router.refresh()} className="min-h-10 w-fit">Tentar novamente</Button>;
}

function personalOpenListDescription(list: PersonalOpenList): string {
  if (list.status === "PRESENCA_REGISTRADA" && list.confirmedAt) return `Presença confirmada às ${formatFrequencyDate(list.confirmedAt, { hour: "2-digit", minute: "2-digit" })}.`;
  if (list.status === "JUSTIFICADO") return "Presença justificada.";
  if (list.confirmationAvailable) return "Sua presença ainda não foi confirmada.";
  if (list.confirmationWindowStatus === "EXPIRADA" || list.confirmationWindowStatus === "ENCERRADA") return "O prazo para confirmar foi encerrado.";
  return "A confirmação não está disponível neste momento.";
}

function PersonalOpenLists({ props, onScan }: { props: WorkspaceProps; onScan: (list: PersonalOpenList) => void }) {
  if (props.openListsIssue) return <section aria-labelledby="current-meeting-title" className="grid gap-2"><h2 id="current-meeting-title" className="font-display text-type-component-title text-nite-text-primary">Encontro atual</h2><div className="flex flex-wrap items-center gap-3"><Issue issue={props.openListsIssue} /><RetryButton /></div></section>;
  const items = props.openLists?.filter((list) => list.status !== "NAO_ELEGIVEL") ?? [];
  if (items.length === 0) return null;
  return <section aria-labelledby="current-meeting-title" className="grid max-w-3xl gap-3">
    <h2 id="current-meeting-title" className="font-display text-type-component-title text-nite-text-primary">Encontro atual</h2>
    <ul className="divide-y divide-nite-border-soft border-y border-nite-border-soft">
      {items.map((list) => <li key={list.listId} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p className="break-words text-type-body font-semibold text-nite-text-primary">{list.meetingName}</p>
          <p className="mt-1 text-type-metadata text-nite-text-muted">{formatFrequencyDate(list.scheduledAt, { dateStyle: "medium", timeStyle: "short" })}</p>
          <p role={list.status === "PRESENCA_REGISTRADA" ? "status" : undefined} className="mt-1 text-type-body-compact text-nite-text-secondary">{personalOpenListDescription(list)}</p>
        </div>
        {list.eligible && list.status === "AGUARDANDO_CONFIRMACAO" && list.confirmationAvailable ? <Button type="button" leadingIcon={<Icon name="scan" />} onClick={() => onScan(list)} disabled={props.synthetic} className="w-full sm:w-auto lg:hidden">Escanear QR Code</Button> : null}
      </li>)}
    </ul>
  </section>;
}

function PersonalView({ props, onScan }: { props: WorkspaceProps; onScan: (list: PersonalOpenList) => void }) {
  const counts = props.personalSummary?.counts;
  return <div className="grid gap-8" data-testid="personal-frequency-view">
    <PersonalOpenLists props={props} onScan={onScan} />
    <section aria-labelledby="personal-summary-title" className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"><h2 id="personal-summary-title" className="font-display text-type-section-title text-nite-text-primary">Suas presenças</h2><PeriodNavigator props={props} /></div>
      <Issue issue={props.summaryIssue} />
      {props.summaryIssue ? <RetryButton /> : counts ? <div className="grid max-w-4xl gap-5 xl:grid-cols-[minmax(15rem,.7fr)_minmax(0,1.3fr)] xl:items-center xl:gap-8">
        <div><p className="font-display text-5xl font-semibold leading-none tracking-tight text-nite-text-primary sm:text-6xl" aria-label={counts.noEligibleMeetings || counts.attendancePercentage === null ? "Sem percentual calculável" : `Comparecimento real: ${Number(counts.attendancePercentage).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}>{counts.noEligibleMeetings || counts.attendancePercentage === null ? "—" : `${Number(counts.attendancePercentage).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}</p><p className="mt-2 text-type-body-compact text-nite-text-secondary">presença nas reuniões realizadas</p>{counts.noEligibleMeetings ? <p className="mt-1 max-w-sm text-type-metadata text-nite-text-muted">Ainda não há reuniões contabilizáveis neste período.</p> : null}</div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-4 lg:gap-x-6"><div><dt className="text-type-metadata text-nite-text-muted">Presenças</dt><dd className="mt-1 text-2xl font-semibold text-nite-text-primary">{counts.present}</dd></div><div><dt className="text-type-metadata text-nite-text-muted">Ausências justificadas</dt><dd className="mt-1 text-2xl font-semibold text-nite-text-primary">{counts.justified}</dd></div><div><dt className="text-type-metadata text-nite-text-muted">Ausências</dt><dd className="mt-1 text-2xl font-semibold text-nite-text-primary">{counts.unjustifiedAbsences}</dd></div><div><dt className="text-type-metadata text-nite-text-muted">Reuniões realizadas</dt><dd className="mt-1 text-2xl font-semibold text-nite-text-primary">{counts.eligibleMeetings}</dd></div></dl>
      </div> : <p className="text-type-body-compact text-nite-text-muted">O resumo ainda não está disponível.</p>}
    </section>
    <section aria-labelledby="personal-history-title" className="grid gap-4">
      <h2 id="personal-history-title" className="font-display text-type-section-title text-nite-text-primary">Histórico de reuniões</h2>
      <Issue issue={props.historyIssue} />
      {props.historyIssue ? <RetryButton /> : props.historyPage?.items.length ? <HistoryRows page={props.historyPage} pageNumber={props.selectedHistoryPage} params={{ view: "personal", range: props.rangeKey }} personal /> : props.historyPage?.total === 0 ? <p className="text-type-body-compact text-nite-text-muted">Nenhuma reunião registrada neste período.</p> : props.historyPage ? <p className="text-type-body-compact text-nite-text-muted">Nenhuma reunião nesta página.</p> : null}
    </section>
  </div>;
}
function compactCounts(row: CollectiveSummaryRow["counts"]): string {
  return row.noEligibleMeetings || row.attendancePercentage === null ? "Sem reuniões elegíveis" : `${Number(row.attendancePercentage).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% · ${row.present} presenças · ${row.justified} justificadas · ${row.unjustifiedAbsences} ausências`;
}

function MemberMode({ props }: { props: WorkspaceProps }) {
  const [search, setSearch] = useState("");
  const rows = useMemo(() => (props.collective?.items ?? []).filter((row) => row.displayName.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))), [props.collective?.items, search]);
  const member = props.collective?.items.find((item) => item.memberId === props.selectedMemberId);
  const paginationParams = { view: "management", mode: "member", range: props.rangeKey };
  return <div className="grid gap-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-type-metadata font-medium uppercase tracking-[0.12em] text-nite-text-muted">Visão coletiva</p><h2 className="mt-1 font-display text-type-section-title">Por integrante</h2></div><PeriodSelect props={props} hidden={{ view: "management", mode: "member" }} /></div>
    <Issue issue={props.collectiveIssue} />
    <div className="grid gap-4 lg:grid-cols-[minmax(17rem,.8fr)_minmax(0,1.2fr)]">
      <section className="min-w-0 rounded-panel border border-nite-border-soft bg-nite-surface">
        <div className="grid gap-3 border-b border-nite-border-soft p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-display text-type-component-title">Integrantes</h3><span className="text-type-metadata text-nite-text-muted">{props.collective?.total ?? 0}</span></div><label className="grid gap-1 text-type-metadata text-nite-text-secondary">Buscar nesta página<TextField type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Nome do integrante" /></label><p className="text-type-metadata text-nite-text-muted">A consulta da API é paginada e não oferece busca remota.</p></div>
        <ul className="divide-y divide-nite-border-soft">
          {rows.map((row) => <li key={row.memberId}><Link href={pathWith({ ...paginationParams, memberId: row.memberId })} aria-current={props.selectedMemberId === row.memberId ? "true" : undefined} className={`block min-h-16 px-4 py-3 transition-colors hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-inset focus-visible:outline-nite-focus ${props.selectedMemberId === row.memberId ? "bg-nite-brand-soft/60" : ""}`}><span className="block truncate text-type-body-compact font-medium text-nite-text-primary">{row.displayName}</span><span className="mt-1 block text-type-metadata text-nite-text-muted">{compactCounts(row.counts)}</span>{row.absenceSignal.hasThreeConsecutiveUnjustifiedAbsences ? <span className="mt-2 inline-flex items-center gap-1.5 text-type-metadata text-status-warning"><span className="size-1.5 rounded-full bg-status-warning" />Três ausências injustificadas consecutivas</span> : null}</Link></li>)}
          {rows.length === 0 ? <li className="px-4 py-7 text-center text-type-body-compact text-nite-text-muted">{search ? "Nenhum nome nesta página corresponde à busca." : "Nenhum integrante neste período."}</li> : null}
        </ul>
        {props.collective && props.collective.total > props.collective.size ? <div className="flex items-center justify-between gap-2 border-t border-nite-border-soft p-3"><span className="text-type-metadata text-nite-text-muted">Página {props.collectivePage + 1}</span><div className="flex gap-2"><PageLink href={pathWith({ ...paginationParams, collectivePage: String(props.collectivePage - 1) })} disabled={props.collectivePage === 0}>Anterior</PageLink><PageLink href={pathWith({ ...paginationParams, collectivePage: String(props.collectivePage + 1) })} disabled={(props.collectivePage + 1) * props.collective.size >= props.collective.total}>Próxima</PageLink></div></div> : null}
      </section>
      <section className="min-w-0 rounded-panel border border-nite-border-soft bg-nite-surface p-4 sm:p-5">
        {member ? <><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-type-metadata font-medium uppercase tracking-[0.12em] text-nite-text-muted">Histórico individual</p><h3 className="mt-1 font-display text-type-section-title">{member.displayName}</h3></div>{member.absenceSignal.hasThreeConsecutiveUnjustifiedAbsences ? <Badge variant="warning">3 ausências consecutivas</Badge> : null}</div><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-type-body-compact text-nite-text-secondary"><span><strong className="text-nite-text-primary">{member.counts.present}</strong> presenças</span><span><strong className="text-nite-text-primary">{member.counts.justified}</strong> justificadas</span><span><strong className="text-nite-text-primary">{member.counts.unjustifiedAbsences}</strong> ausências</span><span><strong className="text-nite-text-primary">{member.counts.noEligibleMeetings || member.counts.attendancePercentage === null ? "—" : `${Number(member.counts.attendancePercentage).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}</strong> comparecimento</span></div><div className="mt-5 grid gap-3"><Issue issue={props.memberHistoryIssue} /><HistoryRows page={props.memberHistory} pageNumber={props.memberHistoryPage} params={{ view: "management", mode: "member", range: props.rangeKey, memberId: member.memberId, collectivePage: String(props.collectivePage) }} /></div></> : <div className="grid min-h-56 place-items-center text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-full bg-nite-surface-elevated text-nite-text-muted"><Icon name="arrow" /></span><h3 className="mt-3 font-display text-type-component-title">Selecione um integrante</h3><p className="mt-1 max-w-xs text-type-body-compact text-nite-text-muted">O histórico e o sinal de acompanhamento aparecem aqui.</p></div></div>}
      </section>
    </div>
  </div>;
}

function participantPageCounts(items: Participant[]): Record<Participant["status"], number> {
  return items.reduce((total, item) => ({ ...total, [item.status]: total[item.status] + 1 }), { AGUARDANDO: 0, PRESENTE: 0, JUSTIFICADO: 0, AUSENTE: 0 });
}

function ParticipantActions({ list, participant, synthetic = false }: { list: FrequencyList; participant: Participant; synthetic?: boolean }) {
  const canJustifyOpen = list.status === "ABERTA" && participant.status === "AGUARDANDO";
  const canCorrectClosed = list.status === "CONCLUIDA" && list.outcome === "REALIZADA_CONTABILIZAVEL" && (participant.status === "AUSENTE" || participant.status === "JUSTIFICADO");
  if (!canJustifyOpen && !canCorrectClosed) return <span className="text-type-metadata text-nite-text-muted">—</span>;
  const target = participant.status === "JUSTIFICADO" ? "AUSENTE" : "JUSTIFICADO";
  return <form action={synthetic ? undefined : changeFrequencyParticipant}><input type="hidden" name="listId" value={list.listId} /><input type="hidden" name="memberId" value={participant.memberId} /><input type="hidden" name="expectedVersion" value={String(list.version)} /><input type="hidden" name="targetStatus" value={target} /><button type="submit" disabled={synthetic} className="min-h-9 rounded-control px-2.5 text-type-metadata font-medium text-nite-brand-primary underline decoration-nite-brand-primary/40 underline-offset-4 hover:bg-nite-brand-soft focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus disabled:text-nite-text-muted">{target === "JUSTIFICADO" ? "Marcar justificado" : "Corrigir para ausente"}</button></form>;
}

function MeetingMode({ props }: { props: WorkspaceProps }) {
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState(props.openKey);
  const filteredParticipants = useMemo(() => (props.participants?.items ?? []).filter((person) => person.displayName.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))), [props.participants?.items, search]);
  const counts = participantPageCounts(props.participants?.items ?? []);
  const listQuery = (page: number) => pathWith({ view: "management", mode: "meeting", range: props.rangeKey, list: props.selectedList?.listId, participantPage: String(page), participantStatus: props.participantStatus });
  const eventOptions = props.events.filter((event) => event.status === "AGENDADO");
  return <div className="grid gap-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-type-metadata font-medium uppercase tracking-[0.12em] text-nite-text-muted">Visão coletiva</p><h2 className="mt-1 font-display text-type-section-title">Por reunião</h2></div><PeriodSelect props={props} hidden={{ view: "management", mode: "meeting" }} /></div>
    {props.error ? <p role="alert" className="rounded-control border border-status-warning-border bg-status-warning-soft px-3 py-2.5 text-type-body-compact text-status-warning">{props.error}</p> : null}
    {props.notice ? <p role="status" className="rounded-control border border-status-done-border bg-status-done-soft px-3 py-2.5 text-type-body-compact text-status-done">{props.notice}</p> : null}
    <details open={props.syntheticOpenCreate} className="group rounded-panel border border-nite-border-soft bg-nite-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus [&::-webkit-details-marker]:hidden"><span><span className="block text-type-body-compact font-semibold text-nite-text-primary">Abrir nova lista</span><span className="mt-0.5 block text-type-metadata text-nite-text-muted">Nome, responsável, horário e integrantes vêm da Agenda e do servidor.</span></span><span className="grid size-9 place-items-center rounded-control border border-nite-border-soft text-nite-text-secondary transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span></summary>
      <form action={props.synthetic ? undefined : openFrequencyList} onChange={() => { if (!props.synthetic) setOpenKey(globalThis.crypto.randomUUID()); }} className="grid gap-4 border-t border-nite-border-soft px-4 py-4 sm:grid-cols-2 xl:grid-cols-[minmax(15rem,1.4fr)_minmax(12rem,1fr)_minmax(10rem,.8fr)_auto] xl:items-end">
        <input type="hidden" name="idempotencyKey" value={openKey} />
        <label className="grid min-w-0 gap-1.5 text-type-metadata text-nite-text-secondary">Encontro de hoje na Agenda
          <Select name="calendarEventId" defaultValue=""><option value="">Reunião rápida sem evento existente</option>{eventOptions.map((event) => <option key={event.id} value={event.id}>{event.title} · {formatFrequencyDate(event.startsAt, { hour: "2-digit", minute: "2-digit" })}</option>)}</Select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-type-metadata text-nite-text-secondary">Nome da reunião rápida<TextField name="meetingName" maxLength={200} placeholder="Ex.: reunião extraordinária" /></label>
        <label className="grid min-w-0 gap-1.5 text-type-metadata text-nite-text-secondary">Janela do QR<Select name="confirmationWindowMinutes" defaultValue="5"><option value="3">3 minutos</option><option value="5">5 minutos</option><option value="10">10 minutos</option></Select></label>
        <Button type="submit" disabled={props.synthetic} className="w-full sm:col-span-2 xl:col-span-1">Abrir e projetar</Button>
        <fieldset className="grid min-w-0 gap-2 sm:col-span-2 xl:col-span-4"><legend className="text-type-metadata font-medium text-nite-text-secondary">Classificação para reunião rápida</legend><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-type-metadata text-nite-text-secondary">Tipo<Select name="classification" defaultValue="EXCEPTIONAL"><option value="EXCEPTIONAL">Excepcional</option><option value="REGULAR">Regular</option></Select></label><label className="grid gap-1 text-type-metadata text-nite-text-secondary">Excepcional entra na apuração?<Select name="countsForFrequency" defaultValue="true"><option value="true">Sim, se realizada</option><option value="false">Não</option></Select></label></div><p className="text-type-metadata text-nite-text-muted">O backend valida a classificação conforme o encontro e a data institucional; Agenda é recomendada quando houver evento cadastrado.</p></fieldset>
      </form>
    </details>
    <div className="grid gap-4 xl:grid-cols-[minmax(17rem,.65fr)_minmax(0,1.35fr)]">
      <section className="min-w-0 rounded-panel border border-nite-border-soft bg-nite-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-nite-border-soft px-4 py-3"><div><h3 className="font-display text-type-component-title">Listas do período</h3><p className="mt-1 text-type-metadata text-nite-text-muted">{props.lists?.total ?? 0} registros</p></div><form action="/frequencia" method="get" className="flex min-w-0 items-end gap-2"><input type="hidden" name="view" value="management" /><input type="hidden" name="mode" value="meeting" /><input type="hidden" name="range" value={props.rangeKey} /><label className="grid min-w-32 gap-1 text-type-metadata text-nite-text-secondary">Estado<Select name="listStatus" defaultValue={props.listStatus}><option value="">Todas</option><option value="ABERTA">Abertas</option><option value="CONCLUIDA">Concluídas</option><option value="CANCELADA">Canceladas</option></Select></label><Button type="submit" variant="secondary">Filtrar</Button></form></div>
        <Issue issue={props.listIssue} />
        <ul className="divide-y divide-nite-border-soft">{props.lists?.items.map((list) => <li key={list.listId}><Link href={pathWith({ view: "management", mode: "meeting", range: props.rangeKey, list: list.listId })} aria-current={props.selectedList?.listId === list.listId ? "true" : undefined} className={`block min-h-16 px-4 py-3 hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-inset focus-visible:outline-nite-focus ${props.selectedList?.listId === list.listId ? "bg-nite-brand-soft/50" : ""}`}><span className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-type-body-compact font-medium text-nite-text-primary">{list.meetingName}</span><Status status={list.status} /></span><span className="mt-1 block text-type-metadata text-nite-text-muted">{formatFrequencyDate(list.openedAt, { dateStyle: "medium", timeStyle: "short" })} · {list.openedBy.displayName}</span></Link></li>)}{props.lists && props.lists.items.length === 0 ? <li className="px-4 py-8 text-center text-type-body-compact text-nite-text-muted">Nenhuma lista neste período.</li> : null}</ul>
        {props.lists && props.lists.total > props.lists.size ? <div className="flex items-center justify-between gap-2 border-t border-nite-border-soft p-3"><span className="text-type-metadata text-nite-text-muted">Página {props.lists.page + 1}</span><div className="flex gap-2"><PageLink href={pathWith({ view: "management", mode: "meeting", range: props.rangeKey, listPage: String(props.lists.page - 1), listStatus: props.listStatus })} disabled={props.lists.page === 0}>Anterior</PageLink><PageLink href={pathWith({ view: "management", mode: "meeting", range: props.rangeKey, listPage: String(props.lists.page + 1), listStatus: props.listStatus })} disabled={(props.lists.page + 1) * props.lists.size >= props.lists.total}>Próxima</PageLink></div></div> : null}
      </section>
      <section className="min-w-0 rounded-panel border border-nite-border-soft bg-nite-surface p-4 sm:p-5">
        {props.selectedList ? <>
          <div className="flex flex-col gap-4 border-b border-nite-border-soft pb-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Status status={props.selectedList.status} />{props.selectedList.classification === "EXCEPTIONAL" ? <Badge variant="institutional">Excepcional</Badge> : <Badge variant="neutral">Regular</Badge>}</div><h3 className="mt-2 font-display text-type-section-title text-nite-text-primary">{props.selectedList.meetingName}</h3><p className="mt-1 text-type-body-compact text-nite-text-secondary">Aberta por {props.selectedList.openedBy.displayName} · {formatFrequencyDate(props.selectedList.openedAt, { dateStyle: "medium", timeStyle: "short" })}</p><p className="mt-1 text-type-metadata text-nite-text-muted">Janela até {formatFrequencyDate(props.selectedList.confirmationDeadline, { dateStyle: "medium", timeStyle: "short" })}{props.selectedList.closedAt ? ` · encerrada em ${formatFrequencyDate(props.selectedList.closedAt, { dateStyle: "medium", timeStyle: "short" })}` : ""}</p></div><div className="flex flex-wrap gap-2">{props.selectedList.status === "ABERTA" ? <><form action={props.synthetic ? undefined : renewFrequencyListQr}><input type="hidden" name="listId" value={props.selectedList.listId} /><input type="hidden" name="expectedVersion" value={String(props.selectedList.version)} /><Button type="submit" variant="secondary" disabled={props.synthetic}>Projetar QR</Button></form><form action={props.synthetic ? undefined : cancelFrequencyList} onSubmit={(event) => { if (!props.synthetic && !window.confirm("Cancelar esta lista e retirar o encontro da apuração?")) event.preventDefault(); }}><input type="hidden" name="listId" value={props.selectedList.listId} /><input type="hidden" name="expectedVersion" value={String(props.selectedList.version)} /><input type="hidden" name="confirmed" value="true" /><Button type="submit" variant="destructive" disabled={props.synthetic}>Cancelar lista</Button></form></> : null}</div></div>
          {props.selectedList.status === "ABERTA" ? <form action={props.synthetic ? undefined : finalizeFrequencyList} className="my-4 flex flex-col gap-3 rounded-control border border-nite-border-soft bg-nite-surface-subtle p-3 sm:flex-row sm:items-end"><input type="hidden" name="listId" value={props.selectedList.listId} /><input type="hidden" name="expectedVersion" value={String(props.selectedList.version)} /><label className="grid min-w-0 flex-1 gap-1 text-type-metadata text-nite-text-secondary">Resultado ao concluir<Select name="outcome" defaultValue={props.selectedList.classification === "REGULAR" || props.selectedList.countsForFrequency ? "REALIZADA_CONTABILIZAVEL" : "REALIZADA_NAO_CONTABILIZAVEL"}><option value="REALIZADA_CONTABILIZAVEL">Realizada e contabilizável</option>{props.selectedList.classification === "EXCEPTIONAL" ? <option value="REALIZADA_NAO_CONTABILIZAVEL">Realizada, não contabilizável</option> : null}<option value="NAO_REALIZADA">Não realizada</option></Select></label><Button type="submit" disabled={props.synthetic}>Concluir lista</Button></form> : null}
          <div className="flex flex-wrap items-end justify-between gap-3 py-3"><div><p className="font-display text-type-component-title">Integrantes</p><p className="mt-1 text-type-metadata text-nite-text-muted">Lista alfabética congelada na abertura · {props.participants?.total ?? 0} integrantes</p></div><label className="grid min-w-[13rem] gap-1 text-type-metadata text-nite-text-secondary">Buscar nesta página<TextField type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Nome do integrante" /></label></div>
          <Issue issue={props.participantsIssue} />
          {props.participants ? <><div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-type-metadata text-nite-text-muted"><span>{counts.PRESENTE} presentes nesta página</span><span>{counts.JUSTIFICADO} justificadas</span><span>{counts.AUSENTE} ausências</span><span>{counts.AGUARDANDO} aguardando</span></div>
            <div className="hidden overflow-x-auto rounded-control border border-nite-border-soft md:block"><table className="w-full min-w-[690px] border-collapse text-left"><thead className="bg-nite-surface-subtle text-type-table-header text-nite-text-secondary"><tr><th scope="col" className="px-3 py-2.5">Integrante</th><th scope="col" className="px-3 py-2.5">Situação</th><th scope="col" className="px-3 py-2.5">Confirmação</th><th scope="col" className="px-3 py-2.5">Ação</th></tr></thead><tbody>{filteredParticipants.map((person) => <tr key={person.memberId} className="border-t border-nite-border-soft"><td className="px-3 py-3 text-type-table-cell font-medium text-nite-text-primary">{person.displayName}</td><td className="px-3 py-3"><Status status={person.status} /></td><td className="px-3 py-3 text-type-table-cell text-nite-text-secondary">{person.confirmedAt ? formatFrequencyDate(person.confirmedAt, { dateStyle: "medium", timeStyle: "short" }) : "—"}</td><td className="px-3 py-2"><ParticipantActions list={props.selectedList!} participant={person} synthetic={props.synthetic} /></td></tr>)}</tbody></table></div>
            <ul className="grid gap-2 md:hidden">{filteredParticipants.map((person) => <li key={person.memberId} className="grid gap-2 rounded-control border border-nite-border-soft p-3"><div className="flex items-start justify-between gap-3"><span className="min-w-0 break-words text-type-body-compact font-medium text-nite-text-primary">{person.displayName}</span><Status status={person.status} /></div><p className="text-type-metadata text-nite-text-muted">{person.confirmedAt ? `Confirmada ${formatFrequencyDate(person.confirmedAt, { dateStyle: "medium", timeStyle: "short" })}` : "Sem horário de confirmação"}</p><ParticipantActions list={props.selectedList!} participant={person} synthetic={props.synthetic} /></li>)}</ul>
            {filteredParticipants.length === 0 ? <p className="px-3 py-6 text-center text-type-body-compact text-nite-text-muted">Nenhum integrante corresponde à busca nesta página.</p> : null}
            {props.participants.total > props.participants.size ? <div className="mt-4 flex items-center justify-between gap-2"><span className="text-type-metadata text-nite-text-muted">Página {props.participantPage + 1} de {Math.ceil(props.participants.total / props.participants.size)}</span><div className="flex gap-2"><PageLink href={listQuery(props.participantPage - 1)} disabled={props.participantPage === 0}>Anterior</PageLink><PageLink href={listQuery(props.participantPage + 1)} disabled={(props.participantPage + 1) * props.participants.size >= props.participants.total}>Próxima</PageLink></div></div> : null}
          </> : !props.participantsIssue ? <p className="py-8 text-center text-type-body-compact text-nite-text-muted">Selecione uma lista para consultar os integrantes.</p> : null}
          <p className="mt-4 border-t border-nite-border-soft pt-3 text-type-metadata text-nite-text-muted">A gestão pode justificar ausências com código administrativo. Presença só pode ser registrada pelo próprio integrante autenticado.</p>
        </> : <div className="grid min-h-64 place-items-center px-4 text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-full bg-nite-surface-elevated text-nite-text-muted"><Icon name="calendar" /></span><h3 className="mt-3 font-display text-type-component-title">Escolha uma lista</h3><p className="mt-1 max-w-sm text-type-body-compact text-nite-text-muted">A autoria, os horários, as contagens e o roster aparecem quando uma reunião é selecionada.</p></div></div>}
      </section>
    </div>
  </div>;
}

export function FrequencyWorkspace(props: WorkspaceProps) {
  const [scannerList, setScannerList] = useState<PersonalOpenList | null>(null);
  const view = props.manager && props.view === "management" ? "management" : "personal";
  const errorLabels: Record<string, string> = { access: "Sua conta não tem acesso a esta ação.", conflict: "A lista mudou. Atualize os dados e tente novamente.", invalid: "Não foi possível aceitar os dados. Confira as informações e tente novamente.", unavailable: "Não foi possível concluir agora. Tente novamente.", qr: "O QR não ficou disponível. Atualize a lista para tentar novamente." };
  const noticeLabels: Record<string, string> = { finalized: "Lista concluída. As presenças foram atualizadas.", canceled: "Lista cancelada.", updated: "Situação atualizada pela gestão." };
  return <div className="grid min-w-0 gap-6 sm:gap-8" data-testid="frequency-workspace">
    <header className="flex min-w-0 flex-col gap-4 border-b border-nite-border-soft pb-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between xl:flex-nowrap">
      <div className="min-w-0"><h1 className="font-display text-type-page-title text-nite-text-primary">Frequência</h1><p className="mt-2 max-w-2xl text-type-body-compact text-nite-text-secondary">{view === "personal" ? "Veja suas presenças e acompanhe as reuniões do NITE." : "Acompanhe as listas e presenças das reuniões do NITE."}</p></div>
      {props.manager ? <nav aria-label="Área de Frequência" className="flex min-w-0 flex-wrap gap-1 rounded-control border border-nite-border-soft bg-nite-surface p-1"><Link href={pathWith({ view: "personal", range: props.rangeKey })} aria-current={view === "personal" ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-control px-3 text-type-body-compact font-medium focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${view === "personal" ? "bg-nite-brand-soft text-nite-brand-primary" : "text-nite-text-secondary hover:bg-nite-surface-subtle"}`}>Visão pessoal</Link><Link href={pathWith({ view: "management", mode: props.mode, range: props.rangeKey })} aria-current={view === "management" ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-control px-3 text-type-body-compact font-medium focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${view === "management" ? "bg-nite-brand-soft text-nite-brand-primary" : "text-nite-text-secondary hover:bg-nite-surface-subtle"}`}>Gestão coletiva</Link></nav> : null}
    </header>
    {props.error ? <p role="alert" className="rounded-control border border-status-warning-border bg-status-warning-soft px-3 py-2.5 text-type-body-compact text-status-warning">{errorLabels[props.error] ?? "Não foi possível concluir a operação."}</p> : null}
    {props.notice ? <p role="status" className="rounded-control border border-status-done-border bg-status-done-soft px-3 py-2.5 text-type-body-compact text-status-done">{noticeLabels[props.notice] ?? "Operação concluída."}</p> : null}
    {view === "personal" ? <PersonalView props={props} onScan={setScannerList} /> : <>
      <nav aria-label="Modo de acompanhamento coletivo" className="flex flex-wrap gap-2 border-b border-nite-border-soft pb-2"><Link href={pathWith({ view: "management", mode: "meeting", range: props.rangeKey })} aria-current={props.mode === "meeting" ? "page" : undefined} className={`inline-flex min-h-10 items-center gap-2 rounded-control px-3 text-type-body-compact focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${props.mode === "meeting" ? "bg-nite-brand-soft font-medium text-nite-brand-primary" : "text-nite-text-secondary hover:bg-nite-surface-subtle"}`}><Icon name="calendar" />Por reunião</Link><Link href={pathWith({ view: "management", mode: "member", range: props.rangeKey })} aria-current={props.mode === "member" ? "page" : undefined} className={`inline-flex min-h-10 items-center gap-2 rounded-control px-3 text-type-body-compact focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${props.mode === "member" ? "bg-nite-brand-soft font-medium text-nite-brand-primary" : "text-nite-text-secondary hover:bg-nite-surface-subtle"}`}>Por integrante</Link></nav>
      {props.mode === "member" ? <MemberMode props={props} /> : <MeetingMode props={props} />}
    </>}
    {scannerList ? <QrScanner listId={scannerList.listId} meetingName={scannerList.meetingName} onClose={() => setScannerList(null)} /> : null}
  </div>;
}
