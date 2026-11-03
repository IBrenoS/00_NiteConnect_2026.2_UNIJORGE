import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { NiteMember } from "../../../lib/auth/identity";
import { meetingGraphHelpHref } from "../../../lib/meetings/graph-help-link";
import { AuthenticatedShell } from "../../../components/shell/authenticated-shell";
import { MeetingsWorkspace } from "../../../components/meetings/meetings-workspace";
import type { MeetingGraphAvailability } from "../../../lib/meetings/contracts";
import { cancelledMeeting, graphMeeting, historicalMeeting, invitedMeeting, linkedMeeting, previewCandidates, previewCancelled, previewNotifications, previewPast, previewUpcoming, previewViewerId } from "../../../lib/meetings/preview-fixtures";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prévia sintética de Reuniões" };

const member: NiteMember = { id: previewViewerId, name: "Integrante NITE", institutionalEmail: "preview@example.invalid", status: "ATIVO" };
type Overlay = "immediate" | "scheduled" | "invite" | "linked" | "history" | "cancelled";
type Availability = Exclude<MeetingGraphAvailability, "checking">;

function overlayValue(value: string | string[] | undefined): Overlay | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return ["immediate", "scheduled", "invite", "linked", "history", "cancelled"].includes(first ?? "") ? first as Overlay : undefined;
}

function availabilityValue(value: string | string[] | undefined): Availability {
  const first = Array.isArray(value) ? value[0] : value;
  return ["available", "consent-required", "not-configured", "teams-unavailable", "session-required", "unavailable"].includes(first ?? "") ? first as Availability : "available";
}

export default async function MeetingsPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const requestHeaders = await headers();
  const overlay = overlayValue(params.overlay);
  const availability = availabilityValue(params.graph);
  const syntheticUpcoming = { ...previewUpcoming, items: [graphMeeting, invitedMeeting, linkedMeeting] };
  const syntheticPast = { ...previewPast, items: [historicalMeeting] };
  const syntheticCancelled = { ...previewCancelled, items: [cancelledMeeting] };
  const overlays: [Overlay | undefined, string][] = [
    [undefined, "Página inicial"],
    ["immediate", "Iniciar agora"],
    ["scheduled", "Agendar"],
    ["invite", "Convite recebido"],
    ["linked", "Link confirmado"],
    ["history", "Histórico e detalhes"],
    ["cancelled", "Reunião cancelada"],
  ];

  return <AuthenticatedShell member={member} roles={[]} projects={[]} leadershipProjectsUnavailable={false}>
    <div role="note" className="mx-auto mt-4 max-w-6xl rounded-control border border-status-warning-border bg-status-warning-soft px-4 py-3 text-type-metadata text-status-warning">
      Prévia de desenvolvimento — reuniões e pessoas sintéticas; ações de gravação, Teams e notificações desativadas.
    </div>
    <nav aria-label="Estados da prévia de Reuniões" className="mx-auto mt-3 flex max-w-6xl flex-wrap gap-2 border-b border-nite-border-soft pb-3">
      {overlays.map(([value, label]) => {
        const href = value ? `/dev-preview/reunioes?overlay=${value}` : "/dev-preview/reunioes";
        return <Link key={label} href={href} aria-current={overlay === value ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-control px-3 text-type-metadata focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${overlay === value ? "bg-nite-brand-soft font-medium text-nite-brand-primary" : "text-nite-text-secondary hover:bg-nite-surface-subtle hover:text-nite-text-primary"}`}>{label}</Link>;
      })}
      <Link href="/dev-preview/reunioes?graph=consent-required" className="inline-flex min-h-10 items-center rounded-control px-3 text-type-metadata text-nite-text-secondary underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Permissão pendente (sintético)</Link>
    </nav>
    <MeetingsWorkspace viewerId={previewViewerId} previewMode previewCandidates={previewCandidates} initialOverlay={overlay} initialGraphAvailability={availability} graphHelpHref={meetingGraphHelpHref(process.env.NODE_ENV, requestHeaders.get("host"))} upcoming={syntheticUpcoming} past={syntheticPast} cancelled={syntheticCancelled} notifications={previewNotifications} upcomingIssue={null} pastIssue={null} cancelledIssue={null} notificationIssue={null} upcomingPage={0} pastPage={0} cancelledPage={0} />
  </AuthenticatedShell>;
}
