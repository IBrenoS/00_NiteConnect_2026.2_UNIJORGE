"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Select, TextField } from "../ui";
import { QrScanner } from "./qr-scanner";
import { cancelFrequencyList, changeFrequencyParticipant, finalizeFrequencyList, openFrequencyList, renewFrequencyListQr } from "../../lib/frequency/actions";
import type { CollectiveSummaryRow, FrequencyList, FrequencyPage, FrequencySummary, HistoryEntry, Participant, ParticipantPage, PersonalOpenList } from "../../lib/frequency/contracts";
import { frequencySelectionLabel, isRegularFrequencyMeeting, stepFrequencySelection, switchFrequencyGroup, type FrequencyGroupBy } from "../../lib/frequency/query";
import type { AgendaEvent } from "../../lib/frequency/data";
import { formatFrequencyDate } from "../../lib/frequency/query";
import { historyPresentation } from "../../lib/frequency/presentation";

type ApiIssue = "access" | "not-found" | "unavailable" | "invalid" | null;
const EMPTY_COLLECTIVE_ROWS: CollectiveSummaryRow[] = [];
const EMPTY_PARTICIPANTS: Participant[] = [];
type WorkspaceProps = {
  manager: boolean;
  view: "personal" | "management";
  mode: "meeting" | "member";
  groupBy: FrequencyGroupBy;
  rangeKey: string;
  openKey: string;
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
  participants: ParticipantPage | null;
  participantsIssue: ApiIssue;
  participantPage: number;
  participantStatus: string;
  participantSearch: string;
  listStatus: string;
  events: AgendaEvent[];
  collective: FrequencyPage<CollectiveSummaryRow> | null;
  collectiveIssue: ApiIssue;
  collectivePage: number;
  memberSearch: string;
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
  "not-found": "Este registro não está disponível nesta consulta.",
  unavailable: "Não foi possível carregar os dados agora. Tente novamente em instantes.",
  invalid: "Não foi possível ler os dados recebidos. Atualize a consulta.",
};

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function Icon({ name, className = "size-[18px]" }: { name: "scan" | "calendar" | "arrow-left" | "arrow-right" | "search" | "check" | "arrow"; className?: string }) {
  const paths: Record<typeof name, ReactNode> = {
    scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M8 8h8v8H8z" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    "arrow-left": <><path d="M19 12H5M11 18l-6-6 6-6" /></>,
    "arrow-right": <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.6" /><path d="m16 16 4.2 4.2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>;
}

function pathWith(params: Record<string, string | undefined>, synthetic = false): string {
  const query = new URLSearchParams();
  if (synthetic) {
    const surface = params.view === "personal" ? "personal" : params.mode === "member" ? "member" : "meeting";
    query.set("surface", surface);
  }
  for (const [key, value] of Object.entries(params)) {
    if (value || (synthetic && (key === "memberId" || key === "list"))) query.set(key, value ?? "");
  }
  const suffix = query.toString();
  return (synthetic ? "/dev-preview/frequencia" : "/frequencia") + (suffix ? "?" + suffix : "");
}

function StateLabel({ children, tone = "muted" }: { children: ReactNode; tone?: "success" | "warning" | "info" | "muted" }) {
  const color = {
    success: "text-status-done",
    warning: "text-status-warning",
    info: "text-nite-brand-accent",
    muted: "text-nite-text-secondary",
  }[tone];
  return <span className={cx("inline-flex min-w-0 items-center gap-2 text-type-metadata font-medium", color)}><span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />{children}</span>;
}

function Issue({ issue }: { issue: ApiIssue }) {
  return issue ? <p role="alert" className="text-type-body-compact text-status-warning">{issueCopy[issue]}</p> : null;
}

function PageLink({ href, children, disabled = false, label }: { href: string; children: ReactNode; disabled?: boolean; label?: string }) {
  return disabled
    ? <span aria-disabled="true" className="inline-flex min-h-10 items-center rounded-control px-3 text-type-metadata text-nite-text-muted">{children}</span>
    : <Link href={href} aria-label={label} className="inline-flex min-h-10 items-center rounded-control px-3 text-type-metadata font-medium text-nite-text-secondary transition-colors hover:bg-nite-surface-subtle hover:text-nite-text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">{children}</Link>;
}

function periodRoute(props: WorkspaceProps, groupBy: FrequencyGroupBy, selection: string): string {
  const common: Record<string, string | undefined> = {
    view: props.view,
    range: groupBy + ":" + selection,
  };
  if (props.view === "management") common.mode = props.mode;
  if (props.view === "management" && props.mode === "member") {
    common.memberId = props.selectedMemberId;
    common.memberSearch = props.memberSearch;
  }
  if (props.view === "management" && props.mode === "meeting") {
    common.listStatus = props.listStatus;
  }
  return pathWith(common, props.synthetic);
}

function RangeControl({ props }: { props: WorkspaceProps }) {
  const selection = props.rangeKey.split(":")[1] ?? "";
  const previous = stepFrequencySelection(selection, props.groupBy, -1);
  const next = stepFrequencySelection(selection, props.groupBy, 1);
  return <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
    <nav aria-label="Agrupar período por" className="inline-flex items-center rounded-control bg-nite-surface-subtle p-1">
      {(["MONTH", "SEMESTER"] as const).map((groupBy) => {
        const target = switchFrequencyGroup(selection, props.groupBy, groupBy);
        const active = props.groupBy === groupBy;
        return target ? <Link key={groupBy} href={periodRoute(props, groupBy, target)} aria-current={active ? "true" : undefined} className={cx("inline-flex min-h-9 items-center rounded-control px-3 text-type-metadata font-medium transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus", active ? "bg-nite-surface text-nite-text-primary shadow-sm" : "text-nite-text-secondary hover:text-nite-text-primary")}>{groupBy === "MONTH" ? "Mês" : "Semestre"}</Link> : null;
      })}
    </nav>
    <div className="flex min-w-0 items-center gap-1">
      <PageLink href={previous ? periodRoute(props, props.groupBy, previous) : "#"} disabled={!previous} label="Período anterior"><Icon name="arrow-left" /></PageLink>
      <span aria-live="polite" className="min-w-[9rem] text-center text-type-body-compact font-medium text-nite-text-primary">{frequencySelectionLabel(selection, props.groupBy)}</span>
      <PageLink href={next ? periodRoute(props, props.groupBy, next) : "#"} disabled={!next} label="Próximo período"><Icon name="arrow-right" /></PageLink>
    </div>
  </div>;
}

function historyStatus(item: HistoryEntry): { label: string; tone: "success" | "warning" | "info" | "muted" } {
  if (item.legacy || item.listStatus === "LEGADO") return { label: "Histórico anterior à apuração", tone: "muted" };
  if (item.listStatus === "ABERTA") {
    if (item.presenceRecorded) return { label: "Presença registrada · aguardando conclusão", tone: "success" };
    return item.confirmationWindowStatus === "EXPIRADA"
      ? { label: "Aguardando conclusão", tone: "warning" }
      : { label: "Aguardando confirmação", tone: "info" };
  }
  if (item.listStatus === "CANCELADA") {
    return item.presenceRecorded
      ? { label: "Presença registrada · reunião cancelada", tone: "success" }
      : { label: "Reunião cancelada", tone: "muted" };
  }
  if (item.outcome === "NAO_REALIZADA") return { label: item.presenceRecorded ? "Presença registrada · reunião não realizada" : "Reunião não realizada", tone: "muted" };
  if (item.accountingStatus === "NAO_CONTABILIZAVEL") {
    if (item.presenceRecorded) return { label: "Presença registrada · fora da apuração", tone: "success" };
    if (item.attendanceStatus === "JUSTIFICADO") return { label: "Justificado · fora da apuração", tone: "info" };
    return { label: "Fora da apuração", tone: "muted" };
  }
  if (item.status === "PRESENTE") return { label: "Presente", tone: "success" };
  if (item.status === "JUSTIFICADO") return { label: "Justificado", tone: "info" };
  if (item.status === "AUSENTE") return { label: "Ausente", tone: "warning" };
  if (item.status === "FORA_DA_APURACAO") return { label: "Fora da apuração", tone: "muted" };
  return { label: "Aguardando confirmação", tone: "muted" };
}

function HistoryRows({ page, pageNumber, params, emptyLabel = "Nenhuma reunião neste período.", synthetic = false, personal = false }: { page: FrequencyPage<HistoryEntry> | null; pageNumber: number; params: Record<string, string | undefined>; emptyLabel?: string; synthetic?: boolean; personal?: boolean }) {
  if (!page || page.items.length === 0) return <p className="py-5 text-type-body-compact text-nite-text-muted">{emptyLabel}</p>;
  const pageCount = Math.ceil(page.total / page.size);
  return <>
    <ol className="divide-y divide-nite-border-soft border-y border-nite-border-soft" aria-label="Histórico de Frequência">
      {page.items.map((item, index) => {
        const status = historyStatus(item);
        const presentation = personal ? historyPresentation(item) : null;
        const key = item.listId ?? item.calendarEventId ?? item.occurredAt + "-" + index;
        return <li key={key} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,.75fr)_auto] sm:items-center sm:gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-control bg-nite-surface-subtle text-nite-brand-accent"><Icon name="calendar" className="size-4" /></span>
            <div className="min-w-0">
              <p className="break-words text-type-body-compact font-medium text-nite-text-primary">{item.meetingName}</p>
              <p className="mt-0.5 text-type-metadata text-nite-text-muted">{formatFrequencyDate(item.occurredAt, { dateStyle: "medium", timeStyle: "short" })}</p>
            </div>
          </div>
          <StateLabel tone={presentation ? presentation.label === "Presente" ? "success" : presentation.label === "Ausente" ? "warning" : "muted" : status.tone}>{presentation ? presentation.label + (presentation.context ? " · " + presentation.context : "") : status.label}</StateLabel>
          <p className="text-type-metadata text-nite-text-secondary sm:text-right">{item.confirmedAt ? "Confirmada às " + formatFrequencyDate(item.confirmedAt, { hour: "2-digit", minute: "2-digit" }) : item.presenceRecorded ? "Presença registrada" : "Sem confirmação"}</p>
        </li>;
      })}
    </ol>
    {page.total > page.size ? <div className="flex items-center justify-between gap-2">
      <span className="text-type-metadata text-nite-text-muted">Página {pageNumber + 1} de {pageCount}</span>
      <div className="flex gap-1">
        <PageLink href={pathWith({ ...params, historyPage: String(pageNumber - 1) }, synthetic)} disabled={pageNumber <= 0}>Anterior</PageLink>
        <PageLink href={pathWith({ ...params, historyPage: String(pageNumber + 1) }, synthetic)} disabled={pageNumber + 1 >= pageCount}>Próxima</PageLink>
      </div>
    </div> : null}
  </>;
}

function percentage(value: number | null, noEligibleMeetings: boolean): string {
  return noEligibleMeetings || value === null ? "—" : Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
}

function RetryButton() {
  const router = useRouter();
  return <Button type="button" variant="secondary" onClick={() => router.refresh()} className="w-fit">Tentar novamente</Button>;
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
  return <div className="grid gap-8">
    <PersonalOpenLists props={props} onScan={onScan} />
    <section aria-labelledby="personal-summary-title" className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-type-metadata text-nite-text-muted">Acompanhamento pessoal</p><h2 id="personal-summary-title" className="mt-1 font-display text-type-section-title text-nite-text-primary">Sua frequência</h2></div>
        <div className="w-full sm:w-auto"><RangeControl props={props} /></div>
      </div>
      <Issue issue={props.summaryIssue} />
      {props.summaryIssue ? <RetryButton /> : counts ? <div className="flex min-w-0 flex-col gap-4 border-y border-nite-border-soft py-4 sm:flex-row sm:items-center sm:gap-7">
        <div className="flex items-baseline gap-3"><span className="font-display text-4xl font-semibold tracking-tight text-nite-text-primary sm:text-5xl">{percentage(counts.attendancePercentage, counts.noEligibleMeetings)}</span><span className="text-type-metadata text-nite-text-muted">comparecimento real</span></div>
        <div className="hidden h-10 w-px bg-nite-border-soft sm:block" />
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-type-body-compact">
          <div><dt className="inline text-nite-text-muted">Presenças </dt><dd className="inline font-semibold text-nite-text-primary">{counts.present}</dd></div>
          <div><dt className="inline text-nite-text-muted">Justificadas </dt><dd className="inline font-semibold text-nite-text-primary">{counts.justified}</dd></div>
          <div><dt className="inline text-nite-text-muted">Ausências </dt><dd className="inline font-semibold text-nite-text-primary">{counts.unjustifiedAbsences}</dd></div>
          <div><dt className="inline text-nite-text-muted">Reuniões elegíveis </dt><dd className="inline font-semibold text-nite-text-primary">{counts.eligibleMeetings}</dd></div>
        </dl>
        {counts.noEligibleMeetings ? <p className="text-type-metadata text-nite-text-muted">Sem reuniões elegíveis neste período; o percentual não é calculado.</p> : null}
      </div> : <p className="py-3 text-type-body-compact text-nite-text-muted">O resumo ainda não está disponível.</p>}
    </section>
    <section aria-labelledby="personal-history-title" className="grid gap-3">
      <div><p className="text-type-metadata text-nite-text-muted">Linha do tempo</p><h2 id="personal-history-title" className="mt-1 font-display text-type-section-title text-nite-text-primary">Histórico de reuniões</h2></div>
      <Issue issue={props.historyIssue} />
      {props.historyIssue ? <RetryButton /> : props.historyPage ? props.historyPage.total === 0
        ? <p className="text-type-body-compact text-nite-text-muted">Nenhuma reunião registrada neste período.</p>
        : <HistoryRows page={props.historyPage} pageNumber={props.selectedHistoryPage} params={{ view: "personal", range: props.rangeKey }} synthetic={props.synthetic} personal emptyLabel="Nenhuma reunião nesta página." />
        : <p className="text-type-body-compact text-nite-text-muted">O histórico ainda não está disponível.</p>}
    </section>
  </div>;
}

function memberSummary(row: CollectiveSummaryRow): string {
  if (row.counts.noEligibleMeetings || row.counts.attendancePercentage === null) return "Sem reuniões elegíveis";
  return percentage(row.counts.attendancePercentage, row.counts.noEligibleMeetings) + " · " + row.counts.present + " presenças";
}

function MemberMode({ props }: { props: WorkspaceProps }) {
  const [search, setSearch] = useState(props.memberSearch);
  const [searchPending, setSearchPending] = useState(false);
  const [rememberedMember, setRememberedMember] = useState<CollectiveSummaryRow | null>(null);
  const rows = props.collective?.items ?? EMPTY_COLLECTIVE_ROWS;
  const matchedMember = rows.find((row) => row.memberId === props.selectedMemberId) ?? null;
  const member = matchedMember ?? (rememberedMember?.memberId === props.selectedMemberId ? rememberedMember : null);
  const syntheticRows = useMemo(() => props.synthetic && search.trim()
    ? rows.filter((row) => row.displayName.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")))
    : rows, [props.synthetic, rows, search]);
  const listVisible = !member && !props.selectedMemberId;
  const detailVisible = Boolean(member || props.selectedMemberId);
  const formAction = props.synthetic ? pathWith({ view: "management", mode: "member" }, true) : "/frequencia";
  const pageCount = props.collective ? Math.ceil(props.collective.total / props.collective.size) : 0;
  const paginationParams = { view: "management", mode: "member", range: props.rangeKey, memberSearch: props.memberSearch, memberId: props.selectedMemberId };
  return <div className="grid gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-type-body-compact text-nite-text-secondary">Frequência por integrante</p>
      <RangeControl props={props} />
    </div>
    <Issue issue={props.collectiveIssue} />
    <div className="grid min-w-0 gap-7 lg:grid-cols-[minmax(17rem,.85fr)_minmax(0,1.5fr)]">
      <section aria-label="Lista de integrantes" className={cx("min-w-0", listVisible ? "block" : "hidden lg:block")}>
        <div className="grid gap-3 pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-type-component-title text-nite-text-primary">Integrantes</h2>
            <span className="text-type-metadata text-nite-text-muted">{props.synthetic ? syntheticRows.length : props.collective?.total ?? 0} neste resultado</span>
          </div>
          <form action={formAction} method="get" aria-busy={searchPending} onSubmit={() => setSearchPending(true)} className="flex min-w-0 gap-2">
            <input type="hidden" name="view" value="management" />
            <input type="hidden" name="mode" value="member" />
            <input type="hidden" name="range" value={props.rangeKey} />
            <input type="hidden" name="collectivePage" value="0" />
            <input type="hidden" name="memberId" value="" />
            <label className="min-w-0 flex-1">
              <span className="sr-only">Buscar integrante</span>
              <TextField type="search" name="memberSearch" value={search} maxLength={120} autoComplete="off" onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Buscar integrante" />
            </label>
            <Button type="submit" variant="secondary" aria-label="Buscar integrante" disabled={searchPending || Boolean(props.synthetic && !search.trim())}><Icon name="search" /></Button>
          </form>
        </div>
        <ul className="divide-y divide-nite-border-soft border-y border-nite-border-soft">
          {syntheticRows.map((row) => <li key={row.memberId}>
          <Link href={pathWith({ view: "management", mode: "member", range: props.rangeKey, memberSearch: props.memberSearch, collectivePage: String(props.collectivePage), memberId: row.memberId }, props.synthetic)} onClick={() => setRememberedMember(row)} aria-current={props.selectedMemberId === row.memberId ? "true" : undefined} className={cx("block min-h-16 px-2 py-3 transition-colors hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-inset focus-visible:outline-nite-focus sm:px-3", props.selectedMemberId === row.memberId && "bg-nite-brand-soft/60")}>
              <span className="block break-words text-type-body-compact font-medium text-nite-text-primary">{row.displayName}</span>
              <span className="mt-1 block text-type-metadata text-nite-text-muted">{memberSummary(row)}</span>
            </Link>
          </li>)}
          {syntheticRows.length === 0 ? <li className="px-2 py-6 text-type-body-compact text-nite-text-muted sm:px-3">{search.trim() ? "Nenhum integrante corresponde à busca." : "Nenhum integrante com frequência neste período."}</li> : null}
        </ul>
        <p aria-live="polite" className="min-h-7 pt-2 text-type-metadata text-nite-text-muted">{searchPending ? "Buscando integrantes…" : props.synthetic ? "Prévia sintética · resultados de demonstração." : search === props.memberSearch && search ? "Busca atualizada para “" + search + "”." : "Digite um nome e selecione Buscar para consultar os integrantes."}</p>
        {props.collective && props.collective.total > props.collective.size ? <div className="flex items-center justify-between gap-2 pt-2">
          <span className="text-type-metadata text-nite-text-muted">Página {props.collectivePage + 1} de {pageCount}</span>
          <div className="flex gap-1">
        <PageLink href={pathWith({ ...paginationParams, collectivePage: String(props.collectivePage - 1) }, props.synthetic)} disabled={props.collectivePage <= 0}>Anterior</PageLink>
        <PageLink href={pathWith({ ...paginationParams, collectivePage: String(props.collectivePage + 1) }, props.synthetic)} disabled={props.collectivePage + 1 >= pageCount}>Próxima</PageLink>
          </div>
        </div> : null}
      </section>
      <section aria-label="Histórico do integrante" className={cx("min-w-0", detailVisible ? "block" : "hidden lg:block")}>
        {member ? <>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={pathWith({ view: "management", mode: "member", range: props.rangeKey, memberSearch: props.memberSearch, collectivePage: String(props.collectivePage), memberId: "" }, props.synthetic)} className="mb-3 inline-flex min-h-9 items-center gap-2 rounded-control pr-2 text-type-metadata font-medium text-nite-brand-primary hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus lg:hidden"><Icon name="arrow-left" className="size-4" />Voltar à lista</Link>
              <p className="text-type-metadata text-nite-text-muted">Histórico individual</p>
              <h2 className="mt-1 break-words font-display text-type-section-title text-nite-text-primary">{member.displayName}</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-nite-border-soft py-4 sm:grid-cols-3 xl:grid-cols-5">
            <div><p className="text-type-metadata text-nite-text-muted">Comparecimento real</p><p className="mt-1 text-type-body-compact font-semibold text-nite-text-primary">{percentage(member.counts.attendancePercentage, member.counts.noEligibleMeetings)}</p></div>
            <div><p className="text-type-metadata text-nite-text-muted">Presenças</p><p className="mt-1 text-type-body-compact font-semibold text-nite-text-primary">{member.counts.present}</p></div>
            <div><p className="text-type-metadata text-nite-text-muted">Justificadas</p><p className="mt-1 text-type-body-compact font-semibold text-nite-text-primary">{member.counts.justified}</p></div>
            <div><p className="text-type-metadata text-nite-text-muted">Ausências</p><p className="mt-1 text-type-body-compact font-semibold text-nite-text-primary">{member.counts.unjustifiedAbsences}</p></div>
            <div><p className="text-type-metadata text-nite-text-muted">Reuniões elegíveis</p><p className="mt-1 text-type-body-compact font-semibold text-nite-text-primary">{member.counts.eligibleMeetings}</p></div>
          </div>
          {member.absenceSignal.hasThreeConsecutiveUnjustifiedAbsences ? <p className="mt-3 text-type-metadata text-status-warning">Três ausências injustificadas consecutivas nas reuniões indicadas pelo histórico.</p> : null}
          <div className="mt-5 grid gap-3">
            <div><h3 className="font-display text-type-component-title text-nite-text-primary">Reuniões</h3><p className="mt-1 text-type-metadata text-nite-text-muted">Situação e contabilização conforme o encerramento oficial de cada lista.</p></div>
            <Issue issue={props.memberHistoryIssue} />
            <HistoryRows page={props.memberHistory} pageNumber={props.memberHistoryPage} params={{ view: "management", mode: "member", range: props.rangeKey, memberId: member.memberId, memberSearch: props.memberSearch, collectivePage: String(props.collectivePage) }} synthetic={props.synthetic} />
          </div>
        </> : props.selectedMemberId ? <div className="grid gap-3 py-5">
          <Link href={pathWith({ view: "management", mode: "member", range: props.rangeKey, memberSearch: props.memberSearch, collectivePage: String(props.collectivePage), memberId: "" }, props.synthetic)} className="inline-flex min-h-9 w-fit items-center gap-2 rounded-control pr-2 text-type-metadata font-medium text-nite-brand-primary hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus lg:hidden"><Icon name="arrow-left" className="size-4" />Voltar à lista</Link>
          <p className="text-type-body-compact text-nite-text-muted">Selecione um integrante nos resultados para ver o histórico e o resumo do período.</p>
        </div> : <div className="hidden py-5 lg:block"><h2 className="font-display text-type-component-title text-nite-text-primary">Histórico</h2><p className="mt-1 text-type-body-compact text-nite-text-muted">Selecione um integrante para consultar os dados do período.</p></div>}
      </section>
    </div>
  </div>;
}

function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function remainingLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

function listState(list: FrequencyList, now: number | null): { label: string; tone: "success" | "warning" | "info" | "muted" } {
  if (list.status === "CANCELADA") return { label: "Cancelada", tone: "muted" };
  if (list.status === "CONCLUIDA") return { label: "Concluída", tone: "success" };
  if (now !== null && Date.parse(list.confirmationDeadline) <= now) return { label: "Aberta · aguardando conclusão", tone: "warning" };
  return { label: "Aberta · confirmações disponíveis", tone: "info" };
}

function listClassLabel(list: FrequencyList): string {
  return list.classification === "REGULAR" ? "Regular" : "Excepcional";
}

function ParticipantActions({ list, participant, synthetic = false }: { list: FrequencyList; participant: Participant; synthetic?: boolean }) {
  const canJustify = list.status === "ABERTA" && participant.status === "AGUARDANDO";
  const canCorrect = list.status === "CONCLUIDA" && list.outcome === "REALIZADA_CONTABILIZAVEL" && (participant.status === "AUSENTE" || participant.status === "JUSTIFICADO");
  if (!canJustify && !canCorrect) return null;
  const targetStatus = participant.status === "JUSTIFICADO" ? "AUSENTE" : "JUSTIFICADO";
  const confirmation = targetStatus === "JUSTIFICADO"
    ? "Marcar " + participant.displayName + " como justificado?"
    : "Corrigir a situação de " + participant.displayName + " para ausente?";
  return <details className="group relative">
    <summary aria-label={"Ações para " + participant.displayName} className="flex min-h-10 cursor-pointer list-none items-center rounded-control px-2 text-type-metadata font-medium text-nite-brand-primary hover:bg-nite-brand-soft focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus [&::-webkit-details-marker]:hidden">Ações</summary>
    <div className="absolute right-0 top-full z-10 mt-1 min-w-52 rounded-panel border border-nite-border-soft bg-nite-background p-2 shadow-nite-floating">
      <form action={synthetic ? undefined : changeFrequencyParticipant} onSubmit={(event) => { if (!synthetic && !window.confirm(confirmation)) event.preventDefault(); }}>
        <input type="hidden" name="listId" value={list.listId} />
        <input type="hidden" name="memberId" value={participant.memberId} />
        <input type="hidden" name="expectedVersion" value={String(list.version)} />
        <input type="hidden" name="targetStatus" value={targetStatus} />
        <button type="submit" disabled={synthetic} className="min-h-10 w-full rounded-control px-3 text-left text-type-body-compact text-nite-text-primary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus disabled:text-nite-text-muted">{targetStatus === "JUSTIFICADO" ? "Marcar como justificado" : "Corrigir para ausente"}</button>
      </form>
    </div>
  </details>;
}

function participantState(participant: Participant, list: FrequencyList, now: number | null): { label: string; tone: "success" | "warning" | "info" | "muted" } {
  if (list.status === "ABERTA") {
    if (participant.status === "PRESENTE") return { label: "Presente", tone: "success" };
    if (participant.status === "JUSTIFICADO") return { label: "Justificado", tone: "info" };
    if (participant.status === "FORA_DA_APURACAO") return { label: "Fora da apuração", tone: "muted" };
    return now !== null && Date.parse(list.confirmationDeadline) <= now
      ? { label: "Aguardando conclusão", tone: "warning" }
      : { label: "Aguardando confirmação", tone: "muted" };
  }
  if (participant.status === "PRESENTE") return { label: "Presente", tone: "success" };
  if (participant.status === "JUSTIFICADO") return { label: "Justificado", tone: "info" };
  if (participant.status === "AUSENTE") return { label: "Ausente", tone: "warning" };
  if (participant.status === "FORA_DA_APURACAO") return { label: "Fora da apuração", tone: "muted" };
  return { label: "Fora da apuração", tone: "muted" };
}

function meetingListRoute(props: WorkspaceProps, listId: string | undefined, page: number, status = props.participantStatus, search = props.participantSearch): string {
  return pathWith({ view: "management", mode: "meeting", range: props.rangeKey, list: listId, participantPage: String(page), participantStatus: status, participantSearch: search, listStatus: props.listStatus }, props.synthetic);
}

function ParticipantRoster({ props, list, now }: { props: WorkspaceProps; list: FrequencyList; now: number | null }) {
  const [search, setSearch] = useState(props.participantSearch);
  const [searchPending, setSearchPending] = useState(false);
  const items = props.participants?.items ?? EMPTY_PARTICIPANTS;
  const visibleItems = useMemo(() => props.synthetic
    ? items.filter((person) => (!search.trim() || person.displayName.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))) && (!props.participantStatus || person.status === props.participantStatus))
    : items, [props.synthetic, items, props.participantStatus, search]);
  const page = props.participants;
  const pageCount = page?.pageCount ?? 0;
  return <section aria-labelledby="participant-list-title" className="mt-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h3 id="participant-list-title" className="font-display text-type-component-title text-nite-text-primary">Integrantes</h3><p className="mt-1 text-type-metadata text-nite-text-muted">{page ? "Mostrando " + visibleItems.length + " de " + page.total + " resultados · lista com " + page.counts.rosterTotal + " integrantes" : "Lista nominal"}</p></div>
    </div>
    <form action={props.synthetic ? pathWith({ view: "management", mode: "meeting" }, true) : "/frequencia"} method="get" aria-busy={searchPending} onSubmit={() => setSearchPending(true)} className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,.8fr)_auto]">
      <input type="hidden" name="view" value="management" />
      <input type="hidden" name="mode" value="meeting" />
      <input type="hidden" name="range" value={props.rangeKey} />
      <input type="hidden" name="list" value={list.listId} />
      <input type="hidden" name="participantPage" value="0" />
      <input type="hidden" name="listStatus" value={props.listStatus} />
      <label className="min-w-0">
        <span className="sr-only">Buscar integrante</span>
        <TextField type="search" name="participantSearch" value={search} maxLength={120} autoComplete="off" onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Buscar integrante" />
      </label>
      <label className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-start-auto">
        <span className="sr-only">Filtrar situação do integrante</span>
        <Select name="participantStatus" value={props.participantStatus} onChange={(event) => { if (!props.synthetic) event.currentTarget.form?.requestSubmit(); }}>
          <option value="">Todas as situações</option>
          <option value="PRESENTE">Presentes</option>
          <option value="JUSTIFICADO">Justificados</option>
          <option value="AUSENTE">Ausentes</option>
          <option value="AGUARDANDO">Aguardando confirmação</option>
        </Select>
      </label>
      <Button type="submit" variant="secondary" aria-label="Buscar integrante" className="col-start-2 row-start-1 justify-self-end px-3 sm:col-start-3 sm:row-start-auto" disabled={searchPending}><Icon name="search" /></Button>
    </form>
    <p aria-live="polite" className="min-h-7 pt-1 text-type-metadata text-nite-text-muted">{searchPending ? "Buscando integrantes…" : props.synthetic ? "Prévia sintética · resultados de demonstração." : search === props.participantSearch && search ? "Busca atualizada para “" + search + "”." : "Digite um nome e selecione Buscar para consultar a lista completa."}</p>
    <Issue issue={props.participantsIssue} />
    {visibleItems.length ? <ul className="divide-y divide-nite-border-soft border-y border-nite-border-soft">
      {visibleItems.map((participant) => {
        const state = participantState(participant, list, now);
        return <li key={participant.memberId} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,.55fr)_auto] sm:items-center sm:gap-4">
          <div className="min-w-0">
            <p className="break-words text-type-body-compact font-medium text-nite-text-primary">{participant.displayName}</p>
            <p className="mt-0.5 text-type-metadata text-nite-text-muted">{participant.confirmedAt ? "Confirmada às " + formatFrequencyDate(participant.confirmedAt, { hour: "2-digit", minute: "2-digit" }) : participant.status === "PRESENTE" ? "Presença registrada" : "Sem confirmação registrada"}</p>
          </div>
          <StateLabel tone={state.tone}>{state.label}</StateLabel>
          <ParticipantActions list={list} participant={participant} synthetic={props.synthetic} />
        </li>;
      })}
    </ul> : page && !props.participantsIssue ? <p className="py-5 text-type-body-compact text-nite-text-muted">{search.trim() || props.participantStatus ? "Nenhum integrante corresponde aos filtros." : "A lista está sem integrantes para exibir."}</p> : null}
    {page && page.pageCount > 1 ? <div className="flex items-center justify-between gap-2 pt-2">
      <span className="text-type-metadata text-nite-text-muted">Página {page.page + 1} de {pageCount}</span>
      <div className="flex gap-1">
        <PageLink href={meetingListRoute(props, list.listId, props.participantPage - 1)} disabled={props.participantPage <= 0}>Anterior</PageLink>
        <PageLink href={meetingListRoute(props, list.listId, props.participantPage + 1)} disabled={props.participantPage + 1 >= pageCount}>Próxima</PageLink>
      </div>
    </div> : null}
  </section>;
}

function GlobalParticipantCounts({ page, open, confirmations }: { page: ParticipantPage | null; open: boolean; confirmations: number }) {
  if (!page) return null;
  const counts = page.counts;
  const entries = [
    { label: open ? "Confirmações recebidas" : "Presentes", count: open ? confirmations : counts.present },
    { label: "Justificados", count: counts.justified },
    { label: "Ausentes", count: counts.absent },
    { label: "Aguardando confirmação", count: counts.awaitingConfirmation },
    { label: "Total de integrantes", count: counts.rosterTotal },
  ];
  if (counts.outsideApuration > 0) entries.push({ label: "Fora da apuração", count: counts.outsideApuration });
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-nite-border-soft py-4 sm:grid-cols-3 xl:grid-cols-5">
    {entries.map((item) => <div key={item.label} className="min-w-0"><dt className="break-words text-type-metadata text-nite-text-muted">{item.label}</dt><dd className="mt-1 font-display text-xl font-semibold tabular-nums text-nite-text-primary">{item.count}</dd></div>)}
  </dl>;
}

function CreateList({ props, openKey, setOpenKey }: { props: WorkspaceProps; openKey: string; setOpenKey: (value: string) => void }) {
  const [selectedEventId, setSelectedEventId] = useState("");
  const events = props.events.filter((event) => event.status === "AGENDADO");
  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const regular = selectedEvent
    ? isRegularFrequencyMeeting(selectedEvent.kind, selectedEvent.modality, selectedEvent.startsAt)
    : isRegularFrequencyMeeting("ENCONTRO", "PRESENCIAL", new Date());
  const action = props.synthetic ? undefined : openFrequencyList;
  return <details open={props.syntheticOpenCreate} className="group rounded-panel bg-nite-surface-subtle">
    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-3 py-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus [&::-webkit-details-marker]:hidden sm:px-4">
      <span><span className="block text-type-body-compact font-semibold text-nite-text-primary">Abrir nova lista</span><span className="mt-0.5 block text-type-metadata text-nite-text-muted">A data, o responsável e os integrantes são definidos automaticamente.</span></span>
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-control bg-nite-surface text-type-body-compact text-nite-text-secondary transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
    </summary>
    <form action={action} onChange={() => { if (!props.synthetic) setOpenKey(globalThis.crypto.randomUUID()); }} className="grid gap-3 border-t border-nite-border-soft px-3 py-4 sm:grid-cols-2 sm:px-4 xl:grid-cols-[minmax(14rem,1.3fr)_minmax(12rem,1fr)_minmax(9rem,.7fr)_auto] xl:items-end">
      <input type="hidden" name="idempotencyKey" value={openKey} />
      <input type="hidden" name="agendaClassification" value={selectedEvent ? regular ? "REGULAR" : "EXCEPTIONAL" : ""} />
      <label className="grid min-w-0 gap-1.5 text-type-metadata text-nite-text-secondary">Encontro da Agenda
        <Select name="calendarEventId" value={selectedEventId} onChange={(event) => setSelectedEventId(event.currentTarget.value)}>
          <option value="">Reunião sem evento existente</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.title} · {formatFrequencyDate(event.startsAt, { hour: "2-digit", minute: "2-digit" })}</option>)}
        </Select>
      </label>
      <label className="grid min-w-0 gap-1.5 text-type-metadata text-nite-text-secondary">Nome do encontro
        <TextField name="meetingName" maxLength={200} required={!selectedEventId} disabled={Boolean(selectedEventId)} placeholder={selectedEvent ? "Nome definido pela Agenda" : "Ex.: reunião extraordinária"} />
      </label>
      <label className="grid min-w-0 gap-1.5 text-type-metadata text-nite-text-secondary">Duração do QR
        <Select name="confirmationWindowMinutes" defaultValue="5"><option value="3">3 minutos</option><option value="5">5 minutos</option><option value="10">10 minutos</option></Select>
      </label>
      {!regular ? <label className="grid min-w-0 gap-1.5 text-type-metadata text-nite-text-secondary">Reunião excepcional entra na apuração?
        <Select name="countsForFrequency" defaultValue="true"><option value="true">Sim, quando realizada</option><option value="false">Não</option></Select>
      </label> : <input type="hidden" name="countsForFrequency" value="" />}
      <div className="sm:col-span-2 xl:col-span-4"><Button type="submit" disabled={props.synthetic} className="w-full sm:w-auto">Abrir e projetar</Button></div>
    </form>
  </details>;
}

function MeetingList({ props, now }: { props: WorkspaceProps; now: number | null }) {
  const page = props.lists;
  const selected = props.selectedList;
  const listCount = page?.total ?? 0;
  const listPageCount = page ? Math.ceil(page.total / page.size) : 0;
  return <section aria-label="Listas do período" className="min-w-0">
    <div className="flex flex-wrap items-end justify-between gap-3 pb-3">
      <div><h2 className="font-display text-type-component-title text-nite-text-primary">Listas do período</h2><p className="mt-1 text-type-metadata text-nite-text-muted">{listCount} {listCount === 1 ? "lista" : "listas"}</p></div>
      <form action={props.synthetic ? pathWith({ view: "management", mode: "meeting" }, true) : "/frequencia"} method="get" className="flex items-center gap-2">
        <input type="hidden" name="view" value="management" />
        <input type="hidden" name="mode" value="meeting" />
        <input type="hidden" name="range" value={props.rangeKey} />
        <input type="hidden" name="listPage" value="0" />
        <label className="text-type-metadata text-nite-text-secondary">
          <span className="sr-only">Filtrar listas por situação</span>
          <Select name="listStatus" value={props.listStatus} aria-label="Situação das listas" onChange={(event) => event.currentTarget.form?.requestSubmit()}>
            <option value="">Todas</option><option value="ABERTA">Abertas</option><option value="CONCLUIDA">Concluídas</option><option value="CANCELADA">Canceladas</option>
          </Select>
        </label>
      </form>
    </div>
    <Issue issue={props.listIssue} />
    {page?.items.length ? <ul className="divide-y divide-nite-border-soft border-y border-nite-border-soft">
      {page.items.map((list) => {
        const state = listState(list, now);
        return <li key={list.listId}>
          <Link href={pathWith({ view: "management", mode: "meeting", range: props.rangeKey, list: list.listId, listStatus: props.listStatus }, props.synthetic)} aria-current={selected?.listId === list.listId ? "true" : undefined} className={cx("block min-h-16 px-2 py-3 transition-colors hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-inset focus-visible:outline-nite-focus sm:px-3", selected?.listId === list.listId && "bg-nite-brand-soft/60")}>
            <span className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 break-words text-type-body-compact font-medium text-nite-text-primary">{list.meetingName}</span>
              <StateLabel tone={state.tone}>{state.label}</StateLabel>
            </span>
            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-type-metadata text-nite-text-muted">
              <span>{formatFrequencyDate(list.openedAt, { dateStyle: "medium", timeStyle: "short" })}</span><span>Responsável: {list.openedBy.displayName}</span>
            </span>
          </Link>
        </li>;
      })}
    </ul> : page && !props.listIssue ? <p className="py-5 text-type-body-compact text-nite-text-muted">Nenhuma lista neste período.</p> : null}
    {page && page.total > page.size ? <div className="flex items-center justify-between gap-2 pt-2">
      <span className="text-type-metadata text-nite-text-muted">Página {page.page + 1} de {listPageCount}</span>
      <div className="flex gap-1">
        <PageLink href={pathWith({ view: "management", mode: "meeting", range: props.rangeKey, listPage: String(page.page - 1), listStatus: props.listStatus }, props.synthetic)} disabled={page.page <= 0}>Anterior</PageLink>
        <PageLink href={pathWith({ view: "management", mode: "meeting", range: props.rangeKey, listPage: String(page.page + 1), listStatus: props.listStatus }, props.synthetic)} disabled={page.page + 1 >= listPageCount}>Próxima</PageLink>
      </div>
    </div> : null}
  </section>;
}

function MeetingDetail({ props, now }: { props: WorkspaceProps; now: number | null }) {
  const list = props.selectedList;
  if (!list) return null;
  const state = listState(list, now);
  const remaining = now === null ? null : Math.max(0, Date.parse(list.confirmationDeadline) - now);
  const open = list.status === "ABERTA";
  const outcomeDefault = list.classification === "REGULAR" || list.countsForFrequency ? "REALIZADA_CONTABILIZAVEL" : "REALIZADA_NAO_CONTABILIZAVEL";
  return <section aria-label="Detalhes da lista" className="min-w-0 border-t border-nite-border-soft pt-5 xl:border-t-0 xl:pt-0">
    <Link href={pathWith({ view: "management", mode: "meeting", range: props.rangeKey, listStatus: props.listStatus, list: "" }, props.synthetic)} className="mb-3 inline-flex min-h-9 items-center gap-2 rounded-control pr-2 text-type-metadata font-medium text-nite-brand-primary hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus xl:hidden"><Icon name="arrow-left" className="size-4" />Voltar às listas</Link>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><StateLabel tone={state.tone}>{state.label}</StateLabel><span className="text-type-metadata text-nite-text-muted">{listClassLabel(list)}</span></div>
        <h2 className="mt-2 break-words font-display text-type-section-title text-nite-text-primary">{list.meetingName}</h2>
        <p className="mt-2 text-type-body-compact text-nite-text-secondary">Responsável: {list.openedBy.displayName}</p>
        <p className="mt-1 text-type-metadata text-nite-text-muted">Aberta em {formatFrequencyDate(list.openedAt, { dateStyle: "medium", timeStyle: "short" })}{list.closedAt ? " · Concluída em " + formatFrequencyDate(list.closedAt, { dateStyle: "medium", timeStyle: "short" }) : ""}</p>
        <p className="mt-1 text-type-metadata text-nite-text-muted">Janela total de {list.confirmationWindowMinutes} minutos · até {formatFrequencyDate(list.confirmationDeadline, { dateStyle: "short", timeStyle: "short" })}</p>
      </div>
      {open ? <div className="flex flex-wrap items-center gap-2">
        <form action={props.synthetic ? undefined : renewFrequencyListQr}>
          <input type="hidden" name="listId" value={list.listId} />
          <input type="hidden" name="expectedVersion" value={String(list.version)} />
          <Button type="submit" variant="secondary" disabled={props.synthetic}>Projetar QR</Button>
        </form>
        <details className="relative">
          <summary className="flex min-h-10 cursor-pointer list-none items-center rounded-control px-3 text-type-body-compact font-medium text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus [&::-webkit-details-marker]:hidden">Concluir</summary>
          <form action={props.synthetic ? undefined : finalizeFrequencyList} className="absolute right-0 top-full z-10 mt-1 grid min-w-64 gap-3 rounded-panel border border-nite-border-soft bg-nite-background p-3 shadow-nite-floating">
            <input type="hidden" name="listId" value={list.listId} />
            <input type="hidden" name="expectedVersion" value={String(list.version)} />
            <label className="grid gap-1.5 text-type-metadata text-nite-text-secondary">Resultado
              <Select name="outcome" defaultValue={outcomeDefault}>
                <option value="REALIZADA_CONTABILIZAVEL">Realizada e contabilizável</option>
                {list.classification === "EXCEPTIONAL" ? <option value="REALIZADA_NAO_CONTABILIZAVEL">Realizada, não contabilizável</option> : null}
                <option value="NAO_REALIZADA">Não realizada</option>
              </Select>
            </label>
            <Button type="submit" disabled={props.synthetic}>Confirmar conclusão</Button>
          </form>
        </details>
        <form action={props.synthetic ? undefined : cancelFrequencyList} onSubmit={(event) => { if (!props.synthetic && !window.confirm("Cancelar esta lista e retirar o encontro da apuração?")) event.preventDefault(); }}>
          <input type="hidden" name="listId" value={list.listId} />
          <input type="hidden" name="expectedVersion" value={String(list.version)} />
          <input type="hidden" name="confirmed" value="true" />
          <Button type="submit" variant="secondary" disabled={props.synthetic}>Cancelar</Button>
        </form>
      </div> : null}
    </header>
    {open ? <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-type-body-compact">
      <StateLabel tone={remaining !== null && remaining === 0 ? "warning" : "info"}>{remaining === null ? "Tempo restante —:—" : remaining === 0 ? "Janela encerrada · aguardando conclusão" : "Tempo restante " + remainingLabel(remaining)}</StateLabel>
      {list.qr ? <span className="text-type-metadata text-nite-text-muted">{Date.parse(list.qr.expiresAt) <= (now ?? 0) ? "QR expirado · a lista permanece aberta" : "QR vigente até " + formatFrequencyDate(list.qr.expiresAt, { hour: "2-digit", minute: "2-digit" })}</span> : <span className="text-type-metadata text-nite-text-muted">Emissão do QR pendente</span>}
    </div> : null}
    {open && props.participants?.counts ? <p className="mt-3 text-type-body-compact text-nite-text-secondary">Confirmações recebidas: <strong className="text-nite-text-primary">{props.participants.counts.present}</strong> de {props.participants.counts.rosterTotal}</p> : null}
    <div className="mt-4"><Issue issue={props.participantsIssue} /><GlobalParticipantCounts page={props.participants} open={open} confirmations={props.participants?.counts.present ?? 0} /></div>
      <ParticipantRoster key={props.participantSearch + ":" + props.participantStatus} props={props} list={list} now={now} />
  </section>;
}

function MeetingMode({ props }: { props: WorkspaceProps }) {
  const [openKey, setOpenKey] = useState(props.openKey);
  const now = useNow();
  const selected = props.selectedList;
  const gridClass = selected
    ? "grid min-w-0 gap-7 xl:grid-cols-[minmax(17rem,.78fr)_minmax(0,1.6fr)]"
    : "grid min-w-0 gap-7";
  return <div className="grid min-w-0 gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-type-body-compact text-nite-text-secondary">Frequência por reunião</p><RangeControl props={props} /></div>
    <div className={cx(selected && "hidden xl:block")}><CreateList props={props} openKey={openKey} setOpenKey={setOpenKey} /></div>
    {props.error ? <p role="alert" className="text-type-body-compact text-status-warning">{({
      access: "Esta operação não está autorizada para sua conta.",
      conflict: "A lista mudou durante a operação. Atualize e confira a situação atual.",
      invalid: "A operação não foi aceita. Confira os dados e o resultado selecionado.",
      unavailable: "Não foi possível confirmar o resultado da operação. Atualize a lista antes de tentar novamente.",
      qr: "A lista foi aberta, mas o QR ainda não foi emitido. Selecione a lista para tentar novamente.",
      origin: "A origem do NITE Connect não está configurada para projetar o QR.",
    } as Record<string, string>)[props.error] ?? "Não foi possível concluir esta operação."}</p> : null}
    {props.notice ? <p role="status" className="text-type-body-compact text-status-done">{({
      finalized: "Lista concluída e atualizada pelo servidor.",
      canceled: "Lista cancelada e atualizada pelo servidor.",
      updated: "Situação do integrante atualizada pelo servidor.",
    } as Record<string, string>)[props.notice] ?? "Operação concluída."}</p> : null}
    <div className={gridClass}>
      <div className={cx(selected && "hidden xl:block")}><MeetingList props={props} now={now} /></div>
      {selected ? <MeetingDetail props={props} now={now} /> : null}
    </div>
  </div>;
}

function ViewNavigation({ props, view }: { props: WorkspaceProps; view: "personal" | "management" }) {
  if (!props.manager) return null;
  return <nav aria-label="Visões de Frequência" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
    <div className="flex min-w-max items-center gap-1">
      <Link href={pathWith({ view: "personal", range: props.rangeKey }, props.synthetic)} aria-current={view === "personal" ? "page" : undefined} className={cx("inline-flex min-h-10 items-center rounded-control px-3 text-type-body-compact font-medium focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus", view === "personal" ? "bg-nite-brand-soft text-nite-brand-primary" : "text-nite-text-secondary hover:bg-nite-surface-subtle")}>Visão pessoal</Link>
      <Link href={pathWith({ view: "management", mode: props.mode, range: props.rangeKey }, props.synthetic)} aria-current={view === "management" ? "page" : undefined} className={cx("inline-flex min-h-10 items-center rounded-control px-3 text-type-body-compact font-medium focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus", view === "management" ? "bg-nite-brand-soft text-nite-brand-primary" : "text-nite-text-secondary hover:bg-nite-surface-subtle")}>Gestão coletiva</Link>
    </div>
    {view === "management" ? <div className="flex min-w-max items-center gap-1 border-l border-nite-border-soft pl-2">
      <Link href={pathWith({ view: "management", mode: "meeting", range: props.rangeKey, listStatus: props.listStatus }, props.synthetic)} aria-current={props.mode === "meeting" ? "page" : undefined} className={cx("inline-flex min-h-10 items-center px-2 text-type-body-compact focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus", props.mode === "meeting" ? "font-semibold text-nite-text-primary underline decoration-nite-brand-accent decoration-2 underline-offset-4" : "text-nite-text-secondary hover:text-nite-text-primary")}>Por reunião</Link>
      <Link href={pathWith({ view: "management", mode: "member", range: props.rangeKey, memberId: "" }, props.synthetic)} aria-current={props.mode === "member" ? "page" : undefined} className={cx("inline-flex min-h-10 items-center px-2 text-type-body-compact focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus", props.mode === "member" ? "font-semibold text-nite-text-primary underline decoration-nite-brand-accent decoration-2 underline-offset-4" : "text-nite-text-secondary hover:text-nite-text-primary")}>Por integrante</Link>
    </div> : null}
  </nav>;
}

export function FrequencyWorkspace(props: WorkspaceProps) {
  const [scannerList, setScannerList] = useState<PersonalOpenList | null>(null);
  const view = props.manager && props.view === "management" ? "management" : "personal";
  return <div className="grid min-w-0 gap-6 sm:gap-7">
    <header className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-type-page-title text-nite-text-primary">Frequência</h1>
        <p className="mt-2 max-w-2xl text-type-body-compact text-nite-text-secondary">Consulte a frequência do período, acompanhe reuniões e confirme sua presença.</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <ViewNavigation props={props} view={view} />
      </div>
    </header>
    {view === "personal" ? <PersonalView props={props} onScan={setScannerList} /> : props.mode === "member" ? <MemberMode key={props.memberSearch} props={props} /> : <MeetingMode props={props} />}
    {scannerList ? <QrScanner listId={scannerList.listId} meetingName={scannerList.meetingName} onClose={() => setScannerList(null)} /> : null}
  </div>;
}
