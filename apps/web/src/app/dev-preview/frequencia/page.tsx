import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthenticatedShell } from "../../../components/shell/authenticated-shell";
import { FrequencyWorkspace } from "../../../components/frequency/frequency-workspace";
import { ProjectorPreview } from "../../../components/frequency/projector-preview";
import { previewAgendaEvents, previewCollectiveSummary, previewFrequencyHistory, previewFrequencyList, previewFrequencyLists, previewFrequencyParticipants, previewFrequencySummary } from "../../../lib/frequency/preview-fixtures";
import { frequencyScanUrl } from "../../../lib/frequency/qr";
import { qrSvg } from "../../../lib/frequency/qr-image";
import type { NiteMember } from "../../../lib/auth/identity";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prévia sintética de Frequência" };
const member: NiteMember = { id: "83000000-0000-4000-8000-000000000901", name: "Breno Oliveira", institutionalEmail: "preview@example.invalid", status: "ATIVO" };
const rangeOptions = [{ value: "MONTH:2026-11", label: "Novembro de 2026" }, { value: "SEMESTER:2026-S2", label: "2º semestre de 2026" }];
const history = previewFrequencyHistory;

function banner() {
  return <div role="note" className="border-b border-status-warning-border bg-status-warning-soft px-4 py-2 text-center text-type-metadata font-medium text-status-warning sm:pl-[calc(250px+1rem)]">Prévia de desenvolvimento — dados sintéticos; controles de escrita desativados; sem persistência institucional.</div>;
}

export default async function SyntheticFrequencyPreview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const rawSurface = typeof params.surface === "string" ? params.surface : "personal";
  const surface = ["meeting", "member", "projector", "create"].includes(rawSurface) ? rawSurface : "personal";
  if (surface === "projector") {
    const svg = qrSvg(frequencyScanUrl("A".repeat(43), "https://nite-connect.example.invalid"));
    return <><div role="note" className="fixed left-0 right-0 top-0 z-10 bg-status-warning-soft px-4 py-2 text-center text-type-metadata font-semibold text-status-warning">Prévia de desenvolvimento · QR sintético, não válido na API.</div><ProjectorPreview svg={svg} /></>;
  }
  const workspace = <FrequencyWorkspace
    manager
    view={surface === "meeting" || surface === "member" || surface === "create" ? "management" : "personal"}
    mode={surface === "member" ? "member" : "meeting"}
    groupBy="MONTH"
    rangeKey="MONTH:2026-11"
    openKey="83000000-0000-4000-8000-000000000901"
    rangeOptions={rangeOptions}
    from="2026-11-01"
    to="2026-11-30"
    historyPage={history}
    historyIssue={null}
    personalSummary={previewFrequencySummary}
    summaryIssue={null}
    selectedHistoryPage={0}
    lists={previewFrequencyLists}
    listIssue={null}
    selectedList={surface === "meeting" || surface === "create" ? previewFrequencyList : null}
    participants={previewFrequencyParticipants}
    participantsIssue={null}
    participantPage={0}
    participantStatus=""
    listStatus=""
    events={previewAgendaEvents}
    collective={previewCollectiveSummary}
    collectiveIssue={null}
    collectivePage={0}
    selectedMemberId={surface === "member" ? previewCollectiveSummary.items[0]?.memberId ?? "" : ""}
    memberHistory={surface === "member" ? history : null}
    memberHistoryIssue={null}
    memberHistoryPage={0}
    notice=""
    error=""
    synthetic
    syntheticOpenCreate={surface === "create"}
  />;
  return <>{banner()}<AuthenticatedShell member={member} roles={["COORDENADOR"]} projects={[]} leadershipProjectsUnavailable={false}><div className="mb-5 flex flex-wrap gap-2 text-type-metadata"><Link href="/dev-preview/frequencia?surface=personal" aria-current={surface === "personal" ? "page" : undefined} className="rounded-control border border-nite-border-soft px-3 py-2">A · Pessoal</Link><Link href="/dev-preview/frequencia?surface=meeting" aria-current={surface === "meeting" ? "page" : undefined} className="rounded-control border border-nite-border-soft px-3 py-2">B · Por reunião</Link><Link href="/dev-preview/frequencia?surface=member" aria-current={surface === "member" ? "page" : undefined} className="rounded-control border border-nite-border-soft px-3 py-2">B · Por integrante</Link><Link href="/dev-preview/frequencia?surface=create" aria-current={surface === "create" ? "page" : undefined} className="rounded-control border border-nite-border-soft px-3 py-2">C · Criar lista</Link><Link href="/dev-preview/frequencia?surface=projector" aria-current="false" className="rounded-control border border-nite-border-soft px-3 py-2">C · Projetor</Link></div>{workspace}</AuthenticatedShell></>;
}
