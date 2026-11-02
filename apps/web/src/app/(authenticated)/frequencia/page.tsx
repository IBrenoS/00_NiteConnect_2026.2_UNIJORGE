import type { Metadata } from "next";
import { FrequencyWorkspace } from "../../../components/frequency/frequency-workspace";
import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getAgendaEvents, getCollectiveFrequencySummary, getCollectiveMemberHistory, getFrequencyList, getFrequencyLists, getFrequencyParticipants, getPersonalFrequencyHistory, getPersonalFrequencySummary, getPersonalOpenLists } from "../../../lib/frequency/data";
import { canManageFrequency, currentBahiaMonth, currentBahiaSemester, periodFromSelection, type FrequencyGroupBy } from "../../../lib/frequency/query";

export const metadata: Metadata = { title: "Frequência" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type PageProps = { searchParams: SearchParams };
type ApiIssue = "access" | "not-found" | "unavailable" | "invalid" | null;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pageNumber(value: string | undefined): number {
  if (!value || !/^(0|[1-9]\d{0,5})$/.test(value)) return 0;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 0;
}

function localToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value ?? "1970"}-${parts.find((part) => part.type === "month")?.value ?? "01"}-${parts.find((part) => part.type === "day")?.value ?? "01"}`;
}

function parseRange(raw: string | undefined): { key: string; groupBy: FrequencyGroupBy; selection: string; from: string; to: string } {
  const fallback = `${currentBahiaMonth()}`;
  const match = /^(MONTH|SEMESTER):(.+)$/.exec(raw ?? "");
  const groupBy = match?.[1] === "SEMESTER" ? "SEMESTER" : "MONTH";
  const selection = match?.[2] ?? (groupBy === "MONTH" ? fallback : currentBahiaSemester());
  const period = periodFromSelection(selection, groupBy);
  if (!period) {
    const from = periodFromSelection(fallback, "MONTH");
    return { key: `MONTH:${fallback}`, groupBy: "MONTH", selection: fallback, from: from!.from, to: from!.to };
  }
  return { key: `${groupBy}:${selection}`, groupBy, selection, from: period.from, to: period.to };
}

function issue(value: ApiIssue | undefined): ApiIssue {
  return value ?? null;
}

export default async function FrequencyPage({ searchParams }: PageProps) {
  const [params, session] = await Promise.all([searchParams, requireAuthenticatedNiteSession()]);
  const canManage = canManageFrequency(session.roles);
  const requestedView = first(params.view);
  const view = canManage && requestedView === "management" ? "management" : "personal";
  const mode = first(params.mode) === "member" ? "member" : "meeting";
  const range = parseRange(first(params.range));
  const requestedOpenKey = first(params.openKey) ?? "";
  const openKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedOpenKey) ? requestedOpenKey : crypto.randomUUID();
  const historyPage = pageNumber(first(params.historyPage));
  const collectivePage = pageNumber(first(params.collectivePage));
  const memberHistoryPage = pageNumber(first(params.memberHistoryPage));
  const listPage = pageNumber(first(params.listPage));
  const participantPage = pageNumber(first(params.participantPage));
  const selectedMemberId = first(params.memberId) ?? "";
  const listId = first(params.list);
  const validListId = listId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(listId) ? listId : "";
  const participantStatusRaw = first(params.participantStatus) ?? "";
  const participantStatus = ["AGUARDANDO", "PRESENTE", "JUSTIFICADO", "AUSENTE"].includes(participantStatusRaw) ? participantStatusRaw : "";
  const listStatusRaw = first(params.listStatus) ?? "";
  const listStatus = ["ABERTA", "CONCLUIDA", "CANCELADA"].includes(listStatusRaw) ? listStatusRaw : undefined;
  const participantSearch = (first(params.participantSearch) ?? "").trim().slice(0, 120);
  const memberSearch = (first(params.memberSearch) ?? "").trim().slice(0, 120);
  const today = localToday();
  const personalDataPromise = Promise.all([
    getPersonalFrequencySummary(session.bearer, range.from, range.to, range.groupBy),
    getPersonalFrequencyHistory(session.bearer, range.from, range.to, historyPage),
  ]);
  const openListsPromise = view === "personal" ? getPersonalOpenLists(session.bearer) : Promise.resolve({ data: null, issue: null } as const);
  const managerDataPromise = (async () => {
    if (view !== "management") return { kind: "none" as const };
    if (mode === "meeting") {
      const [lists, events, selectedList, participants] = await Promise.all([
        getFrequencyLists(session.bearer, range.from, range.to, listPage, listStatus),
        getAgendaEvents(session.bearer, today, today),
        validListId ? getFrequencyList(session.bearer, validListId) : Promise.resolve({ data: null, issue: null } as const),
        validListId ? getFrequencyParticipants(session.bearer, validListId, participantPage, participantStatus || undefined, participantSearch || undefined) : Promise.resolve({ data: null, issue: null } as const),
      ]);
      return { kind: "meeting" as const, lists, events, selectedList, participants };
    }
    const [collective, memberHistory] = await Promise.all([
      getCollectiveFrequencySummary(session.bearer, range.from, range.to, collectivePage, memberSearch || undefined),
      selectedMemberId ? getCollectiveMemberHistory(session.bearer, selectedMemberId, range.from, range.to, memberHistoryPage) : Promise.resolve({ data: null, issue: null } as const),
    ]);
    return { kind: "member" as const, collective, memberHistory };
  })();
  const [personalData, managerData, openLists] = await Promise.all([personalDataPromise, managerDataPromise, openListsPromise]);
  const personalSummary = personalData[0];
  const personalHistory = personalData[1];
  const lists = managerData.kind === "meeting" ? managerData.lists : null;
  const events = managerData.kind === "meeting" ? managerData.events : null;
  const selectedList = managerData.kind === "meeting" ? managerData.selectedList : null;
  const participants = managerData.kind === "meeting" ? managerData.participants : null;
  const collective = managerData.kind === "member" ? managerData.collective : null;
  const memberHistory = managerData.kind === "member" ? managerData.memberHistory : null;

  return <FrequencyWorkspace
    manager={canManage}
    view={view}
    mode={mode}
    groupBy={range.groupBy}
    rangeKey={range.key}
    openKey={openKey}
    from={range.from}
    to={range.to}
    historyPage={personalHistory.data}
    historyIssue={issue(personalHistory.issue)}
    personalSummary={personalSummary.data}
    summaryIssue={issue(personalSummary.issue)}
    openLists={openLists.data}
    openListsIssue={issue(openLists.issue)}
    selectedHistoryPage={historyPage}
    lists={lists?.data ?? null}
    listIssue={issue(lists?.issue)}
    selectedList={selectedList?.data ?? null}
    participants={participants?.data ?? null}
    participantsIssue={issue(participants?.issue)}
    participantPage={participantPage}
    participantStatus={participantStatus}
    participantSearch={participantSearch}
    listStatus={listStatus ?? ""}
    events={events?.data?.items ?? []}
    collective={collective?.data ?? null}
    collectiveIssue={issue(collective?.issue)}
    collectivePage={collectivePage}
    memberSearch={memberSearch}
    selectedMemberId={selectedMemberId}
    memberHistory={memberHistory?.data ?? null}
    memberHistoryIssue={issue(memberHistory?.issue)}
    memberHistoryPage={memberHistoryPage}
    notice={first(params.notice) ?? ""}
    error={first(params.error) ?? ""}
  />;
}
