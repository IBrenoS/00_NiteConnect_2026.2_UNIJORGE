import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthenticatedShell } from "../../../components/shell/authenticated-shell";
import { FrequencyWorkspace } from "../../../components/frequency/frequency-workspace";
import { ProjectorPreview } from "../../../components/frequency/projector-preview";
import { previewAgendaEvents, previewCollectiveSummary, previewEmptyFrequencySummary, previewFrequencyHistory, previewFrequencyList, previewFrequencyLists, previewFrequencyParticipants, previewFrequencySummary, previewPersonalConfirmedOpenList, previewPersonalOpenList } from "../../../lib/frequency/preview-fixtures";
import { frequencyScanUrl } from "../../../lib/frequency/qr";
import { qrSvg } from "../../../lib/frequency/qr-image";
import type { NiteMember } from "../../../lib/auth/identity";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prévia sintética de Frequência" };
const member: NiteMember = { id: "83000000-0000-4000-8000-000000000901", name: "Breno Oliveira", institutionalEmail: "preview@example.invalid", status: "ATIVO" };
const history = previewFrequencyHistory;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function banner() {
  return <div role="note" className="border-b border-status-warning-border bg-status-warning-soft px-4 py-2 text-center text-type-metadata font-medium text-status-warning sm:pl-[calc(250px+1rem)]">Prévia de desenvolvimento — dados sintéticos; controles de escrita desativados; sem persistência institucional.</div>;
}

export default async function SyntheticFrequencyPreview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const rawSurface = typeof params.surface === "string" ? params.surface : "personal";
  const surface = ["meeting", "member", "projector", "create"].includes(rawSurface) ? rawSurface : "personal";
  const rawCase = first(params.case) ?? "available";
  const previewCase = ["available", "confirmed", "history", "empty", "uncountable"].includes(rawCase) ? rawCase : "available";
  const memberSearch = (first(params.memberSearch) ?? "").trim().slice(0, 120);
  const participantSearch = (first(params.participantSearch) ?? "").trim().slice(0, 120);
  const requestedParticipantStatus = first(params.participantStatus) ?? "";
  const participantStatus = ["PRESENTE", "JUSTIFICADO", "AUSENTE", "AGUARDANDO"].includes(requestedParticipantStatus) ? requestedParticipantStatus : "";
  const requestedListStatus = first(params.listStatus) ?? "";
  const listStatus = ["ABERTA", "CONCLUIDA", "CANCELADA"].includes(requestedListStatus) ? requestedListStatus : "";
  const collectiveItems = previewCollectiveSummary.items.filter((row) => !memberSearch || row.displayName.toLocaleLowerCase("pt-BR").includes(memberSearch.toLocaleLowerCase("pt-BR")));
  const participantItems = previewFrequencyParticipants.items.filter((row) => (!participantSearch || row.displayName.toLocaleLowerCase("pt-BR").includes(participantSearch.toLocaleLowerCase("pt-BR"))) && (!participantStatus || row.status === participantStatus));
  const listItems = previewFrequencyLists.items.filter((list) => !listStatus || list.status === listStatus);
  const lists = { ...previewFrequencyLists, items: listItems, total: listItems.length };
  const participants = { ...previewFrequencyParticipants, items: participantItems, total: participantItems.length, pageCount: participantItems.length ? 1 : 0 };
  const collective = { ...previewCollectiveSummary, items: collectiveItems, total: collectiveItems.length };
  const selectedMemberId = params.memberId !== undefined
    ? first(params.memberId) ?? ""
    : surface === "member" ? previewCollectiveSummary.items[4]?.memberId ?? "" : "";
  const selectedListId = params.list !== undefined ? first(params.list) : undefined;
  const selectedList = selectedListId === undefined
    ? surface === "meeting" || surface === "create" ? previewFrequencyList : null
    : previewFrequencyLists.items.find((list) => list.listId === selectedListId) ?? null;
  if (surface === "projector") {
    const svg = qrSvg(frequencyScanUrl("A".repeat(43), "https://nite-connect.example.invalid", previewFrequencyList.listId));
    return <><div role="note" className="fixed left-0 right-0 top-0 z-10 bg-status-warning-soft px-4 py-2 text-center text-type-metadata font-semibold text-status-warning">Prévia de desenvolvimento · QR sintético, não válido na API.</div><ProjectorPreview svg={svg} /></>;
  }
  const personalHistory = previewCase === "empty" ? { items: [], page: 0, size: 20, total: 0 } : previewCase === "uncountable" ? { ...history, items: history.items.filter((item) => !item.inApuration), total: history.items.filter((item) => !item.inApuration).length } : history;
  const personalSummary = previewCase === "empty" || previewCase === "uncountable" ? previewEmptyFrequencySummary : previewFrequencySummary;
  const openLists = previewCase === "available" ? [previewPersonalOpenList] : previewCase === "confirmed" ? [previewPersonalConfirmedOpenList] : [];
  const workspace = <FrequencyWorkspace
    manager
    view={surface === "meeting" || surface === "member" || surface === "create" ? "management" : "personal"}
    mode={surface === "member" ? "member" : "meeting"}
    groupBy="MONTH"
    rangeKey="MONTH:2026-11"
    openKey="83000000-0000-4000-8000-000000000901"
    from="2026-11-01"
    to="2026-11-30"
    historyPage={surface === "personal" ? personalHistory : history}
    historyIssue={null}
    personalSummary={surface === "personal" ? personalSummary : previewFrequencySummary}
    summaryIssue={null}
    openLists={surface === "personal" ? openLists : []}
    openListsIssue={null}
    selectedHistoryPage={0}
    lists={lists}
    listIssue={null}
    selectedList={selectedList}
    participants={participants}
    participantsIssue={null}
    participantPage={0}
    participantStatus={participantStatus}
    participantSearch={participantSearch}
    listStatus={listStatus}
    events={previewAgendaEvents}
    collective={collective}
    collectiveIssue={null}
    collectivePage={0}
    memberSearch={memberSearch}
    selectedMemberId={selectedMemberId}
    memberHistory={surface === "member" ? history : null}
    memberHistoryIssue={null}
    memberHistoryPage={0}
    notice=""
    error=""
    synthetic
    syntheticOpenCreate={surface === "create"}
  />;
  return <>{banner()}<AuthenticatedShell member={member} roles={["COORDENADOR"]} projects={[]} leadershipProjectsUnavailable={false}><div className="mb-5 flex flex-wrap gap-2 text-type-metadata"><Link href="/dev-preview/frequencia?surface=personal&case=available" aria-current={surface === "personal" && previewCase === "available" ? "page" : undefined} className="rounded-control border border-nite-border-soft px-3 py-2">Pessoal · disponível</Link><Link href="/dev-preview/frequencia?surface=personal&case=confirmed" aria-current={surface === "personal" && previewCase === "confirmed" ? "page" : undefined} className="rounded-control border border-nite-border-soft px-3 py-2">Presença confirmada</Link><Link href="/dev-preview/frequencia?surface=personal&case=history" aria-current={surface === "personal" && previewCase === "history" ? "page" : undefined} className="rounded-control border border-nite-border-soft px-3 py-2">Histórico</Link><Link href="/dev-preview/frequencia?surface=personal&case=empty" aria-current={surface === "personal" && previewCase === "empty" ? "page" : undefined} className="rounded-control border border-nite-border-soft px-3 py-2">Sem reuniões</Link><Link href="/dev-preview/frequencia?surface=personal&case=uncountable" aria-current={surface === "personal" && previewCase === "uncountable" ? "page" : undefined} className="rounded-control border border-nite-border-soft px-3 py-2">Sem contabilizáveis</Link><Link href="/dev-preview/frequencia?surface=meeting" className="rounded-control border border-nite-border-soft px-3 py-2">Gestão · reunião</Link><Link href="/dev-preview/frequencia?surface=member" className="rounded-control border border-nite-border-soft px-3 py-2">Gestão · integrante</Link><Link href="/dev-preview/frequencia?surface=create" className="rounded-control border border-nite-border-soft px-3 py-2">Gestão · criar lista</Link><Link href="/dev-preview/frequencia?surface=projector" className="rounded-control border border-nite-border-soft px-3 py-2">Gestão · projeção</Link></div>{workspace}</AuthenticatedShell></>;
}
