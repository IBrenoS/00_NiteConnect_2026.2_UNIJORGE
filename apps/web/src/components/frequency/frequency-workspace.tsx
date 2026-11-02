"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Badge, Select, TextField } from "../ui";
import { QrScanner } from "./qr-scanner";
import { cancelFrequencyList, changeFrequencyParticipant, finalizeFrequencyList, openFrequencyList, renewFrequencyListQr } from "../../lib/frequency/actions";
import type { CollectiveSummaryRow, FrequencyList, FrequencyPage, FrequencySummary, HistoryEntry, Participant } from "../../lib/frequency/contracts";
import type { AgendaEvent } from "../../lib/frequency/data";
import { formatFrequencyDate, type FrequencyGroupBy } from "../../lib/frequency/query";

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
  unavailable: "A API de Frequência não respondeu. Tente novamente em instantes.",
  invalid: "A API retornou dados em um formato inesperado.",
};

function Icon({ name }: { name: "scan" | "calendar" | "arrow" | "check" }) {
  const paths = {
    scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M8 8h8v8H8z" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]">{paths[name]}</svg>;
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

function PageLink({ href, children, disabled = false }: { href: string; children: string; disabled?: boolean }) {
  return disabled ? <span aria-disabled="true" className="inline-flex min-h-10 items-center rounded-control border border-nite-border-soft px-3 text-type-metadata text-nite-text-muted">{children}</span> : <Link href={href} className="inline-flex min-h-10 items-center rounded-control border border-nite-border-strong px-3 text-type-metadata font-medium text-nite-text-secondary transition-colors hover:bg-nite-surface-subtle hover:text-nite-text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">{children}</Link>;
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

function HistoryRows({ page, pageNumber, params }: { page: FrequencyPage<HistoryEntry> | null; pageNumber: number; params: Record<string, string | undefined> }) {
  if (!page || page.items.length === 0) return <p className="rounded-panel border border-dashed border-nite-border-strong px-4 py-8 text-center text-type-body-compact text-nite-text-muted">Nenhuma reunião aparece neste período.</p>;
  return <>
    <ol className="divide-y divide-nite-border-soft border-y border-nite-border-soft" aria-label="Histórico de Frequência">
      {page.items.map((item) => <li key={item.listId} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-5">
        <div className="flex min-w-0 items-start gap-3"><span className="mt-1 grid size-8 shrink-0 place-items-center rounded-control bg-nite-surface-elevated text-nite-brand-accent"><Icon name="calendar" /></span><div className="min-w-0"><p className="truncate text-type-body-compact font-medium text-nite-text-primary">{item.meetingName}</p><p className="mt-0.5 text-type-metadata text-nite-text-muted">{formatFrequencyDate(item.occurredAt, { dateStyle: "medium", timeStyle: "short" })}</p></div></div>
        <Status status={item.status} inApuration={item.inApuration} />
        <p className="text-type-metadata text-nite-text-secondary sm:text-right">{item.confirmedAt ? `Confirmada às ${formatFrequencyDate(item.confirmedAt, { hour: "2-digit", minute: "2-digit" })}` : "Sem horário de confirmação"}</p>
      </li>)}
    </ol>
    {page.total > page.size ? <div className="flex items-center justify-between gap-3"><span className="text-type-metadata text-nite-text-muted">Página {pageNumber + 1} de {Math.ceil(page.total / page.size)}</span><div className="flex gap-2"><PageLink href={pathWith({ ...params, historyPage: String(pageNumber - 1) })} disabled={pageNumber <= 0}>Anterior</PageLink><PageLink href={pathWith({ ...params, historyPage: String(pageNumber + 1) })} disabled={(pageNumber + 1) * page.size >= page.total}>Próxima</PageLink></div></div> : null}
  </>;
}

function PersonalView({ props }: { props: WorkspaceProps }) {
  const summary = props.personalSummary;
  const counts = summary?.counts;
  return <div className="grid gap-8">
    <section aria-labelledby="personal-summary-title" className="grid gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-type-metadata font-medium uppercase tracking-[0.12em] text-nite-text-muted">Acompanhamento pessoal</p><h2 id="personal-summary-title" className="mt-1 font-display text-type-section-title text-nite-text-primary">Sua assiduidade</h2></div><PeriodSelect props={props} hidden={{ view: "personal" }} /></div>
      <Issue issue={props.summaryIssue} />
      {counts ? <div className="flex min-w-0 flex-col gap-4 rounded-panel border border-nite-border-soft bg-nite-surface px-4 py-4 sm:flex-row sm:items-center sm:gap-7 sm:px-5">
        <div className="flex items-baseline gap-3"><span className="font-display text-4xl font-semibold tracking-tight text-nite-text-primary sm:text-5xl">{counts.noEligibleMeetings || counts.attendancePercentage === null ? "—" : `${Number(counts.attendancePercentage).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}</span><span className="text-type-metadata text-nite-text-muted">comparecimento real</span></div>
        <div className="h-px w-full bg-nite-border-soft sm:h-10 sm:w-px" />
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-type-body-compact"><div><dt className="inline text-nite-text-muted">Presenças </dt><dd className="inline font-semibold text-nite-text-primary">{counts.present}</dd></div><div><dt className="inline text-nite-text-muted">Justificadas </dt><dd className="inline font-semibold text-nite-text-primary">{counts.justified}</dd></div><div><dt className="inline text-nite-text-muted">Ausências </dt><dd className="inline font-semibold text-nite-text-primary">{counts.unjustifiedAbsences}</dd></div><div><dt className="inline text-nite-text-muted">Reuniões elegíveis </dt><dd className="inline font-semibold text-nite-text-primary">{counts.eligibleMeetings}</dd></div></dl>
        {counts.noEligibleMeetings ? <p className="w-full text-type-metadata text-nite-text-muted sm:ml-auto sm:w-auto sm:max-w-44 sm:text-right">Sem reuniões elegíveis no período; o percentual não é calculado.</p> : null}
      </div> : !props.summaryIssue ? <p className="text-type-body-compact text-nite-text-muted">O resumo ainda não está disponível.</p> : null}
    </section>
    <section aria-labelledby="personal-history-title" className="grid gap-4">
      <div><p className="text-type-metadata font-medium uppercase tracking-[0.12em] text-nite-text-muted">Linha do tempo</p><h2 id="personal-history-title" className="mt-1 font-display text-type-section-title text-nite-text-primary">Histórico de reuniões</h2></div>
      <Issue issue={props.historyIssue} />
      <HistoryRows page={props.historyPage} pageNumber={props.selectedHistoryPage} params={{ view: "personal", range: props.rangeKey }} />
      <p className="text-type-metadata text-nite-text-muted">O histórico informa situação e confirmação. Quando a API marca um item fora da apuração, ela não expõe aqui o motivo específico.</p>
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
  const [scannerOpen, setScannerOpen] = useState(false);
  const view = props.manager && props.view === "management" ? "management" : "personal";
  const errorLabels: Record<string, string> = { access: "A operação não está autorizada.", conflict: "A lista mudou. Recarregue os dados antes de tentar novamente.", invalid: "A API recusou os dados. Confira nome, janela e classificação.", unavailable: "A API não respondeu; verifique a operação antes de repeti-la.", qr: "A lista foi aberta, mas a primeira emissão do QR falhou. Acesse a lista para renovar o código." };
  const noticeLabels: Record<string, string> = { finalized: "Lista concluída. A apuração e as ausências foram definidas pelo backend.", canceled: "Lista cancelada; o backend retirou o encontro da apuração.", updated: "Situação atualizada pela gestão." };
  return <div className="grid min-w-0 gap-6 sm:gap-8">
    <header className="flex min-w-0 flex-col gap-4 border-b border-nite-border-soft pb-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between xl:flex-nowrap">
      <div className="min-w-0"><p className="text-type-metadata font-medium uppercase tracking-[0.14em] text-nite-brand-accent">Meu espaço · B04</p><h1 className="mt-1 font-display text-type-page-title text-nite-text-primary">Frequência</h1><p className="mt-2 max-w-2xl text-type-body-compact text-nite-text-secondary">Acompanhe presenças por reunião e confirme apenas a sua participação.</p></div>
      {!props.manager || view === "personal" ? <Button type="button" leadingIcon={<Icon name="scan" />} onClick={() => setScannerOpen(true)} disabled={props.synthetic} className="w-full sm:w-auto">Escanear QR Code</Button> : null}
      {props.manager ? <nav aria-label="Área de Frequência" className="flex min-w-0 flex-wrap gap-1 rounded-control border border-nite-border-soft bg-nite-surface p-1"><Link href={pathWith({ view: "personal", range: props.rangeKey })} aria-current={view === "personal" ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-control px-3 text-type-body-compact font-medium focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${view === "personal" ? "bg-nite-brand-soft text-nite-brand-primary" : "text-nite-text-secondary hover:bg-nite-surface-subtle"}`}>Visão pessoal</Link><Link href={pathWith({ view: "management", mode: props.mode, range: props.rangeKey })} aria-current={view === "management" ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-control px-3 text-type-body-compact font-medium focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${view === "management" ? "bg-nite-brand-soft text-nite-brand-primary" : "text-nite-text-secondary hover:bg-nite-surface-subtle"}`}>Gestão coletiva</Link></nav> : null}
    </header>
    {props.error ? <p role="alert" className="rounded-control border border-status-warning-border bg-status-warning-soft px-3 py-2.5 text-type-body-compact text-status-warning">{errorLabels[props.error] ?? "Não foi possível concluir a operação."}</p> : null}
    {props.notice ? <p role="status" className="rounded-control border border-status-done-border bg-status-done-soft px-3 py-2.5 text-type-body-compact text-status-done">{noticeLabels[props.notice] ?? "Operação concluída."}</p> : null}
    {view === "personal" ? <PersonalView props={props} /> : <>
      <nav aria-label="Modo de acompanhamento coletivo" className="flex flex-wrap gap-2 border-b border-nite-border-soft pb-2"><Link href={pathWith({ view: "management", mode: "meeting", range: props.rangeKey })} aria-current={props.mode === "meeting" ? "page" : undefined} className={`inline-flex min-h-10 items-center gap-2 rounded-control px-3 text-type-body-compact focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${props.mode === "meeting" ? "bg-nite-brand-soft font-medium text-nite-brand-primary" : "text-nite-text-secondary hover:bg-nite-surface-subtle"}`}><Icon name="calendar" />Por reunião</Link><Link href={pathWith({ view: "management", mode: "member", range: props.rangeKey })} aria-current={props.mode === "member" ? "page" : undefined} className={`inline-flex min-h-10 items-center gap-2 rounded-control px-3 text-type-body-compact focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${props.mode === "member" ? "bg-nite-brand-soft font-medium text-nite-brand-primary" : "text-nite-text-secondary hover:bg-nite-surface-subtle"}`}>Por integrante</Link></nav>
      {props.mode === "member" ? <MemberMode props={props} /> : <MeetingMode props={props} />}
    </>}
    {scannerOpen ? <QrScanner onClose={() => setScannerOpen(false)} /> : null}
  </div>;
}
